export function browserEvidence(input:any){
 if(!['great','maybe','no','unverified'].includes(input.decision))throw Error('Выбери цвет или «Не удалось проверить».');
 const reason=String(input.reason||'').trim(),url=String(input.url||'').trim();
 if(reason.length<10||reason.length>1500)throw Error('Опиши наблюдения: от 10 до 1500 символов.');
 let parsed;try{parsed=new URL(url)}catch{throw Error('Укажи ссылку на просмотренный образец.')}
 if(!['http:','https:'].includes(parsed.protocol)||parsed.username||parsed.password||url.length>2000)throw Error('Нужна обычная ссылка на образец.');
 const checked=input.videoReviewed===true&&input.audioReviewed===true;
 if(input.decision!=='unverified'&&!checked)throw Error('Для цвета нужно подтвердить просмотр картинки и прослушивание речи.');
 return {decision:input.decision,reason,url,videoReviewed:input.videoReviewed===true,audioReviewed:input.audioReviewed===true,method:'owner_browser',completed:checked&&input.decision!=='unverified'};
}
