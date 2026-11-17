import 'server-only';
import {db,all} from './db';
import {environment,loadRecord,saveRecord,decodeRecord,api,telegram,campaigns} from './promy-bot/store';
import {createAgentRuntime} from './promy-bot/agent-runtime';
import {processJob} from './promy-bot/realtime';
import {processOwnerUpdate} from './promy-bot/owner-update';
import {mailSnapshot} from './hub-data';
import {pendingThreads} from './promy-bot/mail-workflow';
import {MAIL_FOCUS} from './promy-bot/mail-focus';
import {renderReplyMacro} from './promy-bot/reply-macro';
import {approvalToken,validDraftApproval,readyDraft,latestDrafts} from './draft-approval';
const runtime=(env:ReturnType<typeof environment>):any=>createAgentRuntime({env,loadRecord,saveRecord,telegram,api,campaigns});
async function records(){return (await all<any>((from,to)=>db.from('promy_bot_records').select('id,value').like('id','draft:%').order('id').range(from,to))).map(r=>decodeRecord(r.value)).filter(d=>d.campaign===MAIL_FOCUS.campaign)}
export async function draftWorkspace(){
 const env=environment(),[drafts,queue,decisions]=await Promise.all([records(),loadRecord(env,'agent_jobs'),all<any>((from,to)=>db.from('promy_bot_records').select('id,value').like('id','decision:%').order('id').range(from,to))]);
 const visible=latestDrafts(drafts).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
 const saved=decisions.map(r=>decodeRecord(r.value)).filter(d=>d.status==='needs_decision').map(d=>({...d,status:'completed'}));
 const savedIds=new Set(saved.map(d=>d.emailId));
 const jobs=(queue?.items||[]).filter((j:any)=>j.source==='hub_batch'&&(j.status!=='completed'||!j.draftId&&!savedIds.has(j.emailId))).map((j:any)=>({id:j.id,emailId:j.emailId,status:j.status,answer:j.answer||'',error:j.prepareError||'',context:j.hubContext||null,requiresClarification:!!j.requiresClarification}));
 return {drafts:visible.map(d=>({...d,ready:readyDraft(d),approval:approvalToken(d,process.env.APP_PASSWORD!)})),jobs:[...saved,...jobs],focus:MAIL_FOCUS.label};
}
export async function queueDraftBatch(limit=30){
 limit=Math.max(1,Math.min(30,Math.floor(limit)||30));
 const env=environment(),r=runtime(env),[snapshot,workspace,queue]=await Promise.all([mailSnapshot(),draftWorkspace(),loadRecord(env,'agent_jobs')]);
 if(!snapshot.complete)throw Error('История загружена не полностью. Сначала обнови почту.');
 const blocked=new Set(workspace.drafts.filter((d:any)=>['draft','revision_requested','sending','uncertain','sent'].includes(d.status)).map((d:any)=>d.emailId));
 for(const j of queue?.items||[])if(j.source==='hub_batch')blocked.add(j.emailId);
 const candidates=pendingThreads(snapshot).filter((t:any)=>!blocked.has(t.latestInboundId)).slice(0,limit);let queued=0;
 for(const t of candidates){const state=await loadRecord(env,'threadstate:'+t.id);if(state?.closed||state?.status==='closed'||Date.parse(state?.snoozedUntil||'')>Date.now())continue;await r.enqueueJob({id:'batch:'+crypto.randomUUID(),source:'hub_batch',emailId:t.latestInboundId,text:'Подготовь уместный английский ответ на последнее письмо. По-русски кратко объясни, что креатор хочет и что предлагаешь. Не принимай новую ставку или условия за владельца: если нужно его решение, задай конкретный вопрос и не создавай письмо.'});queued++}
 return {queued};
}
export async function prepareNextDraft(){
 const env=environment(),queue=await loadRecord(env,'agent_jobs');
 const job=queue?.items?.find((j:any)=>j.source==='hub_batch'&&j.status==='new'&&!j.prepareError);
 if(!job)return {processed:false};
 const marker='batchwork:'+job.id,lease=await loadRecord(env,marker);if(lease?.until>Date.now())return {processed:false,busy:true};
 await saveRecord(env,marker,{until:Date.now()+90000});
 try{return await processJob(env,job.id)}catch(e){const q=await loadRecord(env,'agent_jobs'),j=q?.items?.find((x:any)=>x.id===job.id);if(j){j.prepareError=e instanceof Error&&e.message==='BOT_FREE_QUOTA'?'Бесплатная квота исчерпана. Повтори позже.':'Не удалось подготовить ответ. Можно повторить.';await saveRecord(env,'agent_jobs',q)}return {processed:false,error:true}}finally{await saveRecord(env,marker,{until:0})}
}
export async function editWorkspaceDraft(id:string,token:unknown,body:string){
 const env=environment(),d=await loadRecord(env,'draft:'+id);
 if(!d||!readyDraft(d)||!validDraftApproval(d,token,process.env.APP_PASSWORD!))throw Error('Черновик изменился или устарел. Обнови страницу.');
 if(!body.trim()||body.length>2800)throw Error('Нужен текст от 1 до 2800 символов.');
 Object.assign(d,renderReplyMacro({body,firstName:d.macroFirstName,signature:d.signatureHtml}),{editedAt:new Date().toISOString()});await saveRecord(env,'draft:'+id,d);return {saved:true};
}
export async function sendWorkspaceDraft(id:string,token:unknown){
 const env=environment(),d=await loadRecord(env,'draft:'+id);
 if(!d||!readyDraft(d)||!validDraftApproval(d,token,process.env.APP_PASSWORD!))throw Error('Текст изменился или устарел. Перечитай и отметь его заново.');
 const latest=latestDrafts(await records());if(!latest.some(x=>x.id===id))throw Error('Есть более новая версия ответа. Обнови страницу.');
 const [config,inst]=await Promise.all([loadRecord(env,'telegram'),loadRecord(env,'instantly')]);
 await processOwnerUpdate({update_id:Date.now(),message:{message_id:0,chat:{id:config.chatId,type:'private'},from:{id:config.userId,is_bot:false},text:'/send '+id}},config,inst,env,async()=>({}),runtime(env));
 const fresh=await loadRecord(env,'draft:'+id);return {status:fresh.status,sentAt:fresh.sentAt||null};
}
export async function requestWorkspaceRevision(emailId:string,instruction:string){
 if(!/^[a-f0-9-]{36}$/.test(emailId)||!instruction.trim()||instruction.length>5000)throw Error('Укажи решение или инструкцию для ответа.');
 const env=environment(),r=runtime(env);const id='batch:'+crypto.randomUUID();
 await r.enqueueJob({id,source:'hub_batch',emailId,text:instruction});return {queued:1};
}
