import 'server-only';
import {db,all} from './db';
import {api,loadRecord,saveRecord,telegram,type StoreEnv} from './promy-bot/store';
import {createAgentRuntime} from './promy-bot/agent-runtime';
import {generateAnswer} from './promy-bot/generate';
import {getSettings} from './settings';
import {assertApifyIncoming} from './mail-source';
import {unquotedText} from './promy-bot/mail-analysis';
export async function apifyCreator(id:string){const {data,error}=await db.from('creators').select('id,email,source,inst_campaign_id,inst_reply_uuid,eaccount,do_not_contact,unsubscribed_at,bounced_at,needs_reply,first_name,handle,ref_code').eq('id',id).eq('source','apify').maybeSingle();if(error||!data)throw Error('APIFY_CREATOR_NOT_FOUND');return data}
export async function apifyRuntime(env:StoreEnv,id:string){
 const c=await apifyCreator(id);if(!c.inst_campaign_id||['2d02d560-a584-4844-948c-3ed035b9e9e8','9296d2af-c971-40c5-9572-440860bc2a65'].includes(c.inst_campaign_id))throw Error('APIFY_CAMPAIGN_NOT_ALLOWED');
 return {creator:c,runtime:createAgentRuntime({env,api,telegram,loadRecord,saveRecord,campaigns:[c.inst_campaign_id],validateIncoming:(e:any)=>assertApifyIncoming(e,c)})};
}
export async function liveApifyConversation(env:StoreEnv,id:string){
 const {creator:c,runtime:r}=await apifyRuntime(env,id);let emailId=c.inst_reply_uuid;
 if(!emailId){const inst=await loadRecord(env,'instantly'),q=new URLSearchParams({search:c.email,limit:'100',mode:'emode_all',preview_only:'false',sort_order:'desc'}),page=await api(inst.key,'/emails?'+q);if(page.next_starting_after)throw Error('APIFY_SEARCH_INCOMPLETE');const candidates=(page.items||[]).filter((e:any)=>Number(e.ue_type)===2&&e.campaign_id===c.inst_campaign_id&&String(e.from_address_email||'').toLowerCase()===c.email.toLowerCase()&&(!c.eaccount||c.eaccount===e.eaccount));const threads=new Set(candidates.map((e:any)=>JSON.stringify([e.thread_id,e.eaccount])));if(threads.size!==1)throw Error('APIFY_THREAD_AMBIGUOUS');emailId=candidates[0].id}
 let context:any=await r.getThread(emailId,{includeReferences:false});if(!context.complete)throw Error('BOT_THREAD_INCOMPLETE');
 if(context.thread?.latestInboundId&&context.thread.latestInboundId!==context.canonical.id)context=await r.getThread(context.thread.latestInboundId,{includeReferences:false});
 if(!context.complete)throw Error('BOT_THREAD_INCOMPLETE');assertApifyIncoming(context.canonical,c);return {creator:c,runtime:r,context};
}
export async function apifyCandidates(){return all<any>((from,to)=>db.from('creators').select('id,email,inst_reply_uuid').eq('source','apify').eq('needs_reply',true).eq('do_not_contact',false).is('unsubscribed_at',null).is('bounced_at',null).order('last_reply_at',{ascending:true}).order('id').range(from,to))}
export async function prepareApifyJob(env:StoreEnv,job:any){
 const {creator:c,runtime:r,context}=await liveApifyConversation(env,job.creatorId),q=await loadRecord(env,'agent_jobs'),saved=q.items.find((j:any)=>j.id===job.id);
 if(!saved||saved.status!=='new')return {processed:false};
 const state=await loadRecord(env,'threadstate:'+context.canonical.thread_id);
 if(context.thread?.state!=='waiting_on_us'||context.thread.latestMessageId!==context.canonical.id||state?.closed||state?.status==='closed'||Date.parse(state?.snoozedUntil||'')>Date.now()){Object.assign(saved,{status:'completed',skipped:'no_longer_waiting_on_us',prepareError:'',answer:''});await saveRecord(env,'agent_jobs',q);return {processed:true,skipped:true,status:'completed'}}
 Object.assign(saved,{emailId:context.canonical.id,hubContext:{...job.hubContext,creatorId:c.id,recipient:c.email,eaccount:context.canonical.eaccount,subject:context.canonical.subject,threadId:context.canonical.thread_id,incomingText:unquotedText(context.canonical),incomingAt:context.canonical.timestamp_email}});await saveRecord(env,'agent_jobs',q);
 const settings=await getSettings(),link=settings.signup_url.replace('{code}',c.ref_code||'');
 const result=await generateAnswer({ownerInstruction:job.text,previousDraft:job.hubContext?.previousDraft||null,conversation:context,policy:{businessContext:settings.kb,creatorSignupLink:link,rules:'Apify creator, not Reddit. Only facts and conditions in this actual thread or explicit owner instruction are authoritative. Do not invent profile review, sample approval, agreed rates, deliverables, brands or deadlines. Ask the owner for missing material terms.'}});
 return {processed:true,...await r.completeJob({id:job.id,...result})};
}
export async function completeApifyJob(env:StoreEnv,job:any,args:any){const {runtime:r}=await apifyRuntime(env,job.creatorId);return r.completeJob(args)}
export async function apifyConversationByEmailId(env:StoreEnv,emailId:string){const q=await loadRecord(env,'agent_jobs'),job=q?.items?.find((j:any)=>j.mailSource==='apify'&&j.emailId===emailId&&j.creatorId);if(job)return (await liveApifyConversation(env,job.creatorId)).context;const {data}=await db.from('creators').select('id').eq('source','apify').eq('inst_reply_uuid',emailId).limit(2);if(data?.length!==1)throw Error('APIFY_THREAD_NOT_ALLOWED');return (await liveApifyConversation(env,data[0].id)).context}
