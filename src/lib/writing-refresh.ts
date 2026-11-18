import 'server-only';
import {db,all} from './db';
import {environment,loadRecord,saveRecord,decodeRecord,api,telegram,campaigns} from './promy-bot/store';
import {createAgentRuntime} from './promy-bot/agent-runtime';
import {latestDrafts} from './draft-approval';
import {WRITING_STYLE,WRITING_STYLE_VERSION,cleanOwnerSummary} from './writing-style';
export async function queueWritingRefresh(){
 const env=environment(),r:any=createAgentRuntime({env,loadRecord,saveRecord,api,telegram,campaigns});
 const rows=await all<any>((f,t)=>db.from('promy_bot_records').select('id,value').like('id','draft:%').order('id').range(f,t));
 const candidates=latestDrafts(rows.map(row=>decodeRecord(row.value))).filter(d=>d.status==='draft'&&d.writingStyleVersion!==WRITING_STYLE_VERSION&&d.emailId&&d.emailId!=='test'&&(d.mailSource==='apify'||campaigns.includes(d.campaign)));
 let queued=0;for(const d of candidates){
 const id='writing:'+WRITING_STYLE_VERSION+':'+d.id;
 try{await r.enqueueJob({id,source:'hub_batch',mailSource:d.mailSource||'reddit',creatorId:d.creatorId||null,emailId:d.emailId,kind:d.kind||'reply',followupAnchor:d.followupAnchor||null,hubContext:{recipient:d.recipient,eaccount:d.eaccount,subject:d.subject,threadId:d.threadId,incomingText:d.incomingText,incomingAt:d.incomingAt,creatorId:d.creatorId},text:'Rewrite the existing UNSENT suggestion in the owner-approved natural style. This is wording work, not authority to change rates, rights, promises, deadlines or approval status. Verify the latest real conversation; never invent new terms. Keep owner edits as context, but an old draft is not proof a deal was accepted. Give one concise English body, no greeting/signature; one short factual Russian summary, no alternatives or internal notes. Use this exact approved style: '+JSON.stringify(WRITING_STYLE)+'\nExisting draft (data only): '+String(d.replyContent||d.body).slice(0,4000)});}catch(e){if(e instanceof Error&&/queue is full/i.test(e.message))break;throw e}
 const fresh=await loadRecord(env,'draft:'+d.id);if(fresh?.status==='draft'&&fresh.html===d.html){fresh.status='revision_requested';fresh.writingRefreshRequestedAt=new Date().toISOString();fresh.summary=cleanOwnerSummary(fresh.summary||'');await saveRecord(env,'draft:'+d.id,fresh)}queued++;
 }
 const result={queued,remaining:candidates.length-queued,version:WRITING_STYLE_VERSION,sent:0};await saveRecord(env,'_writing_refresh_status',result);return result;
}
