'use server';
import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
import {db,requireSession,log} from './db';
import {environment,loadRecord,saveRecord,telegram,api,campaigns} from './promy-bot/store';
import {createAgentRuntime} from './promy-bot/agent-runtime';
import {processJob} from './promy-bot/realtime';
import {processOwnerUpdate} from './promy-bot/owner-update';
import {parseCsv} from './text';
import {createHash} from 'node:crypto';
import {validApproval} from './hub-outreach';
import {reviewFingerprint,validFormEmail} from './reddit-intake';
import {syncRedditForm} from './reddit-form-sync';
import {validDraftApproval,readyDraft} from './draft-approval';
import {renderReplyMacro} from './promy-bot/reply-macro';
import {addApprovedCreator} from './creator-import-server';
import {after} from 'next/server';
import {APPROVED_QUEUE,processApprovedCreatorQueue} from './creator-import-queue-server';
import {queuedApprovalProof,type ApprovedCreator} from './creator-import-queue';
const runtime=(env:ReturnType<typeof environment>):any=>createAgentRuntime({env,loadRecord,saveRecord,telegram,api,campaigns});
const go=(path:string,msg:string):never=>redirect(path+(path.includes('?')?'&':'?')+'msg='+encodeURIComponent(msg));
export async function checkRedditForm(){
 await requireSession();let message='';try{const r=await syncRedditForm();message=`Форма обновлена: новых ${r.added}, изменённых ${r.updated}, повторных строк ${r.duplicates}. В очереди; агент берёт до 20 за час. Некорректные email: строки ${r.invalidRows.join(', ')||'нет'}. В Instantly никто не добавлен.`}catch(e){message=e instanceof Error?e.message:'Не удалось прочитать форму'}
 revalidatePath('/creators');go('/creators?source=reddit',message);
}
export async function saveCreatorChoice(f:FormData){
 const who=await requireSession(),id=String(f.get('id')||''),rating=String(f.get('rating')||''),reason=String(f.get('reason')||'').trim();
 if(!['great','maybe','no','unreviewed'].includes(rating)||!reason||reason.length>1500)go('/creators?source=reddit','Выбери цвет и кратко объясни причину — по ней учится агент.');
 const {data}=await db.from('reddit_creator_directory').update({owner_rating:rating,owner_reason:reason,owner_reviewed_at:new Date().toISOString()}).eq('id',id).select('email');
 if(!data?.length)throw Error('Креатор не найден');
 await log('creator_calibration',rating+': '+reason,null,{email:data[0].email},who);revalidatePath('/creators');go('/creators?source=reddit','Решение сохранено. Агент получит цвет и причину при следующей проверке.');
}
export async function requestCreatorReviews(f:FormData){
 await requireSession();const ids=[...new Set(f.getAll('id').map(String))];
 if(!ids.length||ids.length>20)go('/creators?source=reddit','Выбери от 1 до 20 креаторов.');
 const {data}=await db.from('reddit_creator_directory').update({review_pending:true,review_requested_at:new Date().toISOString()}).in('id',ids).select('id');
 revalidatePath('/creators');go('/creators?source=reddit','Поставлено на проверку: '+(data?.length||0)+'. Часовой агент проверит видео и звук, результат появится здесь и в Telegram.');
}
export async function prepareHubReply(f:FormData){
 await requireSession();const emailId=String(f.get('emailId')||''),instruction=String(f.get('instruction')||'').trim();
 if(!/^[a-f0-9-]{36}$/.test(emailId)||!instruction||instruction.length>5000)go('/inbox','Нужны письмо и инструкция до 5000 символов.');
 const env=environment(),r=runtime(env),context=await r.getThread(emailId,{includeReferences:false});
 const email=(context.canonical as any).from_address_email;
 const id='web:'+crypto.randomUUID();await r.enqueueJob({id,emailId,text:instruction,source:'web'});
 let msg='Черновик готов. Проверь текст перед отправкой.';
 try{const result=await processJob(env,id);if(!result.processed)msg='Запрос уже обработан.'}catch{msg='Сейчас не удалось подготовить черновик. Запрос сохранён; платный режим не включался.'}
 revalidatePath('/inbox');redirect('/inbox?source=reddit&email='+encodeURIComponent(email)+'&job='+encodeURIComponent(id)+'&msg='+encodeURIComponent(msg));
}
export async function sendHubReply(f:FormData){
 await requireSession();const id=String(f.get('draftId')||'');if(!/^[a-f0-9]{8}$/.test(id))throw Error('Неверный черновик');
 const env=environment(),draft=await loadRecord(env,'draft:'+id);if(!draft)throw Error('Черновик не найден');if(!readyDraft(draft)||!validDraftApproval(draft,f.get('approval'),process.env.APP_PASSWORD!))throw Error('Черновик изменился или устарел. Обнови страницу и проверь новую версию.');
 const edited=f.get('body');if(typeof edited==='string'&&draft.status==='draft'){if(!edited.trim()||edited.length>2800)throw Error('Ответ должен содержать от 1 до 2800 символов');if(draft.macroName!=='Reply')throw Error('Нужен новый черновик с макросом Reply');Object.assign(draft,renderReplyMacro({body:edited,firstName:draft.macroFirstName,signature:draft.signatureHtml}));await saveRecord(env,'draft:'+id,draft)}
 const config=await loadRecord(env,'telegram'),inst=await loadRecord(env,'instantly');
 await processOwnerUpdate({update_id:Date.now(),message:{message_id:0,chat:{id:config.chatId,type:'private'},from:{id:config.userId,is_bot:false},text:'/send '+id}},config,inst,env,(text:string,extra={})=>telegram(env,'sendMessage',{chat_id:config.chatId,text,...extra}),runtime(env));
 const fresh=await loadRecord(env,'draft:'+id);revalidatePath('/inbox');go('/inbox?source=reddit&email='+encodeURIComponent(draft.recipient),fresh.status==='sent'?'Письмо отправлено в исходную переписку.':'Статус: '+fresh.status+'. Подробности отправлены в Telegram. Повторной отправки нет.');
}
export async function cancelHubReply(f:FormData){await requireSession();const id=String(f.get('draftId')||''),env=environment(),draft=await loadRecord(env,'draft:'+id);if(draft?.status==='draft'){draft.status='cancelled';await saveRecord(env,'draft:'+id,draft)}revalidatePath('/inbox');go('/inbox?source=reddit&email='+encodeURIComponent(draft?.recipient||''),'Черновик отменён. Письмо не отправлено.');}
export async function refreshRedditMail(){await requireSession();const result=await runtime(environment()).syncHistory({maxPages:20});revalidatePath('/inbox');go('/inbox?source=reddit',result.complete?'История обновлена.':'Загружена часть истории. Нажми «Обновить» ещё раз, чтобы продолжить. Предыдущий полный снимок сохранён.');}
export async function importRedditCreators(f:FormData){
 await requireSession();let text=String(f.get('text')||'');const file=f.get('file');
 if(file instanceof File&&file.size){if(file.size>5*1024*1024)go('/import?source=reddit','Файл должен быть меньше 5 МБ.');if(/\.xlsx?$/i.test(file.name)){const XLSX=await import('xlsx');const book=XLSX.read(await file.arrayBuffer());text=book.SheetNames.map(n=>XLSX.utils.sheet_to_csv(book.Sheets[n])).join('\n')}else text=await file.text()}
 const rows=parseCsv(text),header=rows[0]?.map(c=>c.trim().toLowerCase())||[];const index=header.findIndex(c=>/^(e-?mail|email address|почта|электронная почта)$/.test(c));
 if(index<0)go('/import?source=reddit','Нужна строка заголовков с колонкой Email.');
 let added=0,known=0;for(const row of rows.slice(1,1001)){
  const email=String(row[index]||'').trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email))continue;
  const {data:existing}=await db.from('reddit_creator_directory').select('id').eq('email',email).maybeSingle();if(existing){known++;continue}
  const get=(pattern:RegExp)=>row[header.findIndex(c=>pattern.test(c))]||'';
  const payload={name:get(/name|имя/),reddit:get(/reddit|реддит/),profile:get(/social|profile|соц|профиль/),videos:get(/portfolio|sample|video|портфолио|пример|видео/),price:get(/price|rate|цена|ставка/),country:get(/country|страна/),notes:get(/note|reason|примеч|причин/),rating:'unreviewed',source:'manual_reddit_import'};
  await db.from('reddit_creator_directory').insert({id:createHash('sha256').update(email).digest('hex').slice(0,16),email,payload});added++;
 }
 await log('reddit_import',`Добавлено ${added}, уже были ${known}. Рассылка не запускалась.`);revalidatePath('/creators');go('/creators?source=reddit',`Добавлено ${added}, уже были ${known}. Теперь выбери креаторов для проверки.`);
}

