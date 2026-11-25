import 'server-only';
import {publicPortfolioMedia} from './jockey-review';
// Public portfolio playback on Vercel, never the owner's PC or an authenticated cookie export.
// No paid browser service; stop on access challenges instead of attempting to solve them.
export async function renderPortfolioMedia(parentUrl:string){
 const host=new URL(parentUrl).hostname;
 if(!['canva.link','canva.com','www.canva.com'].includes(host)&&!host.endsWith('.my.canva.site'))return [];
 const [{default:chromium},{default:puppeteer}]=await Promise.all([import('@sparticuz/chromium'),import('puppeteer-core')]);
 const browser=await puppeteer.launch({args:chromium.args,executablePath:await chromium.executablePath(),headless:true});
 try{
  const page=await browser.newPage();await page.setViewport({width:1280,height:900});
  const media=new Set<string>(),hosts=new Map<string,boolean>();
  const allowed=async(url:string)=>{try{const u=new URL(url);if(u.protocol!=='https:'||u.username||u.password||u.port)return false;if(!hosts.has(u.hostname))hosts.set(u.hostname,await publicPortfolioMedia(url,url));return hosts.get(u.hostname)===true}catch{return false}};
  await page.setRequestInterception(true);
  page.on('request',r=>{void(async()=>{try{if(r.method()!=='GET'||!await allowed(r.url()))return await r.abort();await r.continue()}catch{try{await r.abort()}catch{}}})()});
  page.on('response',r=>{const url=r.url();try{const u=new URL(url);if(r.ok()&&/\.(mp4|mov|webm)$/i.test(u.pathname)&&(['media.canva.com','media-public.canva.com',host].includes(u.hostname)))media.add(url)}catch{}});
  await page.goto(parentUrl,{waitUntil:'domcontentloaded',timeout:20000});
  const started=Date.now();
  for(let step=0;step<6&&Date.now()-started<35000;step++){
   const challenge=await page.evaluate(()=>/verify you are human|checking your browser|access denied|sign in to continue/i.test(document.title+' '+document.body.innerText.slice(0,900)));
   if(challenge)throw Error('PORTFOLIO_ACCESS_CHALLENGE');
   await page.evaluate(async()=>{for(const v of Array.from(document.querySelectorAll('video')).slice(0,6)){v.muted=true;await v.play().catch(()=>{})}window.scrollBy(0,650)});
   await page.waitForFunction(()=>Array.from(document.querySelectorAll('video')).some(v=>v.currentTime>0),{timeout:1500}).catch(()=>{});
   if(media.size>=2)break;
   // Public Canva designs reveal original samples after moving into their work pages.
   await page.evaluate((n)=>{const pages=Array.from(document.querySelectorAll('button'));const target=pages.find(b=>b.getAttribute('aria-label')==='Page '+n)||pages.find(b=>b.getAttribute('aria-label')==='Next page');if(target){target.click();target.dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))}},step+2);
  }
  return [...media].slice(0,8);
 }finally{await browser.close()}
}
