import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mailSource,sourceMatches,assertApifyIncoming} from '../src/lib/mail-source.ts';
import {approvalToken,validDraftApproval} from '../src/lib/draft-approval.ts';
test('source selection accepts legacy found links and isolates old Reddit records from Apify',()=>{
 assert.equal(mailSource('found'),'apify');assert.equal(mailSource('apify'),'apify');assert.equal(mailSource(undefined),'reddit');assert.throws(()=>mailSource('all'));
 assert.equal(sourceMatches({},'reddit'),true);assert.equal(sourceMatches({},'apify'),false);assert.equal(sourceMatches({mailSource:'apify'},'reddit'),false);
});
test('Apify incoming must match actual source, campaign, address and account and respect suppression',()=>{
 const c={source:'apify',email:'jane@example.com',inst_campaign_id:'apify-campaign',eaccount:'kim@example.com'};
 const e={ue_type:2,campaign_id:'apify-campaign',from_address_email:'jane@example.com',eaccount:'kim@example.com',thread_id:'thread'};
 assert.doesNotThrow(()=>assertApifyIncoming(e,c));
 for(const changed of [{...c,source:'import:Reddit'},{...c,do_not_contact:true},{...c,unsubscribed_at:'now'},{...c,bounced_at:'now'},{...c,inst_campaign_id:'2d02d560-a584-4844-948c-3ed035b9e9e8'}])assert.throws(()=>assertApifyIncoming(e,changed));
 for(const changed of [{...e,from_address_email:'other@example.com'},{...e,campaign_id:'other'},{...e,eaccount:'other@example.com'},{...e,ue_type:3}])assert.throws(()=>assertApifyIncoming(changed,c));
});
test('changing draft source or creator identity invalidates an approval token',()=>{
 const d={id:'id',mailSource:'apify',creatorId:'creator',body:'approved',html:'html',status:'draft'};const token=approvalToken(d,'fixture');
 assert.equal(validDraftApproval({...d,mailSource:'reddit'},token,'fixture'),false);assert.equal(validDraftApproval({...d,creatorId:'other'},token,'fixture'),false);
});
