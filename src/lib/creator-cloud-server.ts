import 'server-only';
import {createHmac,timingSafeEqual} from 'node:crypto';
import {all,db} from './db';
import {syncRedditForm} from './reddit-form-sync';
import {creatorReviewState} from './creator-progress';
import {portfolioLinks,embeddedMedia,cloudAssessment,publicSocialPosts,socialPlatform,socialPostMedia,tiktokProfileEmbed,tiktokEmbedPosts} from './creator-cloud-policy';
import {tiktokPlayer} from './post-preview';
import {mediaSource} from './media-review';
import {publicPortfolioMedia} from './jockey-review';
import {POST as analyze} from '@/app/api/media-review/route';
import {NextRequest} from 'next/server';
import {renderPortfolioMedia} from './creator-cloud-browser';
const origin='https://influence-crm-ashy.vercel.app';
const token=()=>createHmac('sha256',process.env.SESSION_SECRET!).update('creator-cloud-tick-v1').digest('hex');
export function cloudTickAuthorized(value:string){const a=Buffer.from(value),b=Buffer.from(token());return a.length===b.length&&timingSafeEqual(a,b)}
export async function cloudQueueStatus(){
 const [control,jobs,claims]=await Promise.all([db.from('creator_cloud_control').select('*').eq('id',true).single(),db.from('creator_cloud_jobs').select('creator_id,status,error,next_at,updated_at,lease_until,source'),db.from('creator_cloud_claims').select('creator_id').gte('hour',new Date(new Date().setUTCMinutes(0,0,0)).toISOString())]);
 if(control.error||jobs.error||claims.error)return {ready:false,error:'SERVER_QUEUE_MIGRATION_REQUIRED'};
 const counts={queued:0,processing:0,completed:0,blocked:0};for(const j of jobs.data||[])counts[j.status as keyof typeof counts]++;
 return {ready:true,...control.data,active:control.data.enabled&&(!control.data.until_at||Date.parse(control.data.until_at)>Date.now()),counts,usedThisHour:claims.data?.length||0,hourlyLimit:20,nextHour:new Date(new Date().setUTCMinutes(60,0,0)).toISOString(),activeJobs:(jobs.data||[]).filter(j=>j.status==='processing').map(j=>({id:j.creator_id,stage:Date.parse(j.lease_until||'')>Date.now()?(j.source?'analyzing':'discovering'):'provider_wait',nextAt:j.next_at})),blockers:(jobs.data||[]).filter(j=>j.status==='blocked').slice(0,20).map(({creator_id,status,error,next_at,updated_at})=>({creator_id,status,error,next_at,updated_at}))};
}
async function refreshFormIntake(){
 const key='creator_cloud_last_form_sync';
 const {data,error}=await db.from('settings').select('value').eq('key',key).maybeSingle();
 if(error)throw Error('QUEUE_SYNC_STATUS_FAILED');
 if(Date.now()-Date.parse(data?.value||'')<300000)return;
 const result=await syncRedditForm();
 if(!result.conflicts)await db.from('settings').upsert({key,value:new Date().toISOString()});
}

type CloudIdentity = {creator_id:string; fingerprint:string|null; lease_until:string|null};
type QueuedJob = CloudIdentity & {status:'queued';source:null;parent_url:null;samples:string[];error:null;attempts:number;next_at:string};

