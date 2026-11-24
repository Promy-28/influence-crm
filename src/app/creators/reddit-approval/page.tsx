import {redditDirectory,RATINGS,ratingClass,safeLinks,creatorCampaigns} from '@/lib/hub-data';
import {redditCampaigns,approvalToken} from '@/lib/hub-outreach';
import {reviewFingerprint,suggestedCampaign,validFormEmail} from '@/lib/reddit-intake';
import {sendRedditBatch} from '@/lib/hub-actions';
import {environment,loadRecord} from '@/lib/promy-bot/store';
import {Submit} from '@/components/ui';
import {reconcileCreatorImports} from '@/lib/creator-import-server';
export const maxDuration=300;
export default async function RedditApproval({searchParams}:{searchParams:Promise<{msg?:string}>}){
 const sp=await searchParams;
 // Read-only reconciliation also resolves imports completed outside the hub, without re-uploading.
 try{await reconcileCreatorImports()}catch{/* Display the durable pending state when Instantly is unavailable. */}
 const [directory,membership,last]=await Promise.all([redditDirectory(),creatorCampaigns(),loadRecord(environment(),'_reddit_batch_result')]);
 const ready=directory.filter((c:any)=>!c.legacy&&!c.review_pending&&c.payload.reviewStatus!=='pending_review'&&(!c.outreach_state||c.outreach_state.status==='rejected')&&suggestedCampaign(c)&&validFormEmail(c.email)&&!membership.has(c.email.toLowerCase()));
 const rows=ready.slice(0,20),at=String(Date.now());
 return <div className="hub-stack"><a href="/creators?source=reddit" className="l">← Креаторы</a><h1>Проверка перед рассылкой · Reddit</h1><p className="sub">{ready.length} готовых · до 20 за подтверждение. Зелёные и жёлтые → Green / Yellow; красные → Red. Цвет можно исправить в карточке креатора.</p>
 {sp.msg&&<div className="okbox">{sp.msg}</div>}
 <div className="note">Добавление в активную кампанию запустит её письма по расписанию Instantly. Непроверенные без твоего решения остаются в «Креаторах». Каждый адрес ещё раз проверяется на дубли, отписки и запреты.</div>
 <form action={sendRedditBatch} className="hub-stack"><input type="hidden" name="at" value={at}/>
 {rows.map((c:any)=>{const a=c.payload.assessment,campaign=suggestedCampaign(c),fingerprint=reviewFingerprint(c);return <section className="panel hub-section" key={c.id}>
 <label className="row"><input type="checkbox" name="selected" value={c.id}/><b>{c.payload.name||c.payload.reddit||c.email}</b><span className="mail-address">{c.email}</span></label>
 <p><span className={'tag '+ratingClass(c.owner_rating||a?.decision)}>{RATINGS[c.owner_rating||a?.decision]}</span> → <b>{redditCampaigns.find(([id])=>id===campaign)?.[1]}</b></p>
 <p>Твой выбор: {c.owner_rating?RATINGS[c.owner_rating]:'не задан'} · {c.owner_reason||c.payload.ownerNote||'Нет письменного объяснения'}</p>
 <p>Агент: {a?.reason||'Нет независимой оценки; используется твоё решение.'}</p><p className="muted">{a?.quality} Видео {a?.videoReviewed?'✓':'не проверено'} · звук {a?.audioReviewed?'✓':'не проверен'}</p>
 <p>Цена: {c.payload.price||'не указана'} · {a?.price||'Условия ещё не согласованы'}</p>
 <div className="row">{safeLinks((a?.evidence||[]).join(' ')).map(url=><a key={url} className="l" href={url} target="_blank" rel="noreferrer">Образец ↗</a>)}<a className="l" href={'/outreach/'+c.id}>Другая кампания →</a></div>
 <input type="hidden" name={'campaign:'+c.id} value={campaign}/><input type="hidden" name={'fingerprint:'+c.id} value={fingerprint}/><input type="hidden" name={'token:'+c.id} value={approvalToken(c.id,c.email,campaign,at,fingerprint)}/>
 </section>})}
 {!rows.length?<div className="panel hub-section">Новых готовых контактов нет. Запусти проверку формы в «Креаторах» или дождись результата проверки видео.</div>:<><label className="row"><input type="checkbox" required name="confirm" value="yes"/>Проверил выбранных и разрешаю добавить в указанные кампании</label><Submit className="btn-p">Подтвердить добавление выбранных в Instantly</Submit></>}
 </form>
 {last&&<details className="panel hub-section"><summary>Последний запуск · {last.at}</summary>{last.results?.map((r:any)=>{const c=directory.find((c:any)=>c.id===r.id);return <p key={r.id}>{c?.email||r.id}: {c?.outreach_state?.status==='imported'?'Подтверждено: контакт есть в выбранной кампании Instantly.':r.message}</p>})}</details>}
 </div>;
}
