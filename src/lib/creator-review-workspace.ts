import 'server-only';
import {environment,loadRecord,saveRecord} from './promy-bot/store';
import {createHash} from 'node:crypto';
import {db} from './db';
import {redditDirectory,safeLinks} from './hub-data';
import {creatorProgress,creatorReviewState} from './creator-progress';
import {browserEvidence} from './browser-review-policy';
import {twelveMediaTask} from './twelve-media';
export async function reviewWorkspace(){
 const [rows,browserAgent]=await Promise.all([redditDirectory(),loadRecord(environment(),'_creator_browser_agent')]);return {browserAgent:browserAgent||{enabled:false},counts:creatorProgress(rows),at:new Date().toISOString(),rows:rows.map((c:any)=>({id:c.id,email:c.email,name:c.payload.name||c.payload.reddit||c.email,profile:c.payload.profile||'',videos:c.payload.videos||'',links:safeLinks(c.payload.profile+' '+c.payload.videos),price:c.payload.price||'',state:creatorReviewState(c),reason:c.payload.assessment?.reason||'',ownerRating:c.rating,ownerReason:c.reason,updatedAt:c.updated_at,legacy:c.legacy,browserReview:c.payload.browserReview||null}))};
}
async function canonical(c:any){
 if(!c.legacy)return c;
 const id=createHash('sha256').update(c.email.toLowerCase()).digest('hex').slice(0,16),payload={...c.payload,source:'legacy_browser_review'};
 const {data,error}=await db.from('reddit_creator_directory').insert({id,email:c.email,payload}).select('*').single();
 if(error)throw Error('Не удалось создать карточку исторического контакта. Обнови список.');return data;
}
export async function queueRemainingReviews(){
 const rows=await redditDirectory();let queued=0,conflicts=0;
 for(let i=0;i<rows.length;i+=5)await Promise.all(rows.slice(i,i+5).map(async(c:any)=>{
  if(['great','maybe','no'].includes(creatorReviewState(c))||c.review_pending)return;
  const current=await canonical(c),{data,error}=await db.from('reddit_creator_directory').update({review_pending:true,review_requested_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',current.id).eq('updated_at',current.updated_at).select('id');
  if(error)throw Error('Не удалось сохранить очередь. Уже добавленные заявки сохранены.');if(data?.length)queued++;else conflicts++;
 }));return {queued,conflicts};
}
export async function saveBrowserReview(input:any,reviewer:string){
 const evidence=browserEvidence(input),rows=await redditDirectory(),found=rows.find((c:any)=>c.id===input.id);
 if(!found||found.updated_at!==input.updatedAt)throw Error('Карточка изменилась. Обнови её перед сохранением.');
 const c=await canonical(found),at=new Date().toISOString(),previous=c.payload.browserReview;
 const browserReview={...evidence,at,reviewer,sourceFingerprint:c.payload.sourceFingerprint||null,previous:previous?{...previous,previous:undefined}:null};
 const payload={...c.payload,browserReview};
 const {data,error}=await db.from('reddit_creator_directory').update({payload,...(evidence.completed?{owner_rating:evidence.decision,owner_reason:evidence.reason,owner_reviewed_at:at,review_pending:false}:{}),updated_at:at}).eq('id',c.id).eq('updated_at',c.updated_at).select('id');
 if(error||!data?.length)throw Error('Кто-то обновил карточку одновременно. Текст не сохранён — повтори после обновления.');
 return {saved:true,completed:evidence.completed};
}

export async function setBrowserAgent(input:any){
 const env=environment(),current=await loadRecord(env,'_creator_browser_agent')||{enabled:false};
 if(input.op==='agent'){if(typeof input.enabled!=='boolean')throw Error('Неверное состояние');Object.assign(current,{enabled:input.enabled,requestedAt:new Date().toISOString()})}
 else if(input.op==='agentReport'){const summary=String(input.summary||'').trim();if(!summary||summary.length>1500)throw Error('Нужен краткий итог запуска');Object.assign(current,{lastReport:summary,lastRunAt:new Date().toISOString()})}
 await saveRecord(env,'_creator_browser_agent',current);return current;
}

export async function mediaServiceDiagnostics(){
 if(!process.env.GEMINI_API_KEY||process.env.GEMINI_FREE_PROJECT_CONFIRMED!=='true')throw Error('Free video service not configured');
 const r=await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=100',{headers:{'x-goog-api-key':process.env.GEMINI_API_KEY},cache:'no-store',signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw Error('MODEL_DISCOVERY_'+r.status);const d=await r.json();
 const known=new Set(['gemini-3.5-flash-lite','gemini-3.1-flash-lite','gemini-2.5-flash-lite']);
 const models=await Promise.all((d.models||[]).filter((m:any)=>known.has(String(m.name||'').replace('models/',''))).map(async(m:any)=>{
 const result:any={name:m.name,methods:m.supportedGenerationMethods||[]};
 try{const probe=await fetch('https://generativelanguage.googleapis.com/v1beta/'+m.name+':generateContent',{method:'POST',headers:{'x-goog-api-key':process.env.GEMINI_API_KEY!,'content-type':'application/json'},body:JSON.stringify({contents:[{parts:[{text:'Reply exactly OK.'}]}],generationConfig:{maxOutputTokens:16}}),signal:AbortSignal.timeout(15000),cache:'no-store'});const body=await probe.json().catch(()=>({}));result.http=probe.status;result.rpcStatus=body.error?.status||null;const msg=String(body.error?.message||'');result.errorKind=!msg?null:/model/i.test(msg)?'model_unavailable':/file/i.test(msg)?'file_unavailable':/quota|exhaust/i.test(msg)?'quota':/demand|overload|unavailable/i.test(msg)?'service_unavailable':'other';}catch{result.http=null;result.errorKind='network_timeout'}return result;
 }));
 const env=environment(),state=await loadRecord(env,'_creator_browser_agent')||{enabled:false};state.diagnostics={at:new Date().toISOString(),models};await saveRecord(env,'_creator_browser_agent',state);return {models};
}

// Owner-only, bounded real-media control: same uploaded sample/key/model, minimal request.
// No source file or credential is returned; a text probe cannot prove audio support.
export async function mediaSampleDiagnostic(model='gemini-3.5-flash-lite'){
 if(!['gemini-3.5-flash-lite','gemini-3.8-flash'].includes(model))throw Error('Diagnostic model not allowed');
 if(!process.env.GEMINI_API_KEY||process.env.GEMINI_FREE_PROJECT_CONFIRMED!=='true')throw Error('Free video service not configured');
 const {data:row}=await db.from('creator_media_reviews').select('provider_file').eq('creator_id','hub-33b8ab62652e566d').not('provider_file','is',null).order('started_at',{ascending:false}).limit(1).maybeSingle();
 const f=row?.provider_file;if(!f?.uri?.startsWith('https://generativelanguage.googleapis.com/'))throw Error('Cached Mary sample missing');
 const started=Date.now();const r=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+model+':generateContent',{method:'POST',headers:{'x-goog-api-key':process.env.GEMINI_API_KEY,'content-type':'application/json'},body:JSON.stringify({contents:[{parts:[{fileData:{fileUri:f.uri,mimeType:f.mimeType}},{text:'Listen to the actual audio and inspect the video. Quote the first 15 spoken words exactly, with approximate timestamps. Describe vocal pace, clarity, energy, pauses and background noise with concrete audible evidence. Separately describe the visible framing. If audio is unavailable say so; never infer speech from captions. Answer in Russian, keeping quoted speech in its original language.'}]}],generationConfig:{maxOutputTokens:1800}}),signal:AbortSignal.timeout(40000),cache:'no-store'}).catch(()=>null);
 const d=await r?.json().catch(()=>({}))||{};const clean=(v:unknown)=>String(v||'').replace(/https?:\/\/\S+/g,'[url]').replace(/AIza[\w-]+/g,'[redacted]').slice(0,6000);
 const result={at:new Date().toISOString(),test:'same_real_video_minimal_request',model,http:r?.status||null,rpcStatus:d.error?.status||null,message:r?clean(d.error?.message):'Provider request exceeded 40 seconds',elapsedMs:Date.now()-started,text:r?.ok?clean((d.candidates?.[0]?.content?.parts||[]).map((p:any)=>p.text||'').join('')):''};
 const env=environment(),state=await loadRecord(env,'_creator_browser_agent')||{enabled:false};state.mediaControl=result;await saveRecord(env,'_creator_browser_agent',state);return result;
}

export async function twelveSampleDiagnostic(){
 const env=environment(),state=await loadRecord(env,'_creator_browser_agent')||{enabled:false};
 const result=await twelveMediaTask({apiKey:process.env.TWELVELABS_API_KEY||'',freePlanConfirmed:process.env.TWELVELABS_FREE_PLAN_CONFIRMED==='true',source:'https://maryfeeneyugc.my.canva.site/_assets/video/aa25d9a71029c586b16137866cd82bc7.mp4',taskId:state.twelveControl?.taskId});
 state.twelveControl={...result,at:new Date().toISOString()};await saveRecord(env,'_creator_browser_agent',state);return result;
}
