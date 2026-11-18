// Reply macro observed in the owner's Instantly editor. Variables stay provider-derived.
import {signedFirstName,greetingName,WRITING_STYLE_VERSION} from '../writing-style.ts';
import {BANNER_IMAGE,BANNER_TARGET,withCampaignBanner} from '../email-branding.ts';
export const REPLY_BANNER=BANNER_IMAGE;
export const REPLY_MACRO_VERSION='reply-2026-11-18-human';
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
 const linked=esc(content).replace(/https?:\/\/[^\s<>]+/g,url=>'<a href="'+url+'" target="_blank">'+url+'</a>').replace(/\n/g,'<br>');
 const html=withCampaignBanner('<div><div>Hey&nbsp;'+esc(input.firstName)+',<br><br>'+linked+'<br><br><section id="signature">'+signatureHtml+'</section><br>&nbsp;</div></div>');
 return {writingStyleVersion:WRITING_STYLE_VERSION,body:'Hey '+input.firstName+',\n\n'+content+'\n\n'+signatureText,html,replyContent:content,macroName:'Reply',macroVersion:REPLY_MACRO_VERSION,bannerUrl:REPLY_BANNER,bannerTargetUrl:BANNER_TARGET,macroFirstName:input.firstName,signatureHtml};
}
export async function composeReplyMacro(provider:(path:string,body?:unknown)=>Promise<any>,input:{body:string;recipient:string;eaccount:string;campaignId?:string;incomingText?:string}){
 const [account,page]=await Promise.all([provider('/accounts/'+encodeURIComponent(input.eaccount)),provider('/leads/list',{contacts:[input.recipient],limit:100})]);
 if(String(account.email||'').toLowerCase()!==input.eaccount.toLowerCase())throw Error('REPLY_MACRO_ACCOUNT_MISMATCH');
 if(!Array.isArray(page.items))throw Error('REPLY_MACRO_LEAD_LOOKUP_FAILED');
 const exact=page.items.filter((l:any)=>String(l.email||'').toLowerCase()===input.recipient.toLowerCase()),campaign=exact.filter((l:any)=>l.campaign===input.campaignId),leads=campaign.length?campaign:exact;
 const names=[...new Set(leads.map((l:any)=>String(l.first_name||l.payload?.firstName||'').trim()).filter(Boolean))];
 const signed=signedFirstName(input.incomingText||'');if(!signed&&names.length!==1)throw Error('REPLY_MACRO_FIRST_NAME_MISSING');
 return {...renderReplyMacro({body:input.body,firstName:greetingName(input.incomingText||'',String(names[0]||'')),signature:String(account.signature||'')}),greetingSource:signed?'creator_signature':'provider_lead'};
}
