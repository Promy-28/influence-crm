import 'server-only';
import {db} from './db';
import {portfolioLinks,tiktokEmbedPosts,tiktokProfileEmbed,tiktokStreamKey} from './creator-cloud-policy';
import {expiredPostAsset,postCoverKey,publicHttps,tiktokPlayer,tiktokPostCover} from './post-preview';

export const coverBucket='creator-tiktok-covers';
const imageLimit=256*1024;

async function saveCover(id:string,cover:string|null){
 const path=id+'.jpg';
 try {
  const existing=await db.storage.from(coverBucket).exists(path).catch(()=>null);
  if(existing?.data)return '/api/creator-tiktok/cover/'+id;
  if(!cover)return;
  const url=new URL(cover);
  const allowed=id.startsWith('ig-')?/[.](?:cdninstagram[.]com|fbcdn[.]net)$/:/[.]tiktokcdn(?:-us|-eu)?[.]com$/;
  if(url.protocol!=='https:'||url.username||url.password||url.port||!allowed.test(url.hostname))return;
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

async function publicPostCover(postUrl:string,key:string){
 const url=new URL(postUrl);
 url.hostname=key.startsWith('ig-')?'www.instagram.com':'www.tiktok.com';
 url.search='';
 url.hash='';
 const response=await fetch(url,{headers:{'user-agent':'Mozilla/5.0'},redirect:'error',signal:AbortSignal.timeout(4500)});
 if(!response.ok)return null;
 const html=await response.text();
 if(html.length>2000000)return null;
 if(!key.startsWith('ig-'))return tiktokPostCover(html,postUrl);
 for(const match of html.matchAll(/<meta\s[^>]*>/gi)){
  const attrs=new Map([...match[0].matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/g)].map(m=>[m[1].toLowerCase(),m[3]]));
  if(attrs.get('property')?.toLowerCase()==='og:image'){
   return publicHttps(attrs.get('content')?.replace(/&amp;/g,'&'));
  }
 }
 return null;
}

export async function apifyPostCovers(creatorId:string){
 const {data}=await db.from('creators').select('recent_posts,handle,platform').eq('id',creatorId).eq('source','apify').maybeSingle();
 return storeApifyPostCovers(data?.handle, data?.recent_posts);
}

export async function storeApifyPostCovers(handle: string | null, recentPosts: unknown){
 if(!Array.isArray(recentPosts))return {};
 const posts=recentPosts.slice(0,6).flatMap((post:any)=>{
  const key=postCoverKey(post?.url);
  return key?[{key,url:String(post.url),cover:typeof post.cover==='string'?post.cover:null}]:[];
 }) as {key:string;url:string;cover:string|null}[];
 const covers=await Promise.all(posts.map(post=>saveCover(post.key,expiredPostAsset(post.cover)?null:post.cover)));
 const fresh=new Map<string,string>();
 if(covers.some((cover,i)=>!cover&&!posts[i].key.startsWith('ig-'))&&/^[\w.-]+$/.test(handle||'')){
  try{
   const embed=tiktokProfileEmbed('https://www.tiktok.com/@'+handle);
   if(embed){
    const response=await fetch(embed,{headers:{'user-agent':'Mozilla/5.0'},redirect:'error',signal:AbortSignal.timeout(4500)});
    const html=response.ok?await response.text():'';
    if(html.length<=2000000)for(const post of tiktokEmbedPosts(html,embed)){
     const key=postCoverKey(post.url);
     if(key&&post.cover)fresh.set(key,post.cover);
    }
   }
  }catch{ /* Fall back to the exact public post. */ }
 }
 return Object.fromEntries(await Promise.all(posts.map(async (post,i)=>{
  if(covers[i])return [post.key,covers[i]];
  try{
   const source=fresh.get(post.key)||await publicPostCover(post.url,post.key);
   return [post.key,await saveCover(post.key,source)];
  }catch{return [post.key,null]}
 })));
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
   try{await db.from('creator_tiktok_posts').upsert({creator_id:creatorId,fingerprint,posts});}
   catch{console.warn('creator_tiktok_posts_cache_failed');}
  }
 }
 return Promise.all(shown.map(async post=>{
  const id=new URL(post.url).pathname.match(/\/video\/(\d+)/)?.[1]!;
  return {url:post.url,verified:post.verified,cover:id?await saveCover(id,post.cover):undefined};
 }));
}
