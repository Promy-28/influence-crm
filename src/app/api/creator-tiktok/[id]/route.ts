import {requireSession} from '@/lib/db';
import {creatorTikTokPosts} from '@/lib/creator-tiktok';

export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
 await requireSession();
 const {id}=await params;
 if(!/^[a-f0-9]{16}$/.test(id))return new Response(null,{status:404});
 return Response.json(await creatorTikTokPosts(id),{headers:{'Cache-Control':'private, no-store'}});
}
