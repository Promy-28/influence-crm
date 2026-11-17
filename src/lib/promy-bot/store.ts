import {createCipheriv,createDecipheriv,createHash,randomBytes,timingSafeEqual,createHmac} from 'node:crypto';
import {db} from '../db';
export const campaigns=['2d02d560-a584-4844-948c-3ed035b9e9e8','9296d2af-c971-40c5-9572-440860bc2a65'];
export const sharedId=(id:string)=>/^(telegram|instantly|owner_mail_context|agent_jobs|agent_history_active|agent_history_sync|latest_digest)$/.test(id)||/^(agent_history:|draft:|tgmsg:|threadstate:|digest:|reminder:)/.test(id);
export type StoreEnv={versions:Map<string,number>};
export const environment=():StoreEnv=>({versions:new Map()});
const key=()=>createHash('sha256').update('promy-bot-records:'+process.env.APP_PASSWORD).digest();
function seal(value:unknown){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(),iv);const data=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),data]).toString('base64')}
function open(value:string){const b=Buffer.from(value,'base64'),decipher=createDecipheriv('aes-256-gcm',key(),b.subarray(0,12));decipher.setAuthTag(b.subarray(12,28));return JSON.parse(Buffer.concat([decipher.update(b.subarray(28)),decipher.final()]).toString())}
export const decodeRecord=open;
export async function loadRecord(env:StoreEnv,id:string){const {data,error}=await db.from('promy_bot_records').select('value,version').eq('id',id).maybeSingle();if(error)throw Error('BOT_STATE_READ_FAILED');env.versions.set(id,data?.version||0);return data?open(data.value):null}
export async function saveRecord(env:StoreEnv,id:string,value:unknown){
 if(!env.versions.has(id))await loadRecord(env,id);const version=env.versions.get(id)!;
 if(!version){const {error}=await db.from('promy_bot_records').insert({id,value:seal(value)});if(error)throw Error('BOT_STATE_CONFLICT');env.versions.set(id,1);return}
 const {data,error}=await db.from('promy_bot_records').update({value:seal(value),version:version+1,updated_at:new Date().toISOString()}).eq('id',id).eq('version',version).select('id');
 if(error||!data?.length)throw Error('BOT_STATE_CONFLICT');env.versions.set(id,version+1);
}
export function adminAuthorized(req:Request){const expected=Buffer.from(process.env.APP_PASSWORD||''),supplied=Buffer.from((req.headers.get('authorization')||'').replace(/^Bearer /,''));return !!expected.length&&expected.length===supplied.length&&timingSafeEqual(expected,supplied)}
export function webhookSecret(){return createHmac('sha256',key()).update('promy-telegram-webhook-v1').digest('hex')}
export function webhookAuthorized(req:Request){const supplied=Buffer.from(req.headers.get('x-telegram-bot-api-secret-token')||''),expected=Buffer.from(webhookSecret());return supplied.length===expected.length&&timingSafeEqual(supplied,expected)}
export async function telegram(env:StoreEnv,method:string,body:unknown={}){const c=await loadRecord(env,'_transport');if(!c?.token)throw Error('BOT_NOT_CONFIGURED');const r=await fetch('https://api.telegram.org/bot'+c.token+'/'+method,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(10000),cache:'no-store'});const data=await r.json();if(!r.ok||!data.ok)throw Error('TELEGRAM_'+r.status);return data.result}
export async function api(key:string,path:string,body?:unknown){const r=await fetch('https://api.instantly.ai/api/v2'+path,{method:body?'POST':'GET',headers:{authorization:'Bearer '+key,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(12000),cache:'no-store'});if(!r.ok)throw Error('INSTANTLY_'+r.status);return r.json()}
