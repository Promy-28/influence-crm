import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mailIntent,mailOverview,choosePending} from '../src/lib/promy-bot/mail-workflow.ts';
test('owner screenshot requests route to real mailbox data without needing an email address',()=>{
 assert.equal(mailIntent('что показывает твоя аналитика, предлагай ответы по имейлам с самого начала которые висят неотвеченные - пройдемся по ним'),'backlog');
 assert.equal(mailIntent('переписки из Instantly, имейлы оттуда'),'backlog');
 assert.equal(mailIntent('Что показывает аналитика?'),'analytics');
 assert.equal(mailIntent('давай дальше',true),'next');
 assert.equal(mailIntent('creator@example.com — что она писала?'),'contact');
});
const thread=(id:string,date:string)=>({id,state:'waiting_on_us',sender:id+'@example.com',latestInboundId:id,lastMessageAt:date});
const live=(id:string)=>({complete:true,canonical:{id,from_address_email:id+'@example.com'},thread:{id,state:'waiting_on_us',latestMessageId:id,latestInboundId:id}});
test('mail overview reports actual counts and sorts oldest first without treating opt-outs as pending',()=>{
 const s={complete:true,aggregate:{messages:1180},threads:[thread('new','2026-11-16'),{...thread('optout','2026-10-01'),state:'opt_out'},thread('old','2026-10-14')],syncedAt:'2026-11-16'};
 const overview=mailOverview(s);assert.equal(overview.loadedMessages,1180);assert.equal(overview.awaitingUs,2);assert.equal(overview.oldest[0].emailId,'old');
});
test('walk skips closed, previously reviewed and live already-answered threads; binds only current eligible incoming',async()=>{
 const snapshot={threads:[thread('seen','2026-10-01'),thread('closed','2026-10-02'),thread('answered','2026-10-03'),thread('pending','2026-10-04')]};const calls:string[]=[];
 const found=await choosePending(snapshot,{seen:['seen']},{loadState:async id=>id==='closed'?{closed:true}:null,getThread:async id=>{calls.push(id);const c=live(id);if(id==='answered'){c.thread.state='waiting_on_them';c.thread.latestMessageId='outgoing'}return c}});
 assert.equal(found.context?.canonical.id,'pending');assert.deepEqual(calls,['answered','pending']);assert.ok(found.seen.includes('answered'));
});
test('walk re-reads a newer inbound canonical ID and refuses incomplete context',async()=>{
 const found=await choosePending({threads:[thread('old','2026-10-01')]},null,{loadState:async()=>null,getThread:async id=>id==='old'?{...live('old'),thread:{...live('old').thread,latestInboundId:'new',latestMessageId:'new'}}:live('new')});assert.equal(found.context?.canonical.id,'new');
 await assert.rejects(choosePending({threads:[thread('old','2026-10-01')]},null,{loadState:async()=>null,getThread:async()=>({complete:false})}),/INCOMPLETE/);
});
