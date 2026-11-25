import test from 'node:test';
import assert from 'node:assert/strict';
import {embeddedMedia,cloudAssessment,portfolioLinks} from '../src/lib/creator-cloud-policy.ts';
import {mergeDirectoryPayload} from '../src/lib/reddit-intake.ts';
test('portfolio discovery retains source binding and rejects unrelated media',()=>{
 assert.deepEqual(embeddedMedia('<video src="/_assets/video/abc.mp4"></video><video src="https://evil.example/file.mp4">','https://creator.my.canva.site/'),['https://creator.my.canva.site/_assets/video/abc.mp4']);
 assert.deepEqual(portfolioLinks('https://example.com/a\nhttps://example.com/a'),['https://example.com/a']);
});
test('no color without original audio and visual evidence',()=>{
 assert.equal(cloudAssessment({videoReviewed:true,audioReviewed:false},'25'),null);
 const result={videoReviewed:true,audioReviewed:true,speech:[{second:1,quote:'Hello'}],frames:[{second:1,observation:'camera'}],englishSpeech:true,intelligibility:4,videoQuality:4,summary:'Чёткий разговорный пример',source:'https://a.example/clip.mp4'};
 assert.equal(cloudAssessment(result,'300')?.decision,'maybe');
 assert.equal(cloudAssessment({...result,videoQuality:1},'10')?.decision,'no');
});
test('stale cloud bridge cannot overwrite newer autonomous assessment',()=>{
 const assessment={at:'2026-11-25T12:00:00Z',decision:'maybe'};
 const merged=mergeDirectoryPayload({sourceFingerprint:'a',autonomousReview:{fingerprint:'a',assessment,at:assessment.at}},{assessment:{at:'2026-11-24T12:00:00Z',decision:'unverified'},reviewSourceFingerprint:'a'});
 assert.equal(merged.assessment.decision,'maybe');
});
