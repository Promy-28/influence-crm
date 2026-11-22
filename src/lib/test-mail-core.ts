import {renderReplyMacro} from './promy-bot/reply-macro.ts';
import {validDraftApproval,editableDraft} from './draft-approval.ts';
export const TEST_SENDER='kim.r@trypromy.co';
export const TEST_SUBJECT='Promy Creators · Reply layout test';
export const TEST_BODY='This is a test email sent from Promy Creators Hub.\n\nPlease check the greeting, sender signature, and original Promy banner below.\n\nThis message is for checking the email layout only.';
export function buildTestMail(recipient:string,firstName:string,signature:string){
 if(!/^[^\s,;<>@]+@[^\s,;<>@]+\.[a-z]{2,}$/i.test(recipient)||/[\r\n]/.test(recipient)||recipient.length>254)throw Error('Укажи один корректный email для теста.');
 return {id:crypto.randomUUID(),emailId:'test',recipient:recipient.toLowerCase(),eaccount:TEST_SENDER,subject:TEST_SUBJECT,status:'draft',createdAt:new Date().toISOString(),...renderReplyMacro({body:TEST_BODY,firstName,signature})};
}
export async function sendTestOnce(id:string,approval:unknown,deps:{load:(id:string)=>Promise<any>;save:(id:string,value:any)=>Promise<void>;send:(payload:any)=>Promise<any>;secret:string}){
 const key='testmail:'+id,d=await deps.load(key);
 if(!d||!editableDraft(d)||d.emailId!=='test'||d.replyContent!==TEST_BODY||d.eaccount!==TEST_SENDER||Date.now()-Date.parse(d.createdAt)>15*60000||!validDraftApproval(d,approval,deps.secret))throw Error('Тест уже отправлен, изменился или устарел. Подготовь новый предпросмотр.');
 d.status='sending';await deps.save(key,d);
 try{const result=await deps.send({eaccount:d.eaccount,to_address_email_list:d.recipient,subject:d.subject,body:{html:d.html}});if(result?.status!=='success')throw Error('TEST_RESULT_UNCERTAIN');d.status='sent';d.sentAt=new Date().toISOString();await deps.save(key,d)}catch(e){const code=e instanceof Error?e.message:'';d.status=/^INSTANTLY_4\d\d$/.test(code)?'failed':'uncertain';d.error=/^INSTANTLY_\d{3}$/.test(code)?code:'Результат требует проверки';await deps.save(key,d)}
 return d;
}
