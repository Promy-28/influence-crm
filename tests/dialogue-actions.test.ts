import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dialogueAction,draftFingerprint} from '../src/lib/promy-bot/dialogue-actions.ts';
test('natural confirmation requires an explicit send instruction, never agreement or a negated send',()=>{
 for(const s of ['отправляй','Да, отправь письмо','да, всё верно, отправляй!','Подтверждаю отправку'])assert.equal(dialogueAction(s),'confirm',s);
 for(const s of ['да','всё верно','не отправляй пока','отправляй когда я скажу','предложи ответ, но не отправляй'])assert.notEqual(dialogueAction(s),'confirm',s);
 assert.equal(dialogueAction('не отправляй'),'cancel');
});
test('draft revisions use ordinary wording even when instruction contains next-week words',()=>{
 for(const s of ['Сделай короче','Убери обещание срока','Добавь, что вернёмся на следующей неделе','Перепиши в более тёплом тоне'])assert.equal(dialogueAction(s),'revise');
});
test('approval fingerprint changes for any changed shown draft text',async()=>{
 const a=await draftFingerprint('Hi Dana, thank you.');assert.equal(a,await draftFingerprint('Hi Dana, thank you.'));assert.notEqual(a,await draftFingerprint('Hi Dana, we will pay $100.'));
});
