export const GREEN_ID='2d02d560-a584-4844-948c-3ed035b9e9e8';
export const RED_ID='9296d2af-c971-40c5-9572-440860bc2a65';
export function campaignInfo(id:string){return {id,label:id===GREEN_ID?'Reddit · Green / Yellow':id===RED_ID?'Reddit · Red':'Instantly · '+id.slice(0,8),tone:id===GREEN_ID?'good':id===RED_ID?'bad':''}}
export function campaignIds(value:any):string[]{return [...new Set([...(value?.campaignIds||[]),value?.campaign,value?.campaign_id,value?.inst_campaign_id].filter((v):v is string=>typeof v==='string'&&!!v))]}
export function briefEvidence(messages:any[]){
 // Fresh thread records passed last replace cached duplicates as a whole record.
 const unique=[...new Map(messages.map(m=>[m.id||JSON.stringify(m),m])).values()];
 const sent=unique.filter(m=>m.direction==='outbound'||m.direction==='out'||[1,3].includes(Number(m.ue_type))).map(m=>({id:m.id,at:m.timestamp_email||m.timestamp||m.at,text:String(m.text||m.body?.text||m.body||'')})).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
 const briefs=sent.filter(m=>/brief/i.test(m.text)&&/https:\/\/docs\.google\.com\/document\/d\//i.test(m.text));
 const scope=sent.filter(m=>/\$\s*\d|\b\d+\s+(?:(?:short|full|raw|talking|silent)\s+)*(?:clips?|videos?|hooks?)\b|\bhooks?\b[\s\S]*\bbody\b|\b(?:usage rights|payment terms|your rate|per video)\b/i.test(m.text)).at(-1);
 const latest=briefs.at(-1);const url=latest?.text.match(/https:\/\/docs\.google\.com\/document\/d\/[A-Za-z0-9_-]+(?:\/[^\s<>]*)?/i)?.[0]||null;
 const incoming=unique.filter(m=>m.direction==='inbound'||m.direction==='in'||Number(m.ue_type)===2).map(m=>({at:m.timestamp_email||m.timestamp||m.at,text:String(m.text||m.body?.text||'')})).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
 const sample=incoming.filter(m=>/\b(?:here is|here['’]s|sent|sending|shared|attached|link to)\b[\s\S]{0,120}\b(?:watermarked sample|sample video|sample)\b/i.test(m.text)).at(-1);
 const approved=sent.filter(m=>/\b(?:liked|loved|approved)\s+(?:(?:the|your)\s+)?(?:sample|video|examples)\b/i.test(m.text)).at(-1);
 const paid=scope&&/\$\s*\d|\b\d+\s+(?:(?:short|raw)\s+)*clips\b/i.test(scope.text);
 return {sent:!!latest,url,sentAt:latest?.at||null,evidenceEmailId:latest?.id||null,scope:scope?{at:scope.at,emailId:scope.id,text:scope.text.slice(0,5000)}:null,stage:paid&&approved?'offer_sent':approved?'sample_approved':sample?'sample_received':latest?'brief_sent':'initial',sampleReceivedAt:sample?.at||null,sampleApprovedAt:approved?.at||null,latestOutbound:sent.at(-1)||null,warning:'Latest actual personalized offer/brief in this exact conversation governs ongoing work; default first-contact/test policy must not reset it. An offer is not acceptance. Never transfer another creator price or scope.'};
}

export function briefDraftIssue(body:string,evidence:any){
 const t=body.replace(/\s+/g,' ');
 if(['sample_received','sample_approved','offer_sent'].includes(evidence?.stage)&&(/\b(?:send|share|film|make|record|create|provide)\b.{0,80}\b(?:sample|test video|watermark)\b/i.test(t)||/\b(?:sign up|register|set up your account|upload your portfolio)\b/i.test(t)))return 'Креатор уже прошёл начальные шаги. Нельзя заново просить регистрацию или первый тест: ответ должен учитывать присланный образец и последнее персональное предложение.';
 if(evidence?.stage==='offer_sent'&&evidence.url&&!t.includes(evidence.url.split('?')[0])&&/\b(?:here.s|here is|send|share)\b.{0,30}\bbrief\b|\btest is unpaid\b/i.test(t))return 'Уже отправлено персональное предложение с другим брифом. Нельзя заменять его стандартным первым тестом.';
 const claimsSent=/\b(?:I|we)(?:['’]ve| have)?\s+(?:just\s+|already\s+)?(?:sent|shared|emailed)(?:\s+over)?\b[^.!?]{0,60}\bbrief\b|\bbrief\b[^.!?]{0,35}\b(?:was|has been|is)\s+(?:already\s+)?sent\b/i.test(t);
 if(claimsSent&&!evidence?.sent)return 'Нет подтверждения, что этому креатору уже отправляли бриф. Какой бриф и объём отправить ему сейчас? Не буду утверждать, что отправка уже была.';
 const vague=/\b(?:send|share|forward|get)\b[^.!?]{0,55}\bbrief\b|\bbrief\b[^.!?]{0,40}\b(?:shortly|soon|ready for you)\b/i.test(t);
 if(vague&&!evidence?.sent&&!/https:\/\/docs\.google\.com\/document\/d\//i.test(t))return 'Вместо обещания прислать бриф нужен конкретный следующий шаг. Подтверди бриф и объём для этого креатора; подготовлю письмо со ссылкой и согласованными условиями.';
 return null;
}
