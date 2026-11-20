import {validatePost,type FarmAccount} from './farm-contract.ts';
export const MAX_FARM_PLAN=30;
export type PlanPost=ReturnType<typeof validatePost>;
export type FarmPlan={id:string;name:string;createdAt:string;leaseUntil:number;items:{post:PlanPost;state:'draft'|'sending'|'accepted'|'error'|'uncertain';error?:string;result?:unknown}[]};
export function createFarmPlan(id:unknown,name:unknown,rows:unknown,accounts:FarmAccount[],now=Date.now()):FarmPlan{
 if(typeof id!=='string'||!/^hub-[a-f0-9-]{36}$/i.test(id))throw Error('Некорректный ID плана');
 if(typeof name!=='string'||!name.trim()||name.length>120)throw Error('Укажи название плана (до 120 символов)');
 if(!Array.isArray(rows)||!rows.length||rows.length>MAX_FARM_PLAN)throw Error('В плане должно быть от 1 до 30 постов');
 const seen=new Set<string>();
 const items=rows.map((row,index)=>{const post=validatePost({...row,external_id:id+':'+index},accounts,now);const key=[post.account_id,post.subreddit.toLowerCase(),post.scheduled_at||'now'].join(':');if(seen.has(key))throw Error('Повтор аккаунта, сабреддита и времени в плане');seen.add(key);return {post,state:'draft' as const};});
 return {id,name:name.trim(),createdAt:new Date(now).toISOString(),leaseUntil:0,items};
}
export function planCounts(plan:FarmPlan){return {total:plan.items.length,accepted:plan.items.filter(i=>i.state==='accepted').length,remaining:plan.items.filter(i=>i.state!=='accepted').length,errors:plan.items.filter(i=>i.state==='error'||i.state==='uncertain').length};}
export async function runFarmPlan(plan:FarmPlan,deps:{save:(p:FarmPlan)=>Promise<void>;accounts:()=>Promise<FarmAccount[]>;submit:(p:PlanPost)=>Promise<unknown>;find?:(id:string)=>Promise<unknown|null>;now?:()=>number}){
 const now=deps.now||Date.now;if(plan.leaseUntil>now())throw Error('План уже обрабатывается. Обнови статус через несколько минут.');
 plan.leaseUntil=now()+180000;await deps.save(plan); // CAS claim before contacting FARM.
 try{
  const accounts=await deps.accounts();let n=0;
  for(const item of plan.items){
   if(item.state==='accepted')continue;if(n++>=6)break;
   let attempted=false;
   try{
    if(item.state==='sending'||item.state==='uncertain'){
     if(!deps.find)throw Error('Нужна сверка результата с FARM');
     const found=await deps.find(item.post.external_id);if(found){item.result=found;item.state='accepted';delete item.error;await deps.save(plan);continue;}
    }
    validatePost(item.post,accounts,now());item.state='sending';delete item.error;await deps.save(plan);attempted=true;item.result=await deps.submit(item.post);item.state='accepted';await deps.save(plan);
   }catch(e){item.state=attempted||item.state==='sending'||item.state==='uncertain'?'uncertain':'error';item.error=e instanceof Error?e.message:'Не удалось передать пост';await deps.save(plan);break;}
  }
 }finally{plan.leaseUntil=0;await deps.save(plan);}
 return plan;
}
