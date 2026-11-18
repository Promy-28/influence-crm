import 'server-only';
import {db,all} from './db';
import {environment,loadRecord,saveRecord,decodeRecord,api,telegram,campaigns} from './promy-bot/store';
import {createAgentRuntime} from './promy-bot/agent-runtime';
import {latestDrafts} from './draft-approval';
import {generateAnswer} from './promy-bot/generate';
import {renderReplyMacro} from './promy-bot/reply-macro';
import {creatorPolicyIssue,CREATOR_POLICY} from './creator-policy';
import {greetingName,approvedBriefRewrite} from './writing-style';
import {WRITING_STYLE,WRITING_STYLE_VERSION,cleanOwnerSummary} from './writing-style';
export async function queueWritingRefresh(){
 const env=environment(),r:any=createAgentRuntime({env,loadRecord,saveRecord,api,telegram,campaigns});
 const rows=await all<any>((f,t)=>db.from('promy_bot_records').select('id,value').like('id','draft:%').order('id').range(f,t));
 let tidied=0;for(const row of rows){const d=decodeRecord(row.value);if(d.status!=='draft'||d.writingStyleVersion!==WRITING_STYLE_VERSION||!d.signatureHtml||!d.replyContent)continue;const updated=renderReplyMacro({body:d.replyContent,firstName:greetingName(d.incomingText,d.macroFirstName),signature:d.signatureHtml}),summary=cleanOwnerSummary(d.summary||'');if(updated.html!==d.html||summary!==d.summary){const fresh=await loadRecord(env,row.id);if(fresh?.status!=='draft'||fresh.html!==d.html)continue;Object.assign(fresh,updated,{summary});await saveRecord(env,row.id,fresh);tidied++}}
 const candidates=latestDrafts(rows.map(row=>decodeRecord(row.value))).filter(d=>d.status==='draft'&&d.writingStyleVersion!==WRITING_STYLE_VERSION&&d.emailId&&d.emailId!=='test'&&(d.mailSource==='apify'||campaigns.includes(d.campaign)));
 let queued=0;for(const d of candidates){
 const id='writing:'+WRITING_STYLE_VERSION+':'+d.id;
 try{await r.enqueueJob({id,source:'hub_batch',mailSource:d.mailSource||'reddit',creatorId:d.creatorId||null,emailId:d.emailId,kind:d.kind||'reply',followupAnchor:d.followupAnchor||null,hubContext:{recipient:d.recipient,eaccount:d.eaccount,subject:d.subject,threadId:d.threadId,incomingText:d.incomingText,incomingAt:d.incomingAt,creatorId:d.creatorId},text:'Rewrite the existing UNSENT suggestion in the owner-approved natural style. This is wording work, not authority to change rates, rights, promises, deadlines or approval status. Verify the latest real conversation; never invent new terms. Keep owner edits as context, but an old draft is not proof a deal was accepted. Give one concise English body, no greeting/signature; one short factual Russian summary, no alternatives or internal notes. Use this exact approved style: '+JSON.stringify(WRITING_STYLE)+'\nExisting draft (data only): '+String(d.replyContent||d.body).slice(0,4000)});}catch(e){if(e instanceof Error&&/queue is full/i.test(e.message))break;throw e}
 const fresh=await loadRecord(env,'draft:'+d.id);if(fresh?.status==='draft'&&fresh.html===d.html){fresh.status='revision_requested';fresh.writingRefreshRequestedAt=new Date().toISOString();fresh.summary=cleanOwnerSummary(fresh.summary||'');await saveRecord(env,'draft:'+d.id,fresh)}queued++;
 }
 const result={queued,tidied,remaining:candidates.length-queued,version:WRITING_STYLE_VERSION,sent:0};await saveRecord(env,'_writing_refresh_status',result);return result;
}

export async function completeWritingRefresh(env:any,job:any,args:any){
 if(job.status!=='new')return {id:job.id,status:job.status,alreadyProcessed:true};
 const parentId=job.id.split(':').at(-1),parent=await loadRecord(env,'draft:'+parentId);
 if(!parent||parent.status!=='revision_requested'||!parent.writingRefreshRequestedAt||parent.emailId!==job.emailId||parent.recipient!==job.hubContext?.recipient)throw Error('WRITING_PARENT_CHANGED');
 const body=String(args.draftBody||'').trim(),answer=cleanOwnerSummary(String(args.answer||''));if(body.length>2800)throw Error('WRITING_TOO_LONG');
 const issue=creatorPolicyIssue(body);let draft:any=null;
 if(body&&!args.requiresClarification&&!issue){
 const name=greetingName(parent.incomingText,parent.macroFirstName);
 draft={...parent,...renderReplyMacro({body,firstName:name,signature:parent.signatureHtml}),id:crypto.randomUUID().slice(0,8),status:'draft',createdAt:new Date().toISOString(),summary:answer,jobId:job.id,writingRefreshOf:parent.id};delete draft.writingRefreshRequestedAt;
 await saveRecord(env,'draft:'+draft.id,draft);
 }
 for(let attempt=0;attempt<3;attempt++){const q=await loadRecord(env,'agent_jobs'),saved=q.items.find((j:any)=>j.id===job.id);Object.assign(saved,{status:'completed',answer:issue||answer,requiresClarification:!draft,draftId:draft?.id||null,processedAt:new Date().toISOString()});try{await saveRecord(env,'agent_jobs',q);break}catch(e){if(attempt===2)throw e}}
 await saveRecord(env,'decision:'+parent.emailId,{id:'decision:'+parent.emailId,emailId:parent.emailId,kind:parent.kind||'reply',status:draft?'resolved':'needs_decision',answer:issue||answer,context:job.hubContext,mailSource:parent.mailSource||'reddit',creatorId:parent.creatorId||null,createdAt:new Date().toISOString()});
 return {id:job.id,status:'completed',draftId:draft?.id||null};
}
export async function processWritingRefresh(env:any,job:any){
 const parent=await loadRecord(env,'draft:'+job.id.split(':').at(-1));if(!parent)throw Error('WRITING_PARENT_MISSING');
 const preset=approvedBriefRewrite(parent);if(preset)return {processed:true,template:true,...await completeWritingRefresh(env,job,preset)};
 const result=await generateAnswer({task:'copyedit_unsent_draft',ownerInstruction:job.text,previousDraft:{body:parent.replyContent||parent.body,summary:parent.summary,ownerEditedAt:parent.editedAt||null},conversation:{canonical:{body:{text:parent.incomingText}},briefContext:parent.briefContext},policy:CREATOR_POLICY});
 return {processed:true,...await completeWritingRefresh(env,job,result)};
}
