import {test} from 'node:test';
import assert from 'node:assert/strict';
import {followupDue,followupCurrent,followupProposal} from '../src/lib/followup-policy.ts';
import {approvalToken} from '../src/lib/draft-approval.ts';
const now=Date.parse('2026-11-17T12:00:00Z');
const base={state:'waiting_on_them',latestInboundId:'incoming',latestMessageId:'outgoing',lastMessageAt:'2026-11-15T12:00:00Z'};
test('followup starts at 48h, requires human conversation and never overlaps queued campaign email',()=>{
 assert.equal(followupDue(base,now),true);assert.equal(followupDue(base,now-1),false);
 for(const state of ['waiting_on_us','opt_out','not_interested','bounced','auto_reply','unknown'])assert.equal(followupDue({...base,state},now),false);
 assert.equal(followupDue({...base,latestInboundId:null},now),false);
 assert.equal(followupDue({...base,lastMessageAt:'invalid'},now),false);
 assert.equal(followupDue({...base,messages:[{direction:'scheduled'}]},now),false);
});
test('new creator reply or outgoing invalidates exact followup; approvals bind its kind and anchor',()=>{
 assert.equal(followupCurrent({complete:true,thread:base},'outgoing',now),true);
 assert.equal(followupCurrent({complete:false,thread:base},'outgoing',now),false);
 assert.equal(followupCurrent({complete:true,thread:{...base,latestMessageId:'new'}},'outgoing',now),false);
 assert.equal(followupCurrent({complete:true,thread:{...base,state:'waiting_on_us'}},'outgoing',now),false);
 const d={id:'test',kind:'followup',followupAnchor:'outgoing'};const token=approvalToken(d,'test');assert.notEqual(token,approvalToken({...d,followupAnchor:'other'},'test'));assert.notEqual(token,approvalToken({...d,kind:'reply'},'test'));
});

test('waiting on creator is the reason for a followup, but an actual closed negotiation never gets the fallback',()=>{
 assert.ok(followupProposal('Мяч на стороне креатора, фолоуап писать рано.','',true).draftBody);
 assert.equal(followupProposal('Диалог закрыт после отказа, мяч на стороне креатора.','',true).draftBody,'');
 assert.equal(followupProposal('Нужно решение по правам.','',true).requiresClarification,true);
});
