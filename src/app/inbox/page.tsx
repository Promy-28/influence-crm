import Link from 'next/link';
import MailReplyPanel from '@/components/MailReplyPanel';
import {draftWorkspace} from '@/lib/draft-workspace';
import {focusedReply,mailDate} from '@/lib/mail-reply-view';
import CampaignBadge from '@/components/CampaignBadge';
import {workspaceMode} from '@/lib/workspace-mode';
import {mailSource} from '@/lib/mail-source';
import FoundInbox from '@/components/FoundInbox';
import {mailSnapshot} from '@/lib/hub-data';
import {environment,loadRecord,api,telegram,saveRecord,campaigns} from '@/lib/promy-bot/store';
import {createAgentRuntime} from '@/lib/promy-bot/agent-runtime';
import {refreshRedditMail} from '@/lib/hub-actions';
import {Submit} from '@/components/ui';
import {ago,fmtTime} from '@/lib/format';
export default async function Inbox({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
 const sp=await searchParams,source=sp.source?mailSource(sp.source):await workspaceMode();
 if(source==='apify')return <div className="hub-stack"><FoundInbox searchParams={searchParams}/></div>;
 const snapshot=await mailSnapshot(),query=(sp.q||'').toLowerCase();
 const all=snapshot.threads as any[];const rows=all.filter(t=>(sp.status!=='wait'||t.state==='waiting_on_us')&&(!query||String(t.sender).toLowerCase().includes(query))).sort((a,b)=>String(b.lastMessageAt).localeCompare(String(a.lastMessageAt)));
 const selected=sp.thread?all.find(t=>t.id===sp.thread):sp.email?[...all].sort((a,b)=>String(b.lastMessageAt).localeCompare(String(a.lastMessageAt))).find(t=>String(t.sender).toLowerCase()===sp.email!.toLowerCase()):rows[0];
 const env=environment();let context:any=null,error='';
 if(selected?.latestInboundId){try{const r=createAgentRuntime({env,api,telegram,loadRecord,saveRecord,campaigns});context=await r.getThread(selected.latestInboundId,{includeReferences:false});if(context.complete&&context.thread?.latestInboundId&&context.thread.latestInboundId!==context.canonical.id)context=await r.getThread(context.thread.latestInboundId,{includeReferences:false})}catch{error='Instantly сейчас не отдал живую переписку. Ниже показан сохранённый снимок.'}}
 const thread=context?.thread||selected;
 const messages=[...(thread?.messages||[])].sort((a:any,b:any)=>Date.parse(b.timestamp)-Date.parse(a.timestamp));
 const latest=messages[0],incoming=messages.find((m:any)=>m.id===(context?.canonical?.id||thread?.latestInboundId));
 const proposal=selected?.latestInboundId?focusedReply(await draftWorkspace('reddit'),context?.canonical?.id||selected.latestInboundId):{draft:null,decision:null};
 // Prefer the freshly checked thread over the cached list status for the selected contact.
 const shownRows=rows.map(t=>t.id===selected?.id&&context?.thread?{...t,state:thread.state,lastMessageAt:latest?.timestamp||t.lastMessageAt}:t);

 return <div className="hub-stack">
  <header className="hub-heading"><div><h1>Почта креаторов</h1><p className="sub">Выбери креатора слева → прочитай последнее письмо → предложи ответ → открой черновик для правок и подтверждения. Green / Yellow, конец октября и ноябрь.</p></div><div className="row"><a className="btn-p" href="/drafts">Все черновики →</a><form action={refreshRedditMail}><Submit>Обновить историю</Submit></form></div></header>
  {sp.msg&&<div className="okbox" role="status">{sp.msg}</div>}
  <form className="hub-toolbar"><input type="hidden" name="source" value="reddit"/><input className="in" name="q" defaultValue={sp.q} placeholder="Поиск по email" aria-label="Поиск почты"/><select className="in" name="status" defaultValue={sp.status||'all'} aria-label="Статус ответа"><option value="all">Все переписки ({all.length})</option><option value="wait">Ждут нашего ответа ({all.filter(t=>t.state==='waiting_on_us').length})</option></select><button className="btn">Показать</button><span className="muted">История: {fmtTime(snapshot.syncedAt)} · выбранная ветка проверяется в Instantly</span></form>
  <div className="panel hub-mail">
   <aside className="hub-mail-list" aria-label="Переписки">{shownRows.map(t=><Link scroll={false} prefetch={false} key={t.id} className={'hub-mail-item '+(t.id===selected?.id?'selected':'')} href={'/inbox?source=reddit&thread='+encodeURIComponent(t.id)+'&email='+encodeURIComponent(t.sender)+'&q='+encodeURIComponent(sp.q||'')+'&status='+encodeURIComponent(sp.status||'all')}><strong className="mail-address">{t.sender}</strong><CampaignBadge ids={t.campaignIds}/><span>{t.state==='waiting_on_us'?'● Ждёт нашего ответа':t.state==='waiting_on_them'?'Ждём креатора':'Переписка'}</span><small>{ago(t.lastMessageAt)}</small></Link>)}{!rows.length&&<div className="hub-empty">Переписок по фильтру нет.</div>}</aside>
   <section key={selected?.id||'empty'} className="hub-mail-thread" aria-label="Содержимое переписки">{selected?<><header className="hub-thread-head"><h2 className="mail-address">{selected.sender}</h2><CampaignBadge ids={thread.campaignIds||selected.campaignIds}/><p className="muted">{context?.canonical?.subject||'Переписка'} · {selected.account}</p><a className="l" href="https://app.instantly.ai/app/unibox" target="_blank" rel="noreferrer">Открыть Instantly ↗</a></header>{error&&<div className="note">{error}</div>}{context?.briefContext?.sent&&<div className="note" style={{margin:'10px 20px'}}>Бриф отправляли {fmtTime(context.briefContext.sentAt)} · <a className="l" href={context.briefContext.url} target="_blank" rel="noreferrer">Открыть бриф ↗</a>{context.briefContext.scope&&<details><summary>Последнее уточнение объёма и условий</summary><p className="draft-email-text">{context.briefContext.scope.text}</p></details>}</div>}
    <div className="note" style={{margin:"12px 20px"}}><b>{thread.state==='waiting_on_us'?'Наша очередь ответить':thread.state==='waiting_on_them'?'Ответ отправлен · ждём креатора':'Статус переписки'}</b>{latest&&<p>Последнее письмо: {latest.direction==='outbound'?'от Promy':'от креатора'} · {mailDate(latest.timestamp)}</p>}</div>
    {incoming&&<section className="mail-latest"><h3>Последнее письмо креатора · {mailDate(incoming.timestamp)}</h3><p className="draft-email-text">{incoming.text}</p></section>}
    {selected.latestInboundId&&<MailReplyPanel key={selected.id+':'+(context?.canonical?.id||selected.latestInboundId)} source="reddit" emailId={context?.canonical?.id||selected.latestInboundId} recipient={selected.sender} account={context?.canonical?.eaccount||selected.account} incomingAt={incoming?.timestamp} initial={proposal} canPrepare={thread.state==='waiting_on_us'}/>}
    <details className="mail-history"><summary>Вся переписка · {messages.length} писем · новые сверху</summary><div className="hub-messages">{messages.map((m:any)=><article key={m.id} className={'hub-message '+(m.direction==='outbound'?'out':'')}><div className="hub-message-meta">{m.direction==='outbound'?'Promy':'Креатор'} · {mailDate(m.timestamp)}</div><p>{m.text}</p></article>)}</div></details>
   </>:<div className="hub-empty">{sp.email?'Для этого адреса писем в текущем снимке нет. Обнови историю или проверь Instantly.':'Выбери переписку слева.'}</div>}</section>
  </div>
 </div>;
}
