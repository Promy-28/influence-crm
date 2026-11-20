'use client';
import {useRef,useState} from 'react';
import './regenerate-draft.css';
export default function RegenerateDraft({draft,disabled,onStart,onRegenerate}:{draft:any;disabled:boolean;onStart:()=>void;onRegenerate:(emailId:string,instruction:string,creatorId?:string,draftId?:string,approval?:string)=>Promise<void>}){
 const dialog=useRef<HTMLDialogElement>(null);const [instruction,setInstruction]=useState(''),[pending,setPending]=useState(false),[error,setError]=useState('');
 const open=()=>{setError('');dialog.current?.showModal()};
 return <><button className="btn" type="button" disabled={disabled||pending} onClick={open}>Перегенерировать</button><dialog className="regenerate-dialog" ref={dialog} aria-labelledby={'regenerate-title-'+draft.id} onCancel={event=>{if(pending)event.preventDefault()}}>
 <form onSubmit={async event=>{event.preventDefault();if(!instruction.trim()||pending)return;setPending(true);setError('');onStart();try{await onRegenerate(draft.emailId,instruction,draft.creatorId,draft.id,draft.approval);dialog.current?.close();setInstruction('')}catch(e){setError(e instanceof Error?e.message:'Не удалось подготовить новую версию')}finally{setPending(false)}}}>
 <div className="hub-heading"><h2 id={'regenerate-title-'+draft.id}>Перегенерировать ответ</h2><button type="button" className="btn" disabled={pending} aria-label="Закрыть перегенерацию" onClick={()=>dialog.current?.close()}>✕</button></div><p className="muted">{draft.recipient}</p>
 <label className="hub-stack">Что изменить и почему?<textarea className="in" autoFocus required rows={5} maxLength={5000} value={instruction} onChange={event=>setInstruction(event.target.value)} placeholder="Мы пропустили вопросы креатора. Ответь на каждый: проект, ставка, сроки, оплата и права. Используй данные из формы; если условий нет — уточни у меня."/></label>
 <div className="regenerate-examples">{['Ответь на все вопросы креатора','Сделай короче, сохрани все ответы','Напиши проще и естественнее'].map(text=><button key={text} type="button" className="btn" disabled={pending} onClick={()=>setInstruction(current=>current?current+'\n'+text:text)}>{text}</button>)}</div>
 <p className="muted">Агент учтёт переписку, текущий черновик и твою инструкцию. Предыдущая версия сохранится в истории. Имя, подпись и баннер Reply добавятся к новому ответу. Отправка — только после твоей новой проверки и подтверждения.</p>
 {error&&<p className="errbox" role="alert">{error}</p>}<div className="row"><button className="btn-p" disabled={pending||!instruction.trim()} type="submit">{pending?'Готовлю новую версию…':'Создать новый черновик'}</button><button className="btn" type="button" disabled={pending} onClick={()=>dialog.current?.close()}>Отмена</button></div></form></dialog></>;
}
