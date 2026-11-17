import test from 'node:test';
import assert from 'node:assert/strict';
import {briefEvidence,campaignInfo,GREEN_ID,RED_ID} from '../src/lib/campaign-context.ts';
test('campaign identity comes from provider ID, independently of creator rating',()=>{assert.match(campaignInfo(GREEN_ID).label,/Green/);assert.match(campaignInfo(RED_ID).label,/Red/);assert.equal(campaignInfo('other').tone,'')});
test('latest outbound scope overrides older brief without treating inbound counteroffer as agreement',()=>{
 const history=[{id:'old',direction:'outbound',timestamp:'2026-10-20',text:'Brief: https://docs.google.com/document/d/real123/edit Full video + body + 3 hooks'}, {id:'new',direction:'outbound',timestamp:'2026-11-04',text:'For $50 just 1 full video (favorite hook + body). No separate body or 3 hooks.'}, {id:'counter',direction:'inbound',timestamp:'2026-11-05',text:'Agree only for $100; body and hook.'}];
 const b=briefEvidence(history);assert.equal(b.sent,true);assert.equal(b.evidenceEmailId,'old');assert.equal(b.scope?.emailId,'new');assert.match(b.scope!.text,/\$50/);assert.doesNotMatch(b.scope!.text,/\$100/);
 assert.equal(briefEvidence([{direction:'inbound',text:history[0].text}]).sent,false);
 assert.equal(briefEvidence([{direction:'outbound',text:'I will send the brief shortly.'}]).sent,false);
});
