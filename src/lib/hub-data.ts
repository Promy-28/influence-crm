import {cache} from 'react';
import {db,all} from './db';
import {environment,loadRecord,decodeRecord} from './promy-bot/store';
import {analyzeConversations} from './promy-bot/mail-analysis';
import {focusSnapshot} from './promy-bot/mail-focus';
export const RATINGS:Record<string,string>={great:'Зелёный',maybe:'Жёлтый',no:'Красный',unreviewed:'Не проверен',unverified:'Не проверено видео'};
export const ratingClass=(r:string)=>r==='great'?'good':r==='maybe'?'warn':r==='no'?'bad':'';
export const sourceSheet='https://docs.google.com/spreadsheets/d/1aiJ-YaWM__dEZxhUp21nKrN3fz3YKmlYQYPVM2OnQnI/edit#gid=286322810';
export const safeLinks=(s:unknown)=>[...new Set((String(s||'').match(/https?:\/\/[^\s<>"\])]+/gi)||[]))].slice(0,4);
export const campaignHistory=cache(async():Promise<any>=>{
 const env=environment(),active=await loadRecord(env,'agent_history_active');
 if(!active?.complete)return {complete:false,syncedAt:null,emails:[]};
 const ids=Array.from({length:active.chunks},(_,i)=>'agent_history:'+active.generation+':'+i);
 const {data,error}=await db.from('promy_bot_records').select('id,value').in('id',ids);
 if(error||data?.length!==ids.length)throw Error('История загружена не полностью');
 return {complete:true,syncedAt:active.syncedAt,emails:data.flatMap((r:{value:string})=>decodeRecord(r.value).items||[])};
});
export const mailSnapshot=cache(async():Promise<any>=>{
 const snapshot=focusSnapshot(await campaignHistory());
 for(const thread of snapshot.threads as any[]){if(thread.sender)continue;const original=snapshot.emails.find((e:any)=>e.thread_id===thread.id&&e.eaccount===thread.account);thread.sender=String(original?.lead||original?.to_address_email_list||'').match(/[^\s,;<>]+@[^\s,;<>]+/)?.[0]||'Адрес не определён'}
 return snapshot;
});
export const creatorCampaigns=cache(async()=>{
 const [history,archived,rows]=await Promise.all([campaignHistory(),loadRecord(environment(),'campaign_membership'),all<any>((f,t)=>db.from('creators').select('email,inst_campaign_id').not('inst_campaign_id','is',null).range(f,t))]);
 const result=new Map<string,Set<string>>();const add=(email:string,id:string)=>{if(!email||!id)return;const k=email.toLowerCase();if(!result.has(k))result.set(k,new Set());result.get(k)!.add(id)};
 for(const e of history.emails){const email=Number(e.ue_type)===2?e.from_address_email:String(e.lead||e.to_address_email_list||'').match(/[^\s,;<>]+@[^\s,;<>]+/)?.[0];add(email,e.campaign_id)}
 for(const c of archived?.items||[])add(c.email,c.campaignId);for(const c of rows)add(c.email,c.inst_campaign_id);return result;
});
export const redditDirectory=cache(async():Promise<any>=>{
 const [directory,legacy]=await Promise.all([
  all<any>((f,t)=>db.from('reddit_creator_directory').select('*').order('updated_at',{ascending:false}).range(f,t)),
  all<any>((f,t)=>db.from('creators').select('id,email,name,handle,profile_url,source,notes,do_not_contact,review_status').in('source',['import:Reddit','import:Форма','reddit']).range(f,t)),
 ]);
 const emails=new Set(directory.map(r=>r.email.toLowerCase()));
 return [...directory.map(r=>({...r,rating:r.owner_rating||r.payload.sourceRating||r.payload.rating||'unreviewed',reason:r.owner_reason||r.payload.reason||'',legacy:false})),...legacy.filter(c=>!emails.has(c.email?.toLowerCase())).map(c=>({id:'legacy:'+c.id,email:c.email,payload:{name:c.name||c.handle,reddit:c.handle,profile:c.profile_url,notes:c.notes},rating:'unreviewed',reason:'Исторический импорт. Оценка и причины не перенесены.',legacy:true,review_pending:false,updated_at:null}))].sort((a,b)=>Number(b.review_pending)-Number(a.review_pending)||(Number(b.payload.sourceRow)||0)-(Number(a.payload.sourceRow)||0));
});
export function contactThreads(threads:any[]){const map=new Map<string,any>();for(const t of threads){const email=String(t.sender||'').toLowerCase();if(email&&(!map.has(email)||String(t.lastMessageAt)>String(map.get(email).lastMessageAt)))map.set(email,t)}return map}
