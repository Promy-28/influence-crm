'use client';

import {useEffect, useId, useRef, useState} from 'react';
import {mailDate} from '@/lib/mail-reply-view';
import type {MailSource} from '@/lib/mail-source';

type Thread = {
  emailSubject: string;
  contact: {account?: string};
  error?: string;
  messages: {id: string; direction: string; timestamp: string; text: string}[];
};

export default function DraftThreadDialog({source, threadId, recipient}: {
  source: MailSource; threadId: string; recipient: string;
}) {
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [thread, setThread] = useState<Thread | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const params = new URLSearchParams({source, [source === 'apify' ? 'creator' : 'thread']: threadId || ''});
    async function load() {
      try {
        const response = await fetch('/api/mail-thread?' + params, {signal: controller.signal, cache: 'no-store'});
        if (!response.headers.get('content-type')?.includes('application/json')) throw Error('Войди в хаб заново.');
        const data = await response.json();
        if (!response.ok) throw Error(data.error || 'Не удалось открыть переписку.');
        if (!controller.signal.aborted) setThread(data);
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Не удалось открыть переписку.');
      }
    }
    void load();
    return () => controller.abort();
  }, [open, source, threadId, attempt]);

  return <>
    <button type="button" className="btn" onClick={() => {
      setThread(null);
      setError('');
      dialog.current?.showModal();
      setOpen(true);
    }}>Вся переписка</button>
    <dialog ref={dialog} className="draft-thread-dialog" aria-labelledby={titleId} onClose={() => setOpen(false)}>
      <header className="hub-thread-head hub-heading">
        <div>
          <h2 id={titleId}>Вся переписка</h2>
          <p className="mail-address">{recipient}</p>
          {thread && <p className="muted">{thread.emailSubject}{thread.contact.account && ' · ' + thread.contact.account}</p>}
        </div>
        <button type="button" className="btn" autoFocus onClick={() => dialog.current?.close()}>Закрыть</button>
      </header>
      {error ? <div className="hub-empty"><p role="alert">{error}</p><button type="button" className="btn" onClick={() => {
        setError('');
        setAttempt(value => value + 1);
      }}>Повторить</button></div> : !thread ? <p className="hub-empty" role="status">Загружаю переписку…</p> : <>
        {thread.error && <p className="note" role="status">{thread.error}</p>}
        <div className="hub-messages">{thread.messages.length ? thread.messages.map(message =>
          <article key={message.id} className={'hub-message' + (message.direction === 'outbound' ? ' out' : '')}>
            <div className="hub-message-meta">{message.direction === 'outbound' ? 'Promy' : 'Креатор'} · {mailDate(message.timestamp)}</div>
            <p>{message.text}</p>
          </article>
        ) : <p>В этой переписке пока нет писем.</p>}</div>
      </>}
    </dialog>
  </>;
}
