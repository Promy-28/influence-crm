import {followupDue} from '@/lib/followup-policy';
import RedditInbox from '@/components/RedditInbox';
import {redditThread} from '@/lib/reddit-thread';
import {workspaceMode} from '@/lib/workspace-mode';
import {mailSource} from '@/lib/mail-source';
import FoundInbox from '@/components/FoundInbox';
import {mailSnapshot} from '@/lib/hub-data';
import {refreshRedditMail} from '@/lib/hub-actions';
import {Submit} from '@/components/ui';
import {fmtTime} from '@/lib/format';
export default async function Inbox({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
 const sp=await searchParams,source=sp.source?mailSource(sp.source):await workspaceMode();
 if(source==='apify')return <div className="hub-stack"><FoundInbox searchParams={searchParams}/></div>;
 const snapshot=await mailSnapshot(),query=(sp.q||'').toLowerCase();
 const all=snapshot.threads as any[];const rows=all.filter(t=>(sp.status!=='wait'||t.state==='waiting_on_us')&&(sp.status!=='them'||t.state==='waiting_on_them')&&(sp.status!=='followup'||followupDue(t))&&(!query||String(t.sender).toLowerCase().includes(query))).sort((a,b)=>String(b.lastMessageAt).localeCompare(String(a.lastMessageAt)));
 const selected=sp.thread?all.find(t=>t.id===sp.thread):sp.email?[...all].sort((a,b)=>String(b.lastMessageAt).localeCompare(String(a.lastMessageAt))).find(t=>String(t.sender).toLowerCase()===sp.email!.toLowerCase()):rows[0];
 const initial=selected?await redditThread(selected.id,snapshot):null;

 return <div className="hub-stack">
  <header className="hub-heading"><div><h1>Почта креаторов</h1><p className="sub">Проверяй историю и кого мы ждём. Ответы готовятся автоматически в «Черновиках»; через 48 часов без ответа там появится фолоуап. Green / Yellow, конец октября и ноябрь.</p></div><div className="row"><a className="btn-p" href="/drafts">Все черновики →</a><form action={refreshRedditMail}><Submit>Обновить историю</Submit></form></div></header>
  {sp.msg&&<div className="okbox" role="status">{sp.msg}</div>}
  <form className="hub-toolbar"><input type="hidden" name="source" value="reddit"/><input className="in" name="q" defaultValue={sp.q} placeholder="Поиск по email" aria-label="Поиск почты"/><select className="in" name="status" defaultValue={sp.status||'all'} aria-label="Статус ответа"><option value="all">Все переписки ({all.length})</option><option value="wait">Ждут нашего ответа ({all.filter(t=>t.state==='waiting_on_us').length})</option><option value="them">Ждём креатора ({all.filter(t=>t.state==='waiting_on_them').length})</option><option value="followup">Фолоуап · 48+ ч. ({all.filter(t=>followupDue(t)).length})</option></select><button className="btn">Показать</button><span className="muted">История: {fmtTime(snapshot.syncedAt)} · выбранная ветка проверяется в Instantly</span></form>
  <RedditInbox key={(sp.q||'')+':'+(sp.status||'all')} rows={rows.map(({messages,...row}:any)=>row)} initial={initial} query={sp.q||''} status={sp.status||'all'}/>
 </div>;
}
