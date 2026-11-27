import test from 'node:test';
import assert from 'node:assert/strict';
import {embeddedMedia,cloudAssessment,portfolioLinks,publicSocialPosts,socialPostMedia,tiktokProfileEmbed,tiktokEmbedMedia} from '../src/lib/creator-cloud-policy.ts';
import {mediaSource} from '../src/lib/media-review.ts';
import {mergeDirectoryPayload} from '../src/lib/reddit-intake.ts';
test('portfolio discovery retains source binding and rejects unrelated media',()=>{
 assert.deepEqual(embeddedMedia('<video src="/_assets/video/abc.mp4"></video><video src="https://evil.example/file.mp4">','https://creator.my.canva.site/'),['https://creator.my.canva.site/_assets/video/abc.mp4']);
 assert.deepEqual(portfolioLinks('https://example.com/a\nhttps://example.com/a'),['https://example.com/a']);
});
test('Canva site data exposes relative primary videos for separate clips',()=>{
 const html='<base href="/portfolio/">{"files":[{"url":"_assets/video/first.mp4"}],"rendition":"_assets/video/first-small.mp4"},{"files":[{"url":"_assets/video/second.mp4"}]}';
 assert.deepEqual(embeddedMedia(html,'https://creator.my.canva.site/portfolio'),[
  'https://creator.my.canva.site/portfolio/_assets/video/first.mp4','https://creator.my.canva.site/portfolio/_assets/video/second.mp4',
 ]);
});
test('no color without original audio and visual evidence',()=>{
 assert.equal(cloudAssessment({videoReviewed:true,audioReviewed:false},'25'),null);
 const result={videoReviewed:true,audioReviewed:true,speech:[{second:1,quote:'This is a short demonstration of my favorite product today'}],frames:[{second:1,observation:'camera'}],englishSpeech:true,intelligibility:4,videoQuality:4,summary:'Чёткий разговорный пример',source:'https://a.example/clip.mp4'};
 assert.equal(cloudAssessment(result,'300')?.decision,'maybe');
 assert.equal(cloudAssessment({...result,videoQuality:1},'10')?.decision,'no');
 assert.equal(cloudAssessment({...result,englishSpeech:false},'10')?.decision,'maybe');
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
test('TikTok profile embed accepts public videos belonging to the submitted handle',()=>{
 const profile='https://tiktok.com/@sample';
 const path='/embed/@sample';
 const embed=tiktokProfileEmbed(profile)!;
 assert.equal(embed,'https://www.tiktok.com'+path);
 const stream='https://v16m.tiktokcdn-us.com/948910770206ebd399daeb94704f3caf/6b09770c/video/tos/useast5/tos-useast5-ve-0068c001-tx/example/?token=value';
 const video={id:'1234567890123456789',authorUniqueId:'sample',privateItem:false,playAddr:stream};
 const state={source:{data:{[path]:{videoList:[video,{...video,privateItem:true,playAddr:'private'},{...video,authorUniqueId:'other',playAddr:'other'}]}}}};
 assert.deepEqual(tiktokEmbedMedia('<script id="__FRONTITY_CONNECT_STATE__">'+JSON.stringify(state)+'</script>',embed),[stream]);
 assert.equal(mediaSource(stream,profile),stream);
 assert.throws(()=>mediaSource(stream.replace('tiktokcdn-us.com','unrelated.example'),profile));
});

test('exact TikTok post hydration supplies video only for the matching author and post',()=>{
 const url='https://www.tiktok.com/@sample.creator/video/7603898086716378382';
 const source='https://v16.tiktokcdn-us.com/example.mp4';
 const html=(name:string,id:string,privateItem=false)=>'<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__">'+JSON.stringify({__DEFAULT_SCOPE__:{'webapp.video-detail':{itemInfo:{itemStruct:{id,author:{uniqueId:name},privateItem,video:{playAddr:source}}}}}})+'</script>';
 assert.deepEqual(socialPostMedia(html('sample.creator','7603898086716378382'),url),[source]);
 assert.deepEqual(socialPostMedia(html('another.creator','7603898086716378382'),url),[]);
 assert.deepEqual(socialPostMedia(html('sample.creator','7603898086716378383'),url),[]);
 assert.deepEqual(socialPostMedia(html('sample.creator','7603898086716378382',true),url),[]);
});

test('Instagram public JSON matches the explicit creator and Reel shortcode',()=>{
 const source='https://v.cdninstagram.com/media/test.mp4';
 const html='<script type="application/json">'+JSON.stringify({media:[
  {code:'ABCdef1234',user:{username:'sample'},video_versions:[{url:source}]},
  {code:'Unrelated',user:{username:'other'},video_versions:[{url:'https://v.cdninstagram.com/media/other.mp4'}]}
 ]})+'</script>';
 assert.deepEqual(publicSocialPosts(html,'https://www.instagram.com/sample/'),['https://www.instagram.com/reel/ABCdef1234/']);
 assert.deepEqual(socialPostMedia(html,'https://www.instagram.com/sample/reel/ABCdef1234/'),[source]);
 assert.deepEqual(socialPostMedia(html,'https://www.instagram.com/wrong/reel/ABCdef1234/'),[]);
});
