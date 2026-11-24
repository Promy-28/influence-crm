import 'server-only';
import {getSetting} from './settings';
import {inst} from './instantly';
import {db} from './db';
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
