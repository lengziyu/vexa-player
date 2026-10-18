const { _electron } = require('playwright');
const { mkdtemp, mkdir, writeFile, rm } = require('node:fs/promises');
const { spawnSync } = require('node:child_process');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const assert = require('node:assert/strict');
const ffmpeg = require('ffmpeg-static');
const project = resolve(__dirname, '..');
const output = join(project, 'test-results');
let app, temporary;
async function main() {
  temporary = await mkdtemp(join(tmpdir(), 'vexa-codec-test-'));
  const definitions = [
    { name: 'H264-AAC.mp4', args: ['-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-c:a','aac'] },
    { name: 'VP9-Opus.webm', args: ['-c:v','libvpx-vp9','-deadline','realtime','-cpu-used','8','-c:a','libopus'] },
    { name: 'H264-AAC.mkv', args: ['-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-c:a','aac'] },
    { name: 'HEVC-AAC.mp4', args: ['-c:v','libx265','-preset','ultrafast','-x265-params','pools=1','-tag:v','hvc1','-pix_fmt','yuv420p','-c:a','aac'] },
    { name: 'AV1-Opus.mkv', args: ['-c:v','libaom-av1','-cpu-used','8','-row-mt','1','-pix_fmt','yuv420p','-c:a','libopus'] },
    { name: 'MPEG4-MP3.avi', args: ['-c:v','mpeg4','-q:v','8','-c:a','libmp3lame'] },
  ];
  const files=[];
  for (const definition of definitions) {
    const file=join(temporary, definition.name);
    const result=spawnSync(ffmpeg,['-nostdin','-v','error','-f','lavfi','-i','testsrc2=size=320x180:rate=24','-f','lavfi','-i','anullsrc=r=48000:cl=stereo','-t','5',...definition.args,'-threads','2','-y',file],{windowsHide:true,timeout:45000});
    assert.equal(result.status,0,result.stderr?.toString());files.push(file);
  }
  app=await _electron.launch({executablePath:process.env.VEXA_TEST_EXECUTABLE||require('electron'),args:[...(process.env.VEXA_TEST_EXECUTABLE?[]:['.']),`--user-data-dir=${join(temporary,'data')}`],cwd:project,env:{...process.env,ELECTRON_RUN_AS_NODE:undefined,VEXA_DATA_DIR:join(temporary,'data')},timeout:30000});
  const page=await app.firstWindow();await page.waitForFunction(()=>!!window.vexa);
  await page.evaluate(()=>window.vexa.setSettings({cacheEnabled:false,autoNext:false}));
  await app.evaluate(({dialog},files)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:files})},files);
  await page.getByRole('button',{name:'选择视频',exact:true}).click();
  const deadline=Date.now()+30000;
  while(Date.now()<deadline){const data=await page.evaluate(()=>window.vexa.queryLibrary({limit:100}));if(data.total===6&&data.items.every(m=>m.status!=='pending'))break;await new Promise(r=>setTimeout(r,100))}
  await page.waitForTimeout(500);
  const cards=page.locator('.library-card');assert.equal(await cards.count(),6);
  for(let i=0;i<6;i++)await cards.nth(i).click();
  await page.getByRole('button',{name:'创建播放墙',exact:true}).click();
  await page.waitForTimeout(1800);
  const results=await page.locator('.video-tile').evaluateAll(tiles=>tiles.map(tile=>{const video=tile.querySelector('video');return{name:tile.querySelector('.tile-title strong').textContent,playing:video.readyState>=2&&video.currentTime>0&&!video.error,width:video.videoWidth,height:video.videoHeight,currentTime:video.currentTime,error:video.error?.message||null,visibleError:tile.querySelector('.tile-error p')?.textContent||null}}));
  assert.ok(results.find(r=>r.name==='H264-AAC.mp4')?.playing,'H264 MP4 baseline failed');
  assert.ok(results.find(r=>r.name==='VP9-Opus.webm')?.playing,'VP9 WebM baseline failed');
  assert.ok(results.every(r=>r.playing||r.visibleError),'Every unsupported format needs a visible error');
  await mkdir(output,{recursive:true});await writeFile(join(output,'codec-results.json'),JSON.stringify({success:true,platform:process.platform,arch:process.arch,results},null,2));
  console.log(JSON.stringify(results,null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1}).finally(async()=>{if(app)await app.close().catch(()=>{});if(temporary&&resolve(temporary).startsWith(resolve(tmpdir()))&&temporary.includes('vexa-codec-test-'))await rm(temporary,{recursive:true,force:true})});
