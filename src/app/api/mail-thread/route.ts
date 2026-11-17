import {NextResponse} from 'next/server';
import {requireSession} from '@/lib/db';
import {redditThread} from '@/lib/reddit-thread';
export const dynamic='force-dynamic';export const maxDuration=60;
export async function GET(req:Request){await requireSession();const id=new URL(req.url).searchParams.get('thread');if(!id||id.length>200)return NextResponse.json({error:'Неверная переписка'},{status:400});try{const value=await redditThread(id);return NextResponse.json(value||{error:'Переписка не найдена в этой базе'},{status:value?200:404,headers:{'cache-control':'no-store'}})}catch{return NextResponse.json({error:'Не удалось открыть переписку. Повтори выбор.'},{status:503})}}
