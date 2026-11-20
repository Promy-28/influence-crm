import 'server-only';
import {unstable_cache} from 'next/cache';
import type {FarmAccount,FarmPost,FarmProgram,FarmDetail} from './farm-contract';
export class FarmHttpError extends Error{constructor(message:string,public status:number){super(message);}}
export function farmConfigured(){return ['FARM_PARTNER_BASE_URL','FARM_CF_ACCESS_CLIENT_ID','FARM_CF_ACCESS_CLIENT_SECRET','FARM_PARTNER_TOKEN'].every(k=>!!process.env[k]?.trim());}
export async function farmRequest<T>(path:string,method='GET',body?:unknown):Promise<T>{
 if(!farmConfigured())throw Error('FARM не подключён: добавь четыре серверные переменные в Vercel → influence-crm');
 const base=process.env.FARM_PARTNER_BASE_URL!.trim().replace(/\/+$/,'');
 if(base!=='https://farm.promy.io/api/v1/partner')throw Error('FARM_PARTNER_BASE_URL должен быть https://farm.promy.io/api/v1/partner');
 if(!/^\/(accounts|programs|posts)(?:\/[A-Za-z0-9._:-]+)*(?:\?limit=50&offset=\d+)?$/.test(path))throw Error('Недопустимый маршрут FARM');
 let r:Response;try{r=await fetch(base+path,{method,headers:{'CF-Access-Client-Id':process.env.FARM_CF_ACCESS_CLIENT_ID!,'CF-Access-Client-Secret':process.env.FARM_CF_ACCESS_CLIENT_SECRET!,authorization:'Bearer '+process.env.FARM_PARTNER_TOKEN!,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),cache:'no-store',redirect:'manual',signal:AbortSignal.timeout(15000)});}catch{throw Error(method==='GET'?'FARM недоступен. Попробуй позже.':'Связь прервалась. Результат изменения неизвестен; сначала проверь FARM, не повторяй вслепую.');}
 if(r.status===429)throw Error('FARM: лимит запросов. Повтори не раньше чем через '+(Number(r.headers.get('retry-after'))||60)+' сек.');
 if(r.status>=300&&r.status<400||!r.headers.get('content-type')?.includes('application/json'))throw Error('Cloudflare Access не пропускает сервер. Проверь service token и политику доступа.');
 if(!r.ok)throw new FarmHttpError(({401:'FARM: неверный partner token',403:'FARM: действие не разрешено токену',409:'FARM: конфликт состояния или версии. Обнови данные и проверь изменения.',422:'FARM: действие не поддерживается или данные не прошли проверку.'} as Record<number,string>)[r.status]||'FARM: ошибка сервиса '+r.status,r.status);
 return r.json();
}
export const farmSnapshot=unstable_cache(async()=>{
 const accounts=(await farmRequest<FarmAccount[]>('/accounts')).filter(a=>a.platform==='reddit');
 const posts=(await farmRequest<FarmPost[]>('/posts?limit=50&offset=0')).filter(p=>p.platform==='reddit');
 const programs=await farmRequest<FarmProgram[]>('/programs');
 return {accounts,posts,programs,readAt:new Date().toISOString()};
},['farm-reddit-snapshot-v1'],{revalidate:600});
export const farmProgram=unstable_cache((id:string)=>farmRequest<FarmDetail>('/programs/'+id),['farm-reddit-program-v1'],{revalidate:600});
