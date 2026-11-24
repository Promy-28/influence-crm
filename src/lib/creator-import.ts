export type ImportProvider=(path:string,body?:unknown)=>Promise<any>;
export type ImportResult={status:'imported'|'accepted'|'rejected'|'uncertain';code?:string;leadId?:string};

// Read-only reconciliation never re-submits an ambiguous external write.
export async function creatorCampaignMembership(email:string,campaign:string,provider:ImportProvider){
 let cursor='';
 for(let page=0;page<5;page++){
  const result=await provider('/leads/list',{campaign,contacts:[email],limit:100,...(cursor?{starting_after:cursor}:{})});
  if(!Array.isArray(result?.items))throw Error('IMPORT_READBACK_INCOMPLETE');
  const found=result.items.find((l:any)=>String(l.email||'').trim().toLowerCase()===email.trim().toLowerCase()&&l.campaign===campaign);
  if(found)return {id:String(found.id||''),campaign};
  if(!result.next_starting_after)return null;
  if(result.next_starting_after===cursor)throw Error('IMPORT_READBACK_INCOMPLETE');
  cursor=result.next_starting_after;
 }
 throw Error('IMPORT_READBACK_INCOMPLETE');
}
export function importErrorCode(error:unknown){
 const message=error instanceof Error?error.message:'';
 const match=message.match(/(?:INSTANTLY_|Instantly\s+)(\d{3})/);
 return match?'INSTANTLY_'+match[1]:'IMPORT_RESPONSE_UNKNOWN';
}
export async function submitCreatorImport(email:string,firstName:string,campaign:string,provider:ImportProvider):Promise<ImportResult>{
 let failure:string|undefined;
 try{await provider('/leads/add',{campaign_id:campaign,skip_if_in_workspace:true,skip_if_in_campaign:true,verify_leads_on_import:false,leads:[{email,first_name:firstName,custom_variables:{reddit_username:firstName}}]})}
 catch(error){failure=importErrorCode(error)}
 // Even a timeout/empty response may have created a contact. Always reconcile first.
 try{const found=await creatorCampaignMembership(email,campaign,provider);if(found)return {status:'imported',leadId:found.id}}
 catch{return {status:'uncertain',code:failure||'IMPORT_READBACK_UNAVAILABLE'}}
 if(failure){
  const status=Number(failure.slice(-3));
  if([400,401,403,404,405,413,422,429].includes(status))return {status:'rejected',code:failure};
  return {status:'uncertain',code:failure};
 }
 return {status:'accepted'};
}
export function importMessage(result:ImportResult){
 if(result.status==='imported')return 'Добавление подтверждено: контакт найден в выбранной кампании Instantly.';
 if(result.status==='accepted')return 'Instantly принял запрос. Контакт ещё не появился в кампании; хаб сверит результат автоматически, без повторного добавления.';
 if(result.status==='rejected')return result.code==='INSTANTLY_403'?'Instantly отклонил запрос: у CRM-ключа нет права leads:create. Добавления не было.':'Instantly отклонил запрос ('+result.code+'). Добавления не было.';
 return 'Результат пока не подтверждён ('+result.code+'). Хаб проверит кампанию автоматически; повторная загрузка отключена.';
}
