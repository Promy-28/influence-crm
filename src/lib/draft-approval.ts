import {createHmac,timingSafeEqual} from 'node:crypto';
import {REPLY_BANNER,renderReplyMacro} from './promy-bot/reply-macro.ts';
export function exactDraft(d:any){return JSON.stringify([d.id,d.emailId,d.campaign,d.threadId,d.recipient,d.eaccount,d.subject,d.body,d.html,d.status])}
export function approvalToken(d:any,secret:string){return createHmac('sha256',secret).update(exactDraft(d)).digest('hex')}
export function validDraftApproval(d:any,token:unknown,secret:string){const expected=approvalToken(d,secret);return typeof token==='string'&&/^[a-f0-9]{64}$/.test(token)&&timingSafeEqual(Buffer.from(expected),Buffer.from(token))}
export function readyDraft(d:any,now=Date.now()){
 if(d.status!=='draft'||d.macroName!=='Reply'||!d.replyContent||!d.html||d.bannerUrl!==REPLY_BANNER||!Number.isFinite(Date.parse(d.createdAt))||now-Date.parse(d.createdAt)>86400000||Date.parse(d.createdAt)>now+300000)return false;
 try{const actual=renderReplyMacro({body:d.replyContent,firstName:d.macroFirstName,signature:d.signatureHtml});return actual.body===d.body&&actual.html===d.html}catch{return false}
}
export function latestDrafts(drafts:any[]){
 const newest=new Map<string,any>();
 for(const d of [...drafts].sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))||b.id.localeCompare(a.id))){if(!newest.has(d.emailId))newest.set(d.emailId,d)}
 return drafts.filter(d=>d.status==='sent'||newest.get(d.emailId)?.id===d.id);
}
