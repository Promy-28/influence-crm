import {needsDraftRefresh,refreshInstruction} from './draft-refresh-policy';
import {CREATOR_POLICY_VERSION,prematurePricing,deferDraftPricing,deferPricingSummary} from './creator-policy';
import {cleanOwnerSummary} from './writing-style';
import {replyCoverageIssue,questionCoverage} from './reply-coverage';
import {regenerationSnapshot} from './draft-regeneration';
import {createHash} from 'node:crypto';
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
 await updateDraftPricing(source);
 const env=environment(),[drafts,queue,decisions]=await Promise.all([records(source),loadRecord(env,'agent_jobs'),all<any>((from,to)=>db.from('promy_bot_records').select('id,value').like('id','decision:%').order('id').range(from,to))]);
 const [history,membership]=await Promise.all([campaignHistory(),creatorCampaigns()]);
 const visible=latestDrafts(drafts).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
 const scopedDecisions=decisions.map(r=>decodeRecord(r.value)).filter(d=>sourceMatches(d,source));
 const saved=scopedDecisions.filter(d=>d.status==='needs_decision').map(d=>({...d,status:'completed'}));
 const savedIds=new Set(scopedDecisions.map(d=>(d.kind||'reply')+':'+d.emailId));
 const jobs=(queue?.items||[]).filter((j:any)=>j.source==='hub_batch'&&sourceMatches(j,source)&&(j.status!=='completed'||!j.draftId&&!savedIds.has((j.kind||'reply')+':'+j.emailId))).map((j:any)=>({id:j.id,kind:j.kind,emailId:j.emailId,creatorId:j.creatorId||null,status:j.status,answer:j.answer||'',error:j.prepareError||'',context:j.hubContext||null,requiresClarification:!!j.requiresClarification}));
 return {drafts:visible.map(d=>({...d,summary:cleanOwnerSummary(d.summary||''),coverage:questionCoverage(d.incomingText,d.replyContent),coverageIssue:d.kind==='followup'?null:replyCoverageIssue(d.incomingText,d.replyContent),campaignIds:campaignIds(d),briefContext:d.briefContext||briefEvidence(history.emails.filter((e:any)=>e.campaign_id===d.campaign&&e.eaccount===d.eaccount&&(e.thread_id===d.threadId||String(e.lead||e.to_address_email_list||'').toLowerCase()===d.recipient?.toLowerCase()))),safetyIssue:d.contextVersion!==3||!d.conversationFingerprint?'Черновик создан без актуальной проверки всей переписки. Уже ставим на автоматическую проверку по текущей истории. Можно запустить «Проверить и обновить все». Текст и ручные правки сохранены.':null,ready:readyDraft(d),editable:editableDraft(d),approval:approvalToken(d,process.env.APP_PASSWORD!)})),jobs:[...saved,...jobs].map(j=>({...j,campaignIds:[...(membership.get(String(j.context?.recipient||'').toLowerCase())||[])]})),mailSource:source,focus:source==='apify'?'Apify · TikTok / Instagram':MAIL_FOCUS.label};
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
 const job=[...(queue?.items||[])].sort((a:any,b:any)=>Number(b.id.startsWith('writing:'))-Number(a.id.startsWith('writing:'))).find((j:any)=>j.source==='hub_batch'&&sourceMatches(j,source)&&j.status==='new'&&(!j.prepareError||j.retryAt&&Date.parse(j.retryAt)<=Date.now()));
 if(!job)return {processed:false};
 await saveRecord(env,'_draft_provider_pace',{nextAt:Date.now()+7000});
 const marker='batchwork:'+job.id,lease=await loadRecord(env,marker);if(lease?.until>Date.now())return {processed:false,busy:true};
 await saveRecord(env,marker,{until:Date.now()+90000});
 try{const result=await processJob(env,job.id);if((result as any).template)await saveRecord(env,'_draft_provider_pace',{nextAt:0});return result}catch(e){const code=e instanceof Error?e.message:'UNKNOWN',quota=code==='BOT_FREE_QUOTA',throttled=code==='INSTANTLY_429';if(throttled)await saveRecord(env,'_draft_provider_pace',{nextAt:Date.now()+65000});console.error('draft_prepare_failed',/^[A-Z_0-9]+$/.test(code)?code:(e instanceof Error?e.name:'UNKNOWN'),e instanceof Error?(e.stack||'').split('\n').slice(1,3).join(' '):'');const q=await loadRecord(env,'agent_jobs'),j=q?.items?.find((x:any)=>x.id===job.id);if(j){j.retryAt=new Date(Date.now()+(throttled?65000:3600000)).toISOString();j.prepareErrorCode=/^[A-Z_0-9]+$/.test(code)?code:(e instanceof Error?e.name:'UNKNOWN');j.prepareError=throttled?'Instantly временно ограничил запросы. Продолжу автоматически.':quota?'Бесплатная квота исчерпана. Повтори позже.':code==='APIFY_THREAD_NOT_ALLOWED'?'Ветка или отправитель не совпадают с карточкой Apify. Автоответ заблокирован; проверь данные контакта.':code==='REPLY_MACRO_FIRST_NAME_MISSING'?'В Instantly нет однозначного имени для Reply. Проверь имя в карточке контакта.':code==='REPLY_MACRO_SIGNATURE_MISSING'?'У ящика Instantly отсутствует подпись для Reply.':'Не удалось подготовить ответ. Можно повторить.';await saveRecord(env,'agent_jobs',q)}return {processed:false,error:true,quota,waitMs:throttled?65000:0}}finally{await saveRecord(env,marker,{until:0})}
}
export async function retryDraftPreparation(source:MailSource='reddit'){const env=environment(),q=await loadRecord(env,'agent_jobs');let count=0;for(const j of q?.items||[])if(j.source==='hub_batch'&&sourceMatches(j,source)&&j.status==='new'&&j.prepareError){delete j.prepareError;count++}if(count)await saveRecord(env,'agent_jobs',q);return {queued:count}}
export async function editWorkspaceDraft(id:string,token:unknown,body:string,source:MailSource='reddit'){
 const env=environment(),d=await loadRecord(env,'draft:'+id);
 if(!d||!sourceMatches(d,source)||!editableDraft(d)||!validDraftApproval(d,token,process.env.APP_PASSWORD!))throw Error('Черновик изменился или устарел. Обнови страницу.');
 if(!body.trim()||body.length>2800)throw Error('Нужен текст от 1 до 2800 символов.');
 if(prematurePricing(body,d.briefContext))throw Error('Ставку обсуждаем после получения тестового видео.');
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
export async function requestWorkspaceRevision(emailId:string,instruction:string,source:MailSource='reddit',creatorId:string|null=null,draftId?:string,approval?:unknown){
 if((source==='reddit'&&!/^[a-f0-9-]{36}$/.test(emailId))||!instruction.trim()||instruction.length>5000)throw Error('Укажи решение или инструкцию для ответа.');
 if(draftId!==undefined&&(typeof draftId!=='string'||!/^[a-f0-9]{8}$/.test(draftId)))throw Error('Неверный черновик');
 if(source==='apify'){if(!creatorId)throw Error('Нужен креатор Apify');await apifyCreator(creatorId)}
 const env=environment(),r=runtime(env);
 const parentDraft=draftId?await loadRecord(env,'draft:'+draftId):null;
 const previousStatus=parentDraft?.status;
 const snapshot=draftId?regenerationSnapshot(parentDraft,{emailId,source,creatorId,approval},process.env.APP_PASSWORD!):null;
 if(parentDraft&&!latestDrafts(await records(source)).some(d=>d.id===draftId))throw Error('Есть более новая версия ответа. Обнови страницу.');
 const id=snapshot?'batch:revision:'+createHash('sha256').update(JSON.stringify([draftId,approval,instruction])).digest('hex').slice(0,24):'batch:'+crypto.randomUUID();
 if(parentDraft){parentDraft.status='revision_requested';parentDraft.revisionJobId=id;await saveRecord(env,'draft:'+parentDraft.id,parentDraft)}
 try{await r.enqueueJob({id,source:'hub_batch',mailSource:source,creatorId,emailId:emailId||null,text:instruction,...(snapshot?{hubContext:{previousDraft:snapshot,revisionOf:draftId}}:{})})}
 catch(error){if(parentDraft){const fresh=await loadRecord(env,'draft:'+parentDraft.id);if(fresh?.status==='revision_requested'&&fresh.revisionJobId===id){fresh.status=previousStatus;delete fresh.revisionJobId;await saveRecord(env,'draft:'+fresh.id,fresh)}}throw error}
 const q=await loadRecord(env,'agent_jobs'),previous=[...(q?.items||[])].reverse().find((j:any)=>j.id!==id&&j.emailId===emailId&&j.mailSource===source);const followup=parentDraft?.kind==='followup'?parentDraft:previous?.kind==='followup'?previous:null;if(followup){Object.assign(q.items.find((j:any)=>j.id===id),{kind:'followup',followupAnchor:followup.followupAnchor});await saveRecord(env,'agent_jobs',q)}
 if(!parentDraft)for(const old of await records(source))if(old.emailId===emailId&&old.status==='draft'){const fresh=await loadRecord(env,'draft:'+old.id);if(fresh?.status==='draft'){fresh.status='revision_requested';await saveRecord(env,'draft:'+old.id,fresh)}}
 return {queued:1,jobId:id};
}

// Durable, idempotent bulk migration. Never grants approval and never sends.
export async function queueStaleDraftRefresh(source:MailSource='reddit',limit=500,force=false){
 const {updated:pricingUpdated}=await updateDraftPricing(source);
 const env=environment(),r=runtime(env);let queued=0;const drafts=latestDrafts(await records(source)).filter(d=>needsDraftRefresh(d)||force&&['draft','stale','expired'].includes(d.status)&&d.emailId&&d.replyContent);
 for(const d of drafts.slice(0,Math.max(1,Math.min(500,limit)))){
  const current=await loadRecord(env,'draft:'+d.id);if(!current||approvalToken(current,process.env.APP_PASSWORD!)!==approvalToken(d,process.env.APP_PASSWORD!))continue;
  const previousStatus=current.status,token=approvalToken(current,process.env.APP_PASSWORD!),snapshot=regenerationSnapshot(current,{emailId:d.emailId,source,creatorId:d.creatorId||null,approval:token},process.env.APP_PASSWORD!);
  const id='batch:revision:'+createHash('sha256').update(JSON.stringify([d.id,token,'automatic-context-refresh'])).digest('hex').slice(0,24);
  try{
   current.status='revision_requested';current.revisionJobId=id;await saveRecord(env,'draft:'+d.id,current);
   await r.enqueueJob({id,source:'hub_batch',mailSource:source,creatorId:d.creatorId||null,emailId:d.emailId,text:refreshInstruction(d),kind:d.kind||'reply',followupAnchor:d.followupAnchor||null,hubContext:{previousDraft:snapshot,revisionOf:d.id}});queued++;
  }catch(e){
   const fresh=await loadRecord(env,'draft:'+d.id);if(fresh?.status==='revision_requested'&&fresh.revisionJobId===id){fresh.status=previousStatus;delete fresh.revisionJobId;await saveRecord(env,'draft:'+d.id,fresh)}
   if(e instanceof Error&&(e.message==='BOT_STATE_CONFLICT'||e.message==='Agent queue is full'))return {queued,pricingUpdated,remaining:drafts.length-queued,capacity:true};throw e;
  }
 }
 return {queued,pricingUpdated,remaining:Math.max(0,drafts.length-queued)};
}

// Update only the latest unsent version and retain its exact prior wording.
export async function updateDraftPricing(source:MailSource){
 const env=environment();
 let updated=0;
 for(const draft of latestDrafts(await records(source))){
  if(draft.status!=='draft'||!draft.briefContext||!draft.signatureHtml||!draft.macroFirstName||!draft.replyContent)continue;
  const body=deferDraftPricing(draft.replyContent,draft.briefContext);
  const summary=deferPricingSummary(draft.summary||'',draft.briefContext);
  if(body===draft.replyContent&&summary===(draft.summary||''))continue;
  if(!body||(draft.kind!=='followup'&&replyCoverageIssue(draft.incomingText,body)))continue;
  const fresh=await loadRecord(env,'draft:'+draft.id);
  if(!fresh||approvalToken(fresh,process.env.APP_PASSWORD!)!==approvalToken(draft,process.env.APP_PASSWORD!)||fresh.summary!==draft.summary)continue;
  const id=createHash('sha256').update(fresh.id+':'+CREATOR_POLICY_VERSION).digest('hex').slice(0,8);
  const next={...fresh,...renderReplyMacro({body,firstName:fresh.macroFirstName,signature:fresh.signatureHtml}),
   id,revisionOf:fresh.id,previousVersion:{body:fresh.replyContent,summary:fresh.summary,editedAt:fresh.editedAt||null},
   summary,policyVersion:CREATOR_POLICY_VERSION,createdAt:new Date().toISOString()};
  try{
   if(!await loadRecord(env,'draft:'+id))await saveRecord(env,'draft:'+id,next);
   await saveRecord(env,'draft:'+fresh.id,{...fresh,status:'superseded'});
   updated++;
  }
  catch(e){if(!(e instanceof Error)||e.message!=='BOT_STATE_CONFLICT')throw e}
 }
 return {updated};
}
