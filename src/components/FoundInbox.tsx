import Link from 'next/link';
import MailReplyPanel from './MailReplyPanel';
import {draftWorkspace} from '@/lib/draft-workspace';
import {focusedReply,mailDate} from '@/lib/mail-reply-view';
import CampaignBadge from './CampaignBadge';
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { LABELS } from "@/lib/replies";
import { fmtTime, ago, n } from "@/lib/format";
import { TabLink, Submit } from "@/components/ui";
import { doneDialog, manualReply, redraft, relabel, sendDraftAction, setLabel, skipDraft } from "@/lib/actions";

type C = {inst_reply_uuid?:string;inst_campaign_id?:string; id: string; handle: string; name: string | null; email: string; avatar_url: string | null; platform: string; profile_url: string | null; followers: number | null; reply_label: string | null; last_reply_at: string | null; needs_reply: boolean; registered_at: string | null; profile_done_at: string | null; ref_code: string | null; eaccount: string | null; bio: string | null };
export default async function Inbox({ searchParams }: { searchParams: Promise<{ c?: string; f?: string; err?: string; page?: string }> }) {
  const sp = await searchParams; const page=Math.max(0,Number(sp.page)||0); const s0 = await getSettings(); const f = sp.f ?? ("all");
  const base = db.from("creators").select("id,handle,name,email,avatar_url,platform,profile_url,followers,reply_label,last_reply_at,needs_reply,registered_at,profile_done_at,ref_code,eaccount,bio,inst_reply_uuid,inst_campaign_id,human_reason,needs_human").eq("source", "apify").or("first_sent_at.not.is.null,replied_at.not.is.null").order("last_reply_at", { ascending: false, nullsFirst: false }).range(page*100,page*100+99);
  const q = f === "human" ? base.eq("source","apify").eq("needs_human", true) : f === "wait" ? base.eq("source","apify").eq("needs_reply", true) : f === "pos" ? base.not("positive_at", "is", null) : base;
  const [{ data: list }, { count: waiting }, { data: sched }, { count: human }] = await Promise.all([q, db.from("creators").select("id", { count: "exact", head: true }).eq("source","apify").eq("needs_reply", true), db.from("drafts").select("creator_id").eq("status", "scheduled"), db.from("creators").select("id", { count: "exact", head: true }).eq("source","apify").eq("needs_human", true)]);
  const s = s0;
  const rows = (list ?? []) as C[];
  const cur = rows.find((r) => r.id === sp.c) ?? (sp.c ? ((await db.from("creators").select("id,handle,name,email,avatar_url,platform,profile_url,followers,reply_label,last_reply_at,needs_reply,registered_at,profile_done_at,ref_code,eaccount,bio,inst_reply_uuid,inst_campaign_id,human_reason,needs_human").eq("id", sp.c).eq("source","apify").maybeSingle()).data as C | null) : rows[0]);
  const next = rows[rows.findIndex((r) => r.id === cur?.id) + 1]?.id ?? "";
  const {data:msgs}=cur?await db.from('messages').select('id,direction,body,subject,at,sent_by,inst_email_id').eq('creator_id',cur.id).order('at').limit(100):{data:[]};
  const incoming=(msgs||[]).filter(m=>m.direction==='in').at(-1),emailId=cur?.inst_reply_uuid||incoming?.inst_email_id||'';
  const proposal=cur?focusedReply(await draftWorkspace('apify'),emailId):{draft:null,decision:null};
  const schedSet = new Set((sched ?? []).map((d) => d.creator_id));
  const L = cur?.reply_label ? LABELS[cur.reply_label] : null;
  const link = cur?.ref_code ? s.signup_url.replace("{code}", cur.ref_code) : null;
  return <div className="flex flex-col gap-3 dlg-page">
    <div className="dlg-top"><h1>Почта · Apify</h1><p className="sub">Выбери креатора слева, прочитай последнее письмо и нажми «Предложить ответ». Ответ сохраняется в общих «Черновиках»: там правки и подтверждение с макросом Reply и баннером. {s.autopilot ? `Автопилот включён: AI отвечает сам через ${s.autopilot_delay_min} мин. Сюда, во вкладку «Нужен человек», и в Telegram попадают только сложные случаи.` : "Автопилот выключен: всё отправляешь ты."}</p></div>
    <div className="row"><a className="btn-p" href="/drafts?source=apify">Разобрать пачку Apify →</a></div>
    <div className="tabs dlg-filters"><TabLink href="/inbox?source=apify&f=human" on={f === "human"}>Нужен человек<span className="tab-n">{human ?? 0}</span></TabLink><TabLink href="/inbox?source=apify&f=wait" on={f === "wait"}>Ждут ответа<span className="tab-n">{waiting ?? 0}</span></TabLink><TabLink href="/inbox?source=apify&f=pos" on={f === "pos"}>С интересом</TabLink><TabLink href="/inbox?source=apify&f=all" on={f === "all"}>Все переписки</TabLink></div>
    {sp.err && <div className="errbox">{sp.err}</div>}
    <div className="row">{page>0&&<a className="btn" href={`/inbox?source=apify&f=${f}&page=${page-1}`}>← Назад</a>}{rows.length===100&&<a className="btn" href={`/inbox?source=apify&f=${f}&page=${page+1}`}>Следующие 100 →</a>}</div>
    <div className={`panel dlg ${cur ? "has-chat" : ""}`}>
      <div className="dlg-list">{rows.map((r) => <Link scroll={false} prefetch={false} key={r.id} href={`/inbox?source=apify&c=${r.id}&f=${f}&page=${page}`} className={`dlg-i ${r.id === cur?.id ? "on" : ""}`}>
        <div className="row" style={{ justifyContent: "space-between" }}><b>{r.name||r.handle}</b><div className="mail-address">{r.email}<CampaignBadge ids={r.inst_campaign_id?[r.inst_campaign_id]:[]}/></div><span className="muted" style={{ fontSize: 11.5 }}>{ago(r.last_reply_at)}</span></div>
        <div className="row" style={{ marginTop: 3 }}>{(r.needs_reply || (r as C & { needs_human?: boolean }).needs_human) && <span className="dot" />}{(r as C & { needs_human?: boolean }).needs_human && <span className="tag warn">нужен человек</span>}{r.reply_label && <span className={`tag ${LABELS[r.reply_label]?.tag ?? ""}`}>{LABELS[r.reply_label]?.name ?? r.reply_label}</span>}{schedSet.has(r.id) && <span className="tag lime">автопилот</span>}{r.registered_at && <span className="tag good">зарегался</span>}</div></Link>)}
        {!rows.length && <p className="muted" style={{ padding: 14 }}>{f === "human" ? "Никого. Автопилот справляется сам." : f === "wait" ? "Все переписки обработаны." : "Ответов пока нет."}</p>}</div>
      {cur ? <div key={cur.id} className="dlg-main">
        <div className="dlg-head"><CampaignBadge ids={cur.inst_campaign_id?[cur.inst_campaign_id]:[]}/><a href="/inbox?source=apify" className="dlg-back">← Все диалоги</a><div className="row" style={{ justifyContent: "space-between" }}><div className="row">{cur.avatar_url && <img className="ava-s" src={cur.avatar_url} alt="" referrerPolicy="no-referrer" />}<div><a className="l" href={`/creators/${cur.id}`}><b>@{cur.handle}</b></a> <span className="muted">· {cur.email} · {n(cur.followers)} подп.</span><div className="muted" style={{ fontSize: 12 }}>{cur.registered_at ? (cur.profile_done_at ? "Зарегался и заполнил профиль" : "Зарегался, профиль не заполнен") : "На Promy пока не зарегистрирован"}{cur.eaccount ? ` · пишем с ${cur.eaccount}` : ""}</div></div></div>
          <form action={setLabel} className="row"><input type="hidden" name="creator" value={cur.id} /><input type="hidden" name="back" value={`/inbox?source=apify&c=${cur.id}`} /><select className="in" name="label" defaultValue={cur.reply_label ?? ""} aria-label="Метка">{!cur.reply_label && <option value="">Без метки</option>}{Object.entries(LABELS).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}</select><Submit>Сменить</Submit></form></div></div>
        <div className="dlg-ai mail-reply-flow"><section className="mail-latest"><h3>Последнее письмо креатора · {mailDate(incoming?.at)}</h3><p className="draft-email-text">{incoming?.body||'В локальной истории пока нет входящего письма.'}</p></section><MailReplyPanel key={cur.id+':'+emailId} source="apify" emailId={emailId} creatorId={cur.id} recipient={cur.email} account={cur.eaccount||'Ящик проверится по исходной переписке'} incomingAt={incoming?.at} initial={proposal} canPrepare={!!emailId&&cur.needs_reply}/><details className="mail-history"><summary>Вся переписка · {(msgs||[]).length} писем · новые сверху</summary><div className="dlg-body">{[...(msgs||[])].reverse().map(m=><div key={m.id} className={`b ${m.direction==='out'?'out':''}`}><div className="b-who">{m.direction==='out'?'Promy':'Креатор'} · {mailDate(m.at)}</div>{m.body}</div>)}</div></details></div>
      </div> : <div className="dlg-main" style={{ display: "grid", placeItems: "center" }}><p className="muted">Выбери диалог</p></div>}
    </div></div>;
}

