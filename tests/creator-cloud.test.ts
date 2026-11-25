import test from 'node:test';
import assert from 'node:assert/strict';
import {embeddedMedia,cloudAssessment,portfolioLinks,publicSocialPosts,socialPostMedia} from '../src/lib/creator-cloud-policy.ts';
import {mergeDirectoryPayload} from '../src/lib/reddit-intake.ts';
test('portfolio discovery retains source binding and rejects unrelated media',()=>{
 assert.deepEqual(embeddedMedia('<video src="/_assets/video/abc.mp4"></video><video src="https://evil.example/file.mp4">','https://creator.my.canva.site/'),['https://creator.my.canva.site/_assets/video/abc.mp4']);
 assert.deepEqual(portfolioLinks('https://example.com/a\nhttps://example.com/a'),['https://example.com/a']);
});
test('no color without original audio and visual evidence',()=>{
 assert.equal(cloudAssessment({videoReviewed:true,audioReviewed:false},'25'),null);
 const result={videoReviewed:true,audioReviewed:true,speech:[{second:1,quote:'This is a short demonstration of my favorite product today'}],frames:[{second:1,observation:'camera'}],englishSpeech:true,intelligibility:4,videoQuality:4,summary:'Чёткий разговорный пример',source:'https://a.example/clip.mp4'};
 assert.equal(cloudAssessment(result,'300')?.decision,'maybe');
 assert.equal(cloudAssessment({...result,videoQuality:1},'10')?.decision,'no');
 assert.equal(cloudAssessment({...result,englishSpeech:false},'10'),null);
 assert.equal(cloudAssessment({...result,speech:[{second:1,quote:'Oh'}]},'10'),null);
});
test('social fallback follows creator-owned posts and reads only post video metadata',()=>{
 const profile='https://www.tiktok.com/@sample.creator';
 const post=profile+'/video/123456';
 assert.deepEqual(publicSocialPosts(`<a href="${post}?share=1"></a><a href="/@someone-else/video/678900"></a>`,profile),[post]);
 const html='<meta content="https://v1.tiktokcdn.com/video.mp4?a=1&amp;b=2" property="og:video"><meta property="og:video" content="https://unrelated.example/video.mp4">';
 assert.deepEqual(socialPostMedia(html,post),['https://v1.tiktokcdn.com/video.mp4?a=1&b=2']);
 assert.deepEqual(socialPostMedia(html,profile),[]);
 assert.deepEqual(publicSocialPosts('<a href="/reel/other"></a>','https://www.instagram.com/sample.creator/'),[]);
});
test('stale cloud bridge cannot overwrite newer autonomous assessment',()=>{
 const assessment={at:'2026-11-25T12:00:00Z',decision:'maybe'};
 const merged=mergeDirectoryPayload({sourceFingerprint:'a',autonomousReview:{fingerprint:'a',assessment,at:assessment.at}},{assessment:{at:'2026-11-24T12:00:00Z',decision:'unverified'},reviewSourceFingerprint:'a'});
 assert.equal(merged.assessment.decision,'maybe');
});
