import {NextResponse} from 'next/server';
import {cookies} from 'next/headers';
import {COOKIE,readToken} from '@/lib/session';
import {farmSnapshot,farmProgram} from '@/lib/farm-server';
import {farmRequest} from '@/lib/farm-server';
import {validatePost,validateWarmupProposal,type FarmAccount,type FarmDetail} from '@/lib/farm-contract';
import {environment,loadRecord,saveRecord} from '@/lib/promy-bot/store';
export async function GET(req:Request){
 if(!await readToken((await cookies()).get(COOKIE)?.value))return NextResponse.json({error:'Нужно войти'},{status:401});
 try{const id=new URL(req.url).searchParams.get('program');if(id&&!/^[a-f0-9-]{36}$/i.test(id))throw Error('Некорректная программа');return NextResponse.json(id?await farmProgram(id):await farmSnapshot(),{headers:{'Cache-Control':'private, no-store'}});}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Не удалось прочитать FARM'},{status:502});}
}
export async function POST(req:Request){
 if(!await readToken((await cookies()).get(COOKIE)?.value))return NextResponse.json({error:'Нужно войти'},{status:401});
 if(req.headers.get('origin')!==new URL(req.url).origin)return NextResponse.json({error:'Недопустимый источник'},{status:403});
 try{
  if(Number(req.headers.get('content-length')||0)>20000)throw Error('Слишком большой запрос');
  const {action,body,confirmed}=await req.json();if(confirmed!==true)throw Error('Подтверди действие');
  if(action==='warmup_proposal'){
   if(!body||!/^[a-f0-9-]{36}$/i.test(body.program_id)||!/^hub-[a-f0-9-]{36}$/i.test(body.request_id))throw Error('Некорректный ID');
   const current=await farmRequest<FarmDetail>('/programs/'+body.program_id),proposal=validateWarmupProposal(body,current),env=environment(),id='farm:proposal:'+body.request_id;
   if(await loadRecord(env,id))throw Error('Запрос уже принят или его результат неизвестен. Проверь предложения в FARM перед повтором.');
   await saveRecord(env,id,{body:proposal,program_id:current.id,state:'submitting',at:new Date().toISOString()});
   const result=await farmRequest('/programs/'+current.id,'PUT',proposal);
   await saveRecord(env,id,{body:proposal,program_id:current.id,state:'accepted',result,at:new Date().toISOString()});
   return NextResponse.json({result});
  }
  if(action!=='post')throw Error('Неподдерживаемое действие');
  const post=validatePost(body,await farmRequest<FarmAccount[]>('/accounts')),env=environment(),id='farm:post:'+post.external_id;
  const previous=await loadRecord(env,id);
  if(previous&&JSON.stringify(previous.body)!==JSON.stringify(post))throw Error('Этот ID использован для другого текста. Создай новый пост.');
  if(previous?.result)return NextResponse.json({result:previous.result});
  if(!previous)await saveRecord(env,id,{body:post,state:'submitted',at:new Date().toISOString()});
  const result=await farmRequest('/posts','POST',post);
  await saveRecord(env,id,{body:post,state:'accepted',result,at:new Date().toISOString()});
  return NextResponse.json({result});
 }catch(e){const message=e instanceof Error?e.message:'Ошибка FARM';return NextResponse.json({error:/BOT_STATE/.test(message)?'Конфликт сохранения. Обнови страницу.':message},{status:400});}
}
