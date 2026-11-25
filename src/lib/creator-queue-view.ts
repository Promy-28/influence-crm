export function queueStage(q:any,now=Date.now()){
 if(!q.ready)return {kind:'warning',title:'Очередь не настроена',detail:'Сервер пока не подтвердил готовность очереди.'};
 if(!q.active)return {kind:'paused',title:'На паузе',detail:q.until_at&&Date.parse(q.until_at)<=now?'Запуск на 24 часа завершён. Выбери режим, чтобы продолжить.':'Включи 24/7 или запуск на 24 часа.'};
 if(q.last_tick_at&&now-Date.parse(q.last_tick_at)>180000)return {kind:'warning',title:'Давно нет сигнала от планировщика',detail:'Режим включён, но свежего подтверждения работы нет. Последние результаты сохранены.'};
 const jobs=q.activeJobs||[];
 if(q.counts?.processing>0)return {kind:'working',title:jobs.some((j:any)=>j.stage==='discovering')?'Открываю портфолио':jobs.some((j:any)=>j.stage==='analyzing')?'Проверяю видео и звук':'Ожидаю результат видеосервиса',detail:`В обработке: ${q.counts.processing}. Результат появится здесь автоматически.`};
 if(q.counts?.queued===0)return {kind:q.counts?.blocked?'warning':'done',title:q.counts?.blocked?'Остались недоступные видео':'Очередь завершена',detail:q.counts?.blocked?'Для этих заявок проверка не завершена. Причины — в списке ниже.':'Все задания текущей очереди завершены.'};
 if(q.usedThisHour>=20)return {kind:'waiting',title:'Лимит часа использован — ждём следующий час',detail:'Следующая пачка запустится автоматически. Повторно нажимать кнопку не нужно.'};
 return {kind:'waiting',title:'Очередь включена — ожидаем запуск',detail:'Планировщик проверяет очередь каждую минуту и берёт до 20 креаторов за час.'};
}
export function remainingTime(until:string|undefined,now:number){const n=Math.max(0,Math.ceil((Date.parse(until||'')-now)/1000));return Number.isFinite(n)?`${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`:'—'}
