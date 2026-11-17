import {test} from 'node:test';
import assert from 'node:assert/strict';
import {approvalToken,validApproval,redditCampaigns} from '../src/lib/hub-outreach.ts';
test('campaign approval is bound to exact contact, campaign and a recent displayed confirmation',()=>{
 const previous=process.env.SESSION_SECRET;process.env.SESSION_SECRET='fixture-secret';
 try{const at=String(Date.now()),campaign=redditCampaigns[0][0],token=approvalToken('creator','creator@example.com',campaign,at);
  assert.equal(validApproval('creator','creator@example.com',campaign,at,token),true);
  assert.equal(validApproval('other','creator@example.com',campaign,at,token),false);
  assert.equal(validApproval('creator','other@example.com',campaign,at,token),false);
  assert.equal(validApproval('creator','creator@example.com',redditCampaigns[1][0],at,token),false);
  assert.equal(validApproval('creator','creator@example.com','unapproved',at,token),false);
  const old=String(Date.now()-16*60000);assert.equal(validApproval('creator','creator@example.com',campaign,old,approvalToken('creator','creator@example.com',campaign,old)),false);
 }finally{if(previous===undefined)delete process.env.SESSION_SECRET;else process.env.SESSION_SECRET=previous}
});
