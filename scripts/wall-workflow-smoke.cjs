const { _electron } = require('playwright');
const fs = require('node:fs/promises');
const { join, resolve } = require('node:path');
const { tmpdir } = require('node:os');
const { spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');
const project = resolve(__dirname, '..'), output = resolve(process.env.VEXA_WALL_REPORT_DIR || join(project, 'test-results/wall-workflow'));
let root, app, page, runtime;
const checks = [], errors = [];
const button = name => page.getByRole('button', { name, exact: true });
const historyButton = (id, name) => page.locator(`[data-history-id="${id}"]`).getByRole('button', { name, exact: true });
const check = (name, value) => { assert.ok(value, name); checks.push(name); console.log('PASS', name); };
async function launch(profile) {
  app = await _electron.launch({ executablePath: process.env.VEXA_TEST_EXECUTABLE || require('electron'),
    args: [...(process.env.VEXA_TEST_EXECUTABLE ? [] : ['.']), `--user-data-dir=${profile}`], cwd: project,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined, VEXA_DATA_DIR: profile }, timeout: 45000 });
  page = await app.firstWindow(); page.setDefaultTimeout(15000);
  page.on('pageerror', e => errors.push(e.message));
  runtime = await app.evaluate(({ app }) => ({ version: app.getVersion(), arch: process.arch, packaged: app.isPackaged, translated: app.runningUnderARM64Translation }));
  assert.equal(runtime.version, require('../package.json').version);
  if (process.env.VEXA_TEST_EXECUTABLE) {
    assert.ok(runtime.packaged, 'Run the actual packaged application');
    assert.equal(runtime.arch, process.arch);
  }
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0]; w.setContentSize(1440, 1000); w.setIgnoreMouseEvents(true);
    global.__nativeFullscreen = false;
    w.on('enter-full-screen', () => global.__nativeFullscreen = true);
  });
  await page.getByRole('heading', { name: '你的私人放映室.' }).waitFor();
}
async function selected() { return page.locator('.library-card[aria-checked="true"]').count(); }
async function box(first, last, additive = false) {
  const a = await page.locator('.library-card').nth(first).boundingBox(), b = await page.locator('.library-card').nth(last).boundingBox();
  assert.ok(a && b);
  if (additive) await page.keyboard.down('Meta');
  await page.mouse.move(a.x + 6, a.y + 6); await page.mouse.down();
  await page.mouse.move(b.x + b.width - 6, b.y + Math.min(b.height - 6, 100), { steps: 20 });
  await page.mouse.up();
  if (additive) await page.keyboard.up('Meta');
  await page.waitForTimeout(180);
}
async function tiles(count) {
  await page.waitForFunction(n => {
    const videos = [...document.querySelectorAll('.video-tile video')];
    return videos.length === n && videos.every(v => v.readyState >= 2);
  }, count);
}
async function main() {
  await fs.mkdir(output, { recursive: true });
  root = await fs.mkdtemp(join(tmpdir(), 'vexa-wall-workflow-'));
  const profile = join(root, 'profile'), media = join(root, 'videos');
  await fs.mkdir(profile); await fs.mkdir(media);
  await fs.writeFile(join(profile, 'settings.json'), JSON.stringify({ autoNext: false, randomStart: false, theme: 'dark', thumbnailSize: 'small' }));
  const fixture = join(root, 'fixture.mp4');
  const cached = join(project, '.cache/readme-demo-fixtures-v1/01-山间湖泊.mp4');
  const encode = spawnSync(require('ffmpeg-static'), ['-v', 'error', '-nostdin', '-y',
    ...(await fs.stat(cached).catch(() => null) ? ['-stream_loop', '1', '-i', cached, '-t', '60', '-c', 'copy'] :
      ['-loop', '1', '-framerate', '10', '-i', join(project, 'ui-preview/assets/alpine.jpg'), '-vf', 'scale=480:270', '-t', '60', '-r', '10', '-an', '-c:v', 'libx264', '-preset', 'ultrafast', '-threads', '2']), fixture]);
  assert.equal(encode.status, 0);
  const paths = [];
  for (let i = 1; i <= 40; i++) { const file = join(media, `${String(i).padStart(2, '0')}-风景.mp4`); await fs.link(fixture, file); paths.push(file); }
  await launch(profile);
  await app.evaluate(({ dialog }, files) => dialog.showOpenDialog = async () => ({ canceled: false, filePaths: files }), paths);
  await button('选择视频').click();
  await page.waitForFunction(async () => { const l = await window.vexa.queryLibrary({ limit: 200 }); return l.total === 40 && l.items.every(m => m.status === 'ready'); }, null, { timeout: 60000 });
  await page.getByText('导入完成', { exact: true }).waitFor({ timeout: 60000 });
  const dismiss = button('关闭扫描状态'); if (await dismiss.count()) await dismiss.click();
  await page.locator('.library-card').first().waitFor();
  await page.waitForTimeout(400);
  await button('全选当前列表').waitFor();
  await page.waitForFunction(() => !document.querySelector('[aria-label="全选当前列表"]').disabled);
  await box(0, 1);
  check('Drag selects two cards without a trailing click toggling one off', await selected() === 2);
  await box(2, 2, true);
  check('Cmd-drag adds another card', await selected() === 3);
  const fourth = await page.locator('.library-card').nth(3).boundingBox();
  await page.mouse.move(fourth.x + 6, fourth.y + 6); await page.mouse.down();
  await page.mouse.move(fourth.x + 70, fourth.y + 80, { steps: 10 });
  await page.screenshot({ path: join(output, 'drag-selection.png') });
  await page.keyboard.press('Escape'); await page.waitForTimeout(400); await page.mouse.up();
  check('Escape cancels drag without changing the previous selection', await selected() === 3);
  await page.locator('.library-card').nth(3).getByRole('button', { name: '收藏视频', exact: true }).click();
  check('Favorite controls do not start selection or playback', await selected() === 3 && await page.locator('.video-tile').count() === 0);
  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(250);
  const first = await page.locator('.library-card').first().boundingBox();
  const beforeScroll = await page.evaluate(() => scrollY);
  await page.mouse.move(first.x + 6, first.y + 6); await page.mouse.down();
  await page.mouse.move(first.x + 100, await page.evaluate(() => innerHeight - 5), { steps: 20 });
  await page.waitForTimeout(900); await page.mouse.up();
  const scrollState = await page.evaluate(() => ({ scroll: scrollY }));
  check('Edge dragging auto-scrolls and selects beyond the initial viewport', scrollState.scroll > beforeScroll + 200);
  const selectionText = await page.locator('.selection-bar').innerText();
  check('Offscreen drag selection is retained', Number(selectionText.match(/已选\s*(\d+)/)?.[1]) > 3);
  await button('取消选择').click();
  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(250);
  await box(0, 2);
  await button('创建播放墙').click(); await tiles(3);
  check('Creates a playback wall from the drag selection', await page.locator('.video-tile').count() === 3);
  await page.mouse.move(20, 20);
  check('Remove control is visible without hovering a tile', await page.locator('.tile-remove').first().isVisible());
  const keep = await page.locator('.video-tile video').nth(1).evaluateHandle(v => v);
  await page.locator('.tile-remove').first().click(); await tiles(2);
  check('Removing a playing tile keeps the other player mounted and running', await keep.evaluate(v => v.isConnected && !v.paused));
  await button('撤销移出画面').click(); await tiles(3);
  await button('网格').click();
  await button('全部暂停').click();
  await page.locator('.video-tile').first().hover();
  await page.locator('.video-tile').first().getByRole('button', { name: '单片循环', exact: true }).click();
  await button('统一播放设置').click();
  await button('全部 2 倍速').click();
  const slider = await page.getByRole('slider', { name: '统一进度', exact: true }).boundingBox();
  await page.mouse.click(slider.x + slider.width * .4, slider.y + slider.height / 2);
  await button('收起统一播放设置').click();
  await page.waitForFunction(() => [...document.querySelectorAll('.video-tile video')].every(v => v.paused && v.currentTime > 20));
  await button('打开播放墙历史').click();
  await page.locator('.history-entry').first().waitFor();
  await page.waitForTimeout(300);
  const original = (await page.evaluate(() => window.vexa.wallHistory.list()))[0];
  check('History saves layout, per-tile progress, loop and speed', original.tiles.length === 3 && original.layout === 'grid' && original.tiles[0].loop && original.tiles.every(t => t.speed === 2 && t.progress > 20));
  await page.screenshot({ path: join(output, 'history-window.png') });
  await button('关闭播放墙历史').click();
  await page.getByRole('button', { name: /^视频库/ }).click();
  await box(4, 4); await button('创建播放墙').click(); await tiles(1);
  await button('主次').click(); await button('打开播放墙历史').click();
  await page.waitForFunction(async () => (await window.vexa.wallHistory.list()).length === 2);
  check('A new wall creates a second history entry', await page.locator('.history-entry').count() === 2);
  await app.close(); app = undefined;
  await launch(profile);
  await button('播放墙历史').click(); await page.locator('.history-entry').first().waitFor();
  check('History survives app restart without autoplay on startup', await page.locator('.history-entry').count() === 2 && await page.locator('.video-tile').count() === 0);
  await historyButton(original.id, "恢复这组播放墙").click(); await tiles(3);
  await page.waitForFunction(() => [...document.querySelectorAll('.video-tile video')].every(v => v.paused && v.playbackRate === 2 && v.currentTime > 20));
  await page.waitForFunction(() => document.querySelectorAll('.tile-loading').length === 0);
  check('Restored paused videos show ready frames instead of endless loading', await page.locator('.tile-loading').count() === 0);
  check('Restores the original wall, paused state and progress after restart', await button('网格').evaluate(b => b.classList.contains('selected')));
  await button('全屏播放墙').click();
  await page.waitForFunction(() => !!document.fullscreenElement);
  if (process.platform === 'darwin') for (let i = 0; i < 100 && !await app.evaluate(() => global.__nativeFullscreen); i++) await page.waitForTimeout(100);
  await button('打开播放墙历史').click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(output, 'history-fullscreen.png') });
  check('History panel is accessible inside fullscreen', await page.locator('.wall-history-panel').evaluate(el => document.fullscreenElement.contains(el)));
  await historyButton(original.id, "恢复这组播放墙").click(); await tiles(3);
  check('Restoring history keeps fullscreen active', await page.evaluate(() => !!document.fullscreenElement));
  await page.mouse.move(200, 150);
  await page.locator('.tile-remove').first().click(); await tiles(2);
  await button('撤销移出画面').click(); await tiles(3);
  check('Remove and undo work inside fullscreen', await page.evaluate(() => !!document.fullscreenElement));
  await fs.rename(paths[0], `${paths[0]}.missing`);
  await button('打开播放墙历史').click();
  await historyButton(original.id, "恢复这组播放墙").click(); await tiles(2);
  check('Restores available files when one original video is missing', await page.locator('.video-tile').count() === 2);
  await fs.rename(paths[1], `${paths[1]}.missing`); await fs.rename(paths[2], `${paths[2]}.missing`);
  await button('打开播放墙历史').click(); await historyButton(original.id, "恢复这组播放墙").click();
  await page.getByRole('alert').filter({ hasText: '这组视频暂时不可用' }).waitFor();
  check('An unavailable history does not replace the current wall', await page.locator('.video-tile').count() === 2);
  await fs.rename(`${paths[1]}.missing`, paths[1]); await fs.rename(`${paths[2]}.missing`, paths[2]);
  await historyButton(original.id, "删除这条播放墙历史").click();
  await page.waitForTimeout(5500);
  check('Deleted active history is not recreated by periodic saving', !(await page.evaluate(() => window.vexa.wallHistory.list())).some(e => e.id === original.id));
  await button('清空历史').click(); await button('确认清空').click();
  await page.waitForFunction(async () => (await window.vexa.wallHistory.list()).length === 0);
  check('Clearing history leaves source videos intact', (await fs.stat(paths[1])).isFile());
  assert.deepEqual(errors, []);
  await app.close(); app = undefined;
  await fs.writeFile(join(output, 'results.json'), JSON.stringify({ success: true, runtime, checks, errors }, null, 2));
}
main().catch(async error => { console.error(error); if (page && !page.isClosed()) await page.screenshot({ path: join(output, 'failure.png') }).catch(() => {}); process.exitCode = 1; })
  .finally(async () => { await app?.close().catch(() => {}); if (root) await fs.rm(root, { recursive: true, force: true }); });
