import 'server-only';
import {sendFollowupDraft} from './auto-mail';
import {sourceMatches,type MailSource} from './mail-source';
import {apifyCandidates,apifyRuntime,apifyCreator,liveApifyConversation} from './apify-mail';
import {db,all} from './db';
import {environment,loadRecord,saveRecord,decodeRecord,api,telegram,campaigns} from './promy-bot/store';
import {createAgentRuntime} from './promy-bot/agent-runtime';
import {processJob} from './promy-bot/realtime';
import {processOwnerUpdate} from './promy-bot/owner-update';
import {campaignIds,briefEvidence} from './campaign-context';
import {campaignHistory,creatorCampaigns} from './hub-data';
import {mailSnapshot} from './hub-data';
import {pendingThreads} from './promy-bot/mail-workflow';
import {MAIL_FOCUS} from './promy-bot/mail-focus';
import {renderReplyMacro} from './promy-bot/reply-macro';
import {approvalToken,validDraftApproval,readyDraft,editableDraft,latestDrafts} from './draft-approval';
const runtime=(env:ReturnType<typeof environment>):any=>createAgentRuntime({env,loadRecord,saveRecord,telegram,api,campaigns});
async function records(source:MailSource='reddit'){return (await all<any>((from,to)=>db.from('promy_bot_records').select('id,value').like('id','draft:%').order('id').range(from,to))).map(r=>decodeRecord(r.value)).filter(d=>sourceMatches(d,source)&&(source==='apify'||d.campaign===MAIL_FOCUS.campaign))}
export async function draftWorkspace(source:MailSource='reddit'){
 const env=environment(),[drafts,queue,decisions]=await Promise.all([records(source),loadRecord(env,'agent_jobs'),all<any>((from,to)=>db.from('promy_bot_records').select('id,value').like('id','decision:%').order('id').range(from,to))]);
 const [history,membership]=await Promise.all([campaignHistory(),creatorCampaigns()]);
 const visible=latestDrafts(drafts).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
 const scopedDecisions=decisions.map(r=>decodeRecord(r.value)).filter(d=>sourceMatches(d,source));
 const saved=scopedDecisions.filter(d=>d.status==='needs_decision').map(d=>({...d,status:'completed'}));
 const savedIds=new Set(scopedDecisions.map(d=>(d.kind||'reply')+':'+d.emailId));
 const jobs=(queue?.items||[]).filter((j:any)=>j.source==='hub_batch'&&sourceMatches(j,source)&&(j.status!=='completed'||!j.draftId&&!savedIds.has((j.kind||'reply')+':'+j.emailId))).map((j:any)=>({id:j.id,kind:j.kind,emailId:j.emailId,creatorId:j.creatorId||null,status:j.status,answer:j.answer||'',error:j.prepareError||'',context:j.hubContext||null,requiresClarification:!!j.requiresClarification}));
 return {drafts:visible.map(d=>({...d,campaignIds:campaignIds(d),briefContext:d.briefContext||briefEvidence(history.emails.filter((e:any)=>e.campaign_id===d.campaign&&e.eaccount===d.eaccount&&(e.thread_id===d.threadId||String(e.lead||e.to_address_email_list||'').toLowerCase()===d.recipient?.toLowerCase()))),ready:readyDraft(d),editable:editableDraft(d),approval:approvalToken(d,process.env.APP_PASSWORD!)})),jobs:[...saved,...jobs].map(j=>({...j,campaignIds:[...(membership.get(String(j.context?.recipient||'').toLowerCase())||[])]})),mailSource:source,focus:source==='apify'?'Apify · TikTok / Instagram':MAIL_FOCUS.label};
}
export async function queueDraftBatch(limit=30,source:MailSource='reddit'){
 if(source==='apify'){const env=environment(),r=runtime(env),[candidates,w,q]=await Promise.all([apifyCandidates(),draftWorkspace(source),loadRecord(env,'agent_jobs')]);const blocked=new Set(w.drafts.filter((d:any)=>['draft','sending','uncertain','sent'].includes(d.status)).map((d:any)=>d.emailId));let queued=0;for(const c of candidates){if(queued>=Math.max(1,Math.min(30,Math.floor(limit)||30)))break;if(c.inst_reply_uuid&&blocked.has(c.inst_reply_uuid)||(q?.items||[]).some((j:any)=>j.creatorId===c.id&&j.mailSource==='apify'&&(j.status==='new'||!c.inst_reply_uuid||j.emailId===c.inst_reply_uuid)))continue;await r.enqueueJob({id:'batch:'+crypto.randomUUID(),source:'hub_batch',mailSource:'apify',creatorId:c.id,emailId:c.inst_reply_uuid||(await liveApifyConversation(env,c.id)).context.canonical.id,text:'Подготовь уместный ответ на последнее входящее креатора Apify. Дай краткое пояснение по-русски. Если требуются цена, бриф или решение владельца, спроси его; не выдумывай условия.'});queued++}return {queued}}
 limit=Math.max(1,Math.min(30,Math.floor(limit)||30));
 const env=environment(),r=runtime(env),[snapshot,workspace,queue]=await Promise.all([mailSnapshot(),draftWorkspace(),loadRecord(env,'agent_jobs')]);
 if(!snapshot.complete)throw Error('История загружена не полностью. Сначала обнови почту.');
 const blocked=new Set(workspace.drafts.filter((d:any)=>(['revision_requested','sending','uncertain','sent'].includes(d.status)||d.status==='draft'&&d.editable)).map((d:any)=>d.emailId));
 for(const j of queue?.items||[])if(j.source==='hub_batch')blocked.add(j.emailId);
 const candidates=pendingThreads(snapshot).filter((t:any)=>!blocked.has(t.latestInboundId)).slice(0,limit);let queued=0;
 for(const t of candidates){const state=await loadRecord(env,'threadstate:'+t.id);if(state?.closed||state?.status==='closed'||Date.parse(state?.snoozedUntil||'')>Date.now())continue;await r.enqueueJob({id:'batch:'+crypto.randomUUID(),source:'hub_batch',emailId:t.latestInboundId,text:'Подготовь уместный английский ответ на последнее письмо. По-русски кратко объясни, что креатор хочет и что предлагаешь. Не принимай новую ставку или условия за владельца: если нужно его решение, задай конкретный вопрос и не создавай письмо.'});queued++}
 return {queued};
}
export async function prepareNextDraft(source:MailSource='reddit'){
 const env=environment(),pace=await loadRecord(env,'_draft_provider_pace');if(pace?.nextAt>Date.now())return {processed:false,waitMs:pace.nextAt-Date.now()};const queue=await loadRecord(env,'agent_jobs');
 const job=queue?.items?.find((j:any)=>j.source==='hub_batch'&&sourceMatches(j,source)&&j.status==='new'&&(!j.prepareError||j.retryAt&&Date.parse(j.retryAt)<=Date.now()));
 if(!job)return {processed:false};
 await saveRecord(env,'_draft_provider_pace',{nextAt:Date.now()+7000});
 const marker='batchwork:'+job.id,lease=await loadRecord(env,marker);if(lease?.until>Date.now())return {processed:false,busy:true};
 await saveRecord(env,marker,{until:Date.now()+90000});
 try{return await processJob(env,job.id)}catch(e){const code=e instanceof Error?e.message:'UNKNOWN',quota=code==='BOT_FREE_QUOTA',throttled=code==='INSTANTLY_429';if(throttled)await saveRecord(env,'_draft_provider_pace',{nextAt:Date.now()+65000});console.error('draft_prepare_failed',/^[A-Z_0-9]+$/.test(code)?code:(e instanceof Error?e.name:'UNKNOWN'),e instanceof Error?(e.stack||'').split('\n').slice(1,3).join(' '):'');const q=await loadRecord(env,'agent_jobs'),j=q?.items?.find((x:any)=>x.id===job.id);if(j){j.retryAt=new Date(Date.now()+(throttled?65000:3600000)).toISOString();j.prepareErrorCode=/^[A-Z_0-9]+$/.test(code)?code:(e instanceof Error?e.name:'UNKNOWN');j.prepareError=throttled?'Instantly временно ограничил запросы. Продолжу автоматически.':quota?'Бесплатная квота исчерпана. Повтори позже.':code==='APIFY_THREAD_NOT_ALLOWED'?'Ветка или отправитель не совпадают с карточкой Apify. Автоответ заблокирован; проверь данные контакта.':code==='REPLY_MACRO_FIRST_NAME_MISSING'?'В Instantly нет однозначного имени для Reply. Проверь имя в карточке контакта.':code==='REPLY_MACRO_SIGNATURE_MISSING'?'У ящика Instantly отсутствует подпись для Reply.':'Не удалось подготовить ответ. Можно повторить.';await saveRecord(env,'agent_jobs',q)}return {processed:false,error:true,quota,waitMs:throttled?65000:0}}finally{await saveRecord(env,marker,{until:0})}
}
export async function retryDraftPreparation(source:MailSource='reddit'){const env=environment(),q=await loadRecord(env,'agent_jobs');let count=0;for(const j of q?.items||[])if(j.source==='hub_batch'&&sourceMatches(j,source)&&j.status==='new'&&j.prepareError){delete j.prepareError;count++}if(count)await saveRecord(env,'agent_jobs',q);return {queued:count}}
export async function editWorkspaceDraft(id:string,token:unknown,body:string,source:MailSource='reddit'){
 const env=environment(),d=await loadRecord(env,'draft:'+id);
 if(!d||!sourceMatches(d,source)||!editableDraft(d)||!validDraftApproval(d,token,process.env.APP_PASSWORD!))throw Error('Черновик изменился или устарел. Обнови страницу.');
 if(!body.trim()||body.length>2800)throw Error('Нужен текст от 1 до 2800 символов.');
 Object.assign(d,renderReplyMacro({body,firstName:d.macroFirstName,signature:d.signatureHtml}),{editedAt:new Date().toISOString()});await saveRecord(env,'draft:'+id,d);return {saved:true};
}
export async function sendWorkspaceDraft(id:string,token:unknown,source:MailSource='reddit'){
 const env=environment(),d=await loadRecord(env,'draft:'+id);
 if(!d||!sourceMatches(d,source)||!readyDraft(d)||!validDraftApproval(d,token,process.env.APP_PASSWORD!))throw Error('Текст изменился или устарел. Перечитай и отметь его заново.');
 const latest=latestDrafts(await records(source));if(!latest.some(x=>x.id===id))throw Error('Есть более новая версия ответа. Обнови страницу.');
 if(d.kind==='followup')return sendFollowupDraft(env,d);
 const selectedRuntime=source==='apify'?(await apifyRuntime(env,d.creatorId)).runtime:runtime(env);
 const [config,inst]=await Promise.all([loadRecord(env,'telegram'),loadRecord(env,'instantly')]);
 await processOwnerUpdate({update_id:Date.now(),message:{message_id:0,chat:{id:config.chatId,type:'private'},from:{id:config.userId,is_bot:false},text:'/send '+id}},config,inst,env,async()=>({}),selectedRuntime);
 const fresh=await loadRecord(env,'draft:'+id);if(source==='apify'&&fresh.status==='sent'){try{await db.from('creators').update({needs_reply:false,needs_human:false,human_reason:null}).eq('id',d.creatorId).eq('source','apify');await db.from('drafts').update({status:'superseded'}).eq('creator_id',d.creatorId).in('status',['new','scheduled']);await db.from('messages').upsert({creator_id:d.creatorId,direction:'out',subject:d.subject,body:d.body,eaccount:d.eaccount,inst_email_id:fresh.sentId,via:'hub_reply',sent_by:'Хаб',at:fresh.sentAt},{onConflict:'inst_email_id',ignoreDuplicates:true})}catch{return {status:'sent',sentAt:fresh.sentAt,syncWarning:true}}}return {status:fresh.status,sentAt:fresh.sentAt||null};
}
export async function requestWorkspaceRevision(emailId:string,instruction:string,source:MailSource='reddit',creatorId:string|null=null){
 if((source==='reddit'&&!/^[a-f0-9-]{36}$/.test(emailId))||!instruction.trim()||instruction.length>5000)throw Error('Укажи решение или инструкцию для ответа.');
 if(source==='apify'){if(!creatorId)throw Error('Нужен креатор Apify');await apifyCreator(creatorId)}
 const env=environment(),r=runtime(env);const id='batch:'+crypto.randomUUID();
 await r.enqueueJob({id,source:'hub_batch',mailSource:source,creatorId,emailId:emailId||null,text:instruction});
 const q=await loadRecord(env,'agent_jobs'),previous=[...(q?.items||[])].reverse().find((j:any)=>j.id!==id&&j.emailId===emailId&&j.mailSource===source);if(previous?.kind==='followup'){Object.assign(q.items.find((j:any)=>j.id===id),{kind:'followup',followupAnchor:previous.followupAnchor});await saveRecord(env,'agent_jobs',q)}
 for(const old of await records(source))if(old.emailId===emailId&&old.status==='draft'){old.status='revision_requested';await saveRecord(env,'draft:'+old.id,old)}
 return {queued:1,jobId:id};
}
