export type MailSource='reddit'|'apify';
export function mailSource(value:unknown):MailSource{if(value==null||value===''||value==='reddit')return 'reddit';if(value==='apify'||value==='found')return 'apify';throw Error('Неизвестный источник писем')}
export const sourceOf=(record:any):MailSource=>record?.mailSource==='apify'?'apify':'reddit';
export function sourceMatches(record:any,source:MailSource){return sourceOf(record)===source}
export function assertApifyIncoming(email:any,creator:any){
 if(creator?.source!=='apify'||!creator.inst_campaign_id||['2d02d560-a584-4844-948c-3ed035b9e9e8','9296d2af-c971-40c5-9572-440860bc2a65'].includes(creator.inst_campaign_id)||email?.campaign_id!==creator.inst_campaign_id||String(email.from_address_email||'').toLowerCase()!==String(creator.email||'').toLowerCase()||Number(email.ue_type)!==2||!email.thread_id||!email.eaccount||creator.eaccount&&email.eaccount!==creator.eaccount||creator.do_not_contact||creator.unsubscribed_at||creator.bounced_at)throw Error('APIFY_THREAD_NOT_ALLOWED');
}
