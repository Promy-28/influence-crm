import {createAgentRuntime} from './agent-runtime';
import {processOwnerUpdate} from './owner-update';
import {api,telegram,loadRecord,saveRecord,environment,campaigns,type StoreEnv} from './store';
import {generateAnswer} from './generate';
import playbook from './playbook.json';
const runtime=(env:StoreEnv)=>createAgentRuntime({env,api,telegram,loadRecord,saveRecord,campaigns});
export async function processJob(env:StoreEnv,id:string){
 const q=await loadRecord(env,'agent_jobs'),job=q?.items?.find((j:{id:string})=>j.id===id);
 if(!job||job.status!=='new')return {processed:false};
 const r=runtime(env);let context:Awaited<ReturnType<typeof r.getThread>>|null=null;
 if(job.emailId)context=await r.getThread(job.emailId,{includeReferences:false});
 if(job.emailId&&!context?.complete)throw Error('BOT_THREAD_INCOMPLETE');
 const result=await generateAnswer({ownerInstruction:job.text,conversation:context,policy:playbook,missingContact:!job.emailId});
 if(result.draftBody&&!job.emailId){result.draftBody='';result.requiresClarification=true;result.answer='С кем работаем? Напиши email креатора или ответь на сообщение с нужной перепиской.'}
 return {processed:true,...await r.completeJob({id,...result})};
}
// Telegram transport payload is validated against the bound owner before use.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function receiveUpdate(update:any){
 const env=environment(),config=await loadRecord(env,'telegram');const m=update.callback_query?{...update.callback_query.message,from:update.callback_query.from}:update.message;
 if(!config||m?.chat?.type!=='private'||m.chat.id!==config.chatId||m.from?.id!==config.userId||m.from.is_bot)return {ignored:true};
 if(!Number.isSafeInteger(update.update_id))return {ignored:true};
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
