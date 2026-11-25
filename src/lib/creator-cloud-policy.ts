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

export function tiktokEmbedMedia(html: string, embed: string) {
 const path = new URL(embed).pathname;
 const handle = path.match(/^\/embed\/@([\w.-]+)$/)?.[1]?.toLowerCase();
 const state = html.match(/<script\b[^>]*\bid=["']__FRONTITY_CONNECT_STATE__["'][^>]*>([\s\S]*?)<\/script>/i)?.[1];
 if (!handle || !state) return [];
 try {
  const videos = JSON.parse(state)?.source?.data?.[path]?.videoList;
  if (!Array.isArray(videos)) return [];
  return [...new Set<string>(videos.flatMap(item => {
   if (item?.privateItem !== false || item?.authorUniqueId?.toLowerCase() !== handle || typeof item.playAddr !== 'string') return [];
   return [item.playAddr];
  }))].slice(0,10);
 } catch { return []; }
}

export function publicSocialPosts(html: string, profile: string) {
 const parent = new URL(profile);
 const platform = socialPlatform(parent.hostname);
 const account = parent.pathname.match(platform === 'tiktok' ? /^\/@([\w.-]+)\/?$/ : /^\/([\w.]+)\/?$/)?.[1];
 if (!platform || !account) return [];
 const posts = new Set<string>();
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
  if (posts.size === 2) break;
 }
 return [...posts];
}

export function socialPostMedia(html: string, page: string) {
 const url = new URL(page);
 const platform = socialPlatform(url.hostname);
 if (platform === 'tiktok' ? !/^\/@[\w.-]+\/video\/\d+\/?$/.test(url.pathname)
  : platform !== 'instagram' || !/^\/(?:[\w.]+\/)?(?:p|reel|tv)\/[\w-]+\/?$/.test(url.pathname)) return [];
 const sources = new Set<string>();
 for (const match of html.matchAll(/<meta\s[^>]*>/gi)) {
  const attrs = new Map([...match[0].matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/g)].map((m) => [m[1].toLowerCase(), m[3]]));
  if (!/^og:video(?::(?:url|secure_url))?$/.test(attrs.get('property') || '')) continue;
  try {
   const source = new URL((attrs.get('content') || '').replace(/&amp;/g, '&'));
   const suffixes = platform === 'instagram' ? ['.cdninstagram.com', '.fbcdn.net'] : ['.tiktokcdn.com'];
   if (suffixes.some(suffix => source.hostname.endsWith(suffix))) sources.add(source.href);
  } catch { continue; }
 }
 return [...sources];
}
export function embeddedMedia(html:string,base:string){
 const text=html.replace(/\\u002[fF]/g,'/').replace(/\\\//g,'/').replace(/&amp;/g,'&');
 const urls=[...text.matchAll(/(?:https:\/\/[^\s"'<>\\]+|\/_assets\/[^\s"'<>\\]+)\.(?:mp4|mov|webm)(?:\?[^\s"'<>\\]*)?/gi)].map(m=>new URL(m[0],base).href);
 return [...new Set(urls)].filter(s=>{const u=new URL(s),p=new URL(base);return u.hostname===p.hostname||['media.canva.com','media-public.canva.com'].includes(u.hostname)}).slice(0,12);
}
export function cloudAssessment(result:any,quote:string){
 if(!result?.videoReviewed||!result?.audioReviewed||result.englishSpeech!==true||!result?.speech?.length||!result?.frames?.length)return null;
 if(result.speech.map((s:any)=>s.quote||'').join(' ').trim().split(/\s+/).length<8)return null;
 const poor=result.intelligibility<=2||result.videoQuality<=2;
 return {decision:poor?'no':'maybe',reason:String(result.summary||'').slice(0,900),quality:[`Английская речь: ${result.intelligibility}/5. Видео: ${result.videoQuality}/5.`,result.limitations||''].join(' ').slice(0,900),price:`Заявлено в форме: $${quote||'не указано'}. Это не согласованная ставка. Качество оценено отдельно; цвет можно подтвердить или изменить перед импортом.`,videoReviewed:true,audioReviewed:true,evidence:[result.source],at:new Date().toISOString()};
}
