import 'server-only';
import {db} from './db';
export async function localOutreachProtection(email:string){
 const {data:contacts,error}=await db.from('creators').select('id,do_not_contact,unsubscribed_at,bounced_at,first_sent_at,replied_at,registered_at,profile_done_at,inst_reply_uuid,inst_lead_id,queued_at').ilike('email',email);
 if(error)throw Error('Не удалось проверить защиту контакта');
 if(contacts?.some((c:any)=>c.do_not_contact||c.unsubscribed_at||c.bounced_at||c.first_sent_at||c.replied_at||c.registered_at||c.profile_done_at||c.inst_reply_uuid||c.inst_lead_id||c.queued_at))return 'есть запрет контакта, предыдущая рассылка или начатое сотрудничество';
 if(contacts?.length){const {data:messages,error}=await db.from('messages').select('id').in('creator_id',contacts.map((c:any)=>c.id)).limit(1);if(error)throw Error('Не удалось проверить локальную переписку');if(messages?.length)return 'есть локальная история переписки';}
 const {data:directory,error:directoryError}=await db.from('reddit_creator_directory').select('outreach_state').ilike('email',email);if(directoryError)throw Error('Не удалось проверить историю Reddit');
 if(directory?.some((c:any)=>c.outreach_state?.status&&c.outreach_state.status!=='permission_required'))return 'контакт уже передавался в рассылку или результат добавления требует проверки';
 return null;
}
