import {test} from 'node:test';
import assert from 'node:assert/strict';
import {needsDraftRefresh,refreshInstruction} from '../src/lib/draft-refresh-policy.ts';
const d={status:'draft',emailId:'email',replyContent:'owner text',createdAt:new Date().toISOString(),editedAt:new Date().toISOString()};
test('legacy and expired drafts enter automatic refresh without touching sending or terminal drafts',()=>{
 assert.equal(needsDraftRefresh(d),true);
 const current={...d,contextVersion:3,conversationFingerprint:'a'.repeat(64)};
 assert.equal(needsDraftRefresh(current),false);
 assert.equal(needsDraftRefresh({...current,createdAt:'2020-01-01'}),true);
 for(const status of ['sent','sending','uncertain','cancelled','revision_requested','superseded'])assert.equal(needsDraftRefresh({...d,status}),false);
 assert.equal(needsDraftRefresh({...d,contextVersion:3,conversationFingerprint:'bad'}),true);
});
test('refresh carries owner edits, full history and active offer constraints without granting approval',()=>{
 const instruction=refreshInstruction(d);assert.match(instruction,/ВСЮ актуальную ветку/);assert.match(instruction,/ручные правки владельца/);assert.match(instruction,/Ничего не отправляй/);assert.match(instruction,/не проси уже присланный образец/);
 assert.equal(d.replyContent,'owner text');
});

import fs from 'node:fs';import vm from 'node:vm';import ts from 'typescript';
import {latestDrafts} from '../src/lib/draft-approval.ts';
test('bulk refresh queues sixty creators across pages, preserves each version and never sends; repeated runs are idempotent',async()=>{
 const records=new Map<string,any>();const jobs:any[]=[];
 for(let i=0;i<60;i++){const id=i.toString(16).padStart(8,'0');records.set('draft:'+id,{...d,id,emailId:'00000000-0000-0000-0000-'+i.toString().padStart(12,'0'),mailSource:'reddit',campaign:'focus',recipient:'creator'+i+'@example.com'});}
 const deps:any={
 './draft-refresh-policy':{needsDraftRefresh,refreshInstruction},
 './mail-source':{sourceMatches:()=>true},'./promy-bot/mail-focus':{MAIL_FOCUS:{campaign:'focus'}},
 './db':{all:async()=>[...records.entries()].filter(([id])=>id.startsWith('draft:')).map(([id,value])=>({id,value})),db:{}},
 './promy-bot/store':{environment:()=>({}),decodeRecord:(x:any)=>structuredClone(x),loadRecord:async(_:any,id:string)=>structuredClone(id==='agent_jobs'?{items:jobs}:records.get(id)),saveRecord:async(_:any,id:string,v:any)=>records.set(id,structuredClone(v))},
 './draft-approval':{latestDrafts,approvalToken:()=> 'token'},
 './draft-regeneration':{regenerationSnapshot:(parent:any)=>({id:parent.id,body:parent.replyContent,editedAt:parent.editedAt})},
 './promy-bot/agent-runtime':{createAgentRuntime:()=>({enqueueJob:async(j:any)=>{if(!jobs.some(x=>x.id===j.id))jobs.push(j)}})},
 'node:crypto':{createHash:await import('node:crypto').then(x=>x.createHash)}
 };
 const exports:any={};const js=ts.transpileModule(fs.readFileSync(new URL('../src/lib/draft-workspace.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(js,{exports,require:(id:string)=>deps[id]||{},process:{env:{APP_PASSWORD:'fixture'}},crypto,Date,Map,Set,console});
 for(let n=0;n<6;n++)assert.equal((await exports.queueStaleDraftRefresh('reddit',10)).queued,10);
 assert.equal(jobs.length,60);assert.equal((await exports.queueStaleDraftRefresh('reddit',10)).queued,0);
 for(const parent of records.values()){assert.equal(parent.replyContent,'owner text');assert.equal(parent.status,'revision_requested');}
 for(const job of jobs){assert.equal(job.hubContext.previousDraft.body,'owner text');assert.ok(job.hubContext.previousDraft.editedAt);assert.equal(job.source,'hub_batch');}
});
