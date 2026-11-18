export function followupDue(thread:any,now=Date.now()){
 const at=Date.parse(thread?.lastMessageAt||'');
 return thread?.state==='waiting_on_them'&&!!thread.latestInboundId&&!!thread.latestMessageId&&Number.isFinite(at)&&now-at>=48*3600000&&!thread.messages?.some((m:any)=>m.direction==='scheduled');
}
export function followupCurrent(context:any,anchor:string,now=Date.now()){return context?.complete===true&&followupDue(context.thread,now)&&context.thread.latestMessageId===anchor}
export const followupInstruction='Это именно ФОЛОУАП: мы уже ответили и ждём креатора 48+ часов. То, что мяч на стороне креатора, — причина напомнить, а не причина отказаться от черновика. Подготовь короткий доброжелательный английский follow-up по полной переписке: мы ждём ответа более 48 часов. Напомни только конкретный последний открытый вопрос или следующий шаг, не проси уже выполненное, не выдумывай новые условия, сроки или одобрение. Если последний исходящий завершает разговор, подтверждает получение без следующего шага или не требует ответа — requiresClarification=true, объясни владельцу, почему фолоуап не нужен. Русское пояснение: на чём остановились и о чём напоминаем. Только черновик, без отправки.';

export function followupProposal(answer:string,body:string,clarification:boolean){
 if(!body.trim()&&/мяч|фолоу.?ап.{0,30}рано|рано.{0,40}(?:сторон|жд)/i.test(answer)&&!/закрыт|заверш[её]н|отказ|не заинтерес|closed|declined|unsubscribe/i.test(answer))return {answer:'Креатор не ответил на наше последнее письмо более 48 часов. Предлагаю коротко напомнить о нём и уточнить, хочет ли он продолжить — без новых условий и обещаний.',draftBody:"Just following up on my last email. Have you had a chance to review it? Please let me know if you have any questions or whether you'd like to continue.",requiresClarification:false};
 return {answer,draftBody:body,requiresClarification:clarification};
}
