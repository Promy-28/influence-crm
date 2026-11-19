'use client';
import {useRef,useState} from 'react';
import {expiredPostAsset,publicHttps,tiktokPlayer} from '@/lib/post-preview';
import './post-preview.css';
export default function PostPreview({post,platform,caption,meta}:{post:{url:string;cover?:string|null;media_url?:string|null};platform:string;caption:string;meta:string}){
 const dialog=useRef<HTMLDialogElement>(null),player=tiktokPlayer(post.url),original=publicHttps(post.url);
 const [broken,setBroken]=useState(false),[active,setActive]=useState(false),[videoError,setVideoError]=useState(false);
 const cover=publicHttps(post.cover),coverExpired=expiredPostAsset(cover),direct=publicHttps(post.media_url);
 const canDirect=!!direct&&!expiredPostAsset(direct),hasCover=!!cover&&!coverExpired&&!broken;
 const open=()=>{setVideoError(false);setActive(true);dialog.current?.showModal()};
 return <article className="post post-preview">
 <div className="cv">{hasCover?<img src={cover} alt="Кадр из ролика" loading="lazy" referrerPolicy="no-referrer" onError={()=>setBroken(true)}/>:<div className="post-preview-fallback"><span aria-hidden="true">▶</span><b>{cover&&coverExpired?'Превью устарело':'Превью недоступно'}</b><small>Это обложка, а не ошибка Gemini</small></div>}</div>
 {player||canDirect?<button type="button" className="post-play" onClick={open}>▶ {player?'Смотреть TikTok':'Смотреть видео'}</button>:<span className="post-preview-hint">Видео открой по ссылке ниже</span>}
 {original&&<a className="l" href={original} target="_blank" rel="noreferrer">Открыть в {platform==='tiktok'?'TikTok':'Instagram'} ↗</a>}
 <p>{caption}</p><span>{meta}</span>
 <dialog className="post-player-dialog" ref={dialog} onClose={()=>setActive(false)} aria-label="Просмотр ролика креатора"><div className="post-player-header"><b>Ролик креатора</b><button className="btn" type="button" onClick={()=>dialog.current?.close()} aria-label="Закрыть видео">✕</button></div>
 {active&&(player?<iframe src={player} title="TikTok — видео креатора" allow="fullscreen; autoplay; encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"/>:!videoError?<video src={direct!} controls playsInline preload="metadata" onError={()=>setVideoError(true)}/>:<p className="note">Ссылка на видео устарела или соцсеть ограничила доступ. Открой оригинал ниже.</p>)}
 <p className="muted">Если соцсеть ограничивает встроенный просмотр, открой оригинал. Этот просмотр не запускает AI-анализ или платный сбор данных.</p>{original&&<a className="btn" href={original} target="_blank" rel="noreferrer">Открыть оригинал ↗</a>}
 </dialog></article>;
}
