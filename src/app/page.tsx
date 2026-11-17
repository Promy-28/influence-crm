import {db} from '@/lib/db';
import {mailSnapshot,redditDirectory} from '@/lib/hub-data';
import {draftWorkspace} from '@/lib/draft-workspace';
import {workspaceMode} from '@/lib/workspace-mode';
export default async function Home(){
 const source=await workspaceMode(),apify=source==='apify';
 const [workspace,stats]=await Promise.all([draftWorkspace(source),apify?(async()=>{const [total,waiting]=await Promise.all([db.from('creators').select('id',{count:'exact',head:true}).eq('source','apify'),db.from('creators').select('id',{count:'exact',head:true}).eq('source','apify').eq('needs_reply',true)]);return {total:total.count||0,waiting:waiting.count||0}})():(async()=>{const [directory,mail]=await Promise.all([redditDirectory(),mailSnapshot()]);return {total:directory.length,waiting:mail.threads.filter((t:any)=>t.state==='waiting_on_us').length}})()]);
 const ready=workspace.drafts.filter((d:any)=>d.status==='draft').length,decisions=workspace.jobs.filter((j:any)=>j.requiresClarification||j.status==='completed').length;
 return <div className="hub-stack">
 <header className="hub-heading"><div><h1>Рабочий стол</h1><p className="sub">{apify?'Apify · найденные в TikTok / Instagram':'Reddit и Google-форма'} · одна база на всех рабочих страницах.</p></div><a className="btn" href="/guide">Как пользоваться</a></header>
 <section className="hub-next panel"><div><span className="hub-eyebrow">Следующее действие</span><h2>Разобрать ответы креаторам</h2><p>Читай исходное письмо, правь черновик и отмечай готовые ответы. Пачка — до 30, отправка только после подтверждения.</p></div><a className="btn-p" href="/drafts">Открыть черновики →</a></section>
 <div className="hub-kpis">{[[stats.total,'Креаторов','/creators'],[stats.waiting,'Ждут нашего ответа','/inbox'],[ready,'Черновиков на проверке','/drafts'],[decisions,'Требуют решения','/drafts']].map(([n,label,href])=><a className="panel hub-kpi" href={String(href)} key={String(label)}><b>{n}</b><span>{label}</span></a>)}</div>
 <section className="panel hub-section"><h2>Три шага</h2><div className="hub-steps"><a href="/creators"><span>1</span><b>Креаторы</b><p>Email, портфолио, оценка и причина выбора.</p></a><a href="/inbox"><span>2</span><b>Почта</b><p>Полная переписка и инструкция для отдельного ответа.</p></a><a href="/drafts"><span>3</span><b>Черновики</b><p>Проверка пачки, правки и подтверждение выбранных писем.</p></a></div></section>
 <div className="note">Переключатель сверху меняет базу сразу для креаторов, почты и черновиков. Reply сохраняет имя, подпись и оригинальный баннер. Для отдельной задачи — <a className="l" href="https://t.me/influencerpromybot" target="_blank" rel="noreferrer">Telegram-бот ↗</a>.</div>
 </div>;
}
