import 'server-only';
import {getSetting} from './settings';
import {inst} from './instantly';
import {db,log} from './db';
import {validApproval} from './hub-outreach';
import {assertNewOutreach} from './outreach-protection';
import {localOutreachProtection} from './outreach-protection-server';
import {reviewFingerprint,validFormEmail} from './reddit-intake';
import {submitCreatorImport,importMessage} from './creator-import';
import {creatorCampaignMembership,type ImportProvider} from './creator-import';

// The Replies integration intentionally lacks leads:create. Use the CRM's existing key.
export async function creatorImportProvider():Promise<ImportProvider>{
 const key=await getSetting('instantly_key');
 if(typeof key!=='string'||!key.trim())throw Error('CRM_IMPORT_KEY_MISSING');
 return (path:string,body?:unknown)=>inst<any>('/api/v2'+path,body?{method:'POST',body:JSON.stringify(body)}:{},key);
}
export async function reconcileCreatorImports(limit=20){
 const provider=await creatorImportProvider();
 const {data,error}=await db.from('reddit_creator_directory').select('id,email,outreach_state').in('outreach_state->>status',['importing','accepted','uncertain']).order('updated_at').limit(limit);
 if(error)throw Error('IMPORT_STATE_READ_FAILED');
 const results:{id:string;status:string}[]=[];
 for(const c of data||[]){
  try{const found=await creatorCampaignMembership(c.email,c.outreach_state.campaign,provider);
   if(!found){results.push({id:c.id,status:'awaiting_readback'});continue}
   const state={...c.outreach_state,status:'imported',leadId:found.id,verifiedAt:new Date().toISOString()};
   const {error:e}=await db.from('reddit_creator_directory').update({outreach_state:state}).eq('id',c.id).eq('outreach_state->>status',c.outreach_state.status);
   results.push({id:c.id,status:e?'state_write_failed':'imported'});
  }catch{results.push({id:c.id,status:'readback_unavailable'})}
 }
 return results;
}

export async function addApprovedCreator(id:string,campaign:string,at:string,token:string,who:string,fingerprint=''){
 const {data:c}=await db.from('reddit_creator_directory').select('*').eq('id',id).single();if(!c||!validApproval(id,c.email,campaign,at,token,fingerprint)||!!fingerprint&&reviewFingerprint(c)!==fingerprint)return ('Подтверждение устарело. Выбери кампанию заново.');
 if(!validFormEmail(c.email))return 'Исправь email перед добавлением. Адрес не исправляется автоматически.';
 const {data:protectedContacts,error:protectionError}=await db.from('creators').select('do_not_contact,unsubscribed_at,bounced_at').ilike('email',c.email);
 if(protectionError)throw Error('Не удалось проверить запреты контакта');
 if(protectedContacts?.some((contact:any)=>contact.do_not_contact||contact.unsubscribed_at||contact.bounced_at))return ('Контакт защищён от рассылки: исторический импорт, отписка или недоставка. Ограничение сохранено.');
 if(c.outreach_state?.status&&!['permission_required','rejected'].includes(c.outreach_state.status))return ('По этому контакту уже был запрос добавления. Хаб сверяет результат без повторной загрузки.');
 const provider=await creatorImportProvider();
 try{await assertNewOutreach(c.email,provider,()=>localOutreachProtection(c.email));}catch(e){return e instanceof Error?e.message:'Проверка истории не завершена. Ничего не добавлено.';}
 const current=await provider('/campaigns/'+encodeURIComponent(campaign));if(current.id!==campaign)throw Error('Неверная кампания');
 // Atomic claim: two clicks cannot produce two imports, including after an uncertain response.
 let claim=db.from('reddit_creator_directory').update({outreach_state:{status:'importing',campaign,at:new Date().toISOString()}}).eq('id',id).eq('updated_at',c.updated_at);
 claim=c.outreach_state?.status?claim.eq('outreach_state->>status',c.outreach_state.status):claim.is('outreach_state',null);
 const {data:claimed}=await claim.select('id');
 if(!claimed?.length)return ('Добавление уже выполнялось. Автоповтор отключён.');
 const result=await submitCreatorImport(c.email,c.payload.name||c.payload.reddit||'',campaign,provider);
 const {error:saveError}=await db.from('reddit_creator_directory').update({outreach_state:{...result,campaign,at:new Date().toISOString()}}).eq('id',id).eq('outreach_state->>status','importing');
 const msg=saveError?'Запрос выполнен; сохранение результата требует автоматической сверки. Повторная загрузка отключена.':importMessage(result);
 await log('reddit_campaign_request',msg,null,{email:c.email,campaign},who);return msg;
}

