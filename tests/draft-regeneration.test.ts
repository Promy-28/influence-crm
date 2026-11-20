import {test} from 'node:test';
import assert from 'node:assert/strict';
import {regenerationSnapshot} from '../src/lib/draft-regeneration.ts';
import {approvalToken} from '../src/lib/draft-approval.ts';
const secret='fixture-only',base={id:'1234abcd',status:'draft',emailId:'incoming',recipient:'creator@example.com',eaccount:'sender@example.com',mailSource:'reddit',replyContent:'Original owner-edited answer',body:'Original',html:'<p>Original</p>',createdAt:'2026-11-18',editedAt:'2026-11-19'};
test('regeneration binds to displayed draft and snapshots owner edits without mutating the original',()=>{
 const before=structuredClone(base),snapshot=regenerationSnapshot(base,{emailId:'incoming',source:'reddit',approval:approvalToken(base,secret)},secret);
 assert.deepEqual(base,before);assert.equal(snapshot.body,base.replyContent);assert.equal(snapshot.editedAt,base.editedAt);assert.equal(snapshot.id,base.id);
 const expired={...base,status:'expired'};assert.equal(regenerationSnapshot(expired,{emailId:'incoming',source:'reddit',approval:approvalToken(expired,secret)},secret).body,base.replyContent);
});
test('stale approval, wrong source/contact and sent or uncertain parents cannot be regenerated through a different binding',()=>{
 const input={emailId:'incoming',source:'reddit',approval:approvalToken(base,secret)};
 for(const changed of [{...base,replyContent:'Changed',body:'Changed'},{...base,status:'sent'},{...base,status:'sending'},{...base,status:'uncertain'},{...base,emailId:'other'}])assert.throws(()=>regenerationSnapshot(changed,input,secret));
 assert.throws(()=>regenerationSnapshot(base,{...input,source:'apify',creatorId:'wrong'},secret));
});
