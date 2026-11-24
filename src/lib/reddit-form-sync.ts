import {db,all} from './db';
import {FORM_CSV,parseForm} from './reddit-intake';
export async function syncRedditForm(){
 const response=await fetch(FORM_CSV,{cache:'no-store',signal:AbortSignal.timeout(20000)});
 if(!response.ok||!response.headers.get('content-type')?.includes('text/csv'))throw Error('Форма недоступна. Доступ к таблице не менялся.');
 const reader=response.body!.getReader();let size=0;const chunks:Uint8Array[]=[];
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2*1024*1024){await reader.cancel();throw Error('Форма больше 2 МБ')}chunks.push(value)}
 const parsed=parseForm(Buffer.concat(chunks).toString('utf8'));
 const existing=await all<any>((from,to)=>db.from('reddit_creator_directory').select('*').range(from,to));
 const byEmail=new Map(existing.map(c=>[c.email.toLowerCase(),c]));let added=0,updated=0,conflicts=0;
 const at=new Date().toISOString();
 const sync=async(row:any)=>{const previous=byEmail.get(row.email);if(!previous){const {error}=await db.from('reddit_creator_directory').insert({...row,payload:{...row.payload,sheetSnapshot:row.payload},review_pending:true,review_requested_at:at});if(error)throw Error('Не удалось сохранить новую заявку. Повтори синхронизацию; уже сохранённые заявки не потеряны.');added++;return}
  if(previous.payload?.sourceFingerprint!==row.payload.sourceFingerprint){
   // Preserve owner decisions, outreach claims and all independent evidence.
   const {data,error}=await db.from('reddit_creator_directory').update({payload:{...previous.payload,...row.payload,sheetSnapshot:row.payload},review_pending:true,review_requested_at:at,updated_at:at}).eq('id',previous.id).eq('updated_at',previous.updated_at).select('id');if(error)throw Error('Не удалось обновить заявку. Уже сохранённые изменения не потеряны.');if(data?.length)updated++;else conflicts++;
  }
 };
 for(let i=0;i<parsed.rows.length;i+=5)await Promise.all(parsed.rows.slice(i,i+5).map(sync));
 // Pending flags form a durable queue. The existing hourly worker takes at most twenty.
 return {added,updated,conflicts,duplicates:parsed.duplicates,invalidRows:parsed.invalid,total:parsed.rows.length};
}
