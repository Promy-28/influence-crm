import { db } from "@/lib/db";
import { agreement } from "@/lib/sourcing";
import { getSettings } from "@/lib/settings";
import { FLAG_TEXT } from "@/lib/normalize";
import { ReviewDeck, type Card } from "@/components/ReviewDeck";
import { TabLink, Submit, PickAll } from "@/components/ui";
import { decideForm, bulkDecide } from "@/lib/actions";
import { n, ago } from "@/lib/format";

const COLS = "id,platform,handle,name,bio,email,email_source,profile_url,avatar_url,followers,likes,posts_7d,avg_views,last_post_at,region,ai_score,ai_verdict,ai_reasons,ai_line,ai_us,ai_english,rule_flags,recent_posts,bio_link,reject_reason,reviewed_by,queries(kind,value)";
type Row = Card & { reject_reason: string | null; reviewed_by: string | null; queries: { kind: string; value: string } | null };
const toCard = (r: Row): Card => ({ ...r, query: r.queries ? `${r.queries.kind === "hashtag" ? "#" : ""}${r.queries.value}` : null });

export default async function Review({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const sp = await searchParams; const t = sp.t ?? "deck";
  const c = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0;
  const [pending, unscored, auto, s, ag] = await Promise.all([
    c(db.from("creators").select("id", { count: "exact", head: true }).eq("review_status", "pending").not("email", "is", null).not("ai_at", "is", null)),
    c(db.from("creators").select("id", { count: "exact", head: true }).eq("review_status", "pending").is("ai_at", null)),
    c(db.from("creators").select("id", { count: "exact", head: true }).eq("review_status", "auto_rejected").gte("created_at", new Date(Date.now() - 7 * 864e5).toISOString())),
    getSettings(), agreement(),
  ]);
  const head = <div className="flex flex-col gap-3">
    <div><h1>Проверка креаторов</h1><p className="sub">Смотришь глазами и решаешь, кому писать. Каждое решение учит AI: он видит твои последние одобрения и отказы с причинами и подстраивает оценку.</p></div>
    <div className="row"><div className="tabs"><TabLink href="/review" on={t === "deck"}>Карточки<span className="tab-n">{pending}</span></TabLink><TabLink href="/review?t=table" on={t === "table"}>Таблицей</TabLink><TabLink href="/review?t=auto" on={t === "auto"}>Отсеяно автоматически<span className="tab-n">{auto}</span></TabLink><TabLink href="/review?t=done" on={t === "done"}>Решения</TabLink></div>
      <span className="keys muted" style={{ fontSize: 12.5 }}><span className="kbd">A</span> писать <span className="kbd">R</span> не подходит <span className="kbd">S</span> пропустить <span className="kbd">Z</span> отменить <span className="kbd">O</span> профиль</span></div>
    <div className="row" style={{ fontSize: 13 }}>
      {unscored > 0 && <span className="tag">AI ещё оценивает: {unscored}</span>}
      {ag.high >= 20 && ag.precision !== null && <span className={`tag ${ag.precision >= 0.9 ? "lime" : ""}`}>Точность AI при оценке ≥{s.auto_approve_score}: {Math.round(ag.precision * 100)}% из {ag.high}{ag.precision >= 0.9 && !s.auto_approve ? ", можно включить автоодобрение в Настройках" : ""}</span>}
      {ag.high < 20 && <span className="muted">Чтобы понять, можно ли доверить AI одобрение, нужно 20+ твоих решений по креаторам с оценкой ≥{s.auto_approve_score}. Сейчас {ag.high}.</span>}
      {s.auto_approve && <span className="tag good">Автоодобрение включено: оценка ≥ {s.auto_approve_score}</span>}
    </div></div>;

  if (t === "deck") {
    const { data } = await db.from("creators").select(COLS).eq("review_status", "pending").not("email", "is", null).not("ai_at", "is", null).order("ai_score", { ascending: false, nullsFirst: false }).order("created_at").limit(80);
    return <div className="flex flex-col gap-4">{head}<ReviewDeck initial={((data ?? []) as unknown as Row[]).map(toCard)} flagText={FLAG_TEXT} /></div>;
  }
  const status = t === "auto" ? ["auto_rejected"] : t === "done" ? ["approved", "rejected"] : ["pending"];
  const b = db.from("creators").select(COLS).in("review_status", status).not("email", "is", null);
  const q = t === "done" ? b.not("reviewed_by", "is", null).order("reviewed_at", { ascending: false }) : t === "auto" ? b.order("created_at", { ascending: false }) : b.order("ai_score", { ascending: false, nullsFirst: false });
  const { data } = await q.limit(200);
  const rows = (data ?? []) as unknown as Row[];
  return <div className="flex flex-col gap-4">{head}
    {t === "auto" && <p className="muted" style={{ fontSize: 13 }}>Сюда попадают отсеянные правилами (нет UGC в био, давно не постит, не США...) и AI. Пролистай иногда: если видишь хорошего креатора, верни его, и подумай, не ослабить ли правило в Настройках.</p>}
    <form action={bulkDecide} className="panel tw"><input type="hidden" name="back" value={`/review?t=${t}`} />
      {t === "table" && <div className="row" style={{ padding: 12 }}><Submit className="btn-p" formAction={bulkDecide}>Писать выбранным</Submit><input type="hidden" name="decision" value="approved" /></div>}
      <table className="t t-cards"><thead><tr>{t === "table" && <th><PickAll name="id" /></th>}<th>Креатор</th><th>Описание</th><th className="num">Подписчики</th><th>Последний пост</th><th className="num">AI</th><th>{t === "pending" || t === "table" ? "" : "Решение"}</th><th></th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.id}>{t === "table" && <td><input type="checkbox" name="id" value={r.id} aria-label="Выбрать" /></td>}
          <td><a className="l" href={r.profile_url ?? "#"} target="_blank" rel="noreferrer">@{r.handle}</a><div className="muted" style={{ fontSize: 12 }}>{r.platform === "tiktok" ? "TikTok" : "Instagram"} · {r.email}</div></td>
          <td><div className="desc">{r.bio}</div>{r.ai_reasons && <div className="muted desc">AI: {r.ai_reasons}</div>}</td>
          <td className="num">{n(r.followers)}</td><td>{ago(r.last_post_at)}</td><td className="num">{r.ai_score ?? "—"}</td>
          <td>{r.reject_reason ? <span className="tag bad">{r.reject_reason.replace(/^auto:/, "правило: ").replace(/^ai:/, "AI: ")}</span> : r.reviewed_by ? <span className="tag good">одобрен ({r.reviewed_by})</span> : null}</td>
          <td><div className="row">{t !== "table" && <><button className="btn" formAction={decideForm} name="id" value={r.id}>{t === "done" ? "Вернуть в проверку" : "В проверку"}</button></>}</div></td></tr>)}</tbody></table>
      {t !== "table" && <input type="hidden" name="decision" value="pending" />}
      {!rows.length && <p className="muted" style={{ padding: 16 }}>Пусто.</p>}
    </form></div>;
}
