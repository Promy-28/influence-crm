import {test} from 'node:test';
import assert from 'node:assert/strict';
import {briefEvidence,briefDraftIssue} from '../src/lib/campaign-context.ts';
import {analyzeConversations} from '../src/lib/promy-bot/mail-analysis.ts';
import {conversationFingerprint,draftContextCurrent} from '../src/lib/conversation-safety.ts';
import {assertNewOutreach} from '../src/lib/outreach-protection.ts';
import {readyDraft} from '../src/lib/draft-approval.ts';
const old={id:'old',ue_type:3,timestamp_email:'2026-10-20T19:43:00Z',body:{text:'The brief is ready: https://docs.google.com/document/d/old/edit. Make 1 full video, hook + body.'}};
const approved={id:'approved',ue_type:3,timestamp_email:'2026-11-16T18:08:00Z',body:{text:'Thanks for sending your sample. We liked the video!'}};
const offer={id:'offer',ue_type:3,timestamp_email:'2026-11-19T20:54:00Z',body:{text:'We would love to work with you. $150 for the full set. 43 short clips. Here is the brief: https://docs.google.com/document/d/new/edit'}};
test('Ariel regression: latest paid clip offer replaces old test scope; each evidence keeps its own date and source ID',()=>{
 const b=briefEvidence([old,{...offer,body:{text:old.body.text}},approved,offer]);assert.equal(b.sentAt,offer.timestamp_email);assert.equal(b.url,'https://docs.google.com/document/d/new/edit');assert.equal(b.scope?.emailId,'offer');assert.equal(b.scope?.at,offer.timestamp_email);assert.ok(b.scope?.text.includes('43 short clips'));assert.equal(b.stage,'offer_sent');assert.ok(briefDraftIssue('Please send a watermarked sample first.',b));assert.ok(briefDraftIssue('Please register and upload your portfolio.',b));assert.equal(briefDraftIssue('Any questions about the 43 clips in my last email?',b),null);
});
test('Gmail reactions never queue an ordinary reply or automatic followup and are not acceptance of a deal',()=>{
 const emails=[{...offer,thread_id:'thread',eaccount:'sender@example.com'},{id:'reaction',ue_type:2,thread_id:'thread',timestamp_email:'2026-11-21T14:44:00Z',body:{text:'💖\nAriel reacted via Gmail'},from_address_email:'ariel@example.com'}];
 const a:any=analyzeConversations(emails,{now:Date.parse('2026-11-22'),complete:true});assert.equal(a.threads[0].state,'acknowledged');assert.equal(a.threads[0].intent,null);assert.equal(a.aggregate.waitingOnUs,0);assert.equal(a.aggregate.waitingOnThem,0);
});
test('send safety binds complete exact conversation, including manual outbound changes behind an unchanged incoming ID',async()=>{
 const c={complete:true,canonical:{id:'in',from_address_email:'ariel@example.com',eaccount:'sender@example.com',thread_id:'thread'},thread:{state:'waiting_on_us',messages:[{id:'out',timestamp:offer.timestamp_email,direction:'outbound',text:offer.body.text},{id:'in',timestamp:'2026-11-21',direction:'inbound',text:'What next?'}]},briefContext:briefEvidence([old,approved,offer])};
 const d={contextVersion:3,conversationFingerprint:await conversationFingerprint(c)};assert.equal(await draftContextCurrent(d,c),true);const changed=structuredClone(c);changed.thread.messages[0].text='A different manual offer';assert.equal(await draftContextCurrent(d,changed),false);assert.equal(await draftContextCurrent({...d,contextVersion:2},c),false);assert.equal(await draftContextCurrent(d,{...c,complete:false}),false);assert.equal(readyDraft({contextVersion:2,status:'draft'}),false);
});
test('new-campaign guard blocks previous conversation across campaigns and fails closed on incomplete provider lookup',async()=>{
 let calls=0;const p=async()=>{calls++;return {items:[{id:'manual-old',campaign_id:'another',ue_type:3,to_address_email_list:'Ariel <ariel@example.com>'}]};};await assert.rejects(assertNewOutreach('ariel@example.com',p,async()=>null),/переписку/);assert.equal(calls,1);
 await assert.rejects(assertNewOutreach('ariel@example.com',async()=>({items:[],next_starting_after:'same'}),async()=>null),/неполная/);
 await assert.rejects(assertNewOutreach('ariel@example.com',async()=>{throw Error('Unavailable');},async()=>null));let checked=false;await assert.rejects(assertNewOutreach('ariel@example.com',async()=>{checked=true;return {};},async()=>'уже в работе'),/заблокирован/);assert.equal(checked,false);
 await assertNewOutreach('new@example.com',async()=>({items:[]}),async()=>null);
});
