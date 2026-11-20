import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createFarmPlan,runFarmPlan,planCounts,type FarmPlan} from '../src/lib/farm-plans.ts';
import {canPost,farmCommunities} from '../src/lib/farm-communities.ts';
import type {FarmAccount} from '../src/lib/farm-contract.ts';
const id='hub-11111111-1111-4111-8111-111111111111',now=Date.parse('2026-11-20T12:00:00Z');
const account:FarmAccount={id:'11111111-1111-4111-8111-111111111111',platform:'reddit',handle:'Fixture',status:'warming',phone:'fixture',profile:'test',warm_start:null,program_id:null,program_name:null};
const row=(n:number)=>({account_id:account.id,subreddit:'UGCs',title:'Portfolio question '+n,text:'Which examples are useful?',scheduled_at:new Date(now+(n+1)*86400000).toISOString()});
test('plans bind distinct stable external IDs to at most thirty reviewed payloads',()=>{
 const p=createFarmPlan(id,'Fixture',Array.from({length:30},(_,i)=>row(i)),[account],now);assert.equal(p.items.length,30);assert.equal(new Set(p.items.map(i=>i.post.external_id)).size,30);
 assert.throws(()=>createFarmPlan(id,'Fixture',Array.from({length:31},(_,i)=>row(i)),[account],now));assert.throws(()=>createFarmPlan(id,'Fixture',[row(0),row(0)],[account],now));assert.throws(()=>createFarmPlan(id,'Fixture',[row(0)],[{...account,status:'needs_human'}],now));
 assert.equal(canPost({...account,status:'needs_human'}),false);assert.equal(canPost({...account,platform:'threads'}),false);assert.equal(canPost(account),true);
 assert.deepEqual(farmCommunities.filter(s=>s.group==='owner').map(s=>s.name),['Ugc_forhire','UGCs','UGCSideHustle','techugc']);
});
test('a thirty-post plan advances six at a time, persists each result and never resubmits accepted rows',async()=>{
 const p=createFarmPlan(id,'Fixture',Array.from({length:30},(_,i)=>row(i)),[account],now);const sent:string[]=[],saved:FarmPlan[]=[];
 const deps={now:()=>now,accounts:async()=>[account],save:async(p:FarmPlan)=>{saved.push(structuredClone(p));},submit:async(post:typeof p.items[0]['post'])=>{assert.equal(saved.at(-1)?.items.find(i=>i.post.external_id===post.external_id)?.state,'sending');sent.push(post.external_id);return {state:'awaiting_approval'};}};
 for(let i=0;i<5;i++)await runFarmPlan(p,deps);assert.equal(sent.length,30);assert.equal(new Set(sent).size,30);assert.equal(planCounts(p).remaining,0);await runFarmPlan(p,deps);assert.equal(sent.length,30);
});
test('ambiguous acceptance stops the batch and reconciles by external ID before retry, even after the scheduled time',async()=>{
 const p=createFarmPlan(id,'Fixture',[row(0),row(1)],[account],now);let calls=0;const deps={now:()=>now,accounts:async()=>[account],save:async()=>{},submit:async()=>{calls++;throw Error('timeout');}};
 await runFarmPlan(p,deps);assert.equal(calls,1);assert.equal(p.items[0].state,'uncertain');assert.equal(p.items[1].state,'draft');
 await runFarmPlan(p,{...deps,now:()=>now+2*86400000,find:async()=>({state:'delivered'})});assert.equal(p.items[0].state,'accepted');assert.equal(calls,1);assert.equal(p.items[1].state,'error'); // Missed, never silently sent now.
});
test('fresh account restrictions and a failed CAS claim prevent any submission',async()=>{
 const p=createFarmPlan(id,'Fixture',[row(0)],[account],now);let submitted=0;
 await runFarmPlan(p,{now:()=>now,save:async()=>{},accounts:async()=>[{...account,status:'needs_human'}],submit:async()=>{submitted++;}});assert.equal(submitted,0);assert.equal(p.items[0].state,'error');
 await assert.rejects(runFarmPlan(p,{now:()=>now,save:async()=>{throw Error('CAS conflict');},accounts:async()=>[account],submit:async()=>{submitted++;}}),/CAS/);assert.equal(submitted,0);
 p.leaseUntil=now+10000;await assert.rejects(runFarmPlan(p,{now:()=>now,save:async()=>{},accounts:async()=>[account],submit:async()=>{submitted++;}}),/уже обрабатывается/);
});
