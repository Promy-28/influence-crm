// Reply macro observed in the owner's Instantly editor. Variables stay provider-derived.
export const REPLY_BANNER='https://lh3.googleusercontent.com/pw/AP1GczOt0ynqQcFdGwuWqHXrSCVh_ukl8tP6UnNd_dmf5R6sjrYY2GB8xvM7h09tBGdd-9llLsQH7yFLQA-iFXgHUijH_w8iAoSCOnig1Z_63v0_FzvM2Kk=w2400';
export const REPLY_MACRO_VERSION='reply-2026-11-16';
const esc=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
export function plainSignature(html:string){return html.replace(/<br\s*\/?\s*>/gi,'\n').replace(/<\/(?:div|p|section)>/gi,'\n').replace(/<[^>]*>/g,'').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/\n{3,}/g,'\n\n').trim()}
export function renderReplyMacro(input:{body:string;firstName:string;signature:string}){
 if(!input.firstName.trim()||input.firstName.length>100)throw Error('REPLY_MACRO_FIRST_NAME_MISSING');
 if(!input.signature.trim()||input.signature.length>12000)throw Error('REPLY_MACRO_SIGNATURE_MISSING');
 if(/<(?:script|iframe|object|embed|form|meta|link|svg)\b|\son[a-z]+\s*=|javascript:/i.test(input.signature))throw Error('REPLY_MACRO_SIGNATURE_UNSAFE');
 const signatureHtml=/<[a-z]/i.test(input.signature)?input.signature:esc(input.signature).replace(/\n/g,'<br>'),signatureText=plainSignature(signatureHtml);
 let content=input.body.trim().replace(/^(?:hi|hey|hello|dear)\b[^\n]*[,!]\s*\n+/i,'');
 if(content.endsWith(signatureText))content=content.slice(0,-signatureText.length).trim();
 content=content.replace(/\n+(?:best regards|best|kind regards|regards|warmly|warm regards|cheers|sincerely)[,\s]*\n[\s\S]*$/i,'').trim();
 if(!content)throw Error('REPLY_MACRO_EMPTY_CONTENT');
 const html='<div><div>Hey&nbsp;'+esc(input.firstName)+' ,<br><br>'+esc(content).replace(/\n/g,'<br>')+'<br><br><section id="signature">'+signatureHtml+'</section><br>&nbsp;</div><div><img src="'+REPLY_BANNER+'" style="width:600px;" class="fr-fic fr-dib fr-draggable"></div></div>';
 return {body:'Hey '+input.firstName+' ,\n\n'+content+'\n\n'+signatureText,html,replyContent:content,macroName:'Reply',macroVersion:REPLY_MACRO_VERSION,bannerUrl:REPLY_BANNER,macroFirstName:input.firstName,signatureHtml};
}
export async function composeReplyMacro(provider:(path:string,body?:unknown)=>Promise<any>,input:{body:string;recipient:string;eaccount:string;campaignId?:string}){
 const [account,page]=await Promise.all([provider('/accounts/'+encodeURIComponent(input.eaccount)),provider('/leads/list',{contacts:[input.recipient],limit:100})]);
 if(String(account.email||'').toLowerCase()!==input.eaccount.toLowerCase())throw Error('REPLY_MACRO_ACCOUNT_MISMATCH');
 if(!Array.isArray(page.items))throw Error('REPLY_MACRO_LEAD_LOOKUP_FAILED');
 const exact=page.items.filter((l:any)=>String(l.email||'').toLowerCase()===input.recipient.toLowerCase()),campaign=exact.filter((l:any)=>l.campaign===input.campaignId),leads=campaign.length?campaign:exact;
 const names=[...new Set(leads.map((l:any)=>String(l.first_name||l.payload?.firstName||'').trim()).filter(Boolean))];
 if(names.length!==1)throw Error('REPLY_MACRO_FIRST_NAME_MISSING');
 return renderReplyMacro({body:input.body,firstName:String(names[0]),signature:String(account.signature||'')});
}
