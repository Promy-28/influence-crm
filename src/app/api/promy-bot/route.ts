import {assertNewOutreach} from '@/lib/outreach-protection';
import {localOutreachProtection} from '@/lib/outreach-protection-server';
import {queueWritingRefresh} from '@/lib/writing-refresh';
import {createAgentRuntime} from '@/lib/promy-bot/agent-runtime';
import {api,campaigns} from '@/lib/promy-bot/store';
import {mergeDirectoryPayload} from '@/lib/reddit-intake';
import {syncRedditForm} from '@/lib/reddit-form-sync';
import {queueAutomaticMail} from '@/lib/auto-mail';
import {syncBranding} from '@/lib/branding-sync';
import {reconcileCreatorImports} from '@/lib/creator-import-server';
import {after} from 'next/server';
import {settlesCreatorRequest} from '@/lib/creator-progress';
import {NextResponse} from 'next/server';
import {db} from '@/lib/db';
import {adminAuthorized,sharedId,environment,loadRecord,saveRecord,telegram,webhookSecret} from '@/lib/promy-bot/store';
import {processJob,receiveUpdate,completeCloudJob} from '@/lib/promy-bot/realtime';
import {apifyConversationByEmailId} from '@/lib/apify-mail';
export const runtime='nodejs';
export const maxDuration=60;
export const dynamic='force-dynamic';
export async function POST(req:Request){
 if(!adminAuthorized(req))return NextResponse.json({error:'Unauthorized'},{status:401});
 const env=environment();let b;try{b=await req.json()}catch{return NextResponse.json({error:'Invalid JSON'},{status:400})}
 try{
  if(b.op==='queueWritingRefresh')return NextResponse.json(await queueWritingRefresh());
  if(b.op==='checkOutreach'){if(typeof b.email!=='string'||b.email.length>254)throw Error('Invalid email');const inst=await loadRecord(env,'instantly');try{await assertNewOutreach(b.email,(path,body)=>api(inst.key,path,body),()=>localOutreachProtection(b.email));return NextResponse.json({allowed:true});}catch(e){return NextResponse.json({allowed:false,reason:e instanceof Error?e.message:'Проверка не завершена'});}}
  if(b.op==='autoQueue')return NextResponse.json(await queueAutomaticMail());
  if(b.op==='syncBranding')return NextResponse.json(await syncBranding());
  if(b.op==='syncRedditForm')return NextResponse.json(await syncRedditForm());
  if(b.op==='apifyThread'&&typeof b.emailId==='string')return NextResponse.json(await apifyConversationByEmailId(env,b.emailId));
  if(b.op==='emailThread'&&typeof b.emailId==='string'){
   const r=createAgentRuntime({env,api,telegram,loadRecord,saveRecord,campaigns});
   try{return NextResponse.json(await r.getThread(b.emailId))}catch{return NextResponse.json(await apifyConversationByEmailId(env,b.emailId))}
  }
  if(b.op==='completeJob'&&b.args&&typeof b.args.id==='string')return NextResponse.json(await completeCloudJob(env,b.args));
  if(b.op==='directorySync'){
   if(!Array.isArray(b.records)||b.records.length>1000)throw Error('Invalid directory');
   const rows=b.records.map((r:any)=>{if(!/^[a-f0-9]{16}$/.test(r.id)||typeof r.email!=='string'||!r.payload)throw Error('Invalid creator');return {id:r.id,email:r.email.toLowerCase(),payload:r.payload,updated_at:new Date().toISOString()}});
   const {data:previous}=await db.from('reddit_creator_directory').select('id,email,payload,updated_at,review_pending,review_requested_at').limit(1000);
   const byEmail=new Map((previous||[]).map((r:any)=>[r.email,r]));
   for(const row of rows){const existing:any=byEmail.get(row.email),settled=settlesCreatorRequest(existing,row.payload);row.payload=mergeDirectoryPayload(existing?.payload,row.payload);
    if(!existing)await db.from('reddit_creator_directory').insert(row);
    else if(settled||JSON.stringify(existing.payload)!==JSON.stringify(row.payload))await db.from('reddit_creator_directory').update({payload:row.payload,updated_at:row.updated_at,...(settled?{review_pending:false}:{})}).eq('id',existing.id).eq('updated_at',existing.updated_at);
   }
   if(b.status)await saveRecord(env,'_creator_agent_status',b.status);
   return NextResponse.json({synced:rows.length});
  }
  if(b.op==='directoryWork'){
   after(async()=>{try{await reconcileCreatorImports()}catch{/* Read-only hourly reconciliation resumes on the next call. */}});
   const [requests,feedback]=await Promise.all([db.from('reddit_creator_directory').select('id,email,payload,review_requested_at').eq('review_pending',true).order('review_requested_at').limit(20),db.from('reddit_creator_directory').select('id,email,owner_rating,owner_reason,payload').not('owner_reviewed_at','is',null).order('owner_reviewed_at',{ascending:false}).limit(20)]);
   return NextResponse.json({requests:requests.data||[],feedback:feedback.data||[]});
  }
  if(b.op==='ackDirectory'&&Array.isArray(b.ids)&&b.ids.length<=20){await db.from('reddit_creator_directory').update({review_pending:false}).in('id',b.ids);return NextResponse.json({saved:true})}
  if(b.op==='bootstrap'){
   if(!Array.isArray(b.records)||b.records.length>50)return NextResponse.json({error:'Invalid batch'},{status:400});
   let imported=0;for(const r of b.records){if(typeof r.id!=='string'||!sharedId(r.id))throw Error('Invalid record');if(await loadRecord(env,r.id)===null){await saveRecord(env,r.id,r.value);imported++}}
   if(b.token){if(typeof b.token!=='string'||!/^\d+:[A-Za-z0-9_-]+$/.test(b.token))throw Error('Invalid token');await saveRecord(env,'_transport',{token:b.token})}
   return NextResponse.json({imported});
  }
  if(b.op==='get'&&sharedId(b.id)){const value=await loadRecord(env,b.id);return NextResponse.json({value,version:env.versions.get(b.id)||0})}
  if(b.op==='set'&&sharedId(b.id)){if(!Number.isSafeInteger(b.version)||b.version<0)throw Error('Invalid version');env.versions.set(b.id,b.version);await saveRecord(env,b.id,b.value);return NextResponse.json({saved:true,version:env.versions.get(b.id)})}
  if(b.op==='register'){
   const result=await telegram(env,'setWebhook',{url:'https://influence-crm-ashy.vercel.app/api/webhooks/promy-telegram',secret_token:webhookSecret(),max_connections:1,allowed_updates:['message','callback_query'],drop_pending_updates:false});
   return NextResponse.json({registered:result===true});
  }
  if(b.op==='status'){const active=await loadRecord(env,'owner_draft_context'),draft=active?.draftId?await loadRecord(env,'draft:'+active.draftId):null;const preview=draft?{id:draft.id,emailId:draft.emailId,status:draft.status,recipient:draft.recipient,from:draft.eaccount,macroName:draft.macroName||null,bannerUrl:draft.bannerUrl||null,hasHtml:!!draft.html,body:draft.body,sentAt:draft.sentAt||null,sentId:draft.sentId||null}:null;const info=await telegram(env,'getWebhookInfo');const {data}=await db.from('promy_bot_records').select('id,updated_at').like('id','event:%').order('updated_at',{ascending:false}).limit(5);return NextResponse.json({preview,webhook:info.url,pending:info.pending_update_count,lastError:info.last_error_message||null,events:data,freeModel:!!process.env.GEMINI_API_KEY&&process.env.GEMINI_FREE_PROJECT_CONFIRMED==='true'})}
  if(b.op==='creatorUpdates'){const {data}=await db.from('promy_bot_records').select('id').like('id','event:%').order('updated_at',{ascending:false}).limit(100);const items:unknown[]=[];for(const row of data||[]){const v=await loadRecord(env,row.id);if(v?.status==='creator_pending')items.push(v.update)}return NextResponse.json({items:items.slice(0,20)})}
  if(b.op==='ackCreator'&&Number.isSafeInteger(b.updateId)){await saveRecord(env,'event:'+b.updateId,{status:'completed',at:new Date().toISOString()});return NextResponse.json({saved:true})}
  if(b.op==='processJob'&&typeof b.id==='string'&&b.id.startsWith('telegram:'))return NextResponse.json(await processJob(env,b.id));
  // Owner-private test path can only ask/generate; cannot confirm a send or forge a callback.
  if(b.op==='testQuestion'&&typeof b.text==='string'&&!b.text.trimStart().startsWith('/')&&b.text.length<5000){const c=await loadRecord(env,'telegram');const result=await receiveUpdate({update_id:Math.floor(Date.now()),message:{message_id:0,chat:{id:c.chatId,type:'private'},from:{id:c.userId,is_bot:false},text:b.text}},{allowSend:false});const active=await loadRecord(env,'owner_draft_context'),draft=active?.draftId?await loadRecord(env,'draft:'+active.draftId):null;const queue=await loadRecord(env,'agent_jobs'),job=queue?.items?.find((j:any)=>j.id===(result as any).id);return NextResponse.json({...result,job:job?{emailId:job.emailId,answer:job.answer||null,requiresClarification:!!job.requiresClarification}:null,preview:draft?{id:draft.id,emailId:draft.emailId,status:draft.status,recipient:draft.recipient,from:draft.eaccount,macroName:draft.macroName||null,bannerUrl:draft.bannerUrl||null,hasHtml:!!draft.html,body:draft.body,sentAt:draft.sentAt||null}:null})}
  return NextResponse.json({error:'Unsupported operation'},{status:400});
 }catch(e){return NextResponse.json({error:e instanceof Error&&e.message==='BOT_STATE_CONFLICT'?'BOT_STATE_CONFLICT':'BOT_OPERATION_FAILED'},{status:409})}
}
