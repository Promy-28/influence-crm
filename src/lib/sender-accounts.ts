import 'server-only';
import {unstable_cache} from 'next/cache';
import {getSettings} from './settings';
import {inst,type Mailbox} from './instantly';
import {environment,loadRecord} from './promy-bot/store';
import {campaignHistory} from './hub-data';
import {db} from './db';
import {GREEN_ID,RED_ID} from './campaign-context';
export const senderAccounts=unstable_cache(async()=>{
 const settings=await getSettings(),key=settings.instantly_key||(await loadRecord(environment(),'instantly'))?.key;
 if(!key)return {boxes:[],checkedAt:new Date().toISOString(),error:'Instantly пока не подключён.',complete:false};
 const accounts:Mailbox[]=[];let cursor='',complete=false;
 try{for(let page=0;page<10;page++){const data=await inst<{items:Mailbox[];next_starting_after?:string}>('/api/v2/accounts?limit=100'+(cursor?'&starting_after='+encodeURIComponent(cursor):''),{},key);accounts.push(...(data.items||[]));if(!data.next_starting_after){complete=true;break}if(cursor===data.next_starting_after)break;cursor=data.next_starting_after}}
 catch{return {boxes:[],checkedAt:new Date().toISOString(),error:'Не удалось обновить список ящиков из Instantly. Открой «Все ящики» или повтори позже.',complete:false}}
 const roles=new Map<string,Set<string>>(),add=(email:string,role:string)=>{const k=email?.toLowerCase();if(!k)return;if(!roles.has(k))roles.set(k,new Set());roles.get(k)!.add(role)};
 for(const email of settings.senders)add(email,'Рассылка Apify');
 const history=await campaignHistory().catch(()=>({emails:[]}));for(const e of history.emails)if(Number(e.ue_type)===3)add(e.eaccount,'Ответы');
 const memberships=await Promise.allSettled([[GREEN_ID,'Green / Yellow'],[RED_ID,'Red']].map(async([id,label])=>{const c=await inst<{email_list?:string[]}>('/api/v2/campaigns/'+id,{},key);for(const email of c.email_list||[])add(email,label)}));
 const replyRows=await db.from('messages').select('eaccount').eq('direction','out').in('via',['reply','hub_batch']).not('eaccount','is',null).limit(5000);for(const m of replyRows.data||[])add(m.eaccount,'Ответы');
 return {boxes:[...new Map(accounts.filter(b=>b.email).map(b=>[b.email.toLowerCase(),{email:b.email,status:b.status??0,roles:[...(roles.get(b.email.toLowerCase())||[])]}])).values()].sort((a,b)=>Number(b.roles.length>0)-Number(a.roles.length>0)||a.email.localeCompare(b.email)),checkedAt:new Date().toISOString(),error:complete?'':'Показана часть ящиков — Instantly не завершил выдачу списка.',complete,membershipComplete:memberships.every(r=>r.status==='fulfilled')};
},['promy-sender-accounts-v1'],{revalidate:120});
