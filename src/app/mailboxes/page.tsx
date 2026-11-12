import { getSettings } from "@/lib/settings";
import { listAccounts, mailboxHealth, type Mailbox } from "@/lib/instantly";
import { showPct } from "@/lib/format";

const STATUS: Record<number, [string, string]> = { 1: ["работает", "good"], 2: ["на паузе", "warn"], [-1]: ["ошибка подключения", "bad"], [-2]: ["ошибка отправки", "bad"], [-3]: ["ошибка", "bad"] };
export default async function Mailboxes() {
  const s = await getSettings();
  let boxes: Mailbox[] = []; let err = "";
  if (s.instantly_key) boxes = await listAccounts().catch((e) => { err = String(e).slice(0, 200); return []; });
  const { by } = await mailboxHealth(false);
  const mine = boxes.filter((b) => s.senders.includes(b.email)); const other = boxes.filter((b) => !s.senders.includes(b.email));
  const Row = ({ b }: { b: Mailbox }) => { const m = by[b.email] ?? { sent: 0, bounced: 0, opened: 0 }; const br = m.sent ? (m.bounced / m.sent) * 100 : 0; const st = STATUS[b.status ?? 0] ?? ["?", ""];
    return <tr><td><b>{b.email}</b><div className="muted" style={{ fontSize: 12 }}>{[b.first_name, b.last_name].filter(Boolean).join(" ")}</div></td><td><span className={`tag ${st[1]}`}>{st[0]}</span></td><td className="num">{b.stat_warmup_score ?? "—"}</td><td className="num">{b.daily_limit ?? "—"}</td><td className="num">{m.sent}</td><td className="num">{showPct(m.opened, m.sent)}</td><td className="num"><span className={br > s.bounce_pause_pct ? "bad-n" : br > 2 ? "" : ""}>{showPct(m.bounced, m.sent)}</span></td><td>{br > s.bounce_pause_pct && m.sent >= 40 ? <span className="tag bad">много баунсов</span> : (b.stat_warmup_score ?? 100) < 80 ? <span className="tag warn">слабый прогрев</span> : <span className="tag good">ок</span>}</td></tr>; };
  const head = <thead><tr><th>Ящик</th><th>Статус</th><th className="num">Прогрев</th><th className="num">Лимит/день</th><th className="num">Писем за 14 дн</th><th className="num">Открытия</th><th className="num">Баунсы</th><th></th></tr></thead>;
  return <div className="flex flex-col gap-4">
    <div><h1>Ящики</h1><p className="sub">Здоровье ящиков, с которых пишем креаторам. Если у ящика баунсов больше {s.bounce_pause_pct}% (от 40 писем), автоматика ставит его на паузу, чтобы не сжечь домен. Баунсы растут, когда почта в био старая: поэтому берём только тех, кто постил за последние {s.fresh_days} дн.</p></div>
    {err && <div className="errbox">{err}</div>}
    {!s.instantly_key && <div className="note">Нет ключа Instantly: Настройки → Ключи.</div>}
    <section className="panel tw"><div style={{ padding: "14px 14px 4px" }}><h2>Пишем с них</h2></div><table className="t">{head}<tbody>{mine.map((b) => <Row key={b.email} b={b} />)}</tbody></table>{!mine.length && <p className="muted" style={{ padding: 14 }}>Ящики не выбраны: Настройки → Отправка.</p>}</section>
    {other.length > 0 && <details className="panel set"><summary>Остальные ящики в Instantly ({other.length})</summary><div className="tw" style={{ marginTop: 10 }}><table className="t">{head}<tbody>{other.map((b) => <Row key={b.email} b={b} />)}</tbody></table></div></details>}
  </div>;
}
