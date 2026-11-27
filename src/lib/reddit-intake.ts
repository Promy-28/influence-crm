import {createHash} from 'node:crypto';
import {parseCsv} from './text.ts';
export const FORM_CSV='https://docs.google.com/spreadsheets/d/1aiJ-YaWM__dEZxhUp21nKrN3fz3YKmlYQYPVM2OnQnI/export?format=csv&gid=286322810';
export function validFormEmail(email:string){return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)&&!/@(?:gmail\.con|gmial\.com|example\.com)$/i.test(email)}
export function parseForm(csv:string){
 const rows=parseCsv(csv.replace(/^\uFEFF/,''));
 if(rows[0]?.[0]!=='Timestamp'||rows[0]?.[1]!=='Reddit username'||rows[0]?.[2]!=='Email')throw Error('Заголовки формы изменились. Импорт остановлен.');
 if(rows.length>10001)throw Error('Слишком много строк формы');
 const unique=new Map<string,any>(),invalid:number[]=[];let duplicates=0;
 rows.slice(1).forEach((r,index)=>{if(!r.some(Boolean))return;const email=String(r[2]||'').trim().toLowerCase();if(!validFormEmail(email)){invalid.push(index+2);return}
  const payload={source:'reddit_form',sourceSheetId:'1aiJ-YaWM__dEZxhUp21nKrN3fz3YKmlYQYPVM2OnQnI',sourceRow:index+2,sourceTimestamp:r[0]||'',reddit:r[1]||'',country:r[3]||'',english:r[4]||'',profile:r[5]||'',experience:r[6]||'',videos:r[7]||'',equipment:r[8]||'',registration:r[9]||'',price:r[10]||'',capacity:r[11]||'',notes:r[12]||'',ownerNote:r[13]||''};
  const sourceFingerprint=createHash('sha256').update(JSON.stringify({...payload,sourceRow:0,sourceTimestamp:''})).digest('hex');
  if(unique.has(email))duplicates++;unique.set(email,{id:createHash('sha256').update(email).digest('hex').slice(0,16),email,payload:{...payload,sourceFingerprint}});
 });return {rows:[...unique.values()],invalid,duplicates};
}
// Cloud snapshots may be older than a button-initiated Sheet sync. Keep canonical source fields.
export function mergeDirectoryPayload(existing:any,incoming:any){
 const merged={...existing,...incoming};if(existing?.browserReview)merged.browserReview=existing.browserReview;
 const cloud=existing?.autonomousReview;
 if(existing?.sheetSnapshot){Object.assign(merged,existing.sheetSnapshot);merged.sheetSnapshot=existing.sheetSnapshot}
 if(cloud?.fingerprint&&cloud.fingerprint===merged.sourceFingerprint){
  Object.assign(merged,{assessment:cloud.assessment,autonomousReview:cloud,mediaEvidence:existing.mediaEvidence,reviewStatus:existing.reviewStatus==='already_in_instantly'?'already_in_instantly':'awaiting_owner',reviewSourceFingerprint:cloud.fingerprint});
 }else if(merged.sourceFingerprint&&incoming?.reviewSourceFingerprint!==merged.sourceFingerprint){
  merged.reviewStatus='pending_review';
 }
 return merged;
}
export function reviewFingerprint(c:any){return createHash('sha256').update(JSON.stringify([c.email,c.owner_rating,c.owner_reason,c.payload?.sourceFingerprint,c.payload?.assessment,c.payload?.reviewStatus,c.review_pending,c.outreach_state])).digest('hex')}
export function suggestedCampaign(c:any){
 const a=c.payload?.assessment;
 const rating=c.owner_rating||(a?.videoReviewed&&a?.audioReviewed?a.decision:'');
 if(rating==='great'||rating==='maybe')return '2d02d560-a584-4844-948c-3ed035b9e9e8';
 if(rating==='no')return '9296d2af-c971-40c5-9572-440860bc2a65';
 return '';
}
