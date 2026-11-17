export const BANNER_IMAGE='https://lh3.googleusercontent.com/pw/AP1GczOt0ynqQcFdGwuWqHXrSCVh_ukl8tP6UnNd_dmf5R6sjrYY2GB8xvM7h09tBGdd-9llLsQH7yFLQA-iFXgHUijH_w8iAoSCOnig1Z_63v0_FzvM2Kk=w2400';
export const BANNER_TARGET='https://promy.io/influencers?utm_source=email&utm_medium=outreach&utm_campaign=creator_outreach&utm_content=dom1';
const attr=(s:string)=>s.replace(/&/g,'&amp;').replace(/"/g,'&quot;');
export function bannerHtml(){return '<div data-promy-banner="creator-outreach"><a href="'+attr(BANNER_TARGET)+'" target="_blank"><img src="'+BANNER_IMAGE+'" alt="Promy — become a creator" width="600" style="width:600px;max-width:100%;height:auto;border:0;display:block"></a></div>'}
export function withCampaignBanner(html:string){
 let body=html.replace(/<div data-promy-banner="creator-outreach">[\s\S]*?<\/div>/g,'');
 const escaped=BANNER_IMAGE.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 body=body.replace(new RegExp('<a\\b[^>]*>\\s*<img\\b[^>]*src=["\']'+escaped+'["\'][^>]*>\\s*</a>','gi'),'').replace(new RegExp('<img\\b[^>]*src=["\']'+escaped+'["\'][^>]*>','gi'),'');
 return body.trim()+bannerHtml();
}
