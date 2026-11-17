export type MailIntent='backlog'|'next'|'analytics'|'contact';
export function mailIntent(text:string,hasWalk=false):MailIntent{
 if(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(text))return 'contact';
 if(/следующ|дальше|продолж(?:ай|им|ить)|поехали|начинай|начн[её]м|давай|next|continue/i.test(text)&&hasWalk)return 'next';
 if(/неотвеч|неответ|без ответа|жд[уё]т.*ответ|ждут.*ответ|самого начала|со стар|старейш|пройд[её]м|разбер[её]м.*(?:почт|пись|имейл|переписк)|предлагай.*ответ|покажи.*(?:входящ|письм|имейл)|переписки.*instantly|имейлы.*оттуда|unanswered|oldest/i.test(text))return 'backlog';
 if(/аналитик|статистик|сколько.*(?:пись|ответ|переписк)|что.*(?:почт|письм|имейл)|как.*рассылк|analytics|inbox|instantly/i.test(text))return 'analytics';
 return 'contact';
}
export function pendingThreads(snapshot:any){return (snapshot.threads||[]).filter((t:any)=>t.state==='waiting_on_us'&&t.latestInboundId).sort((a:any,b:any)=>String(a.lastMessageAt).localeCompare(String(b.lastMessageAt))||a.id.localeCompare(b.id))}
export function mailOverview(snapshot:any){return {complete:!!snapshot.complete,syncedAt:snapshot.syncedAt,loadedMessages:snapshot.aggregate?.messages||snapshot.emails?.length||0,loadedThreads:snapshot.threads?.length||0,awaitingUs:pendingThreads(snapshot).length,awaitingThem:(snapshot.threads||[]).filter((t:any)=>t.state==='waiting_on_them').length,threadsWithCreatorReply:(snapshot.threads||[]).filter((t:any)=>t.latestInboundId).length,oldest:pendingThreads(snapshot).slice(0,5).map((t:any)=>({email:t.sender,emailId:t.latestInboundId,lastMessageAt:t.lastMessageAt}))}}
export function overviewText(s:ReturnType<typeof mailOverview>){return 'Instantly · обе Reddit-кампании\nЗагружено: '+s.loadedMessages+' сообщений, '+s.loadedThreads+' переписок.\nЖдут нашего ответа: '+s.awaitingUs+'. Ждём креатора: '+s.awaitingThem+'.\nВеток с ответом креатора: '+s.threadsWithCreatorReply+'.\nСнимок: '+new Date(s.syncedAt).toLocaleString('ru-RU',{timeZone:'America/New_York'})+' (Нью-Йорк). Перед черновиком проверяю живую ветку.'}
export async function choosePending(snapshot:any,walk:any,deps:{getThread:(id:string)=>Promise<any>;loadState:(id:string)=>Promise<any>}){
 const seen=new Set<string>(walk?.seen||[]);let checked=0;
 for(const t of pendingThreads(snapshot)){
  if(seen.has(t.id))continue;if(checked++===8)break;
  const state=await deps.loadState(t.id);if(state?.closed||state?.status==='closed'||Date.parse(state?.snoozedUntil||'')>Date.now()){seen.add(t.id);continue}
  let context=await deps.getThread(t.latestInboundId);if(!context.complete)throw Error('BOT_THREAD_INCOMPLETE');
  if(context.thread?.latestInboundId!==context.canonical.id&&context.thread?.latestInboundId)context=await deps.getThread(context.thread.latestInboundId);
  if(!context.complete)throw Error('BOT_THREAD_INCOMPLETE');
  if(context.thread?.state!=='waiting_on_us'||context.thread.latestMessageId!==context.canonical.id){seen.add(t.id);continue}
  return {context,seen:[...seen],checked};
 }
 return {context:null,seen:[...seen],checked,exhausted:!pendingThreads(snapshot).some((t:any)=>!seen.has(t.id))};
}
