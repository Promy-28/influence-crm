import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAgentRuntime} from '../src/lib/promy-bot/agent-runtime.ts';
import {assertApifyIncoming} from '../src/lib/mail-source.ts';
import {REPLY_BANNER} from '../src/lib/promy-bot/reply-macro.ts';
test('Apify batch uses bound campaign and recipient, persists its source and Reply banner, and never sends',async()=>{
 const c={id:'creator',source:'apify',inst_campaign_id:'apify-campaign',email:'jane@example.com',eaccount:'kim@example.com'};
 const incoming={id:'incoming',campaign_id:c.inst_campaign_id,ue_type:2,from_address_email:c.email,eaccount:c.eaccount,thread_id:'thread',subject:'Re: Work',timestamp_email:new Date(Date.now()-10000).toISOString(),body:{text:'Where can I upload the file?'}};
 const records=new Map<string,any>([['instantly',{key:'fixture'}]]);let sent=0;
 const r:any=createAgentRuntime({env:{},campaigns:[c.inst_campaign_id],validateIncoming:(e:any)=>assertApifyIncoming(e,c),loadRecord:async(_:unknown,id:string)=>structuredClone(records.get(id)||null),saveRecord:async(_:unknown,id:string,value:any)=>{records.set(id,structuredClone(value))},telegram:async()=>{sent++;return {}},api:async(_:unknown,path:string)=>{assert.ok(!path.includes('/reply'),'preparation must not send');if(path.startsWith('/accounts/'))return {email:c.eaccount,signature:'Best regards,<br>Kim'};if(path==='/leads/list')return {items:[{email:c.email,campaign:c.inst_campaign_id,first_name:'Jane'}]};return path==='/emails/incoming'?incoming:{items:[incoming]}}});
 await r.enqueueJob({id:'batch:apify',source:'hub_batch',mailSource:'apify',creatorId:c.id,emailId:'incoming',text:'prepare reply',hubContext:{previousDraft:{id:'old',body:'Owner previous reply',recipient:c.email},revisionOf:'old'}});
 const result=await r.completeJob({id:'batch:apify',answer:'Просит способ загрузки видео',draftBody:'Please share a Google Drive link with view access.'});
 const d=records.get('draft:'+result.draftId);assert.equal(d.mailSource,'apify');assert.equal(d.creatorId,c.id);assert.equal(d.recipient,c.email);assert.equal(d.status,'draft');assert.ok(d.html.includes(REPLY_BANNER));assert.ok(d.html.includes('Hey&nbsp;Jane'));assert.equal(sent,0);assert.equal(d.previousVersion.body,'Owner previous reply');assert.equal(d.revisionOf,'old');assert.equal(records.get('decision:incoming').context.recipient,c.email);assert.equal(records.get('decision:incoming').mailSource,'apify');
 await assert.rejects(r.getThread('foreign'),/Allowed incoming/);
});
