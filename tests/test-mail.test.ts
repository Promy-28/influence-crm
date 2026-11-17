import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildTestMail,sendTestOnce,TEST_SENDER} from '../src/lib/test-mail-core.ts';
import {approvalToken} from '../src/lib/draft-approval.ts';
import {REPLY_BANNER} from '../src/lib/promy-bot/reply-macro.ts';
test('test mail uses exact recipient, Reply signature/banner and only sends an approved stored version once',async()=>{
 const d=buildTestMail('stas@example.com','Stas','Best regards,<br>Kim');let calls=0;
 const records=new Map([['testmail:'+d.id,d]]);const deps={load:async(id:string)=>structuredClone(records.get(id)),save:async(id:string,v:any)=>{records.set(id,structuredClone(v))},secret:'fixture',send:async(p:any)=>{calls++;assert.equal(p.to_address_email_list,'stas@example.com');assert.equal(p.eaccount,TEST_SENDER);assert.ok(p.body.html.includes(REPLY_BANNER));assert.ok(p.body.html.includes('Hey&nbsp;Stas'));return {status:'success'}}};
 await assert.rejects(sendTestOnce(d.id,'invalid',deps));assert.equal(calls,0);
 const token=approvalToken(d,'fixture');const sent=await sendTestOnce(d.id,token,deps);assert.equal(sent.status,'sent');await assert.rejects(sendTestOnce(d.id,token,deps));assert.equal(calls,1);
});
test('rejects multiple recipients and treats uncertain provider outcome as non-retryable',async()=>{
 assert.throws(()=>buildTestMail('one@example.com,two@example.com','Stas','Kim'));
 const d=buildTestMail('stas@example.com','Stas','Kim');let value:any=d,calls=0;const deps={load:async()=>structuredClone(value),save:async(_:string,v:any)=>{value=structuredClone(v)},secret:'fixture',send:async()=>{calls++;throw Error('network timeout')}};
 assert.equal((await sendTestOnce(d.id,approvalToken(d,'fixture'),deps)).status,'uncertain');await assert.rejects(sendTestOnce(d.id,approvalToken(d,'fixture'),deps));assert.equal(calls,1);
});
