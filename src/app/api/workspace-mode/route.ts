import {NextResponse} from 'next/server';
import {requireSession} from '@/lib/db';
import {MODE_COOKIE,normalizedMode,modeDestination} from '@/lib/workspace-mode-core';
export async function POST(req:Request){
 await requireSession();if(req.headers.get('origin')!==new URL(req.url).origin)return NextResponse.json({error:'Недопустимый источник'},{status:403});
 const f=await req.formData(),mode=normalizedMode(f.get('mode'));if(!mode)return NextResponse.json({error:'Выбери Apify или Reddit'},{status:400});
 const response=NextResponse.redirect(new URL(modeDestination(String(f.get('path')||'/'),mode),req.url),303);
 response.cookies.set(MODE_COOKIE,mode,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:365*86400});return response;
}
