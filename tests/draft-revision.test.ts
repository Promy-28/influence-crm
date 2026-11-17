import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAgentRuntime} from '../src/lib/promy-bot/agent-runtime.ts';
import {draftFingerprint} from '../src/lib/promy-bot/dialogue-actions.ts';
test('new shown revision supersedes old version and binds natural approval to exact new text only',async()=>{
 const records=new Map<string,any>([['instantly',{key:'fixture'}],['telegram',{chatId:1}]]),messages:any[]=[];
 const inbound={id:'incoming',ue_type:2,campaign_id:'allowed',thread_id:'thread',eaccount:'sender@example.com',from_address_email:'creator@example.com',timestamp_email:new Date(Date.now()-10000).toISOString(),subject:'Question',body:{text:'Can you share the details?'}};
 const r:any=createAgentRuntime({env:{},campaigns:['allowed'],loadRecord:async(_:unknown,id:string)=>structuredClone(records.get(id)||null),saveRecord:async(_:unknown,id:string,value:unknown)=>{records.set(id,structuredClone(value))},telegram:async(_:unknown,method:string,body:unknown)=>{messages.push({method,body});return {message_id:messages.length}},api:async(_:unknown,path:string)=>{assert.ok(!path.includes('/reply'),'draft generation cannot send');return path==='/emails/incoming'?inbound:{items:[inbound]}}});
 await r.enqueueJob({id:'telegram:1',text:'подготовь ответ',emailId:'incoming'});const first=await r.completeJob({id:'telegram:1',answer:'Первый вариант',draftBody:'Hi, thank you for your message. We will review it.'});
 const old=records.get('draft:'+first.draftId);old.status='revision_requested';records.set('draft:'+old.id,old);
 await r.enqueueJob({id:'telegram:2',text:'сделай короче',emailId:'incoming'});const second=await r.completeJob({id:'telegram:2',answer:'Короткий вариант',draftBody:'Hi, thanks for the update.'});
 assert.equal(records.get('draft:'+first.draftId).status,'superseded');assert.equal(records.get('owner_draft_context').draftId,second.draftId);assert.equal(records.get('owner_draft_context').bodyHash,await draftFingerprint('Hi, thanks for the update.'));
 assert.equal(records.get('draft:'+second.draftId).recipient,'creator@example.com');assert.equal(records.get('draft:'+second.draftId).status,'draft');assert.equal(messages.length,2);
 assert.match(messages[1].body.text,/отправляй/);assert.doesNotMatch(messages[1].body.text,/\/send/);
});