async function enqueueUnreviewedCreators(){
 const [creators,existing]=await Promise.all([
  all<any>(async (from,to)=>{
   const result=await db.from('reddit_creator_directory').select('id,payload,review_pending').order('id').range(from,to);
   if(result.error)throw Error('QUEUE_SOURCE_READ_FAILED');
   return result;
  }),
  all<CloudIdentity>(async (from,to)=>{
   const result=await db.from('creator_cloud_jobs').select('creator_id,fingerprint,lease_until').order('creator_id').range(from,to);
   if(result.error)throw Error('QUEUE_NOT_READY');
   return result;
  }),
 ]);
 const byId=new Map(existing.map(job=>[job.creator_id,job]));
 const next_at=new Date().toISOString();
 const fresh:QueuedJob[]=[];const changed:{row:QueuedJob;old:CloudIdentity}[]=[];
 for(const creator of creators){
  if(['great','maybe','no'].includes(creatorReviewState(creator)))continue;
  const fingerprint=creator.payload.sourceFingerprint||null;
  const old=byId.get(creator.id);
  const row:QueuedJob={creator_id:creator.id,fingerprint,status:'queued',source:null,parent_url:null,samples:[],error:null,attempts:0,lease_until:null,next_at};
  if(!old)fresh.push(row);
  else if(old.fingerprint!==fingerprint&&!(old.lease_until&&old.lease_until>next_at))changed.push({row,old});
 }
 if(fresh.length)await db.from('creator_cloud_jobs').upsert(fresh,{onConflict:'creator_id',ignoreDuplicates:true});
 for(const {row,old} of changed){
  let query=db.from('creator_cloud_jobs').update(row).eq('creator_id',row.creator_id);
  query=old.fingerprint===null?query.is('fingerprint',null):query.eq('fingerprint',old.fingerprint);
  query=old.lease_until===null?query.is('lease_until',null):query.eq('lease_until',old.lease_until);
  await query;
 }
}
async function portfolioHtml(url:string){
 let current=url;
 for(let redirects=0;redirects<3;redirects++){
  const from=new URL(current);
  if(from.protocol!=='https:'||from.username||from.password||from.port)throw Error('PORTFOLIO_NOT_PUBLIC');
  if(!await publicPortfolioMedia(current,current))throw Error('PORTFOLIO_NOT_PUBLIC');
  const r=await fetch(current,{redirect:'manual',signal:AbortSignal.timeout(5000),headers:{accept:'text/html','user-agent':'Mozilla/5.0'},cache:'no-store'});
  if(r.status>=300&&r.status<400){
   const next=new URL(r.headers.get('location')||'',current);
   await r.body?.cancel();
   const canvaRedirect=['canva.link','www.canva.com','canva.com'].includes(from.hostname)&&['www.canva.com','canva.com'].includes(next.hostname);
   const sameHost=from.hostname.replace(/^www\./,'')===next.hostname.replace(/^www\./,'');
   const socialRedirect=socialPlatform(from.hostname)&&socialPlatform(from.hostname)===socialPlatform(next.hostname);
   if(!canvaRedirect&&!sameHost&&!socialRedirect)throw Error('PORTFOLIO_REDIRECT_REQUIRES_BROWSER');
   current=next.href;
   continue;
  }
  if(!r.ok)throw Error('PORTFOLIO_HTTP_'+r.status);
  if(!/text\/html/.test(r.headers.get('content-type')||''))throw Error('PORTFOLIO_HTML_REQUIRED');
  const reader=r.body?.getReader();if(!reader)throw Error('PORTFOLIO_EMPTY');let size=0,text='';const decoder=new TextDecoder();
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2000000)break;text+=decoder.decode(value,{stream:true})}}finally{await reader.cancel()}
  return {html:text,url:current};
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
 const findSample=(candidates:string[],parentUrl:string)=>{
  for(const candidate of candidates){
   try {const source=mediaSource(candidate,parentUrl);if(!j.samples.includes(source))return {source,parentUrl};} catch { /* Try the next candidate. */ }
  }
 };
 let discoveryError=links.length?'NO_PUBLIC_VIDEO_DISCOVERED':'NO_CREATOR_VIDEO_LINK';
 let triedTikTokProfile=false;
 for(const p of links){
  const embed=tiktokProfileEmbed(p);
  if(embed){
   triedTikTokProfile=true;
   try{
    const page=await portfolioHtml(embed);
    if(page.url===embed){
     for(const post of tiktokEmbedPosts(page.html,embed)){
      const sample=findSample([post.source],post.url);
      if(sample)return sample;
     }
    }
   }catch{ /* Continue with submitted links and the regular public page. */ }
  }
  try{
   const {html,url}=await portfolioHtml(p);
   const platform=socialPlatform(new URL(url).hostname);
   const sample=findSample(platform?socialPostMedia(html,url):embeddedMedia(html,url),p);
   if(sample)return sample;
   for(const post of publicSocialPosts(html,url)){
    try{
     const page=await portfolioHtml(post);
     if(new URL(page.url).pathname.replace(/\/$/,'')!==new URL(post).pathname.replace(/\/$/,''))continue;
     const sample=findSample(socialPostMedia(page.html,page.url),p);
     if(sample)return sample;
    }catch{ /* Other creator links may still be playable. */ }
   }
   if(platform&&discoveryError==='NO_PUBLIC_VIDEO_DISCOVERED')discoveryError='SOCIAL_VIDEO_SOURCE_REQUIRED';
  }catch(e){
   const code=e instanceof Error?e.message:'';
   if(/^PORTFOLIO_HTTP_(401|403|429)$/.test(code))discoveryError=code;
  }
 }
 for(const p of links.filter(p=>['canva.link','canva.com','www.canva.com'].includes(new URL(p).hostname)||new URL(p).hostname.endsWith('.my.canva.site')).slice(0,2)){
  try{for(const source of await renderPortfolioMedia(p))if(!j.samples.includes(source)){mediaSource(source,p);return {source,parentUrl:p}}}catch(e){const code=e instanceof Error?e.message:'';discoveryError=/^PORTFOLIO_[A-Z_]+$/.test(code)?code:e instanceof Error&&e.name==='TimeoutError'?'SERVER_BROWSER_TIMEOUT':'SERVER_BROWSER_START_FAILED';console.error('creator_cloud_browser_failed',discoveryError,code.replace(/https?:\/\/\S+/g,'[url]').replace(/[A-Za-z0-9_-]{40,}/g,'[redacted]').slice(0,350))}
 }
 if(discoveryError==='SOCIAL_VIDEO_SOURCE_REQUIRED'&&triedTikTokProfile)throw Error('TIKTOK_EMBED_NO_PLAYABLE_VIDEO');
 if(j.error==='TRY_CANVA_SITE_VIDEO'&&['SOCIAL_VIDEO_SOURCE_REQUIRED','NO_PUBLIC_VIDEO_DISCOVERED'].includes(discoveryError))throw Error('CANVA_SITE_NO_PLAYABLE_VIDEO');
 throw Error(discoveryError);
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
   const payload={...c.payload,assessment,autonomousReview:{assessment,fingerprint:j.fingerprint,source,parentUrl,postUrl:tiktokPlayer(parentUrl)?parentUrl:null,at:assessment.at},reviewSourceFingerprint:j.fingerprint,reviewStatus:'awaiting_owner',mediaEvidence:r.result};
   const {data:written,error:e}=await db.from('reddit_creator_directory').update({payload,review_pending:false,updated_at:assessment.at}).eq('id',c.id).eq('updated_at',c.updated_at).select('id');if(e||!written?.length)throw Error('SOURCE_CHANGED_RESULT_NOT_APPLIED');
   await save({status:'completed',error:null});return;
  }
  const code=String(r.error||r.status||'MEDIA_UNAVAILABLE').slice(0,120),temporary=r.deferred||['processing','hourly_limit'].includes(r.status)||response.status>=500||response.status===429;
  if(['MEDIA_DRIVE_ACCESS_REQUIRED','MEDIA_SOCIAL_VIDEO_UNAVAILABLE','MEDIA_FILE_SIZE_UNSUPPORTED','MEDIA_LINK_NEEDS_VIDEO'].includes(code)&&j.samples.length===0){
   await save({source:null,parent_url:null,samples:[source],status:'queued',error:'TRY_ALTERNATIVE_VIDEO',next_at:new Date().toISOString()});
   return;
  }
  await save({status:temporary?'processing':'blocked',error:code,next_at:new Date(Date.now()+(r.status==='hourly_limit'?3600000:r.status==='processing'?60000:temporary?600000:86400000)).toISOString()});
 }catch(e){await save({status:'blocked',error:e instanceof Error?e.message.slice(0,120):'QUEUE_JOB_FAILED',next_at:new Date(Date.now()+86400000).toISOString()})}
}
export async function runCloudQueue(){
 try{await refreshFormIntake()}catch{console.error('creator_cloud_form_sync_failed')}
 try{await enqueueUnreviewedCreators()}catch{console.error('creator_cloud_enqueue_failed')}
 // Resume file preparation without waiting ten minutes or reuploading the video.
 await db.from('creator_cloud_jobs').update({next_at:new Date().toISOString()}).eq('status','processing').eq('error','processing').gt('next_at',new Date(Date.now()+60000).toISOString());
 // Retry legacy discovery failures once. The new resolver reports different
 // codes so jobs with no public source do not loop or consume later batches.
 await db.from('creator_cloud_jobs').update({status:'queued',error:'TRY_PUBLIC_SOCIAL_VIDEO',next_at:new Date().toISOString()}).eq('status','blocked').is('source',null).in('error',['PUBLIC_PORTFOLIO_MEDIA_UNAVAILABLE','NEEDS_ACCESSIBLE_VIDEO_SOURCE','SERVER_BROWSER_UNAVAILABLE','SERVER_BROWSER_RUNTIME_FAILED','NEEDS_RENDERED_VIDEO_SOURCE']);
 const {data:socialBlocked}=await db.from('creator_cloud_jobs').select('creator_id,reddit_creator_directory(payload)').eq('status','blocked').eq('error','SOCIAL_VIDEO_SOURCE_REQUIRED');
 const tiktokIds=(socialBlocked||[]).filter((row:any)=>{
  const payload=row.reddit_creator_directory?.payload;
  return portfolioLinks([payload?.videos,payload?.profile].join(' ')).some(tiktokProfileEmbed);
 }).map(row=>row.creator_id);
 if(tiktokIds.length){
  await db.from('creator_cloud_jobs').update({status:'queued',error:'TRY_TIKTOK_PROFILE_EMBED',next_at:new Date().toISOString()}).in('creator_id',tiktokIds).eq('status','blocked').eq('error','SOCIAL_VIDEO_SOURCE_REQUIRED');
 }
 const canvaErrors=['NO_PUBLIC_VIDEO_DISCOVERED','SOCIAL_VIDEO_SOURCE_REQUIRED'];
 const {data:canvaBlocked}=await db.from('creator_cloud_jobs').select('creator_id,reddit_creator_directory(payload)').eq('status','blocked').in('error',canvaErrors);
 const canvaIds=(canvaBlocked||[]).filter((row:any)=>portfolioLinks(row.reddit_creator_directory?.payload?.videos||'').some(p=>new URL(p).hostname.endsWith('.my.canva.site'))).map(row=>row.creator_id);
 if(canvaIds.length){
  await db.from('creator_cloud_jobs').update({status:'queued',error:'TRY_CANVA_SITE_VIDEO',next_at:new Date().toISOString()}).in('creator_id',canvaIds).eq('status','blocked').in('error',canvaErrors);
 }
 const rejectedCodes=['MEDIA_DRIVE_ACCESS_REQUIRED','MEDIA_FILE_SIZE_UNSUPPORTED'];
 const {data:rejected}=await db.from('creator_cloud_jobs').select('creator_id,source,error').eq('status','blocked').eq('samples','[]').not('source','is',null).in('error',rejectedCodes).limit(20);
 await Promise.all((rejected||[]).map(job=>db.from('creator_cloud_jobs').update({
  status:'queued',error:'TRY_ALTERNATIVE_VIDEO',source:null,parent_url:null,samples:[job.source],next_at:new Date().toISOString()
 }).eq('creator_id',job.creator_id).eq('status','blocked').eq('source',job.source).eq('error',job.error).eq('samples','[]')));
 const {data:jobs,error}=await db.rpc('claim_creator_cloud_jobs');if(error)throw Error('QUEUE_CLAIM_FAILED');
 await Promise.all((jobs||[]).map(processCloudJob));return {handled:jobs?.length||0,...await cloudQueueStatus()};
}

