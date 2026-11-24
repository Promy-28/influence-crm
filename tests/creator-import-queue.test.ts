import test from 'node:test';
import assert from 'node:assert/strict';
import {queuedApprovalProof,queuedCreatorUnchanged,type ApprovedCreator} from '../src/lib/creator-import-queue.ts';
const secret='fixture-owner-approval-secret';
function job():ApprovedCreator{const j:ApprovedCreator={id:'0123456789abcdef',email:'creator@example.com',campaign:'green',fingerprint:'frozen-review',approvedAt:'2026-01-01T00:00:00Z',approvedBy:'owner',proof:'',status:'pending'};j.proof=queuedApprovalProof(j,secret);return j}
test('durable exact approval survives worker delay without approving a changed card',()=>{
 const j=job();assert.equal(queuedCreatorUnchanged(j,{email:j.email},j.fingerprint,secret),true);
 assert.equal(queuedCreatorUnchanged(j,{email:j.email},'new-review',secret),false);
 assert.equal(queuedCreatorUnchanged(j,{email:'someone-else@example.com'},j.fingerprint,secret),false);
});
test('campaign, owner, time and recipient cannot be substituted in persisted approval',()=>{
 for(const field of ['id','email','campaign','fingerprint','approvedAt','approvedBy'] as const){const j=job();j[field]+='changed';assert.equal(queuedCreatorUnchanged(j,{email:j.email},j.fingerprint,secret),false)}
 const j=job();assert.equal(queuedCreatorUnchanged(j,{email:j.email},j.fingerprint,'wrong-secret'),false);
});
