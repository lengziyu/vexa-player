// Record the real packaged macOS app in an isolated profile; captions are added afterward.
const { _electron } = require('playwright');
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const { resolve, join } = require('node:path');
const assert = require('node:assert/strict');
const ffmpeg = require('ffmpeg-static');
const ffprobe = require('@ffprobe-installer/ffprobe').path;
const project = resolve(__dirname, '..');
const version = require('../package.json').version;
const output = join(project, 'docs/media');
const stem = `vexa-fullscreen-macos-${version}`;
const chapters = [], checks = [], errors = [];
let app, page, work, session, captureStart;

function run(executable, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => stdout += chunk);
    child.stderr.on('data', chunk => stderr = (stderr + chunk).slice(-6000));
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve(stdout) : reject(new Error(`${executable} exited ${code}: ${stderr}`)));
  });
}
const encode = args => run(ffmpeg, ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', ...args]);
const wait = ms => page.waitForTimeout(ms);
const button = (name, root = page) => root.getByRole('button', { name, exact: true });
const tiles = () => page.locator('.video-tile');
async function checkpoint(name, predicate, arg) {
  await page.waitForFunction(predicate, arg);
  assert.equal(await page.evaluate(() => !!document.fullscreenElement), true);
  checks.push(name);
}
async function move(locator, position) {
  await page.mouse.move(640, 340, { steps: 12 });
  const box = await locator.boundingBox();
  assert.ok(box, 'The recorded control must be visible');
  const target = { x: box.x + (position?.x ?? box.width / 2), y: box.y + (position?.y ?? box.height / 2) };
  await page.mouse.move(target.x, target.y, { steps: 24 });
  await wait(230);
}
async function click(locator) {
  await move(locator);
  await locator.click();
  await wait(300);
}
async function chapter(title, description) {
  assert.equal(await page.evaluate(() => !!document.fullscreenElement), true);
  chapters.push({ title, description, seconds: Date.now() / 1000 - captureStart });
  console.log(`Recording ${chapters.length}: ${title}`);
}
async function slider(name, from, to) {
  const control = page.getByRole('slider', { name, exact: true });
  const box = await control.boundingBox();
  assert.ok(box);
  await page.mouse.move(box.x + box.width * from, box.y + box.height / 2, { steps: 24 });
  await page.mouse.down();
  for (let i = 1; i <= 24; i++) {
    await page.mouse.move(box.x + box.width * (from + (to - from) * i / 24), box.y + box.height / 2);
    await wait(35);
  }
  await page.mouse.up();
  await wait(500);
}

async function storyboard() {
  await chapter('全屏之内，自由切换', `Vexa Player ${version} · macOS 实际安装包操作演示`);
  await wait(3000);

  await chapter('01  切换布局', '网格同时看全局；主次布局突出主画面。');
  await click(button('主次'));
  await wait(1900);
  await click(button('网格'));
  await wait(1700);
  await checkpoint('Grid layout restored', () => [...document.querySelectorAll('.layout-switch button')].some(b => b.textContent.trim() === '网格' && b.classList.contains('selected')));

  await chapter('02  双击放大，再次双击恢复', '临时专注一个画面，随时回到多画面播放。');
  const zoomed = tiles().nth(2).locator('.tile-shade');
  await move(zoomed, { x: 130, y: 100 });
  await zoomed.dblclick({ position: { x: 130, y: 100 } });
  await checkpoint('Single tile enlarged', () => !!document.querySelector('.video-wall.is-zoomed'));
  await wait(3000);
  await move(zoomed, { x: 130, y: 100 });
  await zoomed.dblclick({ position: { x: 130, y: 100 } });
  await checkpoint('Multi-view restored', () => !document.querySelector('.video-wall.is-zoomed'));
  await wait(1400);

  await chapter('03  指定换片', '打开画面上的文件夹，搜索视频名称并替换；其他画面继续播放。');
  const previous = await tiles().first().locator('video').getAttribute('src');
  await tiles().first().hover();
  await click(button('选择视频替换此画面', tiles().first()));
  const drawer = page.getByRole('region', { name: '播放墙选片', exact: true });
  await wait(800);
  await drawer.getByRole('searchbox', { name: '选片搜索' }).fill('夜色');
  await wait(1200);
  await click(button('替换为 06-城市夜色.mp4', drawer));
  await checkpoint('Chosen video replaced; other videos keep playing', old => {
    const videos = [...document.querySelectorAll('.video-tile video')];
    return videos[0].getAttribute('src') !== old && videos.every(v => v.readyState >= 2 && !v.paused);
  }, previous);
  await wait(1200);
  await click(button('关闭选片侧栏', drawer));
  await wait(900);

  await chapter('04  全屏内添加视频', '点“添加视频”，从视频库加入第五个画面。');
  await click(button('播放中添加视频'));
  await drawer.getByRole('searchbox', { name: '选片搜索' }).fill('远山');
  await wait(1000);
  await click(button('添加 05-远山云影.mp4', drawer));
  await checkpoint('Fifth video added during playback', () => document.querySelectorAll('.video-tile video').length === 5);
  await wait(1300);

  await chapter('05  移出与撤销', '在“正在播放”中移出画面；误操作可在 8 秒内撤销。');
  await click(drawer.getByRole('button', { name: /^正在播放/ }));
  await wait(800);
  await click(button('移出第 5 个画面', drawer));
  await checkpoint('Fifth tile removed', () => document.querySelectorAll('.video-tile').length === 4);
  await wait(800);
  await click(button('关闭选片侧栏', drawer));
  await click(button('撤销移出画面'));
  await checkpoint('Removal undone', () => document.querySelectorAll('.video-tile').length === 5);
  await wait(1500);

  await chapter('06  随机换片与拖动交换', '一键换个视频，再把喜欢的画面拖到合适的位置。');
  await tiles().first().hover();
  const oldSource = await tiles().first().locator('video').getAttribute('src');
  await click(button('随机替换此画面', tiles().first()));
  await checkpoint('Random replacement loaded', src => {
    const video = document.querySelector('.video-tile video');
    return video.getAttribute('src') !== src && video.readyState >= 2;
  }, oldSource);
  await wait(1300);
  const oldStyle = await tiles().first().getAttribute('style');
  await move(tiles().first(), { x: 120, y: 90 });
  await tiles().first().dragTo(tiles().nth(1), { sourcePosition: { x: 120, y: 90 }, targetPosition: { x: 120, y: 90 } });
  await checkpoint('Tile positions swapped', style => document.querySelector('.video-tile').getAttribute('style') !== style, oldStyle);
  await wait(1900);

  await chapter('07  统一调节进度', '打开调节面板，拖动预览位置，松开后所有视频一起跳转。');
  await click(button('统一播放设置'));
  await wait(1400);
  await slider('统一进度', .18, .42);
  await checkpoint('All videos seek to 42 percent', () => [...document.querySelectorAll('.video-tile video')].every(v => Math.abs(v.currentTime / v.duration - .42) < .04 && !v.seeking));
  await wait(1400);

  await chapter('08  音量与发声范围', '调节统一音量，选择“全部声音”或“仅选中”画面发声。');
  await slider('统一音量', .8, .55);
  await click(button('全部画面同时发声'));
  await checkpoint('Mixed audio enabled', () => document.querySelector('[aria-label="全部画面同时发声"]').getAttribute('aria-pressed') === 'true');
  await wait(1300);
  await click(button('仅选中画面发声'));
  await checkpoint('Selected-tile audio restored', () => document.querySelector('[aria-label="仅选中画面发声"]').getAttribute('aria-pressed') === 'true');
  await wait(1000);

  await chapter('09  统一倍速', '所有画面切换到 2 倍速，再恢复正常播放。');
  await click(button('全部 2 倍速'));
  await checkpoint('All players run at 2x', () => [...document.querySelectorAll('.video-tile video')].every(v => v.playbackRate === 2));
  await wait(2200);
  await click(button('全部 1 倍速'));
  await checkpoint('All players restored to 1x', () => [...document.querySelectorAll('.video-tile video')].every(v => v.playbackRate === 1));
  await wait(900);
  await click(button('收起统一播放设置'));

  await chapter('10  空格暂停、继续与六画面', '按空格统一暂停，再按一次继续；从数量菜单扩展为六画面。');
  // Leave the panel's trigger button before using the app's global shortcut.
  await move(tiles().first().locator('.tile-shade'), { x: 110, y: 90 });
  await tiles().first().locator('.tile-shade').click({ position: { x: 110, y: 90 } });
  await page.keyboard.press('Space');
  await checkpoint('All videos paused', () => [...document.querySelectorAll('.video-tile video')].every(v => v.paused));
  await wait(1300);
  await page.keyboard.press('Space');
  await wait(900);
  await click(page.locator('.subtle-button'));
  await wait(650);
  await click(button('6', page.locator('.count-popover')));
  await checkpoint('Six real videos playing', () => {
    const videos = [...document.querySelectorAll('.video-tile video')];
    return videos.length === 6 && videos.every(v => v.readyState >= 2 && !v.paused);
  });
  await wait(1800);

  await chapter('11  控件自动隐藏，移动鼠标唤醒', '静止约 2.8 秒后沉浸观看；移动鼠标即可继续操作。');
  await page.mouse.move(1000, 380, { steps: 24 });
  await checkpoint('Controls auto-hide', () => document.querySelector('.wall-panel').classList.contains('controls-idle'));
  await wait(1700);
  await page.mouse.move(1100, 430, { steps: 24 });
  await checkpoint('Pointer wakes controls', () => !document.querySelector('.wall-panel').classList.contains('controls-idle'));
  await wait(1300);
  await chapter('播放继续，全程无需退出全屏', '布局 · 放大 · 选片 · 添加与撤销 · 进度 · 音量 · 倍速');
  await checkpoint('Finish with immersive fullscreen playback', () => document.querySelector('.wall-panel').classList.contains('controls-idle'));
  await wait(3000);
}

function assTime(seconds) {
  const n = Math.max(0, Math.round(seconds * 100));
  return `${Math.floor(n / 360000)}:${String(Math.floor(n / 6000) % 60).padStart(2, '0')}:${String(Math.floor(n / 100) % 60).padStart(2, '0')}.${String(n % 100).padStart(2, '0')}`;
}
async function render(raw, duration) {
  const ass = `[Script Info]\nScriptType: v4.00+\nPlayResX: 1920\nPlayResY: 1080\nWrapStyle: 2\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Title,Heiti SC,32,&H00F3EEFF,&H00F3EEFF,&H00171120,&H00171120,-1,0,0,0,100,100,0,0,1,0,0,7,128,128,973,1\nStyle: Detail,Heiti SC,23,&H00C3B7D2,&H00C3B7D2,&H00171120,&H00171120,0,0,0,0,100,100,0,0,1,0,0,7,128,128,1022,1\nStyle: Brand,Helvetica Neue,18,&H00A79AB8,&H00A79AB8,&H00171120,&H00171120,0,0,0,0,100,100,1,0,1,0,0,9,128,128,981,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;
  const lines = chapters.flatMap((item, index) => {
    const start = assTime(item.seconds), end = assTime(chapters[index + 1]?.seconds ?? duration);
    return [
      `Dialogue: 0,${start},${end},Title,,0,0,0,,{\\fad(160,100)}${item.title}`,
      `Dialogue: 0,${start},${end},Detail,,0,0,0,,{\\fad(160,100)}${item.description}`,
    ];
  });
  lines.push(`Dialogue: 0,0:00:00.00,${assTime(duration)},Brand,,0,0,0,,VEXA PLAYER  /  macOS ${version}`);
  const subtitle = join(work, 'captions.ass');
  await fs.writeFile(subtitle, ass + lines.join('\n') + '\n');
  const movie = join(output, `${stem}.mp4`);
  // Keep captions outside the actual UI so no app controls are obscured.
  await encode(['-f', 'concat', '-safe', '0', '-i', raw, '-vf',
    `fps=30,scale=1664:936:flags=lanczos,pad=1920:1080:128:12:color=0x111017,ass='${subtitle}',setsar=1`,
    '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '21', '-pix_fmt', 'yuv420p', '-threads', '4', '-movflags', '+faststart', movie]);
  await encode(['-ss', '1', '-i', movie, '-frames:v', '1', '-c:v', 'libwebp', '-quality', '92', join(output, `${stem}.webp`)]);
  await fs.writeFile(join(output, `${stem}.chapters.json`), JSON.stringify(chapters, null, 2) + '\n');
  const metadata = JSON.parse(await run(ffprobe, ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', movie]));
  assert.equal(metadata.streams[0].width, 1920);
  assert.equal(metadata.streams[0].height, 1080);
  assert.equal(metadata.streams[0].avg_frame_rate, '30/1');
  await encode(['-i', movie, '-f', 'null', '-']);
  return { movie, metadata };
}

async function main() {
  const executablePath = process.env.VEXA_TEST_EXECUTABLE;
  assert.ok(executablePath, 'VEXA_TEST_EXECUTABLE must point to the actual packaged app');
  assert.ok(executablePath.includes('.app/Contents/MacOS/'), 'Use the macOS installation package');
  await fs.access(executablePath);
  await fs.mkdir(join(project, '.cache'), { recursive: true });
  work = await fs.mkdtemp(join(project, '.cache/fullscreen-walkthrough-'));
  console.log(`Recording work directory: ${work}`);
  const profile = join(work, 'profile'), videos = join(work, '演示视频');
  const fixtures = join(project, '.cache/readme-demo-fixtures-v1');
  await Promise.all([fs.mkdir(profile), fs.mkdir(videos), fs.mkdir(fixtures, { recursive: true }), fs.mkdir(output, { recursive: true })]);
  await fs.writeFile(join(profile, 'settings.json'), JSON.stringify({ theme: 'dark', autoNext: false, randomStart: false, layout: 'grid', fit: 'cover' }));
  const scenes = [['alpine', '01-山间湖泊'], ['dunes', '02-沙漠峡谷'], ['forest', '03-森林漫步'], ['coast', '04-海边浪潮'], ['mountain', '05-远山云影'], ['night', '06-城市夜色']];
  const paths = [];
  for (const [asset, name] of scenes) {
    const fixture = join(fixtures, `${name}.mp4`);
    if (!(await fs.stat(fixture).catch(() => null))?.size) await encode([
      '-loop', '1', '-i', join(project, `ui-preview/assets/${asset}.jpg`), '-vf',
      "scale=1600:-2,zoompan=z='min(1.10,1+on*0.00015)':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s=1280x720:fps=24,setsar=1",
      '-t', '30', '-an', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '27', '-pix_fmt', 'yuv420p', '-threads', '2', fixture]);
    const target = join(videos, `${name}.mp4`);
    await encode(['-stream_loop', '7', '-i', fixture, '-t', '240', '-c', 'copy', target]);
    paths.push(target);
    console.log(`Prepared ${name}`);
  }
  app = await _electron.launch({ executablePath, args: [`--user-data-dir=${profile}`], cwd: project,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined, VEXA_DATA_DIR: profile }, timeout: 30000 });
  page = await app.firstWindow({ timeout: 30000 });
  page.setDefaultTimeout(12000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/^https?:/.test(request.url())) errors.push('Unexpected network request'); });
  await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    window.setContentSize(1280, 720);
    window.setIgnoreMouseEvents(true);
    global.__demoNativeFullscreen = false;
    window.on('enter-full-screen', () => global.__demoNativeFullscreen = true);
  });
  await page.getByRole('heading', { name: '你的私人放映室.' }).waitFor();
  await app.evaluate(({ dialog }, paths) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: paths }); }, paths);
  await button('选择视频').click();
  await page.waitForFunction(async () => {
    const library = await window.vexa.queryLibrary({ limit: 50 });
    return library.total === 6 && library.items.every(item => item.status === 'ready');
  });
  const closeScan = button('关闭扫描状态');
  if (await closeScan.count()) await closeScan.click();
  for (const [, name] of scenes.slice(0, 4)) await page.locator('.library-card').filter({ hasText: `${name}.mp4` }).click();
  await button('创建播放墙').click();
  await page.waitForFunction(() => {
    const videos = [...document.querySelectorAll('.video-tile video')];
    return videos.length === 4 && videos.every(video => video.readyState >= 2 && !video.paused);
  });
  await button('全屏播放墙').click();
  await page.waitForFunction(() => !!document.fullscreenElement);
  for (let attempt = 0; attempt < 80; attempt++) {
    if (await app.evaluate(() => global.__demoNativeFullscreen)) break;
    await wait(100);
  }
  assert.equal(await app.evaluate(() => global.__demoNativeFullscreen), true);
  // Fix the recording viewport without changing the user's display settings.
  await page.setViewportSize({ width: 1280, height: 720 });
  await wait(1200);
  await page.evaluate(() => {
    const wall = document.fullscreenElement;
    const style = document.createElement('style');
    style.textContent = `.recording-pointer{position:fixed;left:0;top:0;width:23px;height:29px;pointer-events:none;z-index:2147483647;filter:drop-shadow(0 2px 3px #0009);transition:opacity .2s}.controls-idle .recording-pointer{opacity:0}.recording-pointer::before{content:'';position:absolute;width:34px;height:34px;left:-16px;top:-16px;border:2px solid #dec4ff;background:#c8a5ff44;border-radius:50%;opacity:0}.recording-pointer.clicked::before{animation:demoClick .5s ease-out}@keyframes demoClick{from{opacity:1;transform:scale(.4)}to{opacity:0;transform:scale(1.6)}}`;
    wall.append(style);
    const pointer = document.createElement('div');
    pointer.className = 'recording-pointer';
    pointer.setAttribute('aria-hidden', 'true');
    pointer.innerHTML = '<svg viewBox="0 0 24 30" width="23" height="29"><path d="M2 2 L2 24 L8 18 L12 27 L16 25 L12 16 L21 16 Z" fill="white" stroke="#272331" stroke-width="1.8" stroke-linejoin="round"/></svg>';
    wall.append(pointer);
    wall.addEventListener('pointermove', event => pointer.style.transform = `translate(${event.clientX}px,${event.clientY}px)`, true);
    wall.addEventListener('pointerdown', () => { pointer.classList.remove('clicked'); void pointer.offsetWidth; pointer.classList.add('clicked'); }, true);
  });
  await page.mouse.move(800, 350);
  await page.waitForFunction(() => document.querySelector('.wall-panel').classList.contains('controls-idle'));
  session = await app.context().newCDPSession(page);
  const frames = [], pending = [];
  const framesDir = join(work, 'frames');
  await fs.mkdir(framesDir);
  let firstFrame;
  const firstFrameReady = new Promise(resolve => firstFrame = resolve);
  session.on('Page.screencastFrame', event => {
    if (captureStart === undefined) { captureStart = event.metadata.timestamp; firstFrame(); }
    const file = `frame-${String(frames.length).padStart(6, '0')}.jpg`;
    frames.push({ file, seconds: event.metadata.timestamp - captureStart });
    pending.push(fs.writeFile(join(framesDir, file), Buffer.from(event.data, 'base64'))
      .then(() => session.send('Page.screencastFrameAck', { sessionId: event.sessionId }))
      .catch(error => errors.push(error.message)));
  });
  await session.send('Page.startScreencast', { format: 'jpeg', quality: 94, maxWidth: 1280, maxHeight: 720, everyNthFrame: 1 });
  await firstFrameReady;
  await storyboard();
  await session.send('Page.stopScreencast');
  await Promise.all(pending);
  await session.detach();
  session = undefined;
  assert.deepEqual(errors, []);
  const runtime = await app.evaluate(({ app }) => ({ version: app.getVersion(), platform: process.platform, arch: process.arch, packaged: app.isPackaged, executable: process.execPath }));
  assert.equal(runtime.version, version);
  assert.equal(runtime.packaged, true);
  await app.close(); app = undefined;
  await Promise.all([fs.rm(profile, { recursive: true, force: true }), fs.rm(videos, { recursive: true, force: true })]);
  const concat = ['ffconcat version 1.0'];
  for (let i = 0; i < frames.length; i++) {
    const duration = i < frames.length - 1 ? Math.max(.001, frames[i + 1].seconds - frames[i].seconds) : .5;
    concat.push(`file '${frames[i].file}'`, `duration ${duration.toFixed(6)}`);
  }
  concat.push(`file '${frames.at(-1).file}'`);
  const raw = join(framesDir, 'capture.ffconcat');
  await fs.writeFile(raw, concat.join('\n') + '\n');
  const duration = frames.at(-1).seconds + .5;
  console.log(`Recorded ${frames.length} frames over ${duration.toFixed(1)} seconds; rendering captions.`);
  const rendered = await render(raw, duration);
  const report = { success: true, runtime, duration: Number(rendered.metadata.format.duration), capturedFrames: frames.length,
    output: rendered.movie, chapters, checks, errors, viewport: { width: 1280, height: 720 }, outputSize: { width: 1920, height: 1080 },
    audio: 'No audio track; generated demo clips are silent.', source: 'Actual packaged app renderer, fullscreen verified throughout. Pointer is a recording aid. Captions are postproduction.' };
  await fs.mkdir(join(project, 'test-results'), { recursive: true });
  await fs.writeFile(join(project, 'test-results/fullscreen-walkthrough-results.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  // Keep the recording intermediates in .cache for re-editing without re-recording.
}
main().catch(async error => {
  console.error(error);
  if (page && !page.isClosed()) await page.screenshot({ path: join(work, 'failure.png') }).catch(() => {});
  process.exitCode = 1;
}).finally(async () => {
  if (session) await session.send('Page.stopScreencast').catch(() => {});
  await app?.close().catch(() => {});
});
