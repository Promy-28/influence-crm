import test from 'node:test';
import assert from 'node:assert/strict';
import {queueStage,remainingTime} from '../src/lib/creator-queue-view.ts';
const now=Date.parse('2026-11-25T10:15:00Z');
const q={ready:true,active:true,usedThisHour:20,last_tick_at:'2026-11-25T10:14:00Z',counts:{queued:114,processing:0,completed:0,blocked:47}};
test('hourly cap shows waiting and never implies completed video reviews',()=>{assert.equal(queueStage(q,now).kind,'waiting');assert.match(queueStage(q,now).title,/Лимит часа/);assert.equal(remainingTime('2026-11-25T11:00:00Z',now),'45:00');assert.equal(remainingTime('2026-11-25T10:00:00Z',now),'0:00')});
test('processing and stale heartbeat reflect actual evidence instead of enabled flag alone',()=>{assert.match(queueStage({...q,counts:{...q.counts,processing:1},activeJobs:[{stage:'discovering'}]},now).title,/портфолио/);assert.match(queueStage({...q,counts:{...q.counts,processing:1}},now).title,/видеосервиса/);assert.equal(queueStage({...q,last_tick_at:'2026-11-25T10:00:00Z'},now).kind,'warning');assert.equal(queueStage({...q,active:false},now).kind,'paused')});
test('blocked work is not presented as a successfully completed queue',()=>{assert.equal(queueStage({...q,counts:{queued:0,processing:0,completed:3,blocked:4}},now).kind,'warning');assert.equal(queueStage({...q,counts:{queued:0,processing:0,completed:7,blocked:0}},now).kind,'done')});
