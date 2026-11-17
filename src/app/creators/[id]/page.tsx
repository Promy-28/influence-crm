import CampaignBadge from '@/components/CampaignBadge';
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { LABELS } from "@/lib/replies";
import { stage, fmtTime, n, ago, PLATFORM } from "@/lib/format";
import { CopyButton, Submit } from "@/components/ui";
import { decideForm, markStage, saveNote, setDnc } from "@/lib/actions";

export default async function Creator({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ data: c }, { data: msgs }, { data: logs }, s] = await Promise.all([
    db.from("creators").select("*, arms(label,name), queries(kind,value)").eq("id", id).maybeSingle(),
    db.from("messages").select("id,direction,body,subject,at,sent_by").eq("creator_id", id).order("at"),
    db.from("activity_log").select("actor,summary,created_at").eq("creator_id", id).order("created_at", { ascending: false }).limit(30),
    getSettings(),
  ]);
  if (!c) notFound();
  const [label, tag] = stage(c);
  const arm = c.arms as { label: string; name: string } | null; const q = c.queries as { kind: string; value: string } | null;
  const link = c.ref_code ? s.signup_url.replace("{code}", c.ref_code) : null;
  const tl: [string, string | null][] = [["Найден", c.created_at], ["Одобрен", c.review_status === "approved" ? c.reviewed_at : null], ["Отправлен в Instantly", c.queued_at], ["Первое письмо", c.first_sent_at], ["Открыл", c.opened_at], ["Ответил", c.replied_at], ["Интерес", c.positive_at], ["Зарегистрировался на Promy", c.registered_at], ["Заполнил профиль", c.profile_done_at], ["Первое видео", c.first_video_at]];
  return <div className="flex flex-col gap-4" style={{ maxWidth: 1100 }}>
    <div className="row" style={{ gap: 14 }}>{c.avatar_url ? <img className="ava" src={c.avatar_url} alt="" referrerPolicy="no-referrer" /> : <div className="ava" />}
      <div><h1>@{c.handle}</h1><CampaignBadge ids={c.inst_campaign_id?[c.inst_campaign_id]:[]}/><div className="row" style={{ marginTop: 6 }}><span className={`tag ${tag}`}>{label}</span><span className="tag">{PLATFORM[c.platform]}</span>{arm && <span className="tag">вариант {arm.label}: {arm.name}</span>}{c.reply_label && <span className={`tag ${LABELS[c.reply_label]?.tag ?? ""}`}>{LABELS[c.reply_label]?.name}</span>}{c.do_not_contact && <span className="tag bad">не писать</span>}</div></div></div>
    <div className="two">
      <div className="flex flex-col gap-3">
        <section className="panel card">
          <div className="row"><a className="l" href={c.profile_url ?? "#"} target="_blank" rel="noreferrer">Открыть профиль</a><span className="muted">{c.email}</span><CopyButton text={c.email ?? ""} label="Скопировать почту" /></div>
          <div className="bio">{c.bio || "Описание пустое"}</div>
          <div className="facts2"><div className="fact"><b>{n(c.followers)}</b><span>подписчиков</span></div><div className="fact"><b>{ago(c.last_post_at)}</b><span>последний пост</span></div><div className="fact"><b>{n(c.avg_views)}</b><span>средние просмотры</span></div><div className="fact"><b>{c.ai_score ?? "—"}</b><span>оценка AI</span></div><div className="fact"><b>{c.videos}</b><span>видео на Promy</span></div></div>
          {c.ai_reasons && <div className="ai"><b>AI:</b> {c.ai_reasons}{c.ai_line && <div className="muted" style={{ marginTop: 4 }}>Первая строка: «{c.ai_line}»</div>}</div>}
          {c.reject_reason && <div className="note">Причина отказа: {c.reject_reason}</div>}
          <div className="muted" style={{ fontSize: 12.5 }}>Источник: {q ? `${q.kind === "hashtag" ? "#" : ""}${q.value}` : c.source}{link && <> · ссылка на регистрацию: <a className="l" href={link} target="_blank" rel="noreferrer">{link}</a></>}{c.eaccount && ` · пишем с ${c.eaccount}`}</div>
        </section>
        <section className="panel" style={{ padding: 18 }}><h2>Переписка</h2>{msgs?.length ? <div className="flex flex-col gap-2" style={{ marginTop: 10 }}>{msgs.map((m) => <div key={m.id} className={`b ${m.direction === "out" ? "out" : ""}`} style={{ maxWidth: "100%" }}>{m.sent_by && <div className="b-who">{m.sent_by}</div>}{m.body}<time>{fmtTime(m.at)}</time></div>)}<a className="btn" href={`/inbox?c=${c.id}&f=all`} style={{ width: "fit-content" }}>Открыть в диалогах</a></div> : <p className="muted" style={{ marginTop: 6 }}>Ответов не было. Письма цепочки видны в Instantly.</p>}</section>
      </div>
      <div className="flex flex-col gap-3">
        <section className="panel" style={{ padding: 18 }}><h2>История</h2><div className="timeline" style={{ marginTop: 10 }}>{tl.map(([t, d]) => <div key={t} className={`tl ${d ? "done" : ""}`}><i /><span className="muted">{d ? fmtTime(d) : "—"}</span><span>{t}</span></div>)}</div></section>
        <section className="panel" style={{ padding: 18 }}><h2>Действия</h2>
          <p className="muted" style={{ fontSize: 12.5, margin: "4px 0 8px" }}>Если Promy не прислал событие сам, отметь вручную.</p>
          <div className="row">{!c.registered_at && <form action={markStage}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="stage" value="registered" /><Submit>Зарегистрировался</Submit></form>}
            {!c.profile_done_at && <form action={markStage}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="stage" value="profile_completed" /><Submit>Заполнил профиль</Submit></form>}
            <form action={markStage}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="stage" value="video" /><Submit>+1 видео</Submit></form></div>
          <div className="row" style={{ marginTop: 10 }}><form action={setDnc}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="on" value={c.do_not_contact ? "0" : "1"} /><Submit>{c.do_not_contact ? "Снять «не писать»" : "Не писать больше"}</Submit></form>
            {!c.queued_at && c.review_status !== "approved" && c.review_status !== "existing" && <form action={decideForm}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="decision" value="approved" /><input type="hidden" name="back" value={`/creators/${c.id}`} /><Submit className="btn-p">Одобрить</Submit></form>}</div>
          <form action={saveNote} className="flex flex-col gap-2" style={{ marginTop: 12 }}><input type="hidden" name="id" value={c.id} /><textarea className="in" name="notes" rows={3} defaultValue={c.notes ?? ""} placeholder="Заметка" aria-label="Заметка" /><div><Submit>Сохранить заметку</Submit></div></form>
        </section>
        {!!logs?.length && <section className="panel" style={{ padding: 18 }}><h2>Журнал</h2>{logs.map((l, i) => <div key={i} className="q-log"><span>{l.summary}</span><span className="muted">{l.actor} · {fmtTime(l.created_at)}</span></div>)}</section>}
      </div>
    </div></div>;
}
