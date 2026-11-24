import 'server-only';
import {environment,loadRecord,saveRecord} from './promy-bot/store';
import {createHash} from 'node:crypto';
import {db} from './db';
import {redditDirectory,safeLinks} from './hub-data';
import {creatorProgress,creatorReviewState} from './creator-progress';
import {browserEvidence} from './browser-review-policy';
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
