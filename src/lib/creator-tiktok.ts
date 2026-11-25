import 'server-only';
import {db} from './db';
import {portfolioLinks,tiktokEmbedPosts,tiktokProfileEmbed,tiktokStreamKey} from './creator-cloud-policy';
import {tiktokPlayer} from './post-preview';

export const coverBucket='creator-tiktok-covers';
const imageLimit=256*1024;

async function saveCover(id:string,cover:string|null){
 const path=id+'.jpg';
 try {
  const existing=await db.storage.from(coverBucket).exists(path).catch(()=>null);
  if(existing?.data)return '/api/creator-tiktok/cover/'+id;
  if(!cover)return;
  const url=new URL(cover);
  if(url.protocol!=='https:'||url.username||url.password||url.port||!/[.]tiktokcdn(?:-us|-eu)?[.]com$/.test(url.hostname))return;
  const response=await fetch(url,{redirect:'error',headers:{'user-agent':'Mozilla/5.0','accept':'image/jpeg,image/webp,image/png'},signal:AbortSignal.timeout(4000)});
  if(!response.ok||!response.body||!/^image\/(jpeg|webp|png)(?:;|$)/i.test(response.headers.get('content-type')||''))return;
  const reader=response.body.getReader(),chunks:Uint8Array[]=[];
  let length=0;
  try{
   for(;;){
    const {done,value}=await reader.read();
    if(done)break;
    length+=value.length;
    if(length>imageLimit)return;
    chunks.push(value);
   }
  }finally{await reader.cancel()}
  if(!length)return;
  const contentType=response.headers.get('content-type')!.split(';')[0].toLowerCase();
  const {error}=await db.storage.from(coverBucket).upload(path,Buffer.concat(chunks),{contentType,upsert:false});
  if(!error)return '/api/creator-tiktok/cover/'+id;
  console.warn('creator_tiktok_cover_upload_failed');
 }catch{console.warn('creator_tiktok_cover_unavailable')}
}

export async function creatorTikTokPosts(creatorId:string){
 const {data}=await db.from('reddit_creator_directory').select('payload').eq('id',creatorId).maybeSingle();
 if(!data)return [];
 const p=data.payload,review=p.autonomousReview;
 const fingerprint=typeof p.sourceFingerprint==='string'?p.sourceFingerprint:JSON.stringify([p.videos,p.profile]);
 const assessed=review?.fingerprint===p.sourceFingerprint&&review?.assessment?.videoReviewed===true&&review?.assessment?.audioReviewed===true;
 const verifiedSource=assessed?tiktokStreamKey(review.source):null;
 const links=portfolioLinks([p.videos,p.profile].join(' '));
 const found=new Map<string,{url:string;cover:string|null;streamKey?:string|null;verified:boolean}>();
 const {data:cached}=await db.from('creator_tiktok_posts').select('posts').eq('creator_id',creatorId).eq('fingerprint',fingerprint).maybeSingle();
 for(const post of Array.isArray(cached?.posts)?cached.posts:[]){
  const key=tiktokPlayer(post.url);
  if(key)found.set(key,{...post,cover:null,verified:!!verifiedSource&&verifiedSource===post.streamKey});
 }
 for(const link of links){
  const key=tiktokPlayer(link);
  if(key&&!found.has(key))found.set(key,{url:link,cover:null,verified:assessed&&tiktokPlayer(review.postUrl)===key});
 }
 if(assessed&&tiktokPlayer(review.postUrl))found.set(tiktokPlayer(review.postUrl)!,{url:review.postUrl,cover:review.postCover||null,verified:true});
 for(const embed of [...new Set(links.map(tiktokProfileEmbed).filter(Boolean))].slice(0,2)){
  try{
   const response=await fetch(embed!,{headers:{'user-agent':'Mozilla/5.0'},redirect:'error',signal:AbortSignal.timeout(5000)});
   if(!response.ok)continue;
   const html=await response.text();
   if(html.length>2000000)continue;
   for(const post of tiktokEmbedPosts(html,embed!)){
    const key=tiktokPlayer(post.url);
    if(!key)continue;
    const streamKey=tiktokStreamKey(post.source);
    found.set(key,{url:post.url,cover:post.cover,streamKey,verified:!!found.get(key)?.verified||!!verifiedSource&&verifiedSource===streamKey});
   }
  }catch{ /* Explicit post links remain available. */ }
 }
 const shown=[...found.values()].sort((a,b)=>Number(b.verified)-Number(a.verified)).slice(0,4);
 if(shown.length){
  const posts=shown.map(({url,streamKey})=>({url,streamKey}));
  const unchanged=posts.length===cached?.posts?.length&&posts.every((post,i)=>post.url===cached.posts[i]?.url&&post.streamKey===cached.posts[i]?.streamKey);
  if(!unchanged){
   await db.from('creator_tiktok_posts').upsert({creator_id:creatorId,fingerprint,posts}).catch(()=>console.warn('creator_tiktok_posts_cache_failed'));
  }
 }
 return Promise.all(shown.map(async post=>{
  const id=new URL(post.url).pathname.match(/\/video\/(\d+)/)?.[1]!;
  return {url:post.url,verified:post.verified,cover:id?await saveCover(id,post.cover):undefined};
 }));
}
