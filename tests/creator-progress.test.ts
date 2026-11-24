import {test} from 'node:test';
import assert from 'node:assert/strict';
import {creatorProgress,creatorReviewState} from '../src/lib/creator-progress.ts';
const checked=(decision:string)=>({payload:{assessment:{decision,videoReviewed:true,audioReviewed:true}}});
test('checked colors and remaining categories partition every contact without counting owner colors as video checks',()=>{
 const rows=[checked('great'),checked('maybe'),checked('no'),{review_pending:true,...checked('great')},{rating:'great',payload:{assessment:{decision:'unverified',videoReviewed:false,audioReviewed:false}}},{rating:'no',payload:{}}];
 const s=creatorProgress(rows);assert.equal(s.total,6);assert.equal(s.checked,3);assert.equal(s.percent,50);assert.equal(s.remaining,3);assert.equal(s.great,1);assert.equal(s.maybe,1);assert.equal(s.no,1);assert.equal(s.queued,1);assert.equal(s.unverified,1);assert.equal(s.untouched,1);assert.equal(s.owner.great,1);assert.equal(s.owner.no,1);
 assert.equal(s.checked+s.queued+s.unverified+s.untouched,s.total);
});
test('stale source snapshots, pending cloud reviews and partial audio never inflate completed colors',()=>{
 assert.equal(creatorReviewState({...checked('great'),payload:{...checked('great').payload,sourceFingerprint:'new',reviewSourceFingerprint:'old'}}),'queued');
 assert.equal(creatorReviewState({payload:{...checked('no').payload,reviewStatus:'pending_review'}}),'queued');
 assert.equal(creatorReviewState({payload:{assessment:{decision:'great',videoReviewed:true,audioReviewed:false}}}),'unverified');
 assert.equal(creatorProgress([]).percent,0);
});
import {settlesCreatorRequest} from '../src/lib/creator-progress.ts';

test('new completed evidence settles queued request; earlier or changed-source reviews never do',()=>{
 const existing={review_pending:true,review_requested_at:'2026-11-24T18:30:00Z',payload:{sourceFingerprint:'current'}};
 const incoming={reviewStatus:'awaiting_owner',reviewSourceFingerprint:'current',assessment:{at:'2026-11-24T18:35:00Z',decision:'maybe',videoReviewed:true,audioReviewed:true}};
 assert.equal(settlesCreatorRequest(existing,incoming),true);
 assert.equal(settlesCreatorRequest(existing,{...incoming,reviewSourceFingerprint:'old'}),false);
 assert.equal(settlesCreatorRequest(existing,{...incoming,assessment:{...incoming.assessment,at:'2026-11-24T18:00:00Z'}}),false);
 assert.equal(settlesCreatorRequest(existing,{...incoming,assessment:{...incoming.assessment,audioReviewed:false}}),false);
});
