import {briefReply} from '@/lib/creator-policy';
import {NextResponse} from 'next/server';
import {requireSession} from '@/lib/db';
import {mailSource} from '@/lib/mail-source';
import {draftWorkspace,requestWorkspaceRevision} from '@/lib/draft-workspace';
import {focusedReply} from '@/lib/mail-reply-view';
import {environment,loadRecord,saveRecord,api,telegram,campaigns} from '@/lib/promy-bot/store';
import {createAgentRuntime} from '@/lib/promy-bot/agent-runtime';
import {liveApifyConversation} from '@/lib/apify-mail';
import {completeCloudJob,processJob} from '@/lib/promy-bot/realtime';
import {assertMailFocus} from '@/lib/promy-bot/mail-focus';
export const runtime='nodejs';export const maxDuration=60;
export async function POST(req:Request){
 await requireSession();if(req.headers.get('origin')!==new URL(req.url).origin)return NextResponse.json({error:'Недопустимый источник'},{status:403});
 try{const b=await req.json(),source=mailSource(b.source);if(typeof b.emailId!=='string'||typeof b.instruction!=='string'||b.instruction.length>5000)throw Error('Неверные данные письма');
 const env=environment(),context=source==='apify'?(await liveApifyConversation(env,b.creatorId)).context:await createAgentRuntime({env,api,telegram,loadRecord,saveRecord,campaigns}).getThread(b.emailId,{includeReferences:false});
 if(source==='reddit')assertMailFocus(context.canonical);
 if(!context.complete||context.thread?.state!=='waiting_on_us'||context.thread.latestMessageId!==context.canonical.id||context.canonical.id!==b.emailId)throw Error('Переписка изменилась или уже не ждёт ответа. Обнови страницу.');
 if(b.preset&&!['brief','sample_first'].includes(b.preset))throw Error('Неверные данные шаблона');
 const instruction=b.preset?'Подготовь утверждённый шаблон: '+b.preset:b.instruction.trim()||'Предложи уместный ответ на последнее входящее по полной истории и briefContext. Кратко по-русски объясни, что хочет креатор и что предлагаешь. Используй последние условия именно этого креатора. Если нужно решение владельца по брифу, цене или проверке образца, задай конкретный вопрос, не выдумывай условия.';
 const queued=await requestWorkspaceRevision(b.emailId,instruction,source,b.creatorId||null);if(b.preset)await completeCloudJob(env,{id:queued.jobId,answer:'Готовый ответ по текущим правилам: один ролик hook + body, образец с watermark до оффера/договора; похожее существующее видео тоже можно прислать на первоначальный просмотр. Цена и одобрение не обещаны.',draftBody:briefReply(b.preset),requiresClarification:false});else await processJob(env,queued.jobId);
 return NextResponse.json(focusedReply(await draftWorkspace(source),b.emailId),{headers:{'cache-control':'no-store'}});
 }catch(e){const code=e instanceof Error?e.message:'';return NextResponse.json({error:code==='BOT_FREE_QUOTA'?'Бесплатная квота временно исчерпана. Запрос сохранён. Платный режим не включается.':/Переписка|Неверные/.test(code)?code:'Сейчас не удалось закончить подготовку. Можно повторить; созданные задания сохраняются в очереди. Письмо не отправлялось.'},{status:409})}
}
