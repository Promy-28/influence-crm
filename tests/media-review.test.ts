import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeMedia, mediaSource, qualityDecision, validateMediaReview, boundedVideoBytes, type MediaReview } from "../src/lib/media-review.ts";
const sample = "https://www.youtube.com/watch?v=37ZPM_5fyWc";
const result: MediaReview = { videoReviewed: true, audioReviewed: true, englishSpeech: true, intelligibility: 4, videoQuality: 4, onCamera: true, speech: [{ second: 2, quote: "This is a sample" }], frames: [{ second: 2, observation: "Ровный свет, лицо в кадре" }], summary: "Разборчивая речь, аккуратная картинка", limitations: "Оценён только образец" };
test('chunked videos without Content-Length are bounded and preserved',async()=>{
 const body=new ReadableStream<Uint8Array>({start(c){c.enqueue(new Uint8Array([1,2]));c.enqueue(new Uint8Array([3,4]));c.close()}});
 assert.deepEqual([...await boundedVideoBytes(body,4)],[1,2,3,4]);
 let cancelled=false;const tooBig=new ReadableStream<Uint8Array>({pull(c){c.enqueue(new Uint8Array(5))},cancel(){cancelled=true}});
 await assert.rejects(boundedVideoBytes(tooBig,4),/FILE_SIZE_UNSUPPORTED/);assert.equal(cancelled,true);
});
test("profile URLs and internal URLs cannot masquerade as media", () => {
  for (const url of ["http://127.0.0.1/a.mp4", "https://www.instagram.com/test", "https://www.tiktok.com/@test", "https://evil.test/a.mp4", "https://user:password@youtu.be/37ZPM_5fyWc", "https://youtube.com.evil.test/watch?v=37ZPM_5fyWc"]) assert.throws(() => mediaSource(url));
  assert.equal(mediaSource("https://youtu.be/37ZPM_5fyWc"), sample);
});
test("real portfolio MP4s are accepted while unrelated arbitrary sites remain rejected",()=>{
  assert.ok(mediaSource('https://alexadelany.my.canva.site/_assets/video/example.mp4'));
  assert.ok(mediaSource('https://marcelleugc.com/videos/intro.mp4','https://marcelleugc.com/#start'));
  assert.ok(mediaSource('https://www.alexaugc.com/_assets/video/example.mp4','www.alexaugc.com/portfolio'));
  assert.throws(()=>mediaSource('https://unrelated.test/example.mp4','https://marcelleugc.com/'));
  assert.throws(()=>mediaSource('https://alexadelany.my.canva.site/'));
});
test("captions cannot count as hearing speech", () => {
  assert.throws(() => validateMediaReview({ ...result, speech: [] }), /NO_SPEECH_EVIDENCE/);
  const silent = validateMediaReview({ ...result, audioReviewed: false, speech: [], intelligibility: null, englishSpeech: null });
  assert.equal(qualityDecision(silent), "unverified");
  assert.throws(() => validateMediaReview({ ...silent, englishSpeech: true }));
});
test("visual evidence and bounded timestamps are required", () => {
  assert.throws(() => validateMediaReview({ ...result, frames: [] }), /NO_VISUAL_EVIDENCE/);
  assert.throws(() => validateMediaReview({ ...result, speech: [{ second: 800, quote: "fake" }] }));
  assert.throws(() => validateMediaReview({ ...result, videoQuality: 9 }));
});
test("quality is separate from nationality and price", () => {
  assert.equal(qualityDecision(validateMediaReview({ ...result, country: "unrelated", quote: "330", tool: "send emails" })), "great");
  assert.equal(qualityDecision({ ...result, intelligibility: 3 }), "maybe");
  assert.equal(qualityDecision({ ...result, englishSpeech: false }), "no");
  assert.equal("tool" in validateMediaReview({ ...result, tool: "send emails" }), false);
});
test("no API request without confirmed free project and key", async () => {
  let calls = 0; const fetcher = (async () => { calls++; throw Error("must not call"); }) as typeof fetch;
  await assert.rejects(analyzeMedia({ apiKey: "test", freeProjectConfirmed: false, source: sample, fetcher }), /FREE_PROJECT_NOT_CONFIRMED/);
  await assert.rejects(analyzeMedia({ apiKey: "", freeProjectConfirmed: true, source: sample, fetcher }), /KEY_MISSING/);
  assert.equal(calls, 0);
});
test("quota failure defers, without retries or paid fallback", async () => {
  let calls = 0; const fetcher = (async () => { calls++; return new Response("quota", { status: 429 }); }) as typeof fetch;
  await assert.rejects(analyzeMedia({ apiKey: "test", freeProjectConfirmed: true, source: sample, fetcher }), /QUOTA_DEFERRED/);
  assert.equal(calls, 1);
});
test("provider receives bounded actual video, no email or profile text", async () => {
  const fetcher = (async (url, req) => {
    assert.equal(url, "https://generativelanguage.googleapis.com/v1beta/interactions");
    const b = JSON.parse(String(req?.body));
    assert.equal(b.input[0].type, "video"); assert.equal(b.input[0].processing.end_offset, "60s");
    assert.equal(b.store, false); assert.equal(b.model, "gemini-3.5-flash-lite");
    return Response.json({ output: [{ type: "text", text: JSON.stringify(result) }] });
  }) as typeof fetch;
  assert.deepEqual(await analyzeMedia({ apiKey: "test", freeProjectConfirmed: true, source: sample, fetcher }), result);
});
test("provider errors never leak response bodies or keys", async () => {
  await assert.rejects(analyzeMedia({ apiKey: "secret", freeProjectConfirmed: true, source: sample, fetcher: (async () => new Response("secret", { status: 403 })) as typeof fetch }), e => e instanceof Error && e.message === "MEDIA_PROVIDER_403");
});
test("Drive HTML is never sent to the model as video", async () => {
  let calls=0;
  const fetcher=(async()=>{calls++;return new Response('<html>sign in</html>',{headers:{'content-type':'text/html'}})}) as typeof fetch;
  await assert.rejects(analyzeMedia({apiKey:'test',freeProjectConfirmed:true,source:'https://drive.google.com/file/d/1234567890abcdef/view',fetcher}),/DRIVE_ACCESS_REQUIRED/);
  assert.equal(calls,1);
});
test("uploaded Drive video uses real file input", async () => {
  const file={name:'files/example',uri:'https://generativelanguage.googleapis.com/v1beta/files/example',mimeType:'video/mp4',uploadedAt:new Date().toISOString()};
  const fetcher=(async(url,req)=>{
    if(String(url).endsWith('/files/example'))return Response.json({state:'ACTIVE'});
    const b=JSON.parse(String(req?.body));assert.equal(b.input[0].uri,file.uri);
    return Response.json({output:[{type:'text',text:JSON.stringify(result)}]});
  }) as typeof fetch;
  assert.deepEqual(await analyzeMedia({apiKey:'test',freeProjectConfirmed:true,source:'https://drive.google.com/file/d/1234567890abcdef/view',providerFile:file,fetcher}),result);
});

