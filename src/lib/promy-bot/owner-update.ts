/* eslint-disable @typescript-eslint/ban-ts-comment, @typescript-eslint/no-unused-vars, prefer-const */
// @ts-nocheck
// Shared exact-draft confirmation logic from Creator Hub. No model can call send.
import {contactEmails} from './agent-runtime';
import {unquotedText} from './mail-analysis';
import {loadRecord,saveRecord,telegram,api} from './store';
const plainEmail=unquotedText;
const ownerMessage=(m,c)=>!!m&&m.chat?.type==='private'&&m.chat.id===c.chatId&&m.from?.id===c.userId&&!m.from?.is_bot;
const creatorIntake=()=>({handleCallback:async()=>false});
const BOT_HELP='На связи. Пиши обычным текстом, команды не нужны.\n\n«creator@example.com — что она писала?»\n«Ответь ей, спроси стоимость одного видео»\n«Что у нас с переписками?»\n\nПосле выбора креатора можно продолжать вопросами про неё. Для другой переписки укажи новый email или ответь на нужное сообщение. Черновики отправляются только после твоего подтверждения кнопкой. Сообщения обрабатываются сразу; фоновые проверки — раз в час.';
export async function processOwnerUpdate(update,config,inst,env,tell,runtime){
 const callback=update.callback_query;
 const m=callback?{...callback.message,from:callback.from,text:callback.data?.replace(/^(send|cancel):([a-f0-9]{8})$/,'/$1 $2')}:update.message;
 if(!ownerMessage(m,config)||!m.text)return false;
 // Hourly polling can outlive Telegram's short callback acknowledgement window.
 // A stale spinner acknowledgement must never prevent the owner's actual action.
 if(callback)try{await telegram(env,'answerCallbackQuery',{callback_query_id:callback.id})}catch{}
 if(callback&&await creatorIntake(env).handleCallback(callback.data))return true;
 let text=m.text.trim();
 let linked=m.reply_to_message?.message_id?await loadRecord(env,'tgmsg:'+m.reply_to_message.message_id):null;
 const page=callback?.data?.match(/^page:([a-f0-9]{8}):(\d{1,2})$/);
 if(page){await runtime.pageDigest(page[1],Number(page[2]),m.message_id);return true}
 const pick=callback?.data?.match(/^pick:([a-f0-9]{8}):(\d{1,2})$/);
 if(pick){
  const digest=await loadRecord(env,'digest:'+pick[1]),item=digest?.items?.[Number(pick[2])];
  if(!item){await tell('Эта сводка недоступна. Выбери письмо из новой сводки.');return true}
  const context=await runtime.getThread(item.emailId);
  const result=await tell('ОТВЕТ ДЛЯ '+context.canonical.from_address_email+'\nТема: '+context.canonical.subject+'\n\n'+plainEmail(context.canonical).slice(0,2200)+'\n\nОтветь на это сообщение, что написать. Подготовлю черновик для подтверждения.');
  if(result?.message_id)await saveRecord(env,'tgmsg:'+result.message_id,{emailId:item.emailId,threadId:item.threadId,source:'selected_digest'});
  return true;
 }
 if(linked?.items){
  const selection=text.match(/^\s*(\d{1,2})\s*[:.)-]\s*([\s\S]+)$/),item=selection&&linked.items[Number(selection[1])-1];
  if(!item){await tell('Укажи номер и инструкцию: «2: спроси стоимость одного видео», ответив на сводку.');return true}
  linked={emailId:item.emailId};text=selection[2].trim();
 }
 if(!linked&&m.reply_to_message&&config.botUsername&&m.reply_to_message.from?.username===config.botUsername){const old=m.reply_to_message.text?.match(/^ID:\s*([a-f0-9-]{36})/im);if(old)linked={emailId:old[1]}}
 if(linked?.draftId&&/^(отправь|отправляй|отправить|send)$/i.test(text))text='/send '+linked.draftId;
 if(/^\/(start|help|status)(?:@\w+)?$/.test(text)){await tell(BOT_HELP);return true}
 if(/^\/stats$/.test(text)){const a=await runtime.getAnalysis();await tell(a.complete?'По делу: '+a.aggregate.messages+' сообщений, '+a.aggregate.threads+' переписки.\nЖдут нас: '+a.aggregate.waitingOnUs+'. Ждём их: '+a.aggregate.waitingOnThem+'.\nСнимок: '+a.syncedAt+'\nСтатусы рассчитаны по истории, намерения — предварительные.':'История ещё синхронизируется. Статистику из неполной базы выдавать за полную не буду.');return true}
 if(/^\/pending$/.test(text)){const a=await runtime.getAnalysis();const pending=a.threads.filter(t=>t.state==='waiting_on_us').sort((a,b)=>b.elapsedHours-a.elapsedHours).slice(0,8);await tell((a.complete?'Ждут нашего ответа:':'Неполный снимок:')+'\n'+(pending.map(t=>t.sender+' · '+Math.floor(t.elapsedHours)+' ч.\n/suggest '+t.latestMessageId).join('\n\n')||'В снимке таких переписок нет.'));return true}
 const view=text.match(/^\/thread\s+(\S+)$/i);
 if(view){const c=await runtime.getThread(view[1]);await tell('История · '+c.canonical.from_address_email+'\n'+(c.complete?'Полная загрузка':'Загрузка частичная')+'\n\n'+c.thread.messages.slice(-5).map(e=>(e.direction==='inbound'?'Креатор':'Promy')+' · '+e.timestamp+'\n'+e.text.slice(0,550)).join('\n\n'));return true}
 const manage=text.match(/^\/(close|snooze)\s+(\S+)(?:\s+(\d+))?$/i);
 if(manage){const c=await runtime.getThread(manage[2]);const hours=Math.min(168,Math.max(1,Number(manage[3])||24));await saveRecord(env,'threadstate:'+c.canonical.thread_id,manage[1].toLowerCase()==='close'?{closed:true,at:new Date().toISOString()}:{closed:false,snoozedUntil:new Date(Date.now()+hours*3600000).toISOString()});await tell(manage[1].toLowerCase()==='close'?'Переписка закрыта для напоминаний.':'Напоминания отложены на '+hours+' ч.');return true}
 const literal=text.match(/^\/reply\s+([a-f0-9-]{36})\s+([\s\S]+)$/i);
 if(literal){if(literal[2].trim().length>2800){await tell('Сократи ответ до 2800 символов.');return true}const id='literal:'+update.update_id;await runtime.enqueueJob({id,text:'Готовый текст владельца. Не менять.',emailId:literal[1]});await runtime.completeJob({id,draftBody:literal[2].trim(),answer:'Твой текст сохранён. После просмотра нажми «Отправить».'});return true}
 const send=text.match(/^\/(send|cancel)\s+([a-f0-9]{8})$/i);
 if(send){const draft=await loadRecord(env,'draft:'+send[2]);if(!draft||draft.status!=='draft'){await tell('Черновик уже обработан или требует проверки. Повторно не отправляю.');return true}
  if(send[1].toLowerCase()==='cancel'){draft.status='cancelled';await saveRecord(env,'draft:'+draft.id,draft);await tell('Черновик отменён: '+draft.id);return true}
  if(Date.now()-Date.parse(draft.createdAt)>86400000){draft.status='expired';await saveRecord(env,'draft:'+draft.id,draft);await tell('Черновик старше суток. Нужен свежий ответ.');return true}
  const c=await runtime.getThread(draft.emailId),current=c.canonical;
  if(!c.complete||c.thread?.state!=='waiting_on_us'||c.thread.latestMessageId!==current.id||current.eaccount!==draft.eaccount||current.from_address_email!==draft.recipient||current.thread_id!==draft.threadId){draft.status='stale';await saveRecord(env,'draft:'+draft.id,draft);await tell('Переписка изменилась. Подготовь ответ на последнее письмо.');return true}
  draft.status='sending';await saveRecord(env,'draft:'+draft.id,draft);
  try{const result=await api(inst.key,'/emails/reply',{eaccount:draft.eaccount,reply_to_uuid:draft.emailId,subject:draft.subject,body:{text:draft.body}});draft.status='sent';draft.sentId=result.id;draft.sentAt=new Date().toISOString();await saveRecord(env,'draft:'+draft.id,draft)}catch{draft.status='uncertain';await saveRecord(env,'draft:'+draft.id,draft);await tell('Результат '+draft.id+' нужно проверить в Instantly. Автоповтор отключён.');return true}
  // A failed Telegram confirmation must not turn an already-sent email into an uncertain send.
  await tell('Отправлено в исходную переписку. Черновик '+draft.id+'.');return true;
 }
 const suggest=text.match(/^\/suggest\s+(\S+)$/i);
 let emailId=suggest?.[1]||linked?.emailId||null;
 const addresses=contactEmails(text);
 if(addresses.length>1){await tell('Вижу несколько адресов. С каким креатором сейчас работаем? Напиши один email и вопрос.');return true}
 if(addresses.length===1){
  let found;try{found=await runtime.resolveContact(addresses[0])}catch{await tell('Instantly сейчас не отдал переписку. Вопрос сохраню для повторной проверки.');}
  if(found){
   if(!found.emailId){await tell(!found.complete?'Поиск переписок загрузился частично. Не буду угадывать получателя. Уточни тему или ответь на сообщение с нужным письмом.':found.matches.length?'У этого адреса несколько переписок:\n'+found.matches.map(e=>e.subject+' · '+e.account).join('\n')+'\nОтветь на нужное сообщение с письмом, чтобы выбрать переписку.':'В двух Reddit-кампаниях входящих от '+addresses[0]+' не нашёл. Проверь адрес или пришли нужное письмо.');return true}
   emailId=found.emailId;
  }else emailId=null;
 }else if(!emailId&&/\b(she|her|he|him|they)\b|она|она\b|её|ее\b|ей\b|ему\b|он\b|этот|эта|ответь|напиши|скажи|черновик/i.test(text)){
  const active=await loadRecord(env,'owner_mail_context');if(active?.emailId&&Date.now()-Date.parse(active.at)<86400000)emailId=active.emailId;
 }
 if(emailId)await saveRecord(env,'owner_mail_context',{emailId,at:new Date().toISOString()});
 const id='telegram:'+update.update_id;
 await runtime.enqueueJob({id,text:suggest?'Изучи переписку и предложи уместный ответ без новых обязательств.':text,emailId,replyToMessageId:m.message_id});
 await tell(emailId?'Принял. Проверю реальную переписку и отвечу по существу сейчас. Если просишь написать письмо — покажу черновик для подтверждения.':'Принял вопрос сейчас. Можешь писать обычным текстом. Для вопроса о креаторе укажи его email, например: «creator@example.com — что она писала?»');return true;
}
