export const GREEN_ID='2d02d560-a584-4844-948c-3ed035b9e9e8';
export const RED_ID='9296d2af-c971-40c5-9572-440860bc2a65';
export function campaignInfo(id:string){return {id,label:id===GREEN_ID?'Reddit · Green / Yellow':id===RED_ID?'Reddit · Red':'Instantly · '+id.slice(0,8),tone:id===GREEN_ID?'good':id===RED_ID?'bad':''}}
export function campaignIds(value:any):string[]{return [...new Set([...(value?.campaignIds||[]),value?.campaign,value?.campaign_id,value?.inst_campaign_id].filter((v):v is string=>typeof v==='string'&&!!v))]}
export function briefEvidence(messages:any[]){
 const sent=messages.filter(m=>m.direction==='outbound'||m.direction==='out'||[1,3].includes(Number(m.ue_type))).map(m=>({id:m.id,at:m.timestamp||m.timestamp_email||m.at,text:String(m.text||m.body?.text||m.body||'')})).sort((a,b)=>String(a.at).localeCompare(String(b.at)));
 const briefs=sent.filter(m=>/brief/i.test(m.text)&&/https:\/\/docs\.google\.com\/document\/d\//i.test(m.text));
 const scope=sent.filter(m=>/\bhooks?\b/i.test(m.text)&&/\bbody\b/i.test(m.text)).at(-1);
 const latest=briefs.at(-1);const url=latest?.text.match(/https:\/\/docs\.google\.com\/document\/d\/[A-Za-z0-9_-]+(?:\/[^\s<>]*)?/i)?.[0]||null;
 return {sent:!!latest,url,sentAt:latest?.at||null,evidenceEmailId:latest?.id||null,scope:scope?{at:scope.at,emailId:scope.id,text:scope.text.slice(0,5000)}:null,warning:'A later explicit offer in this creator conversation overrides the original brief. An offer is not acceptance. Never carry another creator price or scope over.'};
}
