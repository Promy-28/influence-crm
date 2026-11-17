import 'server-only';
import {db,all} from './db';
import {inst} from './instantly';
import {getSettings} from './settings';
import {environment,loadRecord,saveRecord,decodeRecord} from './promy-bot/store';
import {withCampaignBanner,BANNER_IMAGE,BANNER_TARGET} from './email-branding';
import {renderReplyMacro} from './promy-bot/reply-macro';
import {CREATOR_POLICY_VERSION,creatorPolicyIssue} from './creator-policy';
const APIFY_IDS=new Set(['3b508e1a-8f11-4ef1-813e-0d46229b8c72','f35b75e5-cfc7-4866-a912-5eba3d34684b']);
export async function syncBranding(){
 const env=environment(),settings=await getSettings(),key=settings.instantly_key||(await loadRecord(env,'instantly'))?.key;if(!key)throw Error('INSTANTLY_NOT_CONNECTED');
 const {data:arms}=await db.from('arms').select('inst_campaign_id').not('inst_campaign_id','is',null);const ids=[...new Set<string>((arms||[]).map((a:any)=>String(a.inst_campaign_id)).filter((id:string)=>APIFY_IDS.has(id)))];const campaigns:{id:string;variants:number;verified:boolean}[]=[];
 for(const id of ids){const old=await inst<any>('/api/v2/campaigns/'+id,{},key);if(old.id!==id||!Array.isArray(old.sequences)||!old.sequences.length)throw Error('CAMPAIGN_READ_FAILED');if(!await loadRecord(env,'branding_backup:'+id))await saveRecord(env,'branding_backup:'+id,{sequences:old.sequences,text_only:old.text_only,at:new Date().toISOString()});let variants=0;const sequences=old.sequences.map((sequence:any)=>({...sequence,steps:sequence.steps.map((step:any)=>({...step,variants:step.variants.map((variant:any)=>{variants++;return {...variant,body:withCampaignBanner(String(variant.body||''))}})}))}));
 await inst('/api/v2/campaigns/'+id,{method:'PATCH',body:JSON.stringify({sequences,text_only:false})},key);
 const checked=await inst<any>('/api/v2/campaigns/'+id,{},key),actual=checked.sequences.flatMap((s:any)=>s.steps.flatMap((step:any)=>step.variants));if(actual.length!==variants||checked.text_only===true||!actual.every((v:any)=>v.body.includes(BANNER_IMAGE)&&v.body.includes('utm_campaign=creator_outreach')&&v.body.includes('utm_content=dom1')))throw Error('CAMPAIGN_BANNER_VERIFY_FAILED');campaigns.push({id,variants,verified:true});
 }
 let drafts=0,flagged=0;const records=await all<any>((f,t)=>db.from('promy_bot_records').select('id,value').like('id','draft:%').order('id').range(f,t));
 for(const row of records){const d=decodeRecord(row.value);if(d.status!=='draft'||d.macroName!=='Reply'||!d.replyContent||!d.macroFirstName||!d.signatureHtml)continue;const updated=renderReplyMacro({body:d.replyContent,firstName:d.macroFirstName,signature:d.signatureHtml});if(updated.html!==d.html){const fresh=await loadRecord(env,row.id);if(fresh?.status!=='draft'||fresh.html!==d.html)continue;Object.assign(fresh,updated,{bannerUpdatedAt:new Date().toISOString()});const issue=creatorPolicyIssue(fresh.replyContent);if(issue){fresh.status='stale';fresh.policyIssue=issue;flagged++}await saveRecord(env,row.id,fresh);drafts++}}
 await saveRecord(env,'creator_policy',{version:CREATOR_POLICY_VERSION,at:new Date().toISOString()});return {campaigns,drafts,flagged,bannerTarget:BANNER_TARGET,sent:0};
}
