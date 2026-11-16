import {NextResponse} from 'next/server';
import {webhookAuthorized} from '@/lib/promy-bot/store';
import {receiveUpdate} from '@/lib/promy-bot/realtime';
export const runtime='nodejs';
export const maxDuration=60;
export const dynamic='force-dynamic';
export async function POST(req:Request){
 if(!webhookAuthorized(req))return NextResponse.json({error:'Unauthorized'},{status:401});
 let update;try{update=await req.json()}catch{return NextResponse.json({error:'Invalid JSON'},{status:400})}
 if(JSON.stringify(update).length>50000)return NextResponse.json({error:'Too large'},{status:413});
 try{return NextResponse.json(await receiveUpdate(update))}catch{return NextResponse.json({error:'Temporarily unavailable'},{status:503})}
}
