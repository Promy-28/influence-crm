import {NextResponse,after} from 'next/server';
import {cloudTickAuthorized,runCloudQueue} from '@/lib/creator-cloud-server';
export const dynamic='force-dynamic';export const maxDuration=300;
export async function POST(req:Request){
 if(!cloudTickAuthorized(new URL(req.url).searchParams.get('token')||''))return NextResponse.json({error:'Unauthorized'},{status:401});
 after(async()=>{try{await runCloudQueue()}catch{console.error('creator_cloud_tick_failed')}});
 return NextResponse.json({accepted:true});
}
