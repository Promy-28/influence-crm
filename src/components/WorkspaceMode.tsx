'use client';
import {usePathname} from 'next/navigation';
import type {MailSource} from '@/lib/mail-source';
export default function WorkspaceMode({source}:{source:MailSource}){
 const path=usePathname(),common=['/settings','/log','/guide','/test-email','/mailboxes','/import'].includes(path);
 return <header className="workspace-topbar panel"><div className="workspace-context"><span className="workspace-eyebrow">Рабочая база</span><strong>{source==='apify'?'Apify · TikTok / Instagram':'Reddit и Google-форма'}</strong><small>{common?'Общий раздел · выбранная база сохранена':'Креаторы, почта и черновики выбранной базы'}</small></div><div className="workspace-toggle" role="group" aria-label="Режим хаба">{[['apify','Apify'],['reddit','Reddit / форма']].map(([mode,label])=><form action="/api/workspace-mode" method="post" key={mode}><input type="hidden" name="mode" value={mode}/><input type="hidden" name="path" value={path}/><button type="submit" className={source===mode?'active':''} aria-pressed={source===mode} disabled={source===mode}><span aria-hidden="true">{source===mode?'●':'○'}</span> {label}</button></form>)}</div></header>;
}
