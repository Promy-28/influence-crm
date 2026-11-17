export function dialogueAction(text:string):'confirm'|'cancel'|'revise'|'other'{
 const s=String(text).trim().toLowerCase().replace(/ё/g,'е').replace(/[.!?]+$/,'').trim();
 if(/^(?:(?:да|да, все верно)[, ]+)?(?:отправь|отправляй|отправить)(?: (?:письмо|ответ|этот ответ|этот черновик|ей|ему))?$/.test(s)||/^(можно отправлять|подтверждаю отправку|подтверждаю, отправляй)$/.test(s))return 'confirm';
 if(/^(отмени(?: черновик)?|отмена|не отправляй|не отправлять)$/.test(s))return 'cancel';
 if(/^(сделай|сократи|убери|добавь|перепиши|исправь|замени|поменяй|покороче|короче|напиши короче|ответ должен|в черновике)/.test(s))return 'revise';
 return 'other';
}
export async function draftFingerprint(body:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(body)))).map(b=>b.toString(16).padStart(2,'0')).join('')}
