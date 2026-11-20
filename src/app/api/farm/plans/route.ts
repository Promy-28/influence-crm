import {NextResponse} from 'next/server';
import {cookies} from 'next/headers';
import {COOKIE,readToken} from '@/lib/session';
import {environment,loadRecord,saveRecord} from '@/lib/promy-bot/store';
import {farmRequest,FarmHttpError} from '@/lib/farm-server';
import type {FarmAccount} from '@/lib/farm-contract';
import {createFarmPlan,runFarmPlan,type FarmPlan} from '@/lib/farm-plans';
export const maxDuration=180;
const validId=(id:unknown):id is string=>typeof id==='string'&&/^hub-[a-f0-9-]{36}$/i.test(id);
async function authorized(){return readToken((await cookies()).get(COOKIE)?.value);}
export async function GET(){
 if(!await authorized())return NextResponse.json({error:'Нужно войти'},{status:401});
 try{const env=environment(),index=await loadRecord(env,'farm:plan_index');const plans=(await Promise.all((index?.ids||[]).slice(0,10).map((id:string)=>loadRecord(env,'farm:plan:'+id)))).filter(Boolean);return NextResponse.json({plans},{headers:{'Cache-Control':'private, no-store'}});}catch{return NextResponse.json({error:'Не удалось загрузить сохранённые планы'},{status:500});}
}
export async function POST(req:Request){
 if(!await authorized())return NextResponse.json({error:'Нужно войти'},{status:401});
 if(req.headers.get('origin')!==new URL(req.url).origin)return NextResponse.json({error:'Недопустимый источник'},{status:403});
 try{
  const raw=await req.text();if(raw.length>200000)throw Error('План слишком большой');const {action,id,name,rows,confirmed}=JSON.parse(raw);if(!validId(id))throw Error('Некорректный план');
  const env=environment(),key='farm:plan:'+id;let plan:FarmPlan|null=await loadRecord(env,key);
  if(action==='save'){
   const fresh=createFarmPlan(id,name,rows,await farmRequest<FarmAccount[]>('/accounts'));
   if(plan&&JSON.stringify(plan.items.map(i=>i.post))!==JSON.stringify(fresh.items.map(i=>i.post)))throw Error('Сохранённый план нельзя незаметно заменить. Сохрани новую версию.');
   if(!plan){plan=fresh;await saveRecord(env,key,plan);}
   const index=await loadRecord(env,'farm:plan_index');await saveRecord(env,'farm:plan_index',{ids:[id,...(index?.ids||[]).filter((x:string)=>x!==id)].slice(0,10)});
  }else if(action==='run'){
   if(confirmed!==true||!plan)throw Error('Нужен сохранённый план и подтверждение отправки');
   plan=await runFarmPlan(plan,{save:p=>saveRecord(env,key,p),accounts:()=>farmRequest<FarmAccount[]>('/accounts'),submit:p=>farmRequest('/posts','POST',p),find:async id=>{try{return await farmRequest('/posts/'+id);}catch(e){if(e instanceof FarmHttpError&&e.status===404)return null;throw e;}}});
  }else throw Error('Неизвестное действие');
  return NextResponse.json({plan});
 }catch(e){const message=e instanceof Error?e.message:'Ошибка плана';return NextResponse.json({error:/BOT_STATE/.test(message)?'Другой запрос изменил план. Обнови страницу перед повтором.':message},{status:400});}
}