export async function sendRedditToCampaign(f:FormData){
 const who=await requireSession();const msg=await addApprovedCreator(String(f.get('id')||''),String(f.get('campaign')||''),String(f.get('at')||''),String(f.get('token')||''),who);
 revalidatePath('/creators');go('/creators?source=reddit',msg);
}
export async function sendRedditBatch(f:FormData){
 const who=await requireSession(),selected=[...new Set(f.getAll('selected').map(String))];
 if(!selected.length||selected.length>1000||selected.some(id=>!/^[a-f0-9]{16}$/.test(id)))throw Error('Выбери проверенных креаторов');
 if(f.get('confirm')!=='yes')throw Error('Нужно подтвердить запуск писем активной кампании');
 const {data:rows,error}=await db.from('reddit_creator_directory').select('*').in('id',selected);
 if(error||rows?.length!==selected.length)throw Error('Не удалось сверить все карточки');
 const additions:ApprovedCreator[]=rows.map(c=>{
  const campaign=String(f.get('campaign:'+c.id)||''),fingerprint=String(f.get('fingerprint:'+c.id)||'');
  if(c.review_pending||c.payload.reviewStatus==='pending_review'||!fingerprint||reviewFingerprint(c)!==fingerprint||!validApproval(c.id,c.email,campaign,String(f.get('at')||''),String(f.get('token:'+c.id)||''),fingerprint))throw Error('Карточка изменилась. Обнови список перед подтверждением.');
  const j:ApprovedCreator={id:c.id,email:c.email,campaign,fingerprint,approvedAt:new Date().toISOString(),approvedBy:who,proof:'',status:'pending'};
  j.proof=queuedApprovalProof(j,process.env.SESSION_SECRET!);return j;
 });
 const env=environment(),q=await loadRecord(env,APPROVED_QUEUE)||{items:[]};
 for(const j of additions){if(q.items.some((x:ApprovedCreator)=>x.id===j.id&&['pending','processing','uncertain'].includes(x.status)))continue;q.items=q.items.filter((x:ApprovedCreator)=>x.id!==j.id);q.items.push(j)}
 await saveRecord(env,APPROVED_QUEUE,q);
 after(async()=>{try{await processApprovedCreatorQueue()}catch{/* Durable queue continues hourly. */}});
 revalidatePath('/creators');go('/creators/reddit-approval?source=reddit','Выбранные сохранены в очереди автоматической загрузки. Повторное подтверждение каждой части не требуется.');
}
