import 'server-only';
import {mailSnapshot} from './hub-data';
import {draftWorkspace} from './draft-workspace';
import {focusedReply} from './mail-reply-view';
import {environment,loadRecord,api,telegram,saveRecord,campaigns} from './promy-bot/store';
import {createAgentRuntime} from './promy-bot/agent-runtime';
export async function redditThread(id:string,snapshot?:any){
 const history=snapshot||await mailSnapshot(),selected=history.threads.find((t:any)=>t.id===id);if(!selected)return null;
 const env=environment();let context:any=null,error='';
 if(selected.latestInboundId){try{const r=createAgentRuntime({env,api,telegram,loadRecord,saveRecord,campaigns});context=await r.getThread(selected.latestInboundId,{includeReferences:false});if(context.complete&&context.thread?.latestInboundId&&context.thread.latestInboundId!==context.canonical.id)context=await r.getThread(context.thread.latestInboundId,{includeReferences:false})}catch{error='Instantly сейчас не отдал живую переписку. Показан сохранённый снимок.'}}
 const thread=context?.thread||selected,messages=[...(thread.messages||[])].sort((a:any,b:any)=>Date.parse(b.timestamp)-Date.parse(a.timestamp)),emailId=context?.canonical?.id||thread.latestInboundId;
 return {contact:{id:selected.id,sender:selected.sender,account:context?.canonical?.eaccount||selected.account,campaignIds:thread.campaignIds||selected.campaignIds},state:thread.state,messages,incoming:messages.find((m:any)=>m.id===emailId)||null,emailId,emailSubject:context?.canonical?.subject||'Переписка',briefContext:context?.briefContext||null,error,proposal:emailId?focusedReply(await draftWorkspace('reddit'),emailId):{draft:null,decision:null}};
}
