export function draftCard(draft:any,answer:string){
 const head='КРЕАТОР · '+draft.recipient+'\nОтправитель: '+draft.eaccount+'\nТема: '+draft.subject;
 const proposed='\n\nПРЕДЛАГАЕМЫЙ ОТВЕТ\n'+draft.body;
 const tail='\n\nReply: имя, подпись и баннер сохранены.\nПравки — обычным сообщением. «Отправляй» — подтвердить этот текст. «Дальше» — следующая переписка.';
 const available=3900-head.length-proposed.length-tail.length-100;
 const original=String(draft.incomingText||'Оригинал — в полной ветке по ссылке ниже.');
 const limit=Math.min(2100,Math.max(0,available-250));
 const excerpt=original.length>limit?original.slice(0,Math.max(0,limit-55))+'\n[Полный оригинал — в ветке по ссылке ниже.]':original;
 const summary=answer.slice(0,Math.max(0,available-excerpt.length));
 return (head+'\n\nИСХОДНОЕ ПИСЬМО\n'+excerpt+(summary?'\n\nКРАТКО ПО-РУССКИ\n'+summary:'')+proposed+tail).slice(0,3900);
}
