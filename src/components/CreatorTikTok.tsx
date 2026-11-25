'use client';
import {useState} from 'react';
import PostPreview from './PostPreview';

type Clip={url:string;cover?:string;verified:boolean};
export default function CreatorTikTok({id}:{id:string}){
 const [clips,setClips]=useState<Clip[]>();
 const [status,setStatus]=useState('');
 async function load(){
  setStatus('Загружаю ролики…');
  try{
   const response=await fetch('/api/creator-tiktok/'+id);
   if(!response.ok)throw Error();
   const posts:Clip[]=await response.json();
   setClips(posts);
   setStatus(posts.length?'':'Публичные ролики не найдены');
  }catch{setStatus('Не удалось загрузить ролики. Можно повторить.')}
 }
 return <details onToggle={e=>{if(e.currentTarget.open&&!clips&&!status)void load()}}>
  <summary className="l">Ролики TikTok</summary>
  {status&&<p role="status">{status}</p>}
  {status.startsWith('Не удалось')&&<button type="button" className="btn" onClick={load}>Повторить</button>}
  {!!clips?.length&&<div className="posts">{clips.map(clip=><PostPreview key={clip.url} post={clip} platform="tiktok" caption={clip.verified?'Проверено агентом · видео и звук':'Ролик из профиля'} meta=""/>)}</div>}
 </details>;
}
