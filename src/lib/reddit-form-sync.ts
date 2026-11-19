import {db,all} from './db';
import {FORM_CSV,parseForm} from './reddit-intake';
export async function syncRedditForm(){
 const response=await fetch(FORM_CSV,{cache:'no-store',signal:AbortSignal.timeout(20000)});
 if(!response.ok||!response.headers.get('content-type')?.includes('text/csv'))throw Error('Форма недоступна. Доступ к таблице не менялся.');
 const reader=response.body!.getReader();let size=0;const chunks:Uint8Array[]=[];
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2*1024*1024){await reader.cancel();throw Error('Форма больше 2 МБ')}chunks.push(value)}
 const parsed=parseForm(Buffer.concat(chunks).toString('utf8'));
 const existing=await all<any>((from,to)=>db.from('reddit_creator_directory').select('*').range(from,to));
 const byEmail=new Map(existing.map(c=>[c.email.toLowerCase(),c]));let added=0,updated=0;
 const at=new Date().toISOString();
 for(const row of parsed.rows){const previous=byEmail.get(row.email);if(!previous){await db.from('reddit_creator_directory').insert({...row,payload:{...row.payload,sheetSnapshot:row.payload},review_pending:true,review_requested_at:at});added++;continue}
  if(previous.payload?.sourceFingerprint!==row.payload.sourceFingerprint){
   // Preserve owner decisions, outreach claims and all independent evidence.
   await db.from('reddit_creator_directory').update({payload:{...previous.payload,...row.payload,sheetSnapshot:row.payload},review_pending:true,review_requested_at:at}).eq('id',previous.id);updated++;
  }
 }
 // Pending flags form a durable queue. The existing hourly worker takes at most twenty.
 return {added,updated,duplicates:parsed.duplicates,invalidRows:parsed.invalid,total:parsed.rows.length};
}
