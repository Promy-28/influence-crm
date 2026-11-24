import 'server-only';
import {db} from './db';
import {environment,loadRecord,saveRecord} from './promy-bot/store';
import {approvalToken} from './hub-outreach';
import {reviewFingerprint} from './reddit-intake';
import {addApprovedCreator,reconcileCreatorImports} from './creator-import-server';
import {queuedCreatorUnchanged,type ApprovedCreator} from './creator-import-queue';
export const APPROVED_QUEUE='_reddit_approved_import_queue';
export async function approvedCreatorQueue(){return await loadRecord(environment(),APPROVED_QUEUE)||{items:[] as ApprovedCreator[]}}
export async function processApprovedCreatorQueue(limit=20){
 const started=Date.now();let processed=0;
 // Recover visible results after a worker lost its final queue-record write, without repeating import.
 const recoveryEnv=environment(),recovery=await loadRecord(recoveryEnv,APPROVED_QUEUE);
 const pendingReadbacks=(recovery?.items||[]).filter((j:ApprovedCreator)=>['processing','uncertain'].includes(j.status));
 if(pendingReadbacks.length){
  const {data}=await db.from('reddit_creator_directory').select('id,email,outreach_state').in('id',pendingReadbacks.map((j:ApprovedCreator)=>j.id));let changed=false;
  for(const c of data||[]){const j=recovery.items.find((x:ApprovedCreator)=>x.id===c.id);if(j&&j.email===c.email&&c.outreach_state?.campaign===j.campaign&&c.outreach_state?.status==='imported'){j.status='done';j.message='Подтверждено: контакт есть в выбранной кампании Instantly.';changed=true}}
  if(changed)try{await saveRecord(recoveryEnv,APPROVED_QUEUE,recovery)}catch{/* Another worker updated it. */}
 }
 for(let n=0;n<Math.min(limit,20)&&Date.now()-started<120000;n++){
  const env=environment(),q=await loadRecord(env,APPROVED_QUEUE);if(!q)break;
  const job:ApprovedCreator|undefined=q.items.find((j:ApprovedCreator)=>j.status==='pending');if(!job)break;
  // CAS on the encrypted queue record claims before any external write. Lost outcomes are never retried.
  job.status='processing';try{await saveRecord(env,APPROVED_QUEUE,q)}catch{break}
  let status:ApprovedCreator['status']='blocked',message='Карточка изменилась после подтверждения. Нужна новая проверка.';
  try{
   const {data:c,error}=await db.from('reddit_creator_directory').select('*').eq('id',job.id).single();
   if(error)throw Error('DIRECTORY_READ_FAILED');
   if(c&&queuedCreatorUnchanged(job,c,reviewFingerprint(c),process.env.SESSION_SECRET!)){
    const at=String(Date.now());message=await addApprovedCreator(job.id,job.campaign,at,approvalToken(job.id,job.email,job.campaign,at,job.fingerprint),job.approvedBy,job.fingerprint);status='done';
   }
  }catch{status='uncertain';message='Обработка прервана. Автоматической повторной загрузки нет; результат сверяется с Instantly.'}
  const finalEnv=environment(),fresh=await loadRecord(finalEnv,APPROVED_QUEUE),entry=fresh?.items.find((j:ApprovedCreator)=>j.id===job.id&&j.proof===job.proof);
  if(entry?.status==='processing'){Object.assign(entry,{status,message});try{await saveRecord(finalEnv,APPROVED_QUEUE,fresh)}catch{/* Processing stays protected until readback. */}}
  processed++;
 }
 try{await reconcileCreatorImports(3)}catch{/* Next hourly run reconciles. */}
 return {processed};
}
