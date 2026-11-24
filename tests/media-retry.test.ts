import test from 'node:test';import assert from 'node:assert/strict';
import {mediaRetryAfter} from '../src/lib/media-retry.ts';
test('failed media returns its real blocker during cooldown, while file processing can resume',()=>{
 const now=Date.parse('2026-11-24T18:00:00Z');
 assert.equal(mediaRetryAfter({status:'failed',error:'MEDIA_JOCKEY_SOURCE_UNAVAILABLE',finished_at:'2026-11-24T17:59:00Z'},now),240);
 assert.equal(mediaRetryAfter({status:'failed',error:'MEDIA_FILE_PROCESSING',finished_at:'2026-11-24T17:59:00Z'},now),0);
 assert.equal(mediaRetryAfter({status:'failed',error:'MEDIA_JOCKEY_SOURCE_UNAVAILABLE',finished_at:'2026-11-24T17:50:00Z'},now),0);
 assert.equal(mediaRetryAfter({status:'completed'},now),0);
});
