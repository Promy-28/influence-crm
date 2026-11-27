export function portfolioLinks(value:string){return [...new Set((String(value||'').match(/https?:\/\/[^\s<>"']+/g)||[]).map(s=>s.replace(/[),.;]+$/,'')))].slice(0,8)}
export function socialPlatform(host: string) {
 if (['instagram.com', 'www.instagram.com'].includes(host)) return 'instagram';
 if (['tiktok.com', 'www.tiktok.com', 'vm.tiktok.com', 'vt.tiktok.com'].includes(host)) return 'tiktok';
}

export function tiktokProfileEmbed(profile: string) {
 const url = new URL(profile);
 const handle = url.pathname.match(/^\/@([\w.-]+)\/?$/)?.[1];
 if (socialPlatform(url.hostname) === 'tiktok' && url.protocol === 'https:' && !url.username && !url.password && !url.port && handle) {
  return 'https://www.tiktok.com/embed/@' + handle;
 }
}

export function tiktokEmbedPosts(html: string, embed: string): {url:string;source:string;cover:string|null}[] {
 const path = new URL(embed).pathname;
 const handle = path.match(/^\/embed\/@([\w.-]+)$/)?.[1]?.toLowerCase();
 const state = html.match(/<script\b[^>]*\bid=["']__FRONTITY_CONNECT_STATE__["'][^>]*>([\s\S]*?)<\/script>/i)?.[1];
 if (!handle || !state) return [];
 try {
  const videos = JSON.parse(state)?.source?.data?.[path]?.videoList;
  if (!Array.isArray(videos)) return [];
  return videos.flatMap(item => {
   if (item?.privateItem !== false || typeof item?.authorUniqueId!=='string' || item.authorUniqueId.toLowerCase() !== handle || typeof item.playAddr !== 'string'||typeof item.id!=='string'||!/^\d{10,25}$/.test(item.id)) return [];
   return [{url:'https://www.tiktok.com/@'+handle+'/video/'+item.id,source:item.playAddr,cover:typeof item.coverUrl==='string'?item.coverUrl:null}];
  }).slice(0,10);
 } catch { return []; }
}
export function tiktokEmbedMedia(html:string,embed:string){
 return [...new Set(tiktokEmbedPosts(html,embed).map(post=>post.source))];
}
export function tiktokStreamKey(source:unknown){
 try{
  const u=new URL(String(source));
  if(u.protocol!=='https:'||!/(?:\.)tiktokcdn(?:-us|-eu)?\.com$/.test(u.hostname))return null;
  return u.pathname.match(/^\/[a-f0-9]{32}\/[a-f0-9]{8}(\/video\/tos\/[\w/-]+)$/i)?.[1]?.replace(/\/$/,'')||null;
 }catch{return null}
}

export function sameSocialSample(left:string,right:string){
 if(left===right)return true;
 const key=tiktokStreamKey(left);
 if(key&&key===tiktokStreamKey(right))return true;
 try{
  const a=new URL(left),b=new URL(right);
  return a.hostname===b.hostname&&a.pathname===b.pathname&&a.pathname!=='/'&&a.hostname.endsWith('.cdninstagram.com');
 }catch{return false}
}

function instagramVideoItems(html:string){
 const items:any[]=[];
 for(const script of html.matchAll(/<script\b[^>]*\btype=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi)){
  if(!script[1].includes('video_versions')&&!script[1].includes('video_url'))continue;
  let root:unknown;
  try{root=JSON.parse(script[1])}catch{continue}
  const pending=[root];
  for(let seen=0;pending.length&&seen<30000;seen++){
   const value=pending.pop();
   if(!value||typeof value!=='object')continue;
   const item=value as Record<string,any>;
   const code=item.shortcode||item.code;
   if(typeof code==='string'&&/^[\w-]{5,32}$/.test(code)&&(Array.isArray(item.video_versions)||typeof item.video_url==='string')){
    const username=item.owner?.username||item.user?.username||null;
    const sources=[item.video_url,...(Array.isArray(item.video_versions)?item.video_versions.map((video:any)=>video?.url):[])];
    items.push({code,username,sources});
   }
   pending.push(...Object.values(value));
  }
 }
 return items as {code:string;username:string|null;sources:unknown[]}[];
}

export function publicSocialPosts(html: string, profile: string) {
 const parent = new URL(profile);
 const platform = socialPlatform(parent.hostname);
 const account = parent.pathname.match(platform === 'tiktok' ? /^\/@([\w.-]+)\/?$/ : /^\/([\w.]+)\/?$/)?.[1];
 if (!platform || !account) return [];
 const posts = new Set<string>();
 if(platform==='instagram'){
  for(const item of instagramVideoItems(html)){
   if(typeof item.username==='string'&&item.username.toLowerCase()===account.toLowerCase())posts.add('https://www.instagram.com/reel/'+item.code+'/');
   if(posts.size>=5)return [...posts];
  }
 }
 for (const match of html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)) {
  let url: URL;
  try { url = new URL(match[1], parent); } catch { continue; }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || socialPlatform(url.hostname) !== platform) continue;
  // Instagram profile HTML can contain recommendations with no author binding.
  // Only accept links whose path identifies the submitted account.
  const post = platform === 'tiktok'
   ? url.pathname.match(/^\/@([\w.-]+)\/video\/(\d+)\/?$/)
   : url.pathname.match(/^\/([\w.]+)\/(?:reel|p)\/([\w-]+)\/?$/);
  if (post?.[1].toLowerCase() === account.toLowerCase()) posts.add(url.origin + url.pathname);
  if (posts.size >= 5) break;
 }
 return [...posts];
}

export function socialPostMedia(html: string, page: string) {
 const url = new URL(page);
 const platform = socialPlatform(url.hostname);
 if (platform === 'tiktok' ? !/^\/@[\w.-]+\/video\/\d+\/?$/.test(url.pathname)
  : platform !== 'instagram' || !/^\/(?:[\w.]+\/)?(?:p|reel|tv)\/[\w-]+\/?$/.test(url.pathname)) return [];
 const sources = new Set<string>();
 const suffixes = platform === 'instagram' ? ['.cdninstagram.com', '.fbcdn.net'] : ['.tiktokcdn.com', '.tiktokcdn-us.com', '.tiktokcdn-eu.com'];
 const accept = (value: unknown) => {
  if (typeof value !== 'string') return;
  try {
   const source = new URL(value.replace(/&amp;/g, '&'));
   if (source.protocol === 'https:' && !source.username && !source.password && !source.port && suffixes.some(suffix => source.hostname.endsWith(suffix))) sources.add(source.href);
  } catch { /* Invalid media URL. */ }
 };
 if (platform === 'tiktok') {
  const [account,id] = url.pathname.match(/^\/@([\w.-]+)\/video\/(\d+)\/?$/)!.slice(1);
  const state=html.match(/<script\b[^>]*\bid=["']__UNIVERSAL_DATA_FOR_REHYDRATION__["'][^>]*>([\s\S]*?)<\/script>/i)?.[1];
  if (state) {
   try {
    const item=JSON.parse(state)?.__DEFAULT_SCOPE__?.['webapp.video-detail']?.itemInfo?.itemStruct;
    if (item && (String(item.id)!==id || item.author?.uniqueId?.toLowerCase()!==account.toLowerCase() || item.privateItem===true)) return [];
    if (item) {
     accept(item.video?.playAddr);
     accept(item.video?.downloadAddr);
    }
   } catch { /* Try public metadata if the page has no usable state. */ }
  }
 }
 if (platform === 'instagram') {
  const identity=url.pathname.match(/^\/(?:([\w.]+)\/)?(?:p|reel|tv)\/([\w-]+)\/?$/)!;
  for(const item of instagramVideoItems(html)){
   if(item.code!==identity[2])continue;
   if(identity[1]&&typeof item.username==='string'&&item.username.toLowerCase()!==identity[1].toLowerCase())continue;
   for(const source of item.sources)accept(source);
  }
 }
 for (const match of html.matchAll(/<meta\s[^>]*>/gi)) {
  const attrs = new Map([...match[0].matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/g)].map(m => [m[1].toLowerCase(), m[3]]));
  if (/^og:video(?::(?:url|secure_url))?$/.test(attrs.get('property') || '')) accept(attrs.get('content'));
 }
 return [...sources];
}
export function embeddedMedia(html:string,base:string){
 const text=html.replace(/\\u002[fF]/g,'/').replace(/\\\//g,'/').replace(/&amp;/g,'&');
 const page=new URL(base);
 const canvaSite=page.hostname.endsWith('.my.canva.site');
 const basePath=canvaSite?text.match(/<base\s+href=["'](\/(?!\/)[\w/-]*)["']/i)?.[1]:undefined;
 const assetBase=basePath?new URL(basePath,page):page;
 // Canva Sites emit a primary rendition per asset, followed by copies at
 // different resolutions. Prefer the primary entries across different clips.
 const canvaVideos=canvaSite
  ? [...text.matchAll(/"files"\s*:\s*\[\s*\{\s*"url"\s*:\s*"((?:\.\/|\/)?_assets\/video\/[\w-]+\.(?:mp4|webm|mov))"/gi)].map(m=>new URL(m[1],assetBase).href)
  : [];
 const urls=[...text.matchAll(/(?:https:\/\/[^\s"'<>\\]+|\/_assets\/[^\s"'<>\\]+)\.(?:mp4|mov|webm)(?:\?[^\s"'<>\\]*)?/gi)].map(m=>new URL(m[0],base).href);
 return [...new Set([...canvaVideos,...urls])].filter(s=>{const u=new URL(s);return u.hostname===page.hostname||['media.canva.com','media-public.canva.com'].includes(u.hostname)}).slice(0,12);
}
export function cloudAssessment(result:any,quote:string){
 if(!result?.videoReviewed||!result?.audioReviewed||typeof result.englishSpeech!=='boolean'||!result?.speech?.length||!result?.frames?.length)return null;
 const speech=result.speech.filter((sample:any)=>typeof sample.quote==='string'&&/[\p{L}]/u.test(sample.quote)&&Number.isFinite(sample.second));
 const words=speech.map((sample:any)=>sample.quote.trim().split(/\s+/).length);
 const total=words.reduce((sum:number,count:number)=>sum+count,0);
 const separateQuotes=new Set(speech.map((sample:any)=>sample.quote.trim().toLowerCase())).size>=2&&new Set(speech.map((sample:any)=>sample.second)).size>=2;
 if(total<8&&!(total>=5&&Math.max(...words)>=4&&separateQuotes))return null;
 if(!Number.isInteger(result.videoQuality)||result.videoQuality<1||result.videoQuality>5)return null;
 if(result.englishSpeech&&(!Number.isInteger(result.intelligibility)||result.intelligibility<1||result.intelligibility>5))return null;
 const poor=result.videoQuality<=2||result.englishSpeech&&result.intelligibility<=2;
 const speechQuality=result.englishSpeech?`Английская речь: ${result.intelligibility}/5.`:'Речь проверена: в этом образце она не на английском. Для оценки английского нужен другой ролик.';
 return {decision:poor?'no':'maybe',reason:String(result.summary||'').slice(0,900),quality:[`${speechQuality} Видео: ${result.videoQuality}/5.`,result.limitations||''].join(' ').slice(0,900),price:`Заявлено в форме: $${quote||'не указано'}. Это не согласованная ставка. Качество оценено отдельно; цвет можно подтвердить или изменить перед импортом.`,videoReviewed:true,audioReviewed:true,evidence:[result.source],at:new Date().toISOString()};
}
