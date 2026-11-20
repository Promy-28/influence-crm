import {completeWritingRefresh,processWritingRefresh} from '../writing-refresh';
import {completeFollowupJob,processFollowupJob} from '../auto-mail';
import {prepareApifyJob,completeApifyJob} from '../apify-mail';
import {createAgentRuntime} from './agent-runtime';
import {processOwnerUpdate} from './owner-update';
import {api,telegram,loadRecord,saveRecord,environment,campaigns,type StoreEnv} from './store';
import {generateAnswer} from './generate';
import playbook from './playbook.json';
import {mailSnapshot} from '../hub-data';
import {mailIntent,mailOverview,overviewText,choosePending} from './mail-workflow';
import {dialogueAction} from './dialogue-actions';
import {unquotedText} from './mail-analysis';
const runtime=(env:StoreEnv)=>createAgentRuntime({env,api,telegram,loadRecord,saveRecord,campaigns});
export const completeCloudJob=async(env:StoreEnv,args:Parameters<ReturnType<typeof runtime>['completeJob']>[0])=>{const q=await loadRecord(env,'agent_jobs'),job=q?.items?.find((j:any)=>j.id===args.id);return job?.id?.startsWith('writing:')?completeWritingRefresh(env,job,args):job?.kind==='followup'?completeFollowupJob(env,job,args):job?.mailSource==='apify'?completeApifyJob(env,job,args):runtime(env).completeJob(args)};
export async function processJob(env:StoreEnv,id:string){
 const q=await loadRecord(env,'agent_jobs'),job=q?.items?.find((j:{id:string})=>j.id===id);
 if(!job||job.status!=='new')return {processed:false};
 if(job.id.startsWith('writing:'))return processWritingRefresh(env,job);
 if(job.kind==='followup')return processFollowupJob(env,job);
 if(job.mailSource==='apify')return prepareApifyJob(env,job);
 const r=runtime(env);let context:Awaited<ReturnType<typeof r.getThread>>|null=null;
 const priorWalk=await loadRecord(env,'owner_mail_walk'),revision=job.source!=='hub_batch'&&dialogueAction(job.text)==='revise',intent=job.source==='hub_batch'||revision?'contact':mailIntent(job.text,!!priorWalk);
 const activeDraft=await loadRecord(env,'owner_draft_context');let previousDraft:{recipient:string;body:string}|null=job.hubContext?.previousDraft||null;
 if(revision&&activeDraft?.draftId){
  const old=await loadRecord(env,'draft:'+activeDraft.draftId);
  if(old&&(!job.emailId||job.emailId===old.emailId)&&['draft','revision_requested'].includes(old.status)){
   previousDraft={recipient:old.recipient,body:old.replyContent||old.body};job.emailId=old.emailId;
   const queue=await loadRecord(env,'agent_jobs');queue.items.find((j:any)=>j.id===id).emailId=old.emailId;await saveRecord(env,'agent_jobs',queue);
   old.status='revision_requested';await saveRecord(env,'draft:'+old.id,old);await saveRecord(env,'owner_draft_context',{...activeDraft,pendingRevision:true});
  }
 }
 let overview:ReturnType<typeof mailOverview>|null=null,walk:any=null;
 if(!job.emailId||intent!=='contact'){
  const snapshot=await mailSnapshot();if(!snapshot.complete)throw Error('BOT_HISTORY_INCOMPLETE');overview=mailOverview(snapshot);
  if(intent==='analytics'){if(!priorWalk)await saveRecord(env,'owner_mail_walk',{seen:[],startedAt:new Date().toISOString()});const queue=await loadRecord(env,'agent_jobs');queue.items.find((j:any)=>j.id===id).emailId=null;await saveRecord(env,'agent_jobs',queue);return {processed:true,...await r.completeJob({id,answer:overviewText(overview)+'\n\nСамые старые неотвеченные:\n'+overview.oldest.map((t:any,i:number)=>(i+1)+'. '+t.email+' · '+new Date(t.lastMessageAt).toLocaleDateString('ru-RU',{timeZone:'America/New_York'})).join('\n')+'\n\nМогу пройти по ним по порядку и готовить ответы для подтверждения.'})};}
  if(intent==='backlog'||intent==='next'){
   const reset=/заново|с самого начала|сначала|самого начала/i.test(job.text);
   walk=reset||!priorWalk?{seen:[],startedAt:new Date().toISOString()}:priorWalk;
   const choice=await choosePending(snapshot,walk,{getThread:emailId=>r.getThread(emailId,{includeReferences:false}),loadState:threadId=>loadRecord(env,'threadstate:'+threadId)});
   walk={...walk,seen:choice.seen};
   if(!choice.context){await saveRecord(env,'owner_mail_walk',walk);return {processed:true,...await r.completeJob({id,answer:overviewText(overview)+'\n\n'+(choice.exhausted?'Все доступные в этом проходе неотвеченные ветки разобраны.':'Проверенные старые ветки уже обработаны или закрыты. Продолжу следующими, когда напишешь «дальше».')})}}
   context=choice.context;job.emailId=(context as any).canonical.id;
   const freshQueue=await loadRecord(env,'agent_jobs'),saved=freshQueue.items.find((j:any)=>j.id===id);saved.emailId=job.emailId;saved.mailWorkflow='oldest_unanswered';await saveRecord(env,'agent_jobs',freshQueue);
  }
 }
 if(job.emailId&&!context)context=await r.getThread(job.emailId,{includeReferences:false});
 if(job.emailId&&!context?.complete)throw Error('BOT_THREAD_INCOMPLETE');
 if(job.source==='hub_batch'&&context){const state=await loadRecord(env,'threadstate:'+(context as any).canonical.thread_id);if((context as any).thread?.state!=='waiting_on_us'||(context as any).thread?.latestMessageId!==(context as any).canonical.id||state?.closed||state?.status==='closed'||Date.parse(state?.snoozedUntil||'')>Date.now()){const queue=await loadRecord(env,'agent_jobs');Object.assign(queue.items.find((j:any)=>j.id===id),{status:'completed',skipped:'no_longer_waiting_on_us',prepareError:'',answer:'',requiresClarification:false});await saveRecord(env,'agent_jobs',queue);return {processed:true,status:'completed',skipped:true}}}
 if(job.source==='hub_batch'&&context){const queue=await loadRecord(env,'agent_jobs'),e:any=context.canonical;queue.items.find((j:any)=>j.id===id).hubContext={...job.hubContext,recipient:e.from_address_email,eaccount:e.eaccount,subject:e.subject,threadId:e.thread_id,incomingText:unquotedText(e),incomingAt:e.timestamp_email};await saveRecord(env,'agent_jobs',queue)}
 const result=await generateAnswer({ownerInstruction:walk?'Разбираем неотвеченные письма по порядку. По полной реальной ветке кратко объясни по-русски: что хочет креатор, где остановились и что предлагаешь ответить. Подготовь уместный английский черновик. Если для цены/условий нужно решение владельца — задай конкретный вопрос, не проси прислать историю. Исходный запрос: '+job.text:revision?'Исправь previousDraft по инструкции владельца, сохраняя остальные согласованные факты. Верни полный новый английский черновик, не только комментарий. Правка: '+job.text:job.text,previousDraft,conversation:context,mailAnalytics:overview,policy:playbook,missingContact:!job.emailId});
 if(walk&&context){result.answer=(overview?overviewText(overview)+'\n\n':'')+'Разбор · '+(context as any).canonical.from_address_email+'\n'+result.answer+'\n\nМожно уточнить ответ или перейти к следующему письму сообщением «дальше». Для отправки напиши «отправляй» после просмотра черновика.';result.answer=result.answer.slice(0,3500)}
 if(result.draftBody&&!job.emailId){result.draftBody='';result.requiresClarification=true;result.answer='С кем работаем? Напиши email креатора или ответь на сообщение с нужной перепиской.'}
 const completed=await r.completeJob({id,...result});
 if(walk&&context&&completed.status==='completed')await saveRecord(env,'owner_mail_walk',{...walk,seen:[...new Set([...walk.seen,(context as any).thread.id])],currentEmailId:job.emailId,updatedAt:new Date().toISOString()});
 return {processed:true,...completed};
}
// Telegram transport payload is validated against the bound owner before use.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function receiveUpdate(update:any,options:{allowSend?:boolean}={}){
 const env=Object.assign(environment(),{allowExternalSend:options.allowSend!==false}),config=await loadRecord(env,'telegram');const m=update.callback_query?{...update.callback_query.message,from:update.callback_query.from}:update.message;
 if(!config||m?.chat?.type!=='private'||m.chat.id!==config.chatId||m.from?.id!==config.userId||m.from.is_bot)return {ignored:true};
 if(!Number.isSafeInteger(update.update_id))return {ignored:true};
 if(options.allowSend===false&&dialogueAction(update.message?.text||'')==='confirm')return {ok:false,error:'OWNER_CONFIRMATION_MUST_COME_FROM_TELEGRAM'};
 // Insert-only claim: Telegram retries cannot repeat confirmations or a generated answer.
 const eventId='event:'+update.update_id;
 if(await loadRecord(env,eventId))return {duplicate:true};
 try{await saveRecord(env,eventId,{status:'processing',at:new Date().toISOString()})}catch{return {duplicate:true}}
 if(/^c(sel|add|hold):/.test(update.callback_query?.data||'')){
  await saveRecord(env,eventId,{status:'creator_pending',update,at:new Date().toISOString()});
  await telegram(env,'answerCallbackQuery',{callback_query_id:update.callback_query.id,text:'Принял. Действие по заявке выполнит фоновый агент.'}).catch(()=>null);return {queuedCreatorAction:true};
 }
 const tell=(text:string,extra={})=>telegram(env,'sendMessage',{chat_id:config.chatId,text:String(text).slice(0,4000),...extra});
 try{
  if(update.message?.text)await telegram(env,'sendChatAction',{chat_id:config.chatId,action:'typing'}).catch(()=>null);
  const inst=await loadRecord(env,'instantly');if(inst?.purpose!=='replies')throw Error('BOT_REPLY_INTEGRATION_MISSING');
  await processOwnerUpdate(update,config,inst,env,async(text:string,extra:object={})=>{
   if(text.startsWith('Принял. Проверю')||text.startsWith('Принял вопрос'))return tell('Принял. Разбираю переписку и готовлю ответ сейчас.');
   return tell(text,extra);
  },runtime(env));
  const result=await processJob(env,'telegram:'+update.update_id);
  await saveRecord(env,eventId,{status:'completed',at:new Date().toISOString()});
  return {ok:true,...result};
 }catch(e){
  const code=e instanceof Error?e.message:'BOT_FAILED';
  await saveRecord(env,eventId,{status:'failed',code:/^[A-Z_0-9]+$/.test(code)?code:'BOT_FAILED',at:new Date().toISOString()}).catch(()=>null);
  await tell(code==='BOT_FREE_QUOTA'?'Бесплатная квота Gemini временно исчерпана. Запрос сохранён, платный режим не включаю. Можно повторить позже.':'Не удалось закончить ответ сейчас. Запрос сохранён. Повтори вопрос; отправку письма без подтверждения не выполняю.').catch(()=>null);
  return {ok:false,error:code.startsWith('BOT_')?code:'BOT_FAILED'};
 }
}
