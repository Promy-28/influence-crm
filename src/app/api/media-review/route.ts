import {environment,loadRecord} from '@/lib/promy-bot/store';
import { NextRequest, NextResponse } from "next/server";
import { db, requireSession } from "@/lib/db";
import { analyzeMedia, mediaSource, qualityDecision, MediaReviewError, MEDIA_MODEL } from "@/lib/media-review";
import { timingSafeEqual } from "node:crypto";
export const maxDuration = 60;
export const dynamic = "force-dynamic";
const configured = () => !!process.env.GEMINI_API_KEY && process.env.GEMINI_FREE_PROJECT_CONFIRMED === "true";
async function authorize(req: NextRequest) {
  const supplied = Buffer.from((req.headers.get("authorization") ?? "").replace(/^Bearer /, ""));
  const expected = Buffer.from(process.env.APP_PASSWORD ?? "");
  if (expected.length && supplied.length === expected.length && timingSafeEqual(supplied, expected)) return;
  await requireSession();
}
export async function GET(req: NextRequest) {
  await authorize(req);
  return NextResponse.json({ configured: configured(), model: MEDIA_MODEL, hourlyLimit: 20, sampleSeconds: 60, browserRequired: false, paidFallback: false });
}
export async function POST(req: NextRequest) {
  await authorize(req);
  if (!configured()) return NextResponse.json({ error: "MEDIA_FREE_PROJECT_NOT_CONFIGURED" }, { status: 409 });
  let input; try { input = await req.json(); } catch { return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 }); }
  if (typeof input.creatorId !== "string" || !/^(hub-[a-f0-9]{16}|[a-f0-9-]{36})$/.test(input.creatorId)) return NextResponse.json({ error: "INVALID_CREATOR" }, { status: 400 });
  const external = input.creatorId.startsWith("hub-");
  const { data: creator } = external ? { data: { id: input.creatorId, recent_posts: [{ url: input.source }] } } : await db.from("creators").select("id,recent_posts").eq("id", input.creatorId).maybeSingle();
  if (!creator) return NextResponse.json({ error: "CREATOR_NOT_FOUND" }, { status: 404 });
  const sources: string[] = [];
  for (const p of creator.recent_posts ?? []) for (const candidate of [p.media_url, p.url]) {
    if (typeof candidate !== "string") continue;
    try { const source = mediaSource(candidate,external?input.parentUrl:undefined); if (!sources.includes(source)) sources.push(source); } catch { /* HTML profile/post URLs are not actual media */ }
  }
  // Canonical DB media only: callers cannot send arbitrary URLs or substituted identities.
  let source = sources[0];
  if(!source&&external){const {data:pending}=await db.from('creator_media_reviews').select('source').eq('creator_id',creator.id).not('provider_file','is',null).order('started_at',{ascending:false}).limit(1).maybeSingle();if(pending?.source)source=pending.source;}
  if (!source) return NextResponse.json({ error: "MEDIA_LINK_NEEDS_VIDEO", nextStep: "Нужен доступный видеофайл или YouTube-ролик в recent_posts. Страница профиля не заменяет видео." }, { status: 409 });
  const { data: saved } = await db.from('creator_media_reviews').select('provider_file').eq('creator_id',creator.id).eq('source',source).maybeSingle();
  const { data: claim, error } = await db.rpc("claim_creator_media_review", { p_creator_id: creator.id, p_source: source });
  if (error) return NextResponse.json({ error: "MEDIA_QUEUE_NOT_READY" }, { status: 503 });
  if (!claim?.claimed) return NextResponse.json({ creatorId: creator.id, source, ...claim });
  try {
    const health=await loadRecord(environment(),'_creator_browser_agent');
    const fallbackModel=['gemini-3.1-flash-lite','gemini-2.5-flash-lite'].find(name=>health?.diagnostics?.models?.some((m:any)=>m.name==='models/'+name&&m.http===200))||null;
    const preferGenerateContent=true; // Real Mary audio/video control succeeded on this transport.
    const review = await analyzeMedia({fallbackModel,preferGenerateContent, apiKey: process.env.GEMINI_API_KEY!, freeProjectConfirmed: true, source, parentUrl:external?input.parentUrl:undefined, providerFile:saved?.provider_file });
    const result = { ...review, qualityDecision: qualityDecision(review), commercialDecision: "not_evaluated", source, model: review.modelUsed||MEDIA_MODEL, reviewedAt: new Date().toISOString() };
    await db.from("creator_media_reviews").update({ status: "completed", result, finished_at: new Date().toISOString(), error: null }).eq("creator_id", creator.id).eq("source", source);
    return NextResponse.json({ creatorId: creator.id, status: "completed", result });
  } catch (e) {
    const code = e instanceof MediaReviewError ? e.code : "MEDIA_REVIEW_FAILED";
    await db.from("creator_media_reviews").update({ status: "failed", error: code, ...(e instanceof MediaReviewError&&e.providerFile?{provider_file:e.providerFile}:{}), finished_at: new Date().toISOString() }).eq("creator_id", creator.id).eq("source", source);
    if(code==='MEDIA_FILE_PROCESSING')return NextResponse.json({status:'processing',source,deferred:true},{status:202});
    const blocked=['MEDIA_DRIVE_ACCESS_REQUIRED','MEDIA_FILE_SIZE_UNSUPPORTED','MEDIA_LINK_NEEDS_VIDEO'].includes(code);
    return NextResponse.json({ error: code, source, deferred: code === "MEDIA_QUOTA_DEFERRED" }, { status: code === "MEDIA_QUOTA_DEFERRED" ? 429 : blocked?409:502 });
  }
}
