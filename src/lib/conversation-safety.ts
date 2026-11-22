export const MAIL_CONTEXT_VERSION=3;
export async function conversationFingerprint(context:any){
 const data=JSON.stringify([context.canonical?.from_address_email,context.canonical?.eaccount,context.canonical?.thread_id,context.complete,context.thread?.state,...[...(context.thread?.messages||[])].sort((a,b)=>String(a.id).localeCompare(String(b.id))).map(m=>[m.id,m.timestamp,m.direction,m.intent,m.text]),context.briefContext]);
 return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(data))),b=>b.toString(16).padStart(2,'0')).join('');
}
export async function draftContextCurrent(draft:any,context:any){return draft.contextVersion===MAIL_CONTEXT_VERSION&&!!draft.conversationFingerprint&&context.complete===true&&draft.conversationFingerprint===await conversationFingerprint(context);}
