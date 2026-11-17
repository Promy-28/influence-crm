import {workspaceMode} from '@/lib/workspace-mode';
import {mailSource} from '@/lib/mail-source';
import FoundInbox from '@/components/FoundInbox';
import {mailSnapshot} from '@/lib/hub-data';
import {environment,loadRecord,api,telegram,saveRecord,campaigns} from '@/lib/promy-bot/store';
import {createAgentRuntime} from '@/lib/promy-bot/agent-runtime';
import {prepareHubReply,sendHubReply,cancelHubReply,refreshRedditMail} from '@/lib/hub-actions';
import {Submit} from '@/components/ui';
import {approvalToken} from '@/lib/draft-approval';
import {ago,fmtTime} from '@/lib/format';
export default async function Inbox({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
 const sp=await searchParams,source=sp.source?mailSource(sp.source):await workspaceMode();
 if(source==='apify')return <div className="hub-stack"><FoundInbox searchParams={searchParams}/></div>;
 const snapshot=await mailSnapshot(),query=(sp.q||'').toLowerCase();
 const all=snapshot.threads as any[];const rows=all.filter(t=>(sp.status!=='wait'||t.state==='waiting_on_us')&&(!query||String(t.sender).toLowerCase().includes(query))).sort((a,b)=>String(b.lastMessageAt).localeCompare(String(a.lastMessageAt)));
 const selected=sp.thread?all.find(t=>t.id===sp.thread):sp.email?[...all].sort((a,b)=>String(b.lastMessageAt).localeCompare(String(a.lastMessageAt))).find(t=>String(t.sender).toLowerCase()===sp.email!.toLowerCase()):rows[0];
 const env=environment();let context:any=null,error='';
 if(selected?.latestInboundId){try{context=await createAgentRuntime({env,api,telegram,loadRecord,saveRecord,campaigns}).getThread(selected.latestInboundId,{includeReferences:false})}catch{error='Instantly сейчас не отдал живую переписку. Ниже показан сохранённый снимок.'}}
 const thread=context?.thread||selected;
 const messages=[...(thread?.messages||[])].sort((a:any,b:any)=>Date.parse(b.timestamp)-Date.parse(a.timestamp));
 const latest=messages[0];
 // Prefer the freshly checked thread over the cached list status for the selected contact.
 const shownRows=rows.map(t=>t.id===selected?.id&&context?.thread?{...t,state:thread.state,lastMessageAt:latest?.timestamp||t.lastMessageAt}:t);
 const queue=sp.job?await loadRecord(env,'agent_jobs'):null,job=queue?.items?.find((j:any)=>j.id===sp.job),draft=job?.draftId?await loadRecord(env,'draft:'+job.draftId):null;
 return <div className="hub-stack">
  <header className="hub-heading"><div><h1>Почта креаторов</h1><p className="sub">Ответы Green / Yellow с 25 октября и за ноябрь. Выбери человека, напиши инструкцию, проверь и отправь ответ.</p></div><div className="row"><a className="btn-p" href="/drafts">Все черновики →</a><form action={refreshRedditMail}><Submit>Обновить историю</Submit></form></div></header>
  {sp.msg&&<div className="okbox" role="status">{sp.msg}</div>}
  <form className="hub-toolbar"><input type="hidden" name="source" value="reddit"/><input className="in" name="q" defaultValue={sp.q} placeholder="Поиск по email" aria-label="Поиск почты"/><select className="in" name="status" defaultValue={sp.status||'all'} aria-label="Статус ответа"><option value="all">Все переписки ({all.length})</option><option value="wait">Ждут нашего ответа ({all.filter(t=>t.state==='waiting_on_us').length})</option></select><button className="btn">Показать</button><span className="muted">История: {fmtTime(snapshot.syncedAt)} · выбранная ветка проверяется в Instantly</span></form>
  <div className="panel hub-mail">
   <aside className="hub-mail-list" aria-label="Переписки">{shownRows.map(t=><a key={t.id} className={'hub-mail-item '+(t.id===selected?.id?'selected':'')} href={'/inbox?source=reddit&thread='+encodeURIComponent(t.id)+'&email='+encodeURIComponent(t.sender)+'&q='+encodeURIComponent(sp.q||'')}><strong className="mail-address">{t.sender}</strong><span>{t.state==='waiting_on_us'?'● Ждёт нашего ответа':t.state==='waiting_on_them'?'Ждём креатора':'Переписка'}</span><small>{ago(t.lastMessageAt)}</small></a>)}{!rows.length&&<div className="hub-empty">Переписок по фильтру нет.</div>}</aside>
   <section className="hub-mail-thread">{selected?<><header className="hub-thread-head"><h2 className="mail-address">{selected.sender}</h2><p className="muted">{context?.canonical?.subject||'Переписка'} · {selected.account}</p><a className="l" href="https://app.instantly.ai/app/unibox" target="_blank" rel="noreferrer">Открыть Instantly ↗</a></header>{error&&<div className="note">{error}</div>}
    <div className="note" style={{margin:"12px 20px"}}><b>{thread.state==='waiting_on_us'?'Наша очередь ответить':thread.state==='waiting_on_them'?'Ответ отправлен · ждём креатора':'Статус переписки'}</b>{latest&&<p>Последнее письмо: {latest.direction==='outbound'?'от Promy':'от креатора'} · {fmtTime(latest.timestamp)}. {thread.state==='waiting_on_us'?'Креатор написал после нашего ответа.':'Смотри последнее сообщение ниже.'}</p>}<small>Новые письма сверху. Более раннее письмо Promy ниже — часть истории.</small></div><div className="hub-messages">{messages.map((m:any)=><article key={m.id} className={'hub-message '+(m.direction==='outbound'?'out':'')}><div className="hub-message-meta">{m.direction==='outbound'?'Promy':'Креатор'} · {fmtTime(m.timestamp)}</div><p>{m.text}</p></article>)}</div>
    {draft&&<section className="hub-draft"><h2>Черновик ответа</h2><p className="muted">Кому: {draft.recipient} · от: {draft.eaccount}</p>{job.answer&&<p>{job.answer}</p>}{draft.macroName==='Reply'&&<details><summary className="l">Письмо целиком: имя, подпись и баннер Reply</summary><iframe title="Письмо с макросом Reply" sandbox="" srcDoc={draft.html} style={{width:"100%",height:430,border:0,background:"white"}}/></details>}{draft.status==='draft'?<form action={sendHubReply} className="hub-stack"><input type="hidden" name="draftId" value={draft.id}/><input type="hidden" name="approval" value={approvalToken(draft,process.env.APP_PASSWORD!)}/><textarea className="in" name="body" rows={7} defaultValue={draft.replyContent||draft.body} required maxLength={2800} aria-label="Текст письма для подтверждения"/><div className="row"><Submit className="btn-p">Подтвердить и отправить это письмо</Submit><Submit formAction={cancelHubReply}>Отменить</Submit></div></form>:<><pre>{draft.body}</pre><span className="tag">{draft.status}</span></>}</section>}
    {context?.complete&&thread.state==='waiting_on_us'?<form action={prepareHubReply} className="hub-compose"><input type="hidden" name="emailId" value={context.canonical.id}/><label htmlFor="reply-instruction"><b>Что ответить?</b></label><textarea id="reply-instruction" className="in" name="instruction" rows={3} maxLength={5000} required placeholder="Например: видео понравилось, готовим бриф, скоро пришлём детали"/><div className="row"><Submit className="btn-p">Подготовить черновик</Submit><a className="btn" href="https://t.me/influencerpromybot" target="_blank" rel="noreferrer">Продолжить в Telegram ↗</a></div><small className="muted">Черновик также появится в Telegram. До подтверждения письмо не отправляется.</small></form>:<p className="hub-empty">{context?'Последнее письмо уже обработано или не требует ответа.':'Для черновика нужна подтверждённая входящая ветка. Обнови историю или открой Instantly.'}</p>}
   </>:<div className="hub-empty">{sp.email?'Для этого адреса писем в текущем снимке нет. Обнови историю или проверь Instantly.':'Выбери переписку слева.'}</div>}</section>
  </div>
 </div>;
}