test('503 switches once to the free alternate model API using the same actual video; never silently reports the old model',async()=>{
 let calls=0;const fetcher=(async(url,req)=>{calls++;if(calls===1)return new Response('busy',{status:503});assert.equal(String(url),'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent');const body=JSON.parse(String(req?.body));assert.equal(body.contents[0].parts[0].fileData.fileUri,sample);assert.equal(body.contents[0].parts[0].videoMetadata.endOffset,'60s');return Response.json({candidates:[{content:{parts:[{text:JSON.stringify(result)}]}}]});}) as typeof fetch;
 const got=await analyzeMedia({apiKey:'test',freeProjectConfirmed:true,source:sample,fallbackModel:'gemini-2.5-flash-lite',fetcher});assert.equal(got.modelUsed,'gemini-2.5-flash-lite');assert.equal(got.audioReviewed,true);assert.equal(calls,2);
});
test('failed fallback preserves deferred error and cannot invent a review or try paid providers',async()=>{
 let calls=0;await assert.rejects(analyzeMedia({apiKey:'test',freeProjectConfirmed:true,source:sample,fallbackModel:'gemini-2.5-flash-lite',fetcher:(async()=>{calls++;return new Response('busy',{status:503})}) as typeof fetch}),/MEDIA_PROVIDER_503_FALLBACK_503/);assert.equal(calls,2);
});

test('unproven or unsupported fallback models are never called',async()=>{let calls=0;await assert.rejects(analyzeMedia({apiKey:'test',freeProjectConfirmed:true,source:sample,fetcher:(async()=>{calls++;return new Response('busy',{status:503})}) as typeof fetch}),/MEDIA_PROVIDER_503/);assert.equal(calls,1);await assert.rejects(analyzeMedia({apiKey:'test',freeProjectConfirmed:true,source:sample,fallbackModel:'paid-unknown',fetcher:(async()=>{throw Error('must not run')}) as typeof fetch}),/FALLBACK_MODEL_NOT_ALLOWED/)});

test('responsive generateContent route analyzes the real video directly without Interactions or local downloads',async()=>{
 let calls=0;const fetcher=(async(url,req)=>{calls++;assert.match(String(url),/models\/gemini-3.5-flash-lite:generateContent$/);const body=JSON.parse(String(req?.body));assert.equal(body.contents[0].parts[0].fileData.fileUri,sample);return Response.json({candidates:[{content:{parts:[{text:JSON.stringify(result)}]}}]});}) as typeof fetch;
 const got=await analyzeMedia({apiKey:'test',freeProjectConfirmed:true,source:sample,preferGenerateContent:true,fetcher});assert.equal(got.audioReviewed,true);assert.equal(got.transportUsed,'generateContent');assert.equal(calls,1);
});
