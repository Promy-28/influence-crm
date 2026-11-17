import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { LABELS } from "@/lib/replies";
import { fmtTime, ago, n } from "@/lib/format";
import { TabLink, Submit } from "@/components/ui";
import { doneDialog, manualReply, redraft, relabel, sendDraftAction, setLabel, skipDraft } from "@/lib/actions";

type C = { id: string; handle: string; name: string | null; email: string; avatar_url: string | null; platform: string; profile_url: string | null; followers: number | null; reply_label: string | null; last_reply_at: string | null; needs_reply: boolean; registered_at: string | null; profile_done_at: string | null; ref_code: string | null; eaccount: string | null; bio: string | null };
export default async function Inbox({ searchParams }: { searchParams: Promise<{ c?: string; f?: string; err?: string; page?: string }> }) {
  const sp = await searchParams; const page=Math.max(0,Number(sp.page)||0); const s0 = await getSettings(); const f = sp.f ?? ("all");
  const base = db.from("creators").select("id,handle,name,email,avatar_url,platform,profile_url,followers,reply_label,last_reply_at,needs_reply,registered_at,profile_done_at,ref_code,eaccount,bio,human_reason,needs_human").or("first_sent_at.not.is.null,replied_at.not.is.null").order("last_reply_at", { ascending: false, nullsFirst: false }).range(page*100,page*100+99);
  const q = f === "human" ? base.eq("needs_human", true) : f === "wait" ? base.eq("needs_reply", true) : f === "pos" ? base.not("positive_at", "is", null) : base;
  const [{ data: list }, { count: waiting }, { data: sched }, { count: human }] = await Promise.all([q, db.from("creators").select("id", { count: "exact", head: true }).eq("needs_reply", true), db.from("drafts").select("creator_id").eq("status", "scheduled"), db.from("creators").select("id", { count: "exact", head: true }).eq("needs_human", true)]);
  const s = s0;
  const rows = (list ?? []) as C[];
  const cur = rows.find((r) => r.id === sp.c) ?? (sp.c ? ((await db.from("creators").select("id,handle,name,email,avatar_url,platform,profile_url,followers,reply_label,last_reply_at,needs_reply,registered_at,profile_done_at,ref_code,eaccount,bio,human_reason,needs_human").eq("id", sp.c).maybeSingle()).data as C | null) : rows[0]);
  const next = rows[rows.findIndex((r) => r.id === cur?.id) + 1]?.id ?? "";
  const [{ data: msgs }, { data: draft }] = cur ? await Promise.all([db.from("messages").select("id,direction,body,subject,at,sent_by,via,label").eq("creator_id", cur.id).order("at").limit(100), db.from("drafts").select("*").eq("creator_id", cur.id).in("status", ["new", "scheduled"]).order("created_at", { ascending: false }).limit(1).maybeSingle()]) : [{ data: [] }, { data: null }];
  const schedSet = new Set((sched ?? []).map((d) => d.creator_id));
  const L = cur?.reply_label ? LABELS[cur.reply_label] : null;
  const link = cur?.ref_code ? s.signup_url.replace("{code}", cur.ref_code) : null;
  return <div className="flex flex-col gap-3 dlg-page">
    <div className="dlg-top"><h1>Диалоги</h1><p className="sub">AI читает ответ, ставит метку и пишет черновик. Ты правишь и отправляешь, письмо уходит в ту же ветку с того же ящика. Твои правки AI учитывает в следующих черновиках. {s.autopilot ? `Автопилот включён: AI отвечает сам через ${s.autopilot_delay_min} мин. Сюда, во вкладку «Нужен человек», и в Telegram попадают только сложные случаи.` : "Автопилот выключен: всё отправляешь ты."}</p></div>
    <div className="tabs dlg-filters"><TabLink href="/inbox?source=found&f=human" on={f === "human"}>Нужен человек<span className="tab-n">{human ?? 0}</span></TabLink><TabLink href="/inbox?source=found&f=wait" on={f === "wait"}>Ждут ответа<span className="tab-n">{waiting ?? 0}</span></TabLink><TabLink href="/inbox?source=found&f=pos" on={f === "pos"}>С интересом</TabLink><TabLink href="/inbox?source=found&f=all" on={f === "all"}>Все переписки</TabLink></div>
    {sp.err && <div className="errbox">{sp.err}</div>}
    <div className="row">{page>0&&<a className="btn" href={`/inbox?source=found&f=${f}&page=${page-1}`}>← Назад</a>}{rows.length===100&&<a className="btn" href={`/inbox?source=found&f=${f}&page=${page+1}`}>Следующие 100 →</a>}</div>
    <div className={`panel dlg ${cur ? "has-chat" : ""}`}>
      <div className="dlg-list">{rows.map((r) => <a key={r.id} href={`/inbox?source=found&c=${r.id}&f=${f}`} className={`dlg-i ${r.id === cur?.id ? "on" : ""}`}>
        <div className="row" style={{ justifyContent: "space-between" }}><b>{r.name||r.handle}</b><div className="mail-address">{r.email}</div><span className="muted" style={{ fontSize: 11.5 }}>{ago(r.last_reply_at)}</span></div>
        <div className="row" style={{ marginTop: 3 }}>{(r.needs_reply || (r as C & { needs_human?: boolean }).needs_human) && <span className="dot" />}{(r as C & { needs_human?: boolean }).needs_human && <span className="tag warn">нужен человек</span>}{r.reply_label && <span className={`tag ${LABELS[r.reply_label]?.tag ?? ""}`}>{LABELS[r.reply_label]?.name ?? r.reply_label}</span>}{schedSet.has(r.id) && <span className="tag lime">автопилот</span>}{r.registered_at && <span className="tag good">зарегался</span>}</div></a>)}
        {!rows.length && <p className="muted" style={{ padding: 14 }}>{f === "human" ? "Никого. Автопилот справляется сам." : f === "wait" ? "Все переписки обработаны." : "Ответов пока нет."}</p>}</div>
      {cur ? <div className="dlg-main">
        <div className="dlg-head"><a href="/inbox" className="dlg-back">← Все диалоги</a><div className="row" style={{ justifyContent: "space-between" }}><div className="row">{cur.avatar_url && <img className="ava-s" src={cur.avatar_url} alt="" referrerPolicy="no-referrer" />}<div><a className="l" href={`/creators/${cur.id}`}><b>@{cur.handle}</b></a> <span className="muted">· {cur.email} · {n(cur.followers)} подп.</span><div className="muted" style={{ fontSize: 12 }}>{cur.registered_at ? (cur.profile_done_at ? "Зарегался и заполнил профиль" : "Зарегался, профиль не заполнен") : "На Promy пока не зарегистрирован"}{cur.eaccount ? ` · пишем с ${cur.eaccount}` : ""}</div></div></div>
          <form action={setLabel} className="row"><input type="hidden" name="creator" value={cur.id} /><input type="hidden" name="back" value={`/inbox?source=found&c=${cur.id}`} /><select className="in" name="label" defaultValue={cur.reply_label ?? ""} aria-label="Метка">{!cur.reply_label && <option value="">Без метки</option>}{Object.entries(LABELS).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}</select><Submit>Сменить</Submit></form></div></div>
        <div className="dlg-body">{(msgs ?? []).map((m) => <div key={m.id} className={`b ${m.direction === "out" ? "out" : ""}`}>{m.direction === "out" && m.sent_by && <div className="b-who">{m.sent_by}</div>}{m.subject && m.direction === "in" && <div className="b-who">{m.subject}</div>}{m.body}<time>{fmtTime(m.at)}</time></div>)}</div>
        <div className="dlg-ai">
          {(cur as C & { human_reason?: string | null }).human_reason && <div className="note" style={{ marginBottom: 8 }}>Нужен человек: {(cur as C & { human_reason?: string | null }).human_reason}</div>}
          {L && <div className="row" style={{ marginBottom: 8 }}><span className={`tag ${L.tag}`}>{L.name}</span>{draft?.summary && <span className="muted" style={{ fontSize: 13 }}>{draft.summary}</span>}{draft?.confidence != null && <span className="muted" style={{ fontSize: 12 }}>уверенность {Math.round(Number(draft.confidence) * 100)}%</span>}</div>}
          {draft ? <form action={sendDraftAction} className="flex flex-col gap-2"><input type="hidden" name="id" value={draft.id} /><input type="hidden" name="creator" value={cur.id} /><input type="hidden" name="next" value={next} />
            {draft.status === "scheduled" && <div className="note">Автопилот отправит это {fmtTime(draft.send_after)}. Нажми «Отправить» сейчас, поправь или пропусти.</div>}
            <textarea className="in" name="body" rows={8} defaultValue={draft.body} aria-label="Черновик ответа" />
            <div className="row"><Submit className="btn-p">Отправить</Submit><Submit formAction={skipDraft}>Не отвечать</Submit>{link && <span className="muted" style={{ fontSize: 12 }}>Ссылка креатора: {link}</span>}</div>
          </form> : cur.needs_reply ? <div className="flex flex-col gap-2"><p className="muted">{s.openai_key ? "Черновика нет (или метка не требует ответа)." : "Нет ключа OpenAI: черновики не пишутся."}</p><form action={relabel}><input type="hidden" name="creator" value={cur.id} /><Submit>Разобрать ответ AI ещё раз</Submit></form></div> : null}
          <details style={{ marginTop: 10 }}><summary className="muted" style={{ cursor: "pointer", fontSize: 13 }}>Переписать черновик по указанию или ответить вручную</summary>
            <form action={redraft} className="row" style={{ marginTop: 8 }}><input type="hidden" name="creator" value={cur.id} /><input className="in" name="instruction" placeholder="Например: короче, предложи созвон, ответь про оплату" style={{ flex: 1, minWidth: 220 }} aria-label="Указание для AI" /><Submit>Переписать</Submit></form>
            <form action={manualReply} className="flex flex-col gap-2" style={{ marginTop: 8 }}><input type="hidden" name="creator" value={cur.id} /><textarea className="in" name="body" rows={4} placeholder="Свой ответ, уйдёт в ту же ветку" aria-label="Свой ответ" /><div className="row"><Submit>Отправить свой ответ</Submit></div></form>
            {cur.needs_reply && <form action={doneDialog} style={{ marginTop: 8 }}><input type="hidden" name="creator" value={cur.id} /><Submit>Отметить как обработанный</Submit></form>}
          </details>
        </div>
      </div> : <div className="dlg-main" style={{ display: "grid", placeItems: "center" }}><p className="muted">Выбери диалог</p></div>}
    </div></div>;
}

