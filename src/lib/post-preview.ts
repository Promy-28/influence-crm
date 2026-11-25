export function publicHttps(value:unknown){try{const u=new URL(String(value));return u.protocol==='https:'&&!u.username&&!u.password?u.href:null}catch{return null}}
export function expiredPostAsset(value:unknown,now=Date.now()){
 const url=publicHttps(value);if(!url)return true;const u=new URL(url);
 const expiry=u.searchParams.get('x-expires')||u.searchParams.get('Expires');
 if(expiry&&/^\d{9,13}$/.test(expiry))return Number(expiry)*(expiry.length>10?1:1000)<=now;
 const ig=u.searchParams.get('oe');if(/(?:cdninstagram\.com|fbcdn\.net)$/.test(u.hostname)&&ig&&/^[a-f0-9]{8}$/i.test(ig))return parseInt(ig,16)*1000<=now;
 return false;
}
export function tiktokPlayer(value:unknown){
 const url=publicHttps(value);if(!url)return null;const u=new URL(url);
 if(!['www.tiktok.com','tiktok.com'].includes(u.hostname)||u.port)return null;
 const id=u.pathname.match(/^\/@[^/]+\/video\/(\d{10,25})\/?$/)?.[1];
 return id?'https://www.tiktok.com/player/v1/'+id+'?autoplay=0&controls=1&description=0&music_info=0':null;
}
export function postCoverKey(value:unknown){
 const tiktok=tiktokPlayer(value);
 if(tiktok)return new URL(tiktok).pathname.split('/').at(-1)||null;
 const url=publicHttps(value);
 if(!url)return null;
 const u=new URL(url);
 if(u.port||!['instagram.com','www.instagram.com'].includes(u.hostname))return null;
 const shortcode=u.pathname.match(/^\/(?:p|reel|tv)\/([\w-]{5,32})\/?$/)?.[1];
 return shortcode?'ig-'+shortcode:null;
}
