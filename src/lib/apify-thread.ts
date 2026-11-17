import 'server-only';
import {apifyCreator,liveApifyConversation} from './apify-mail';
import {environment} from './promy-bot/store';
import {db} from './db';
import {draftWorkspace} from './draft-workspace';
import {focusedReply} from './mail-reply-view';
export async function apifyThread(id:string){
 const c=await apifyCreator(id);let context:any=null,error='';try{context=(await liveApifyConversation(environment(),id)).context}catch{error='Instantly сейчас не отдал живую ветку. Показана сохранённая переписка.'}
 let messages:any[]=context?.thread?.messages||[];if(!context){const {data}=await db.from('messages').select('id,inst_email_id,direction,body,at,subject').eq('creator_id',id).order('at',{ascending:false}).limit(100);messages=(data||[]).map(m=>({id:m.inst_email_id||m.id,direction:m.direction==='in'?'inbound':'outbound',text:m.body,timestamp:m.at}))}
 messages=[...messages].sort((a,b)=>Date.parse(b.timestamp)-Date.parse(a.timestamp));const emailId=context?.canonical?.id||c.inst_reply_uuid,incoming=messages.find(m=>m.id===emailId)||messages.find(m=>m.direction==='inbound');
 return {contact:{id:c.id,sender:c.email,account:context?.canonical?.eaccount||c.eaccount,campaignIds:c.inst_campaign_id?[c.inst_campaign_id]:[]},state:context?.thread?.state||(c.needs_reply?'waiting_on_us':'waiting_on_them'),messages,incoming,emailId,emailSubject:context?.canonical?.subject||'Переписка',briefContext:context?.briefContext||null,error,proposal:emailId?focusedReply(await draftWorkspace('apify'),emailId):{draft:null,decision:null}};
}
