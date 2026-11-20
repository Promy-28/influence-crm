export type FarmAccount={id:string;platform:string;handle:string;status:string;phone:string;profile:string;warm_start:string|null;program_id:string|null;program_name:string|null};
export type FarmPost={external_id:string;account_id:string;platform:string;handle:string;state:string;text:string;url:string|null;created_at:string;scheduled_at:string|null;stats:{views:number;likes:number;comments:number;shares:number;read_at:string}|null};
export type FarmProgram={id:string;name:string;description:string;version:number;profile_count:number};
export type FarmDetail=FarmProgram&{editable:boolean;reddit:{enabled?:boolean;items:Record<string,{on:boolean;min:number;max:number}>;minutes?:number[]|null;per_day?:number[]|null}|null;reddit_calibrated:string[];session_minutes:number[];sessions_per_day:number[];proposals:{id:string;state:string;note:string}[]};
export const postStates:Record<string,string>={awaiting_approval:'Ждёт одобрения в FARM',draft:'Нужны изменения',approved:'Одобрен · ожидает времени',queued:'В очереди телефона',running:'Телефон выполняет',delivered:'Опубликован',uncertain:'Результат неизвестен · проверить вручную',failed_before_publish:'Ошибка до публикации',missed:'Пропущен',not_published:'Не опубликован',cancelled:'Отменён'};
export function validatePost(input:unknown,accounts:FarmAccount[],now=Date.now()){
 const x=input as Record<string,unknown>;if(!x||typeof x!=='object')throw Error('Некорректный пост');
 const string=(k:string,max:number,required=true)=>{const v=typeof x[k]==='string'?(x[k] as string).trim():'';if((required&&!v)||v.length>max)throw Error('Проверь поле '+k);return v};
 const account_id=string('account_id',64),a=accounts.find(a=>a.id===account_id&&a.platform==='reddit');
 if(!a||!['warming','ready','live'].includes(a.status))throw Error('Выбери доступный Reddit-аккаунт (warming, ready или live)');
 const external_id=string('external_id',128);if(!/^[A-Za-z0-9._:-]+$/.test(external_id))throw Error('Некорректный ID запроса');
 const title=string('title',300),text=string('text',5000),subreddit=string('subreddit',64).replace(/^r\//i,''),flair=string('flair',64,false),scheduled_at=string('scheduled_at',64,false);
 if(!/^[A-Za-z0-9_]{2,50}$/.test(subreddit))throw Error('Укажи название сабреддита без ссылки');
 if(/https?:|www\.|@[\w]|\b(?:dm me|link in bio)\b/i.test(title+' '+text))throw Error('FARM не принимает ссылки, @упоминания и призывы в личку');
 if(scheduled_at&&(!/(Z|[+-]\d\d:\d\d)$/.test(scheduled_at)||!Number.isFinite(Date.parse(scheduled_at))||Date.parse(scheduled_at)<=now))throw Error('Время публикации должно быть в будущем и содержать часовой пояс');
 return {external_id,account_id,title,text,subreddit,...(flair?{flair}:{}),...(scheduled_at?{scheduled_at}: {})};
}
export function validateWarmupProposal(input:unknown,current:FarmDetail){
 const x=input as {base_version?:unknown;note?:unknown;actions?:unknown};
 if(!x||!current.editable||!current.reddit)throw Error('Эту программу нельзя изменить через хаб');
 if(x.base_version!==current.version)throw Error('Программа изменилась. Обнови данные и проверь изменения заново.');
 if(typeof x.note!=='string'||!x.note.trim()||x.note.length>500)throw Error('Укажи причину изменения (до 500 символов)');
 const actions=x.actions as Record<string,unknown>;if(!actions||typeof actions!=='object'||Array.isArray(actions))throw Error('Некорректные действия');
 const items=structuredClone(current.reddit.items);
 if(Object.keys(actions).length!==Object.keys(items).length)throw Error('Набор действий изменился. Обнови программу.');
 for(const [key,on] of Object.entries(actions)){
  if(!Object.hasOwn(items,key)||typeof on!=='boolean')throw Error('Неподдерживаемое действие прогрева');
  if(on&&!items[key].on&&!current.reddit_calibrated.includes(key))throw Error('Действие ещё не откалибровано на телефоне: '+key);
  items[key].on=on;
 }
 // Preserve all current ranges and platform fields; never send a Threads part.
 return {base_version:current.version,note:x.note.trim(),reddit:{...current.reddit,items}};
}
