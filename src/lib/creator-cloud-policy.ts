export function portfolioLinks(value:string){return [...new Set((String(value||'').match(/https?:\/\/[^\s<>"']+/g)||[]).map(s=>s.replace(/[),.;]+$/,'')))].slice(0,8)}
export function embeddedMedia(html:string,base:string){
 const text=html.replace(/\\u002[fF]/g,'/').replace(/\\\//g,'/').replace(/&amp;/g,'&');
 const urls=[...text.matchAll(/(?:https:\/\/[^\s"'<>\\]+|\/_assets\/[^\s"'<>\\]+)\.(?:mp4|mov|webm)(?:\?[^\s"'<>\\]*)?/gi)].map(m=>new URL(m[0],base).href);
 return [...new Set(urls)].filter(s=>{const u=new URL(s),p=new URL(base);return u.hostname===p.hostname||['media.canva.com','media-public.canva.com'].includes(u.hostname)}).slice(0,12);
}
export function cloudAssessment(result:any,quote:string){
 if(!result?.videoReviewed||!result?.audioReviewed||!result?.speech?.length||!result?.frames?.length)return null;
 const poor=result.englishSpeech===false||result.intelligibility<=2||result.videoQuality<=2;
 return {decision:poor?'no':'maybe',reason:String(result.summary||'').slice(0,900),quality:[`Английская речь: ${result.intelligibility}/5. Видео: ${result.videoQuality}/5.`,result.limitations||''].join(' ').slice(0,900),price:`Заявлено в форме: $${quote||'не указано'}. Это не согласованная ставка. Качество оценено отдельно; цвет можно подтвердить или изменить перед импортом.`,videoReviewed:true,audioReviewed:true,evidence:[result.source],at:new Date().toISOString()};
}
