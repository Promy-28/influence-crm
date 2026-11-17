export function focusedReply(workspace:any,emailId:string){
 return {draft:workspace.drafts.find((d:any)=>d.emailId===emailId&&['draft','uncertain','stale','sending'].includes(d.status))||null,decision:workspace.jobs.find((j:any)=>j.emailId===emailId&&(j.answer||j.error))||null};
}
export function draftLink(source:string,email:string,needs=false){return '/drafts?'+new URLSearchParams({source,email,view:needs?'needs':'review'})}
export function mailDate(value?:string|null){if(!value||!Number.isFinite(Date.parse(value)))return 'Дата не указана';return new Date(value).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'America/New_York'})+' · Нью-Йорк'}
