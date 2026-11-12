import { db } from "@/lib/db";
import { fmtTime } from "@/lib/format";
export default async function Log() {
  const { data } = await db.from("activity_log").select("id,actor,action,summary,created_at,creator_id").order("created_at", { ascending: false }).limit(300);
  return <div className="flex flex-col gap-4"><div><h1>Журнал</h1><p className="sub">Что делали люди и автоматика. Ошибки тоже здесь.</p></div>
    <div className="panel tw"><table className="t"><thead><tr><th>Когда</th><th>Кто</th><th>Что</th></tr></thead><tbody>{(data ?? []).map((l) => <tr key={l.id}><td className="muted" style={{ whiteSpace: "nowrap" }}>{fmtTime(l.created_at)}</td><td>{l.actor}</td><td>{/failed|error/.test(l.action) ? <span className="tag bad" style={{ marginRight: 6 }}>ошибка</span> : null}{l.creator_id ? <a className="l" href={`/creators/${l.creator_id}`}>{l.summary}</a> : l.summary}</td></tr>)}</tbody></table></div></div>;
}
