export function messageInvolves(email:any,address:string){
 const participants=[email.from_address_email,email.to_address_email_list,email.to_address,email.lead,email.email].flatMap(v=>Array.isArray(v)?v:[v]);
 return participants.some(v=>String(v||'').toLowerCase().match(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}/g)?.includes(address.toLowerCase()));
}
export async function assertNewOutreach(address:string,provider:(path:string,body?:unknown)=>Promise<any>,local:()=>Promise<string|null>){
 address=address.trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address))throw Error('Неверный адрес');
 const localReason=await local();if(localReason)throw Error('Повторный аутрич заблокирован: '+localReason);
 let cursor='';for(let p=0;p<5;p++){
  const q=new URLSearchParams({search:address,limit:'100',mode:'emode_all',preview_only:'true'});if(cursor)q.set('starting_after',cursor);
  const page=await provider('/emails?'+q);if(!Array.isArray(page.items))throw Error('Историю контакта проверить не удалось. Добавление заблокировано.');
  if(page.items.some((e:any)=>messageInvolves(e,address)))throw Error('Контакт уже имеет переписку в Instantly. Только продолжение текущей работы, без новой общей рассылки.');
  if(!page.next_starting_after)break;if(page.next_starting_after===cursor||p===4)throw Error('Проверка истории неполная. Добавление заблокировано.');cursor=page.next_starting_after;
 }
 cursor='';for(let p=0;p<5;p++){
  const page=await provider('/leads/list',{contacts:[address],limit:100,...(cursor?{starting_after:cursor}:{})});
  if(!Array.isArray(page.items))throw Error('Проверка контактов неполная. Добавление заблокировано.');
  if(page.items.some((l:any)=>String(l.email||'').trim().toLowerCase()===address))throw Error('Контакт уже есть в Instantly. Повторное добавление запрещено.');
  if(!page.next_starting_after)return;if(page.next_starting_after===cursor||p===4)throw Error('Проверка контактов неполная. Добавление заблокировано.');cursor=page.next_starting_after;
 }
}
