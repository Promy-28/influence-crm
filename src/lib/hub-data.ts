import {cache} from 'react';
import {db,all} from './db';
import {environment,loadRecord,decodeRecord} from './promy-bot/store';
import {analyzeConversations} from './promy-bot/mail-analysis';
export const RATINGS:Record<string,string>={great:'Зелёный',maybe:'Жёлтый',no:'Красный',unreviewed:'Не проверен',unverified:'Не проверено видео'};
export const ratingClass=(r:string)=>r==='great'?'good':r==='maybe'?'warn':r==='no'?'bad':'';
export const sourceSheet='https://docs.google.com/spreadsheets/d/1aiJ-YaWM__dEZxhUp21nKrN3fz3YKmlYQYPVM2OnQnI/edit#gid=286322810';
export const safeLinks=(s:unknown)=>[...new Set((String(s||'').match(/https?:\/\/[^\s<>"\])]+/gi)||[]))].slice(0,4);
export const mailSnapshot=cache(async():Promise<any>=>{
 const env=environment(),active=await loadRecord(env,'agent_history_active');
 if(!active?.complete)return {complete:false,syncedAt:null,emails:[],threads:[],aggregate:{waitingOnUs:0,messages:0,threads:0}};
 const ids=Array.from({length:active.chunks},(_,i)=>'agent_history:'+active.generation+':'+i);
 const {data,error}=await db.from('promy_bot_records').select('id,value,version').in('id',ids);
 if(error||data?.length!==ids.length)throw Error('История загружена не полностью');
 const emails=data.flatMap((r:{value:string})=>decodeRecord(r.value).items||[]);
 const analysis=analyzeConversations(emails,{complete:true});
 for(const t of analysis.threads as any[]){if(!t.sender){const original=emails.find((e:any)=>e.thread_id===t.id);t.sender=(String(original?.lead||original?.to_address_email_list||'').match(/[^\s,;<>]+@[^\s,;<>]+/)||[])[0]||'Адрес не определён'}}
 return {...analysis,emails,syncedAt:active.syncedAt};
});
export const redditDirectory=cache(async():Promise<any>=>{
 const [directory,legacy]=await Promise.all([
  all<any>((f,t)=>db.from('reddit_creator_directory').select('*').order('updated_at',{ascending:false}).range(f,t)),
  all<any>((f,t)=>db.from('creators').select('id,email,name,handle,profile_url,source,notes,do_not_contact,review_status').in('source',['import:Reddit','import:Форма','reddit']).range(f,t)),
 ]);
 const emails=new Set(directory.map(r=>r.email.toLowerCase()));
 return [...directory.map(r=>({...r,rating:r.owner_rating||r.payload.sourceRating||r.payload.rating||'unreviewed',reason:r.owner_reason||r.payload.reason||'',legacy:false})),...legacy.filter(c=>!emails.has(c.email?.toLowerCase())).map(c=>({id:'legacy:'+c.id,email:c.email,payload:{name:c.name||c.handle,reddit:c.handle,profile:c.profile_url,notes:c.notes},rating:'unreviewed',reason:'Исторический импорт. Оценка и причины не перенесены.',legacy:true,review_pending:false,updated_at:null}))];
});
export function contactThreads(threads:any[]){const map=new Map<string,any>();for(const t of threads){const email=String(t.sender||'').toLowerCase();if(email&&(!map.has(email)||String(t.lastMessageAt)>String(map.get(email).lastMessageAt)))map.set(email,t)}return map}
