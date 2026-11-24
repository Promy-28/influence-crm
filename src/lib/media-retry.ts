// Failures are visible during cooldown, never disguised as active processing.
export function mediaRetryAfter(saved:{status?:string;error?:string|null;finished_at?:string|null}|null,now=Date.now()){
 if(saved?.status!=='failed'||!saved.error||saved.error==='MEDIA_FILE_PROCESSING')return 0;
 const at=Date.parse(saved.finished_at||'');if(!Number.isFinite(at))return 0;
 return Math.max(0,Math.ceil((at+300000-now)/1000));
}
