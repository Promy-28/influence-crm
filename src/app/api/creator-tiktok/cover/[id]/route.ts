import {db,requireSession} from '@/lib/db';
import {coverBucket} from '@/lib/creator-tiktok';

export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
 await requireSession();
 const {id}=await params;
 if(!/^(?:\d{10,25}|ig-[\w-]{5,32})$/.test(id))return new Response(null,{status:404});
 try{
  const {data}=await db.storage.from(coverBucket).download(id+'.jpg');
  if(data)return new Response(data,{headers:{'Content-Type':data.type,'Cache-Control':'private, max-age=86400','X-Content-Type-Options':'nosniff'}});
 }catch{ /* A missing preview is handled by the player card. */ }
 return new Response(null,{status:404});
}
