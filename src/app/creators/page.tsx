import CreatorTikTok from '@/components/CreatorTikTok';
import CampaignBadge from '@/components/CampaignBadge';
import CreatorReviewControl from '@/components/CreatorReviewControl';
import {creatorProgress} from '@/lib/creator-progress';
import {creatorReviewState} from '@/lib/creator-progress';
import {creatorCampaigns} from '@/lib/hub-data';
import {workspaceMode} from '@/lib/workspace-mode';
import {mailSource} from '@/lib/mail-source';
import FoundCreators from '@/components/FoundCreators';
import {redditDirectory,mailSnapshot,contactThreads,RATINGS,ratingClass,safeLinks,sourceSheet} from '@/lib/hub-data';
import {saveCreatorChoice,requestCreatorReviews,checkRedditForm} from '@/lib/hub-actions';
import {Filters,Submit,PickAll} from '@/components/ui';
export const maxDuration=60;
export default async function Creators({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
 const sp=await searchParams,source=(sp.source?mailSource(sp.source):await workspaceMode())==='apify'?'found':'reddit';

 if(source==='found')return <div className="hub-stack"><div className="note">Этих креаторов нашли через поиск TikTok / Instagram. Источник и запрос указаны в таблице. <a className="l" href="/review">Проверить найденных →</a></div><FoundCreators searchParams={searchParams}/></div>;
 const [all,mail,membership]=await Promise.all([redditDirectory(),mailSnapshot(),creatorCampaigns()]);const contacts=contactThreads(mail.threads);
 const query=(sp.q||'').toLowerCase();const rows=all.filter(c=>{const state=creatorReviewState(c),checked=['great','maybe','no'].includes(state);return (!sp.review||sp.review==='all'||(sp.review==='checked'?checked:sp.review==='remaining'?!checked:state===sp.review))&&(!sp.rating||c.rating===sp.rating)&&(!query||[c.email,c.payload.name,c.payload.reddit].join(' ').toLowerCase().includes(query))});
 const page=Math.max(0,Number(sp.page)||0),shown=rows.slice(page*50,page*50+50);
 return <div className="hub-stack">
  <header className="hub-heading"><div><h1>Креаторы</h1><p className="sub">Проверяй качество, сохраняй причину выбора и переходи к переписке.</p></div><a className="btn" href="/guide">Как работать</a></header>
  {sp.msg&&<div className="okbox" role="status">{sp.msg}</div>}
  <CreatorReviewControl initialCounts={creatorProgress(all)}/>
  <div className="hub-toolbar"><span>{all.length} креаторов · исходные цвета и новые заявки из формы</span><a className="l" href={sourceSheet} target="_blank" rel="noreferrer">Исходная таблица ↗</a><a className="btn" href="/import?source=reddit">Добавить из Reddit</a></div>
  <Filters><input type="hidden" name="source" value="reddit"/>{sp.review&&<input type="hidden" name="review" value={sp.review}/>}<input className="in" name="q" defaultValue={sp.q} placeholder="Имя, Reddit или email" aria-label="Поиск креаторов"/><select className="in" name="rating" defaultValue={sp.rating||''} aria-label="Твой выбор"><option value="">Все цвета</option>{Object.entries(RATINGS).filter(([k])=>k!=='unverified').map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></Filters>
  <form action={requestCreatorReviews} id="batch-review" className="hub-toolbar"><Submit className="btn-p">Проверить выбранных с видео и звуком</Submit><span className="muted">До 20 за час · результат здесь и в Telegram</span></form>
  <div className="panel tw"><table className="t hub-creators"><thead><tr><th><PickAll name="id"/></th><th>Креатор / email</th><th>Твой выбор</th><th>Проверка видео</th><th>Цена из формы</th><th>Почта</th></tr></thead><tbody>{shown.map(c=>{const p=c.payload,a=p.browserReview?.completed&&p.browserReview.sourceFingerprint===(p.sourceFingerprint||null)?p.browserReview:p.assessment,t=contacts.get(c.email.toLowerCase());return <tr key={c.id}>
   <td><input type="checkbox" name="id" value={c.id} form="batch-review" disabled={c.legacy} aria-label={'Проверить '+c.email}/></td>
   <td><b>{p.name||p.reddit||c.email}</b><div className="mail-address">{c.email}</div><CampaignBadge ids={[...(membership.get(c.email?.toLowerCase())||[])]}/><div className="muted">{p.country||'Страна не указана'} · {c.legacy?'Старая таблица':'Reddit / форма'}</div><div className="row">{safeLinks(p.profile+' '+p.videos).map((url,i)=><a className="l" key={url} href={url} target="_blank" rel="noreferrer">{i?'Образец':'Портфолио'} ↗</a>)}</div>{!c.legacy&&/tiktok\.com\//i.test([p.videos,p.profile,p.autonomousReview?.postUrl].join(' '))&&<CreatorTikTok id={c.id}/>}</td>
   <td><span className={'tag '+ratingClass(c.rating)}>{RATINGS[c.rating]||'Не проверен'}</span><p className="hub-small">{c.reason||'Причина пока не записана'}</p>{!c.legacy&&<details><summary className="l">Изменить и объяснить</summary><form action={saveCreatorChoice} className="hub-stack hub-review-form"><input type="hidden" name="id" value={c.id}/><select className="in" name="rating" defaultValue={c.rating} aria-label="Твой цвет">{['great','maybe','no','unreviewed'].map(k=><option value={k} key={k}>{RATINGS[k]}</option>)}</select><textarea className="in" name="reason" required maxLength={1500} defaultValue={c.reason} placeholder="Почему: речь, качество, цена…" aria-label="Причина выбора"/><Submit>Сохранить и обучить агента</Submit></form></details>}</td>
   <td>{creatorReviewState(c)==='queued'?<span className="tag">В очереди на проверку</span>:a?<><span className={'tag '+ratingClass(a.decision)}>{RATINGS[a.decision]||a.decision}</span><p className="hub-small">{a.reason}</p><span className="muted">Видео {a.videoReviewed?'✓':'не проверено'} · звук {a.audioReviewed?'✓':'не проверен'}</span></>:<span className="muted">Ещё не проверял</span>}</td>
   <td>{p.price?String(p.price).startsWith('$')?p.price:'$'+p.price:'—'}<p className="muted hub-small">{a?.price||'Не согласована'}</p></td>
   <td><span className={'tag '+(t?.state==='waiting_on_us'?'warn':'')}>{t?t.state==='waiting_on_us'?'Ждёт нас':t.state==='waiting_on_them'?'Ждём ответ':'Есть переписка':'Нет писем в снимке'}</span><p><a className="l" href={'/inbox?source=reddit&email='+encodeURIComponent(c.email)}>Открыть почту →</a></p>{!c.legacy&&<a className="l" href={"/outreach/"+c.id}>Добавить в кампанию →</a>}{c.outreach_state&&<p className="muted">{c.outreach_state.status}</p>}</td>
  </tr>})}</tbody></table>{!shown.length&&<div className="hub-empty">По этим фильтрам никого нет. Сбрось поиск или добавь креаторов из Reddit.</div>}</div>
  <div className="hub-toolbar"><span>{rows.length} по фильтру</span>{page>0&&<a className="btn" href={'/creators?'+new URLSearchParams({...sp as Record<string,string>,page:String(page-1)})}>← Назад</a>}{rows.length>(page+1)*50&&<a className="btn" href={'/creators?'+new URLSearchParams({...sp as Record<string,string>,page:String(page+1)})}>Дальше →</a>}</div>
 </div>;
}
