import {test} from 'node:test';import assert from 'node:assert/strict';
import {browserEvidence} from '../src/lib/browser-review-policy.ts';
import {creatorProgress,creatorReviewState} from '../src/lib/creator-progress.ts';
import {mergeDirectoryPayload} from '../src/lib/reddit-intake.ts';
const valid={decision:'great',url:'https://portfolio.example/video',reason:'Clear English; good framing and lighting.',videoReviewed:true,audioReviewed:true};
test('browser review requires actual video and sound confirmations and retains provenance',()=>{
 assert.equal(browserEvidence(valid).method,'owner_browser');assert.equal(browserEvidence(valid).completed,true);
 assert.throws(()=>browserEvidence({...valid,audioReviewed:false}));assert.throws(()=>browserEvidence({...valid,videoReviewed:false}));assert.throws(()=>browserEvidence({...valid,url:'javascript:alert(1)'}));
 assert.equal(browserEvidence({...valid,decision:'unverified',audioReviewed:false}).completed,false);
});
test('fresh browser evidence counts once, is not overwritten by cloud merge and expires on changed form source',()=>{
 const browserReview={...browserEvidence(valid),sourceFingerprint:'v1'};
 const row={review_pending:true,payload:{sourceFingerprint:'v1',reviewSourceFingerprint:'old',reviewStatus:'pending_review',browserReview}};
 assert.equal(creatorReviewState(row),'great');assert.equal(creatorProgress([row]).checked,1);
 assert.equal(creatorReviewState({...row,payload:{...row.payload,sourceFingerprint:'v2'}}),'queued');
 assert.equal(mergeDirectoryPayload(row.payload,{browserReview:null}).browserReview,browserReview);
 assert.equal(creatorReviewState({payload:{browserReview:{...browserReview,sourceFingerprint:null,completed:false}}}),'unverified');
});

import fs from 'node:fs';import vm from 'node:vm';import ts from 'typescript';
test('queue remaining includes all pages and more than twenty, preserves completed checks and uses concurrency guard',async()=>{
 const rows=Array.from({length:60},(_,i)=>({id:'id'+i,updated_at:'v1',review_pending:false,payload:i===0?{assessment:{decision:'great',videoReviewed:true,audioReviewed:true}}:{assessment:{decision:'unverified',videoReviewed:false,audioReviewed:false}}}));
 rows[1].review_pending=true;const changed:string[]=[];
 const db={from:(table:string)=>{assert.equal(table,'reddit_creator_directory');let id='';return {update(patch:any){assert.equal(patch.review_pending,true);assert.equal('owner_rating' in patch,false);return this},eq(k:string,v:string){if(k==='id')id=v;else assert.equal(v,'v1');return this},async select(){changed.push(id);return {data:[{id}],error:null}}}}};
 const deps:any={'server-only':{},'node:crypto':{},'./db':{db},'./hub-data':{redditDirectory:async()=>rows},'./creator-progress':{creatorReviewState},'./browser-review-policy':{browserEvidence}};
 const exports:any={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../src/lib/creator-review-workspace.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:(id:string)=>deps[id],Date,Promise,Set,URL});
 const result=await exports.queueRemainingReviews();assert.equal(result.queued,58);assert.equal(changed.length,58);assert.equal(changed.includes('id0'),false);assert.equal(changed.includes('id1'),false);
});
