'use server';
import {redirect} from 'next/navigation';
import {requireSession,log} from './db';
import {environment,loadRecord,saveRecord,api} from './promy-bot/store';
import {buildTestMail,sendTestOnce,TEST_SENDER} from './test-mail-core';
export async function prepareTestMail(f:FormData){
 await requireSession();const env=environment(),inst=await loadRecord(env,'instantly');if(!inst?.key)throw Error('Instantly не подключён');
 const account=await api(inst.key,'/accounts/'+encodeURIComponent(TEST_SENDER));if(account.email?.toLowerCase()!==TEST_SENDER)throw Error('Тестовый отправитель не подтверждён в Instantly');
 const draft=buildTestMail(String(f.get('recipient')||'').trim(),String(f.get('firstName')||'').trim(),String(account.signature||''));await saveRecord(env,'testmail:'+draft.id,draft);redirect('/test-email?id='+draft.id);
}
export async function sendTestMail(f:FormData){
 const who=await requireSession(),id=String(f.get('id')||'');if(!/^[a-f0-9-]{36}$/.test(id))throw Error('Неверный тест');
 const env=environment(),inst=await loadRecord(env,'instantly');if(!inst?.key)throw Error('Instantly не подключён');
 const d=await sendTestOnce(id,f.get('approval'),{load:key=>loadRecord(env,key),save:(key,value)=>saveRecord(env,key,value),send:payload=>api(inst.key,'/emails/test',payload),secret:process.env.APP_PASSWORD!});
 await log('test_email','Тест Reply: '+d.status,null,{recipient:d.recipient,eaccount:d.eaccount},who);redirect('/test-email?id='+id);
}
