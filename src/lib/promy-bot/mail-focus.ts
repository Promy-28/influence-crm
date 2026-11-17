import {analyzeConversations} from './mail-analysis.ts';
export const GREEN_YELLOW_CAMPAIGN='2d02d560-a584-4844-948c-3ed035b9e9e8';
export const MAIL_FOCUS={campaign:GREEN_YELLOW_CAMPAIGN,from:'2026-10-25T00:00:00-04:00',before:'2026-12-01T00:00:00-05:00',label:'Green / Yellow · 25 октября — ноябрь 2026'};
export function focusedIncoming(email:any){const at=Date.parse(email.timestamp_email||email.timestamp_created||'');return email.campaign_id===MAIL_FOCUS.campaign&&Number(email.ue_type)===2&&at>=Date.parse(MAIL_FOCUS.from)&&at<Date.parse(MAIL_FOCUS.before)}
export function assertMailFocus(email:any){if(!focusedIncoming(email))throw Error('BOT_EMAIL_OUT_OF_FOCUS')}
export function focusSnapshot(snapshot:any){
 const emails=(snapshot.emails||[]).filter((e:any)=>e.campaign_id===MAIL_FOCUS.campaign&&Date.parse(e.timestamp_email||e.timestamp_created)>=Date.parse(MAIL_FOCUS.from)&&Date.parse(e.timestamp_email||e.timestamp_created)<Date.parse(MAIL_FOCUS.before));
 const analysis=analyzeConversations(emails,{complete:snapshot.complete});
 return {...snapshot,...analysis,emails,focusLabel:MAIL_FOCUS.label};
}
