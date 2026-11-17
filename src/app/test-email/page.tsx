import {requireSession} from '@/lib/db';
import {environment,loadRecord} from '@/lib/promy-bot/store';
import {prepareTestMail,sendTestMail} from '@/lib/test-mail-actions';
import {TEST_SENDER} from '@/lib/test-mail-core';
import {approvalToken} from '@/lib/draft-approval';
import {Submit} from '@/components/ui';
export const dynamic='force-dynamic';
export default async function TestEmail({searchParams}:{searchParams:Promise<{id?:string}>}){
 await requireSession();const sp=await searchParams,d=sp.id&&/^[a-f0-9-]{36}$/.test(sp.id)?await loadRecord(environment(),'testmail:'+sp.id):null;
 return <div className="hub-stack" style={{maxWidth:900}}><header className="hub-heading"><div><h1>Тестовое письмо себе</h1><p className="sub">Тот же Reply: имя, текст, подпись и оригинальный баннер.</p></div><a className="btn" href="/drafts">К черновикам →</a></header>
 <section className="panel hub-section"><p>Отправитель: <b>{TEST_SENDER}</b>. Тест не добавляет контакт в кампанию и не отправляет письма креаторам.</p><form action={prepareTestMail} className="hub-stack"><label>Email для проверки<input className="in" type="email" name="recipient" required defaultValue={d?.recipient||'stas.natsvin@gmail.com'} autoComplete="email"/></label><label>Имя в приветствии<input className="in" name="firstName" required maxLength={100} defaultValue={d?.macroFirstName||'Stas'}/></label><div><Submit>Подготовить предпросмотр</Submit></div></form></section>
 {d&&<section className="panel hub-section hub-stack"><h2>{d.subject}</h2><p>Кому: <b>{d.recipient}</b> · от: {d.eaccount}</p><iframe title="Тест Reply с оригинальным баннером" sandbox="" referrerPolicy="no-referrer" srcDoc={'<style>body{font:14px/1.6 Arial,sans-serif;margin:16px}img{max-width:100%;height:auto}</style>'+d.html} style={{width:'100%',height:480,border:'1px solid var(--line)',borderRadius:12,background:'white'}}/>
 {d.status==='draft'?<form action={sendTestMail}><input type="hidden" name="id" value={d.id}/><input type="hidden" name="approval" value={approvalToken(d,process.env.APP_PASSWORD!)}/><Submit className="btn-p">Отправить тест на {d.recipient}</Submit></form>:<div className={d.status==='sent'?'okbox':'note'} role="status">{d.status==='sent'?'Instantly принял тестовое письмо. Проверь входящие и папку «Спам» по теме выше.':d.status==='failed'?'Instantly отклонил тест: '+d.error+'. Автоматического повтора нет.':'Результат отправки требует проверки. Сначала проверь почту; автоматически повторять тест не буду.'}</div>}
 <p className="muted hub-small">Тестовая отправка проверяет оформление. Она не подтверждает доставку будущих писем креаторам. Тесты Instantly могут не появляться в Unibox.</p></section>}</div>;
}
