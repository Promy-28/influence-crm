'use client';
import {useEffect,useState} from 'react';
import {queueStage,remainingTime} from '@/lib/creator-queue-view';
import './creator-cloud-progress.css';
type Props={queue:any;rows:any[];busy:boolean;onMode:(mode:string)=>void};
const errors:Record<string,string>={NO_PUBLIC_VIDEO_DISCOVERED:'Не найден публичный источник видео в портфолио или соцсетях',NO_CREATOR_VIDEO_LINK:'В анкете нет ссылки на видео или профиль',SOCIAL_VIDEO_SOURCE_REQUIRED:'Нужна публичная ссылка на конкретный ролик',MEDIA_SOCIAL_VIDEO_UNAVAILABLE:'Видеофайл из соцсети недоступен',PORTFOLIO_HTTP_401:'Сайт требует входа',PORTFOLIO_HTTP_403:'Сайт отказал в доступе',PORTFOLIO_HTTP_429:'Сайт ограничил запросы',MEDIA_FILE_SIZE_UNSUPPORTED:'Размер видео превышает допустимый предел',NEEDS_ACCESSIBLE_VIDEO_SOURCE:'Нужна доступная ссылка на видео',NEEDS_RENDERED_VIDEO_SOURCE:'Не найден доступный исходник видео',PUBLIC_PORTFOLIO_MEDIA_UNAVAILABLE:'Видео на странице не удалось открыть',MEDIA_DRIVE_ACCESS_REQUIRED:'Нет публичного доступа к Drive',SAMPLE_WITHOUT_VERIFIED_SPEECH:'Недостаточно подтверждённой английской речи',NO_SPEECH_AFTER_TWO_SAMPLES:'Два образца не подтвердили речь',SERVER_BROWSER_START_FAILED:'Не удалось запустить серверный браузер',SERVER_BROWSER_RUNTIME_FAILED:'Ошибка серверного браузера',SERVER_BROWSER_TIMEOUT:'Страница не загрузилась вовремя',PORTFOLIO_ACCESS_CHALLENGE:'Сайт требует подтверждения доступа'};
export default function CreatorCloudProgress({queue:q,rows,busy,onMode}:Props){
 const [now,setNow]=useState<number|null>(null);
 useEffect(()=>{setNow(Date.now());const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer)},[]);
 const stage=queueStage(q,now??Date.now()),counts=q.counts||{queued:0,processing:0,completed:0,blocked:0},total=counts.queued+counts.processing+counts.completed+counts.blocked;
 const continuous=!!q.active&&!q.until_at,day=!!q.active&&!!q.until_at;
 return <section className="panel hub-section cloud-progress" aria-label="Состояние автоматической очереди" aria-busy={busy}>
  <div className="cloud-progress-top"><div><h2>Автоматическая очередь</h2><p className="muted">До 20 креаторов в час · работает без открытого сайта и ПК</p></div><span className={'cloud-mode '+(q.active?'is-on':'')}>{q.active?'● Включена':'Ⅱ Пауза'}{day?' · на 24 часа':continuous?' · 24/7':''}</span></div>
  <div className="cloud-controls" role="group" aria-label="Режим работы очереди">
   <button type="button" className={'cloud-toggle '+(continuous?'is-on':'')} role="switch" aria-checked={continuous} disabled={busy||!q.ready} onClick={()=>onMode(continuous?'pause':'continuous')}><span className="cloud-toggle-track" aria-hidden="true"><span/></span><span>Работать 24/7</span></button>
   <button type="button" className={'btn '+(day?'cloud-day-active':'')} aria-pressed={day} disabled={busy||!q.ready} onClick={()=>onMode('day')}>На 24 часа{day?' · включено':''}</button>
   <button type="button" className="btn" disabled={busy||!q.active} onClick={()=>onMode('pause')}>Пауза</button>
   {busy&&<span role="status">Сохраняю режим…</span>}
  </div>
  <div className={'cloud-stage '+stage.kind} role="status" aria-live="polite"><span className="cloud-stage-dot" aria-hidden="true"/><div><strong>{stage.title}</strong><p>{stage.detail}</p></div></div>
  <div className="cloud-hour"><div><strong>Пачка этого часа</strong><span>{q.usedThisHour||0} / 20 заявок взято в работу</span></div><progress max={20} value={Math.min(20,q.usedThisHour||0)} aria-label="Использован лимит текущего часа"/>{q.active&&q.usedThisHour>=20&&counts.queued>0&&<p>Следующий час через <b suppressHydrationWarning>{now===null?'—':remainingTime(q.nextHour,now)}</b> · продолжим автоматически</p>}</div>
  <div className="cloud-stat-grid">{[{key:'queued',label:'Ожидают',n:counts.queued},{key:'processing',label:'В обработке',n:counts.processing},{key:'completed',label:'Проверены',n:counts.completed},{key:'blocked',label:'Не удалось проверить',n:counts.blocked}].map(s=><div key={s.key} className={'cloud-stat '+s.key}><span>{s.label}</span><b>{s.n}</b></div>)}</div>
  <div className="cloud-overall"><div><strong>Завершённые проверки этой очереди</strong><span>{counts.completed} из {total}</span></div><progress max={total||1} value={counts.completed} aria-label="Успешно проверенные креаторы"/><p className="muted">Недоступные видео не считаются проверенными. Оценки собираются для твоего подтверждения перед Instantly.</p></div>
  {!!q.activeJobs?.length&&<div className="cloud-active"><strong>Сейчас в работе</strong>{q.activeJobs.map((j:any)=><p key={j.id}>{rows.find(c=>c.id===j.id)?.email||j.id} · {j.stage==='discovering'?'поиск видео в портфолио':j.stage==='analyzing'?'проверка видео и речи':'ожидание видеосервиса'}</p>)}</div>}
  {!!q.blockers?.length&&<details><summary>Почему не удалось проверить · {counts.blocked}</summary>{q.blockers.map((b:any)=><p key={b.creator_id}>{rows.find(c=>c.id===b.creator_id)?.email||b.creator_id}: {errors[b.error]||b.error}</p>)}</details>}
  <p className="muted cloud-heartbeat">Последний сигнал сервера: {q.last_tick_at?new Date(q.last_tick_at).toLocaleString('ru-RU',{timeZone:'America/New_York'}):'ожидаем первый запуск'}{day?' · До '+new Date(q.until_at).toLocaleString('ru-RU',{timeZone:'America/New_York'}):''}. Статус обновляется каждые 15 секунд.</p>
 </section>;
}
