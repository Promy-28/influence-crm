"use client";
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return <div className="panel" style={{ padding: 20 }}><h1>Не сохранилось</h1><p className="sub">Данные не записаны. Попробуйте ещё раз, а если повторится, пришлите текст ниже.</p><pre className="chat" style={{ marginTop: 10 }}>{error.message}</pre><button className="btn-p" style={{ marginTop: 10 }} onClick={reset}>Повторить</button></div>;
}
