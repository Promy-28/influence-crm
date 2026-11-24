import {NextResponse} from 'next/server';
import {requireSession} from '@/lib/db';
import {reviewWorkspace,queueRemainingReviews,saveBrowserReview,setBrowserAgent,mediaServiceDiagnostics,mediaSampleDiagnostic,twelveSampleDiagnostic,twelveVoiceDiagnostic} from '@/lib/creator-review-workspace';
import {syncRedditForm} from '@/lib/reddit-form-sync';
export const dynamic='force-dynamic';export const maxDuration=60;
export async function GET(){await requireSession();return NextResponse.json(await reviewWorkspace(),{headers:{'cache-control':'no-store'}})}
export async function POST(req:Request){const who=await requireSession();if(req.headers.get('origin')!==new URL(req.url).origin)return NextResponse.json({error:'Недопустимый источник'},{status:403});
 try{const b=await req.json();let result;if(b.op==='twelveVoice')result=await twelveVoiceDiagnostic();else if(b.op==='twelveControl')result=await twelveSampleDiagnostic();else if(b.op==='mediaControl')result=await mediaSampleDiagnostic(b.model);else if(b.op==='mediaDiagnostics')result=await mediaServiceDiagnostics();else if(b.op==='agent'||b.op==='agentReport')result=await setBrowserAgent(b);else if(b.op==='sync')result=await syncRedditForm();else if(b.op==='queue')result=await queueRemainingReviews();else if(b.op==='browser')result=await saveBrowserReview(b,who);else throw Error('Неизвестное действие');return NextResponse.json({result,...await reviewWorkspace()});}
 catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Не удалось выполнить действие. Очередь сохранена.'},{status:409})}}
