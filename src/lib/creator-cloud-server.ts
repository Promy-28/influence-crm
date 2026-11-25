import 'server-only';
import {createHmac,timingSafeEqual} from 'node:crypto';
import {db} from './db';
import {creatorReviewState} from './creator-progress';
import {portfolioLinks,embeddedMedia,cloudAssessment} from './creator-cloud-policy';
import {mediaSource} from './media-review';
import {publicPortfolioMedia} from './jockey-review';
import {POST as analyze} from '@/app/api/media-review/route';
import {NextRequest} from 'next/server';
import {renderPortfolioMedia} from './creator-cloud-browser';
const origin='https://influence-crm-ashy.vercel.app';
const token=()=>createHmac('sha256',process.env.SESSION_SECRET!).update('creator-cloud-tick-v1').digest('hex');
export function cloudTickAuthorized(value:string){const a=Buffer.from(value),b=Buffer.from(token());return a.length===b.length&&timingSafeEqual(a,b)}
export async function cloudQueueStatus(){
 const [control,jobs,claims]=await Promise.all([db.from('creator_cloud_control').select('*').eq('id',true).single(),db.from('creator_cloud_jobs').select('creator_id,status,error,next_at,updated_at'),db.from('creator_cloud_claims').select('creator_id').gte('hour',new Date(new Date().setUTCMinutes(0,0,0)).toISOString())]);
 if(control.error||jobs.error||claims.error)return {ready:false,error:'SERVER_QUEUE_MIGRATION_REQUIRED'};
 const counts={queued:0,processing:0,completed:0,blocked:0};for(const j of jobs.data||[])counts[j.status as keyof typeof counts]++;
 return {ready:true,...control.data,active:control.data.enabled&&(!control.data.until_at||Date.parse(control.data.until_at)>Date.now()),counts,usedThisHour:claims.data?.length||0,hourlyLimit:20,nextHour:new Date(new Date().setUTCMinutes(60,0,0)).toISOString(),blockers:(jobs.data||[]).filter(j=>j.status==='blocked').slice(0,20)};
}
export async function configureCloudQueue(mode:'day'|'continuous'|'pause'){
 if(!['day','continuous','pause'].includes(mode))throw Error('Invalid queue mode');
 if(mode!=='pause'){
  const {data,error}=await db.from('reddit_creator_directory').select('*');if(error)throw Error('QUEUE_SOURCE_READ_FAILED');
  const {data:existing,error:readError}=await db.from('creator_cloud_jobs').select('creator_id,fingerprint,status');if(readError)throw Error('QUEUE_NOT_READY');
  const byId=new Map<string,any>((existing||[]).map((j:any)=>[j.creator_id,j]));
  const rows=(data||[]).filter(c=>!['great','maybe','no'].includes(creatorReviewState(c))).filter(c=>!byId.has(c.id)||byId.get(c.id)?.fingerprint!==c.payload.sourceFingerprint).map(c=>({creator_id:c.id,fingerprint:c.payload.sourceFingerprint||null,status:'queued',source:null,parent_url:null,samples:[],error:null,attempts:0,lease_until:null,next_at:new Date().toISOString()}));
  if(rows.length){const {error:e}=await db.from('creator_cloud_jobs').upsert(rows);if(e)throw Error('QUEUE_SAVE_FAILED')}
  // A dedicated HMAC, not APP_PASSWORD. Settings is server-only; never return this URL.
  const {error:e}=await db.from('settings').upsert({key:'creator_cloud_cron_url',value:origin+'/api/creator-review/cloud-tick?token='+token()});if(e)throw Error('QUEUE_CRON_CONFIG_FAILED');
 }
 const at=new Date().toISOString(),{error}=await db.from('creator_cloud_control').update({enabled:mode!=='pause',until_at:mode==='day'?new Date(Date.now()+86400000).toISOString():null,...(mode!=='pause'?{started_at:at}:{}),updated_at:at}).eq('id',true);if(error)throw Error('QUEUE_CONTROL_FAILED');
 return cloudQueueStatus();
}
async function portfolioHtml(url:string){
 let current=url;
 for(let redirects=0;redirects<3;redirects++){
  if(!await publicPortfolioMedia(current,current))throw Error('PORTFOLIO_NOT_PUBLIC');
  const r=await fetch(current,{redirect:'manual',signal:AbortSignal.timeout(12000),headers:{accept:'text/html'},cache:'no-store'});
  if(r.status>=300&&r.status<400){const next=new URL(r.headers.get('location')||'',current);if(!['canva.link','www.canva.com','canva.com'].includes(new URL(current).hostname)||!['www.canva.com','canva.com'].includes(next.hostname))throw Error('PORTFOLIO_REDIRECT_REQUIRES_BROWSER');current=next.href;continue}
  if(!r.ok)throw Error('PORTFOLIO_HTTP_'+r.status);
  if(!/text\/html/.test(r.headers.get('content-type')||''))throw Error('PORTFOLIO_HTML_REQUIRED');
  const reader=r.body?.getReader();if(!reader)throw Error('PORTFOLIO_EMPTY');let size=0,text='';const decoder=new TextDecoder();
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2000000)break;text+=decoder.decode(value,{stream:true})}}finally{await reader.cancel()}
  return embeddedMedia(text,current);
 }throw Error('PORTFOLIO_REDIRECT_LIMIT');
}
async function discover(c:any,j:any){
 if(j.source)return {source:j.source,parentUrl:j.parent_url};
 const links=portfolioLinks(c.payload.videos+' '+c.payload.profile);
 // Resume cached original media for this exact creator; never substitute another identity.
 const {data:cached}=await db.from('creator_media_reviews').select('source,status,result').eq('creator_id','hub-'+c.id).order('started_at',{ascending:false}).limit(12);
 const ordered=[...(cached||[])].sort((a:any,b:any)=>Number(!!b.result?.audioReviewed&&b.result?.englishSpeech===true)-Number(!!a.result?.audioReviewed&&a.result?.englishSpeech===true));
 for(const x of ordered){const parent=links.find(p=>{try{return new URL(p).hostname===new URL(x.source).hostname||(['canva.link','www.canva.com'].includes(new URL(p).hostname)&&new URL(x.source).hostname==='media.canva.com')}catch{return false}});if(parent&&!j.samples.includes(x.source))return {source:x.source,parentUrl:parent}}
 for(const p of links){try{const source=mediaSource(p,p);if(!j.samples.includes(source))return {source,parentUrl:p}}catch{}}
 for(const p of links.slice(0,3)){
  if(/(?:instagram|tiktok|photos\.icloud)\.com/.test(new URL(p).hostname))continue;
  try{const media=await portfolioHtml(p);for(const source of media)if(!j.samples.includes(source)){mediaSource(source,p);return {source,parentUrl:p}}}catch{}
  try{for(const source of await renderPortfolioMedia(p))if(!j.samples.includes(source)){mediaSource(source,p);return {source,parentUrl:p}}}catch{}
 }
 throw Error('NEEDS_RENDERED_VIDEO_SOURCE');
}
async function processCloudJob(j:any){
 const {data:c,error}=await db.from('reddit_creator_directory').select('*').eq('id',j.creator_id).single();if(error||!c)throw Error('CREATOR_NOT_FOUND');
 const save=async(value:any)=>{const {error:e}=await db.from('creator_cloud_jobs').update({...value,lease_until:null,updated_at:new Date().toISOString()}).eq('creator_id',j.creator_id).eq('lease_until',j.lease_until);if(e)throw Error('QUEUE_RESULT_SAVE_FAILED')};
 if((c.payload.sourceFingerprint||null)!==j.fingerprint){await save({status:'blocked',error:'SOURCE_CHANGED_REQUEUE_REQUIRED'});return}
 if(['great','maybe','no'].includes(creatorReviewState(c))){await save({status:'completed',error:null});return}
 try{
  if(j.samples.length>=2&&!j.source)throw Error('NO_SPEECH_AFTER_TWO_SAMPLES');
  const {source,parentUrl}=await discover(c,j);
  // Persist before provider work so a timeout resumes the same source.
  await db.from('creator_cloud_jobs').update({status:'processing',source,parent_url:parentUrl,attempts:j.attempts+1}).eq('creator_id',j.creator_id).eq('lease_until',j.lease_until);
  const response=await analyze(new NextRequest(origin+'/api/media-review',{method:'POST',headers:{authorization:'Bearer '+process.env.APP_PASSWORD,'content-type':'application/json'},body:JSON.stringify({creatorId:'hub-'+c.id,source,parentUrl})}));const r=await response.json();
  if(r.status==='completed'&&r.result){
   const assessment=cloudAssessment({...r.result,source},c.payload.price);
   if(!assessment){await save({source:null,parent_url:null,samples:[...j.samples,source],status:j.samples.length>=1?'blocked':'queued',error:'SAMPLE_WITHOUT_VERIFIED_SPEECH',next_at:new Date(Date.now()+3600000).toISOString()});return}
   const payload={...c.payload,assessment,autonomousReview:{assessment,fingerprint:j.fingerprint,source,parentUrl,at:assessment.at},reviewSourceFingerprint:j.fingerprint,reviewStatus:'awaiting_owner',mediaEvidence:r.result};
   const {data:written,error:e}=await db.from('reddit_creator_directory').update({payload,review_pending:false,updated_at:assessment.at}).eq('id',c.id).eq('updated_at',c.updated_at).select('id');if(e||!written?.length)throw Error('SOURCE_CHANGED_RESULT_NOT_APPLIED');
   await save({status:'completed',error:null});return;
  }
  const code=String(r.error||r.status||'MEDIA_UNAVAILABLE').slice(0,120),temporary=r.deferred||['processing','hourly_limit'].includes(r.status)||response.status>=500||response.status===429;
  await save({status:temporary?'processing':'blocked',error:code,next_at:new Date(Date.now()+(r.status==='hourly_limit'?3600000:temporary?600000:86400000)).toISOString()});
 }catch(e){await save({status:'blocked',error:e instanceof Error?e.message.slice(0,120):'QUEUE_JOB_FAILED',next_at:new Date(Date.now()+86400000).toISOString()})}
}
export async function runCloudQueue(){
 // One-time upgrade of jobs previously blocked by the HTML-only resolver.
 const {data:old}=await db.from('creator_cloud_jobs').select('creator_id').eq('status','blocked').eq('error','NEEDS_ACCESSIBLE_VIDEO_SOURCE');
 if(old?.length){const {data:rows}=await db.from('reddit_creator_directory').select('id,payload').in('id',old.map((j:any)=>j.creator_id));const ids=(rows||[]).filter((c:any)=>/canva\.(link|site|com)/i.test(c.payload.videos||'')).map((c:any)=>c.id);if(ids.length)await db.from('creator_cloud_jobs').update({status:'queued',error:'RENDERER_UPGRADE_RETRY',next_at:new Date().toISOString()}).in('creator_id',ids).eq('status','blocked').eq('error','NEEDS_ACCESSIBLE_VIDEO_SOURCE')}
 const {data:jobs,error}=await db.rpc('claim_creator_cloud_jobs');if(error)throw Error('QUEUE_CLAIM_FAILED');
 await Promise.all((jobs||[]).map(processCloudJob));return {handled:jobs?.length||0,...await cloudQueueStatus()};
}
