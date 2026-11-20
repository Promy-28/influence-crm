import {queueAutomaticMail} from '@/lib/auto-mail';
import {mailSource} from '@/lib/mail-source';
import {NextResponse} from 'next/server';
import {requireSession} from '@/lib/db';
import {environment} from '@/lib/promy-bot/store';
import {processJob} from '@/lib/promy-bot/realtime';
import {draftWorkspace,queueDraftBatch,prepareNextDraft,editWorkspaceDraft,sendWorkspaceDraft,requestWorkspaceRevision,retryDraftPreparation} from '@/lib/draft-workspace';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
export async function GET(req:Request){await requireSession();return NextResponse.json(await draftWorkspace(mailSource(new URL(req.url).searchParams.get('source'))),{headers:{'cache-control':'no-store'}})}
export async function POST(req:Request){
 await requireSession();if(req.headers.get('origin')!==new URL(req.url).origin)return NextResponse.json({error:'Недопустимый источник запроса'},{status:403});
 let operation='';try{const b=await req.json(),source=mailSource(b.source);operation=b.op;let result;
  if(b.op==='auto')result=await queueAutomaticMail();
  else if(b.op==='queue')result=await queueDraftBatch(b.limit,source);
  else if(b.op==='next')result=await prepareNextDraft(source);
  else if(b.op==='retry')result=await retryDraftPreparation(source);
  else if(b.op==='edit'&&/^[a-f0-9]{8}$/.test(b.id)&&typeof b.body==='string')result=await editWorkspaceDraft(b.id,b.approval,b.body,source);
  else if(b.op==='send'&&/^[a-f0-9]{8}$/.test(b.id))result=await sendWorkspaceDraft(b.id,b.approval,source);
  else if(b.op==='revise'&&typeof b.emailId==='string'&&typeof b.instruction==='string'){
   result=await requestWorkspaceRevision(b.emailId,b.instruction,source,b.creatorId||null,b.draftId,b.approval);
   if(b.draftId)try{result={...result,preparation:await processJob(environment(),result.jobId)}}catch{result={...result,notice:'Запрос сохранён в облаке. Сейчас подготовка не завершилась; агент повторит её. Платный режим не включается.'}}
  }
  else throw Error('Неизвестное действие');
  return NextResponse.json(result);
 }catch(e){if(operation==='next'&&e instanceof Error&&e.message==='BOT_STATE_CONFLICT')return NextResponse.json({processed:false,waitMs:1500});return NextResponse.json({error:e instanceof Error?e.message:'Не удалось выполнить действие'},{status:409})}
}
