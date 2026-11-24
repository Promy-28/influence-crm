import {boundedVideoBytes,mediaSource,MEDIA_RUBRIC,validateMediaReview,type MediaReview} from './media-review.ts';
export type JockeyState={source:string;assetId?:string;itemId?:string;uploadStarted?:boolean;itemStarted?:boolean;responseStarted?:boolean;result?:MediaReview};
export function parseJockeyReview(d:any,itemId:string):MediaReview{
 if(d.status!=='completed')throw Error('MEDIA_JOCKEY_INCOMPLETE');
 const parts=(d.output||[]).filter((o:any)=>o.type==='message').flatMap((o:any)=>o.content||[]).filter((p:any)=>p.type==='output_text');
 const refs=parts.flatMap((p:any)=>p.annotations||[]).filter((a:any)=>a.type==='video_citation');
 if(refs.some((a:any)=>a.item_id!==itemId))throw Error('MEDIA_JOCKEY_SOURCE_MISMATCH');
 const raw=parts.map((p:any)=>p.text||'').join('\n').trim();if(raw.length>16000)throw Error('MEDIA_RESULT_INVALID');
 let parsed;try{parsed=JSON.parse(raw.replace(/^```json\s*/i,'').replace(/\s*```$/,''))}catch{throw Error('MEDIA_RESULT_INVALID')}
 return {...validateMediaReview(parsed),modelUsed:'twelvelabs-jockey',transportUsed:'jockey-original-audio',evidenceReport:raw};
}
export async function runJockeyReview(opts:{apiKey:string;freePlanConfirmed:boolean;source:string;parentUrl?:string;storeId:string;state:JockeyState;save:(s:JockeyState)=>Promise<void>;fetcher?:typeof fetch;sleep?:(ms:number)=>Promise<void>}):Promise<MediaReview>{
 if(!opts.apiKey||!opts.freePlanConfirmed)throw Error('MEDIA_JOCKEY_FREE_PLAN_NOT_CONFIGURED');
 const source=mediaSource(opts.source,opts.parentUrl),s=opts.state;
 const host=new URL(source).hostname;
 if(!(host.endsWith('.my.canva.site')||host==='media-public.canva.com'||host.endsWith('.pages.dev')||host==='firebasestorage.googleapis.com'||host.endsWith('.tiktokcdn.com')||host.endsWith('.cdninstagram.com')||host.endsWith('.fbcdn.net')))throw Error('MEDIA_JOCKEY_DIRECT_SOURCE_REQUIRED');
 if(s.source!==source)throw Error('MEDIA_JOCKEY_SOURCE_MISMATCH');
 if(s.result)return s.result;
 if(!/^ks_[\w-]+$/.test(opts.storeId))throw Error('MEDIA_JOCKEY_STORE_INVALID');
 for(const id of [s.assetId,s.itemId])if(id&&!/^[\w-]{1,128}$/.test(id))throw Error('MEDIA_JOCKEY_ID_INVALID');
 const fetcher=opts.fetcher||fetch,wait=opts.sleep||((ms:number)=>new Promise<void>(r=>setTimeout(r,ms))),started=Date.now();
 const call=async(path:string,body?:unknown,timeout=20000)=>{
  if(Date.now()-started>255000)throw Error('MEDIA_JOCKEY_TIME_LIMIT');
  const r=await fetcher('https://api.twelvelabs.io/v1.3/'+path,{method:body?'POST':'GET',headers:{'x-api-key':opts.apiKey,...(body instanceof FormData?{}:{'content-type':'application/json'})},...(body?{body:body instanceof FormData?body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(timeout),cache:'no-store'});
  const d=await r.json().catch(()=>({}));if(!r.ok)throw Error('MEDIA_JOCKEY_'+r.status+'_'+String(d.code||d.error?.code||'FAILED').replace(/[^A-Za-z0-9_]/g,'').slice(0,80));return d;
 };
 const ready=async(path:string)=>{for(let i=0;i<12;i++){const d=await call(path);if(d.status==='ready')return;if(d.status==='failed')throw Error('MEDIA_JOCKEY_ASSET_FAILED');await wait(5000)}throw Error('MEDIA_JOCKEY_PROCESSING')};
 if(!s.assetId){
  if(s.uploadStarted)throw Error('MEDIA_JOCKEY_UPLOAD_UNCERTAIN');
  if(!/\.(mp4|webm|mov)(?:\?|$)/i.test(source))throw Error('MEDIA_JOCKEY_DIRECT_SAMPLE_REQUIRED');
  const media=await fetcher(source,{redirect:'error',signal:AbortSignal.timeout(15000)});const mime=media.headers.get('content-type')?.split(';')[0]||'';if(!media.ok||!mime.startsWith('video/'))throw Error('MEDIA_JOCKEY_SOURCE_UNAVAILABLE');
  const bytes=await boundedVideoBytes(media.body);s.uploadStarted=true;await opts.save(s);
  const form=new FormData();form.append('method','direct');form.append('file',new Blob([bytes],{type:mime}),'creator-sample.'+(mime.includes('webm')?'webm':mime.includes('mov')?'mov':'mp4'));
  const d=await call('assets',form);s.assetId=String(d._id||'');if(!s.assetId)throw Error('MEDIA_JOCKEY_ASSET_INVALID');await opts.save(s);
 }
 await ready('assets/'+s.assetId);
 if(!s.itemId){if(s.itemStarted)throw Error('MEDIA_JOCKEY_ITEM_UNCERTAIN');s.itemStarted=true;await opts.save(s);const d=await call('knowledge-stores/'+opts.storeId+'/items',{asset_id:s.assetId});s.itemId=String(d._id||'');if(!s.itemId)throw Error('MEDIA_JOCKEY_ITEM_INVALID');await opts.save(s)}
 await ready('knowledge-stores/'+opts.storeId+'/items/'+s.itemId);
 if(s.responseStarted)throw Error('MEDIA_JOCKEY_RESPONSE_UNCERTAIN');
 s.responseStarted=true;await opts.save(s);
 const d=await call('responses',{knowledge_store_id:opts.storeId,selections:[{kind:'item',id:s.itemId}],input:[{type:'message',role:'user',content:'Evaluate ONLY {{sel:0}}. Never use another creator or other store items. Access original audio, not just transcription: if waveform is unavailable set audioReviewed=false. In summary describe actual pace, articulation, energy and noise, with limitations. Return one JSON object and nothing outside JSON; citation markers may occur only inside summary. '+MEDIA_RUBRIC}],stream:false,tools:[]},120000);
 s.result=parseJockeyReview(d,s.itemId);await opts.save(s);return s.result;
}
