import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseForm,mergeDirectoryPayload,suggestedCampaign,reviewFingerprint} from '../src/lib/reddit-intake.ts';
import {approvalToken,validApproval,redditCampaigns} from '../src/lib/hub-outreach.ts';
test('fixed form parser keeps quoted multiline notes, deduplicates email and never repairs a guessed address',()=>{
 const r=parseForm('Timestamp,Reddit username,Email,Country,English,Profile,Experience,Videos,Equipment,Registration,Price,Capacity,Notes,Owner\nnow,A,UPPER@gmail.com,US,Native,url,Yes,video,phone,No,50,2,"line 1\nline 2",good\nnow,A,upper@gmail.com,US,Native,new,Yes,video,phone,No,100,2,note,owner\nnow,B,b@gmail.con');
 assert.equal(r.rows.length,1);assert.equal(r.duplicates,1);assert.deepEqual(r.invalid,[4]);assert.equal(r.rows[0].email,'upper@gmail.com');assert.equal(r.rows[0].payload.price,'100');assert.equal(r.rows[0].payload.ownerNote,'owner');
 assert.throws(()=>parseForm('<html>Sign in</html>'),/Заголовки/);
});
test('older cloud snapshots cannot replace latest form source or release stale media for approval',()=>{
 const old={sheetSnapshot:{sourceFingerprint:'new',videos:'newvideo'},assessment:{reason:'kept'},sourceFingerprint:'new'};
 const merged=mergeDirectoryPayload(old,{videos:'oldvideo',reviewStatus:'awaiting_owner',reviewSourceFingerprint:'old'});
 assert.equal(merged.videos,'newvideo');assert.equal(merged.assessment.reason,'kept');assert.equal(merged.reviewStatus,'pending_review');
 assert.equal(mergeDirectoryPayload(old,{reviewSourceFingerprint:'new',reviewStatus:'awaiting_owner'}).reviewStatus,'awaiting_owner');
});
test('unknown evidence is never green; owner decisions and verified colors route without a blanket price cap',()=>{
 assert.equal(suggestedCampaign({payload:{assessment:{decision:'great'},price:20}}),'');
 assert.equal(suggestedCampaign({payload:{assessment:{decision:'great',audioReviewed:true,videoReviewed:true},price:350}}),redditCampaigns[0][0]);
 assert.equal(suggestedCampaign({owner_rating:'no',payload:{}}),redditCampaigns[1][0]);
});
test('batch approval binds exact source and assessment as well as recipient, campaign and expiry',()=>{
 const before=process.env.SESSION_SECRET;process.env.SESSION_SECRET='test';
 try{const c={email:'a@gmail.com',payload:{sourceFingerprint:'one',assessment:{decision:'great'}}},f=reviewFingerprint(c),at=String(Date.now()),campaign=redditCampaigns[0][0],token=approvalToken('id',c.email,campaign,at,f);
 assert.equal(validApproval('id',c.email,campaign,at,token,f),true);
 assert.equal(validApproval('id',c.email,campaign,at,token,''),false);
 assert.equal(validApproval('id',c.email,campaign,at,token,reviewFingerprint({...c,owner_reason:'changed'})),false);
 }finally{if(before===undefined)delete process.env.SESSION_SECRET;else process.env.SESSION_SECRET=before}
});
