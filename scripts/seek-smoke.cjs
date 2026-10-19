// Real multi-player seeking regression; uses generated media and an isolated profile.
const { _electron } = require('playwright');
const assert = require('node:assert/strict');
const { mkdtemp, mkdir, copyFile, writeFile, stat, rm } = require('node:fs/promises');
const { spawnSync } = require('node:child_process');
const { join, resolve } = require('node:path');
const { tmpdir } = require('node:os');
const project = resolve(__dirname, '..');
const streams = 24;
const strict = process.env.VEXA_SEEK_ASSERT !== '0';
const report = { streams, syntheticLowComplexity: true, strict, checks: [], stages: {}, errors: [] };
let app, temporary, page;
const check = (name, pass) => { assert.ok(pass, name); report.checks.push(name); console.log('PASS', name); };
async function until(fn, timeout = 45000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { if (await fn()) return; await new Promise(r => setTimeout(r, 100)); }
  throw Error('Playback did not reach the expected state');
}
async function stage(selector, count = 60) {
  const result = await page.evaluate(async ({ selector, count }) => {
    const input = document.querySelector(selector);
    if (!input) throw Error('Missing test control: ' + selector);
    window.seekMetrics.counts = {};
    const start = performance.now();
    let last = start, maxDelay = 0;
    const heartbeat = setInterval(() => { const now = performance.now(); maxDelay = Math.max(maxDelay, now - last); last = now; }, 16);
    for (let i = 0; i < count; i++) {
      input.value = selector.includes('volume') ? String(0.25 + (i % 40) / 100) : String(15 + i * 0.8);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(requestAnimationFrame);
    }
    const beforeRelease = { ...window.seekMetrics.counts };
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 250));
    clearInterval(heartbeat);
    return { events: count, elapsedMs: performance.now() - start, maxHeartbeatMs: maxDelay, beforeRelease, counts: { ...window.seekMetrics.counts } };
  }, { selector, count });
  console.log(JSON.stringify({ control: selector, ...result }));
  return result;
}
async function main() {
  temporary = await mkdtemp(join(tmpdir(), 'vexa-seek-test-'));
  const data = join(temporary, 'data'), videos = join(temporary, 'videos');
  await mkdir(data); await mkdir(videos);
  await writeFile(join(data, 'settings.json'), JSON.stringify({ autoNext: false, randomStart: false, cacheEnabled: false, layout: 'grid' }));
  let fixture = join(project, 'test-results/fixtures/测试视频 with spaces/01-alpine.mp4');
  if (!(await stat(fixture).catch(() => null))) {
    fixture = join(temporary, 'fixture.mp4');
    const generated = spawnSync(require('ffmpeg-static'), [
      '-nostdin', '-v', 'error', '-loop', '1', '-i', join(project, 'ui-preview/assets/alpine.jpg'),
      '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-t', '25',
      '-vf', 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '30', '-pix_fmt', 'yuv420p',
      '-r', '30', '-c:a', 'aac', '-threads', '2', '-y', fixture,
    ], { windowsHide: true, timeout: 60000 });
    assert.equal(generated.status, 0, generated.stderr?.toString());
  }
  for (let i = 0; i < streams; i++) await copyFile(fixture, join(videos, `${String(i + 1).padStart(2, '0')}-sample.mp4`));
  app = await _electron.launch({
    executablePath: process.env.VEXA_TEST_EXECUTABLE || require('electron'),
    args: [...(process.env.VEXA_TEST_EXECUTABLE ? [] : ['.']), `--user-data-dir=${data}`],
    cwd: project, env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined, VEXA_DATA_DIR: data },
  });
  page = await app.firstWindow();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setIgnoreMouseEvents(true));
  page.on('pageerror', error => report.errors.push(error.message));
  await page.getByRole('heading', { name: '你的私人放映室.' }).waitFor();
  await app.evaluate(({ dialog }, folder) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] }); }, videos);
  await page.getByRole('button', { name: '导入文件夹', exact: true }).click();
  await until(async () => (await page.evaluate(() => window.vexa.queryLibrary({ limit: 100 }))).items.filter(m => m.status === 'ready').length === streams);
  await page.getByRole('button', { name: '全选当前列表', exact: true }).click();
  await until(async () => (await page.locator('.selection-bar strong').textContent()) === String(streams));
  await page.getByRole('button', { name: '创建播放墙', exact: true }).click();
  await until(() => page.locator('.video-tile video').evaluateAll(v => v.length === 24 && v.every(e => e.readyState >= 2 && e.currentTime > 0 && !e.paused && !e.error)));
  report.runtime = await app.evaluate(({ app }) => ({ version: app.getVersion(), gpu: app.getGPUFeatureStatus() }));
  await page.evaluate(() => {
    window.seekMetrics = { counts: {} };
    for (const name of ['currentTime', 'volume', 'muted', 'playbackRate', 'loop']) {
      const descriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, name);
      Object.defineProperty(HTMLMediaElement.prototype, name, { ...descriptor, set(value) {
        if (this.matches('.video-tile video')) window.seekMetrics.counts[name] = (window.seekMetrics.counts[name] || 0) + 1;
        return descriptor.set.call(this, value);
      } });
    }
  });
  report.stages.singleSeek = await stage('.tile-progress');
  if (strict) {
    check('single-video drag previews without decoding intermediate targets', !report.stages.singleSeek.beforeRelease.currentTime);
    check('single-video release seeks only its own player once', report.stages.singleSeek.counts.currentTime === 1);
  }
  await page.getByRole('button', { name: '统一播放设置', exact: true }).click();
  report.stages.allSeek = await stage('#wall-unified-seek');
  if (strict) {
    check('24-video drag does not issue intermediate seeks', !report.stages.allSeek.beforeRelease.currentTime);
    check('release seeks every video exactly once', report.stages.allSeek.counts.currentTime === streams);
  }
  await until(() => page.locator('.video-tile video').evaluateAll(v => v.every(e => !e.seeking && e.readyState >= 2 && !e.error)));
  check('every player recovers after unified seeking', true);
  report.stages.volume = await stage('#wall-unified-volume', 40);
  if (strict) check('volume drag avoids repeated full-wall property writes', report.stages.volume.counts.volume <= 40 * streams);
  if (strict) check('volume changes leave playback rate and loop properties untouched', !report.stages.volume.counts.playbackRate && !report.stages.volume.counts.loop);
  // Browser pointer input confirms native range behavior, including release outside.
  await page.getByRole('button', { name: '收起统一播放设置', exact: true }).click();
  const slider = page.locator('.tile-progress').first();
  await slider.hover();
  const box = await slider.boundingBox();
  await page.evaluate(() => { window.seekMetrics.counts = {}; });
  await page.mouse.move(box.x + box.width * 0.15, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.65, box.y + box.height / 2, { steps: 20 });
  const inDrag = await page.evaluate(() => window.seekMetrics.counts.currentTime || 0);
  await page.mouse.move(box.x + box.width * 0.65, box.y - 24);
  await page.mouse.up();
  await page.waitForTimeout(200);
  report.pointer = { duringDrag: inDrag, afterRelease: await page.evaluate(() => window.seekMetrics.counts.currentTime || 0) };
  console.log(JSON.stringify({ pointer: report.pointer }));
  if (strict) {
    check('pointer drag waits until release before seeking', inDrag === 0);
    check('release outside the slider reaches the chosen position once', report.pointer.afterRelease === 1);
  }
  await page.getByRole('button', { name: '统一播放设置', exact: true }).click();
  const allSlider = page.locator('#wall-unified-seek');
  await allSlider.hover();
  const allBox = await allSlider.boundingBox();
  await page.evaluate(() => { window.seekMetrics.counts = {}; });
  await page.mouse.move(allBox.x + allBox.width * 0.2, allBox.y + allBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(allBox.x + allBox.width * 0.45, allBox.y + allBox.height / 2, { steps: 20 });
  const allInDrag = await page.evaluate(() => window.seekMetrics.counts.currentTime || 0);
  await page.mouse.move(allBox.x + allBox.width * 0.45, allBox.y - 24);
  await page.mouse.up();
  await page.waitForTimeout(200);
  report.allPointer = { duringDrag: allInDrag, afterRelease: await page.evaluate(() => window.seekMetrics.counts.currentTime || 0) };
  console.log(JSON.stringify({ allPointer: report.allPointer }));
  if (strict) {
    check('unified pointer drag keeps all players playing without intermediate seeks', report.allPointer.duringDrag === 0);
    check('unified release outside seeks every player once', report.allPointer.afterRelease === streams);
  }
  await until(() => page.locator('.video-tile video').evaluateAll(v => v.every(e => !e.seeking && !e.paused && e.readyState >= 2 && !e.error)));
  const framesBefore = await page.locator('.video-tile video').evaluateAll(v => v.map(e => ({ time: e.currentTime, frames: e.getVideoPlaybackQuality().totalVideoFrames })));
  await page.waitForTimeout(1500);
  const states = await page.locator('.video-tile video').evaluateAll(v => v.map(e => ({ time: e.currentTime, paused: e.paused, error: e.error?.code, frames: e.getVideoPlaybackQuality().totalVideoFrames })));
  report.continuity = states.map((state, i) => ({ ...state, before: framesBefore[i] }));
  check('all 24 players continue advancing after repeated control operations', states.every((e, i) => !e.paused && !e.error && e.time > framesBefore[i].time + 0.5 && e.frames > framesBefore[i].frames));
  check('no renderer errors', report.errors.length === 0);
  report.success = true;
}
main().catch(async error => { report.errors.push(error.message); console.error(error); if(page) report.failureState = await page.locator('.video-tile video').evaluateAll(v => v.map(e => ({ time: e.currentTime, paused: e.paused, seeking: e.seeking, ready: e.readyState, error: e.error?.message }))).catch(() => null); process.exitCode = 1; }).finally(async () => {
  if (app) await app.close().catch(() => {});
  if (temporary && resolve(temporary).startsWith(resolve(tmpdir()) + require('node:path').sep) && temporary.includes('vexa-seek-test-')) await rm(temporary, { recursive: true, force: true });
  const output = process.env.VEXA_SEEK_REPORT || join(project, 'test-results/seek-results.json');
  await mkdir(require('node:path').dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2));
});
