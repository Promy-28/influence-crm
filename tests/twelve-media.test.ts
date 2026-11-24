import test from 'node:test';
import assert from 'node:assert/strict';
import {twelveMediaTask} from '../src/lib/twelve-media.ts';
const source='https://maryfeeneyugc.my.canva.site/_assets/video/aa25d9a71029c586b16137866cd82bc7.mp4';
test('free-only control uses direct real URL, preserves task and polls without resubmitting video',async()=>{
 let calls=0;const fetcher=(async(url,req)=>{calls++;if(calls===1){const b=JSON.parse(String(req?.body));assert.equal(b.video.url,source);assert.match(b.prompt,/only a transcript/);assert.equal(req?.method,'POST');return Response.json({task_id:'task-123'});}assert.equal(req?.method,'GET');assert.equal(req?.body,undefined);return Response.json({status:'ready',result:{data:'Реальная речь'}});}) as typeof fetch;
 const a=await twelveMediaTask({apiKey:'test',freePlanConfirmed:true,source,fetcher});assert.equal(a.taskId,'task-123');const b=await twelveMediaTask({apiKey:'test',freePlanConfirmed:true,source,taskId:a.taskId,fetcher});assert.equal(b.text,'Реальная речь');assert.equal(calls,2);
});
test('cannot call provider without confirmed free plan or substitute another source',async()=>{const fetcher=(async()=>{throw Error('must not call')}) as typeof fetch;await assert.rejects(twelveMediaTask({apiKey:'test',freePlanConfirmed:false,source,fetcher}),/FREE_PLAN/);await assert.rejects(twelveMediaTask({apiKey:'test',freePlanConfirmed:true,source:'https://example.com/test.mp4',fetcher}),/SOURCE_INVALID/)});
