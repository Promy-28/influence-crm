export function followupDue(thread:any,now=Date.now()){
 const at=Date.parse(thread?.lastMessageAt||'');
 return thread?.state==='waiting_on_them'&&!!thread.latestInboundId&&!!thread.latestMessageId&&Number.isFinite(at)&&now-at>=48*3600000&&!thread.messages?.some((m:any)=>m.direction==='scheduled');
}
export function followupCurrent(context:any,anchor:string,now=Date.now()){return context?.complete===true&&followupDue(context.thread,now)&&context.thread.latestMessageId===anchor}
export const followupInstruction='Подготовь короткий доброжелательный английский follow-up по полной переписке: мы ждём ответа более 48 часов. Напомни только конкретный последний открытый вопрос или следующий шаг, не проси уже выполненное, не выдумывай новые условия, сроки или одобрение. Если последний исходящий завершает разговор, подтверждает получение без следующего шага или не требует ответа — requiresClarification=true, объясни владельцу, почему фолоуап не нужен. Русское пояснение: на чём остановились и о чём напоминаем. Только черновик, без отправки.';
