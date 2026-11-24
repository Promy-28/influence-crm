import {test} from 'node:test';
import assert from 'node:assert/strict';
import {creatorCampaignMembership,submitCreatorImport,importMessage} from '../src/lib/creator-import.ts';
test('imports once with free verification disabled and confirms exact email/campaign',async()=>{
 const calls:any[]=[];const result=await submitCreatorImport('a@example.org','A','green',async(path,body)=>{calls.push({path,body});return path==='/leads/add'?{}:{items:[{id:'lead',email:'a@example.org',campaign:'green'}]}});
 assert.equal(result.status,'imported');assert.equal(result.leadId,'lead');assert.equal(calls.filter(c=>c.path==='/leads/add').length,1);assert.equal(calls[0].body.verify_leads_on_import,false);assert.equal(calls[0].body.skip_if_in_workspace,true);
});
test('403 is an explicit rejection, not unknown; response text/secrets never become status',async()=>{
 const result=await submitCreatorImport('a@example.org','A','green',async path=>{if(path==='/leads/add')throw Error('Instantly 403: secret payload');return {items:[]}});
 assert.deepEqual(result,{status:'rejected',code:'INSTANTLY_403'});assert.ok(!JSON.stringify(result).includes('secret'));assert.match(importMessage(result),/leads:create/);
});
test('lost write response reconciles without a second write',async()=>{
 let writes=0;const result=await submitCreatorImport('a@example.org','A','green',async path=>{if(path==='/leads/add'){writes++;throw Error('timeout')}return {items:[{id:'one',email:'a@example.org',campaign:'green'}]}});
 assert.equal(writes,1);assert.equal(result.status,'imported');
});
test('unknown timeout remains protected and other campaigns never confirm the import',async()=>{
 const result=await submitCreatorImport('a@example.org','A','green',async path=>{if(path==='/leads/add')throw Error('timeout');return {items:[{id:'other',email:'a@example.org',campaign:'red'}]}});
 assert.equal(result.status,'uncertain');
 assert.equal(await creatorCampaignMembership('a@example.org','green',async()=>({items:[]})),null);
});
test('accepted is distinct from confirmed; readback failure never authorizes re-upload',async()=>{
 assert.equal((await submitCreatorImport('a@example.org','A','green',async()=>({items:[]}))).status,'accepted');
 assert.equal((await submitCreatorImport('a@example.org','A','green',async path=>{if(path==='/leads/list')throw Error('offline');return {}})).status,'uncertain');
});
