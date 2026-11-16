/* eslint-disable @typescript-eslint/ban-ts-comment, @typescript-eslint/no-unused-vars, prefer-const */
// @ts-nocheck
// Shared mail safety core, mirrored from Creator Hub.
// Pure observation only. Provider types/timestamps: https://developer.instantly.ai/api-reference/schemas/email
const HOUR = 3600000;
export function unquotedText(email) {
 const raw = String(email.body?.text || email.body?.html || email.content_preview || '');
 const html = raw.split(/<blockquote\b|<div\b[^>]*class=["'][^"']*(?:gmail_quote|yahoo_quoted)/i)[0];
 return html.replace(/<br\s*\/?\s*>|<\/p>/gi,'\n').replace(/<[^>]*>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').split(/\n\s*(?:On .{3,200}wrote:|From:\s|-----Original Message-----|_{5,})/i)[0].split('\n').filter(line=>!/^\s*>/.test(line)).join('\n').trim();
}
function intent(email) {
 const text = unquotedText(email).toLowerCase();
 if (/\b(unsubscribe|remove me|stop (?:emailing|contacting)|do not contact|don't contact|opt out)\b/.test(text)) return 'opt_out';
 if (/\b(not interested|no interest|no thanks|not a fit|not for me)\b/.test(text)) return 'not_interested';
 if (/\b(undeliverable|delivery (?:status notification|failed)|mail delivery (?:failed|failure)|address not found|recipient not found)\b/.test(String(email.subject||'').toLowerCase()+' '+text)) return 'bounce';
 if (email.is_auto_reply===true || Number(email.is_auto_reply)===1 || /\b(out of (?:the )?office|automatic reply|auto(?:matic)?[- ]response|on (?:annual )?leave)\b/.test(String(email.subject||'').toLowerCase()+' '+text)) return 'auto_reply';
 if (/\b(how much|price|pricing|rate|budget|payment|paid)\b/.test(text)) return 'pricing';
 if (/\b(interested|sounds good|let's do|lets do|happy to|would love)\b/.test(text)) return 'interested';
 if (text.includes('?')) return 'question';
 return 'other';
}
const metric = value => typeof value==='number' && Number.isFinite(value) && value>=0 ? value : null;
function counts() { return {messages:0,inbound:0,humanInbound:0,outbound:0,scheduled:0,autoReplies:0,bounces:0,threads:0,waitingOnUs:0,waitingOnThem:0}; }
export function analyzeConversations(emails,{now=Date.now(),complete=false,campaignMetrics={}}={}) {
 const nowMs=typeof now==='number'?now:Date.parse(now);
 const groups=new Map(),seen=new Set(),campaigns=new Map(),attribution=new Map();
 let duplicates=0,invalidTimestamps=0,unidentified=0;
 for (const email of Array.isArray(emails)?emails:[]) {
  if(!email||typeof email!=='object')continue;
  if(!email.id){unidentified++;continue}
  if(seen.has(email.id)){duplicates++;continue} seen.add(email.id);
  const type=Number(email.ue_type),direction=type===2?'inbound':type===1||type===3?'outbound':type===4?'scheduled':'unknown';
  // Never substitute database insertion time for a malformed actual email timestamp.
  const timestamp=email.timestamp_email??email.timestamp_created,time=typeof timestamp==='string'?Date.parse(timestamp):NaN;
  if(!Number.isFinite(time))invalidTimestamps++;
  const threadId=email.thread_id||'message:'+email.id;
  const message={id:email.id,threadId,campaignId:email.campaign_id||null,direction,type,time:Number.isFinite(time)?time:null,timestamp:Number.isFinite(time)?new Date(time).toISOString():null,sender:email.from_address_email||null,account:email.eaccount||null,intent:direction==='inbound'?intent(email):null,text:unquotedText(email),step:email.step??null,variant:email.variant??email.variant_id??null};
  if(!groups.has(threadId))groups.set(threadId,[]);groups.get(threadId).push(message);
 }
 const threads=[];
 for(const [id,messages] of groups) {
  messages.sort((a,b)=>(a.time??Infinity)-(b.time??Infinity)||a.id.localeCompare(b.id));
  const active=messages.filter(m=>m.direction==='inbound'||m.direction==='outbound'),latest=active.at(-1)||null;
  const human=messages.filter(m=>m.direction==='inbound'&&!['auto_reply','bounce'].includes(m.intent));
  const latestHuman=human.at(-1)||null,optedOut=human.some(m=>m.intent==='opt_out');
  let state='unknown';
  const ambiguousLatest=latest&&active.some(m=>m.id!==latest.id&&m.time===latest.time&&m.direction!==latest.direction);
  if(active.length&&active.every(m=>m.time!==null)&&Number.isFinite(nowMs)&&!active.some(m=>m.time>nowMs)&&!ambiguousLatest) {
   if(optedOut)state='opt_out';
   else if(latest?.intent==='bounce')state='bounced';
   else if(latest?.intent==='auto_reply')state='auto_reply';
   else if(latest?.direction==='inbound')state=latest.intent==='not_interested'?'not_interested':'waiting_on_us';
   else if(latest?.direction==='outbound')state=latestHuman?.intent==='not_interested'?'not_interested':'waiting_on_them';
  }
  const elapsedHours=latest?.time!==null&&Number.isFinite(nowMs)&&latest ? Math.max(0,(nowMs-latest.time)/HOUR):null;
  const stage=state==='waiting_on_us'&&elapsedHours>=48?'48h':state==='waiting_on_us'&&elapsedHours>=24?'24h':null;
  const campaignIds=[...new Set(messages.map(m=>m.campaignId).filter(Boolean))];
  const thread={id,campaignIds,state,latestMessageId:latest?.id||null,latestInboundId:latestHuman?.id||null,sender:latestHuman?.sender||null,account:latest?.account||null,lastMessageAt:latest?.timestamp||null,elapsedHours,stage,intent:latestHuman?.intent||null,intentSource:'keyword_heuristic',messageIds:messages.map(m=>m.id),messages};threads.push(thread);
  let previousSent=null;
  for(const m of messages) {
   if(m.direction==='outbound')previousSent=m;
   const attributed=m.direction==='inbound'?previousSent:m;
   if(!attributed?.campaignId||attributed.step===null)continue;
   const key=JSON.stringify([attributed.campaignId,attributed.step,attributed.variant]);
   if(!attribution.has(key))attribution.set(key,{campaignId:attributed.campaignId,step:attributed.step,variant:attributed.variant,sent:0,humanReplies:0});
   const bucket=attribution.get(key);if(m.direction==='outbound')bucket.sent++;else if(m.direction==='inbound'&&!['auto_reply','bounce'].includes(m.intent)&&m.time!==null&&attributed.time!==null&&m.time>attributed.time)bucket.humanReplies++;
  }
  for(const campaignId of campaignIds) {
   if(!campaigns.has(campaignId))campaigns.set(campaignId,{campaignId,...counts()});
   const c=campaigns.get(campaignId);c.threads++;if(state==='waiting_on_us')c.waitingOnUs++;if(state==='waiting_on_them')c.waitingOnThem++;
   for(const m of messages.filter(m=>m.campaignId===campaignId)){c.messages++;if(m.direction==='outbound')c.outbound++;if(m.direction==='scheduled')c.scheduled++;if(m.direction==='inbound'){c.inbound++;if(m.intent==='auto_reply')c.autoReplies++;else if(m.intent==='bounce')c.bounces++;else c.humanInbound++}}
  }
 }
 const aggregate=counts();aggregate.threads=threads.length;aggregate.waitingOnUs=threads.filter(t=>t.state==='waiting_on_us').length;aggregate.waitingOnThem=threads.filter(t=>t.state==='waiting_on_them').length;
 for(const t of threads)for(const m of t.messages){aggregate.messages++;if(m.direction==='outbound')aggregate.outbound++;if(m.direction==='scheduled')aggregate.scheduled++;if(m.direction==='inbound'){aggregate.inbound++;if(m.intent==='auto_reply')aggregate.autoReplies++;else if(m.intent==='bounce')aggregate.bounces++;else aggregate.humanInbound++}}
 const campaignRows=[...campaigns.values()].map(c=>{const delivered=metric(campaignMetrics[c.campaignId]?.delivered),replied=metric(campaignMetrics[c.campaignId]?.uniqueReplies);return {...c,delivered,uniqueReplies:replied,replyRate:delivered>0&&replied!==null&&replied<=delivered?replied/delivered:null}});
 return {complete:complete===true,analyzedAt:Number.isFinite(nowMs)?new Date(nowMs).toISOString():null,intentSource:'keyword_heuristic',aggregate,campaigns:campaignRows,attribution:[...attribution.values()],threads,warnings:{duplicates,invalidTimestamps,unidentified,partialHistory:complete!==true}};
}
export function reminderCandidates(analysis,{sentIds=[],limit=20,requireComplete=true}={}) {
 if(!analysis||(requireComplete&&!analysis.complete))return [];
 const sent=new Set(sentIds),maximum=Number.isFinite(limit)?Math.max(0,Math.min(100,Math.floor(limit))):20;
 return (analysis.threads||[]).filter(t=>t.state==='waiting_on_us'&&t.stage&&t.latestMessageId).map(t=>({id:JSON.stringify(['unanswered',t.id,t.latestMessageId,t.stage]),threadId:t.id,emailId:t.latestMessageId,sender:t.sender,account:t.account,campaignIds:t.campaignIds,stage:t.stage,elapsedHours:t.elapsedHours,lastMessageAt:t.lastMessageAt,intent:t.intent})).filter(r=>!sent.has(r.id)).sort((a,b)=>b.elapsedHours-a.elapsedHours||a.id.localeCompare(b.id)).slice(0,maximum);
}
