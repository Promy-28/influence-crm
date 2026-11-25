import {requireSession} from '@/lib/db';
import {apifyPostCovers} from '@/lib/creator-tiktok';

export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
 await requireSession();
 const {id}=await params;
 if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id))return new Response(null,{status:404});
 return Response.json(await apifyPostCovers(id),{headers:{'Cache-Control':'private, no-store'}});
}
