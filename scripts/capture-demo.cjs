// Capture actual desktop UI for the README, using only an isolated demo profile.
const { _electron } = require("playwright");
const { spawn } = require("node:child_process");
const { mkdtemp, mkdir, writeFile, copyFile, rm, stat } = require("node:fs/promises");
const { resolve, join, sep } = require("node:path");
const assert = require("node:assert/strict");
const ffmpeg = require("ffmpeg-static");
const project = resolve(__dirname, "..");
const version = require("../package.json").version;
const output = join(project, "docs/media");
const fullscreenDemo = process.argv.includes("--fullscreen");
let temporary, app, page;
const errors = [];

async function prepareWall(page, scenes, count) {
  for (const [, name] of scenes.slice(0, count))
    await page.locator(".library-card").filter({ hasText: `${name}.mp4` }).click();
  await page.getByRole("button", { name: "创建播放墙", exact: true }).click();
  await page.waitForFunction(count => {
    const players = [...document.querySelectorAll(".video-tile video")];
    return players.length === count && players.every(video => video.readyState >= 2 && !video.paused && video.currentTime > 0);
  }, count);
}

async function prepareFullscreen(page) {
  for (const tile of await page.locator(".video-tile").all()) {
    await tile.hover();
    await tile.getByRole("button", { name: "单片循环", exact: true }).click();
  }
  await page.getByRole("button", { name: "网格", exact: true }).click();
  await page.getByRole("button", { name: "全屏播放墙", exact: true }).click();
  await page.waitForFunction(() => !!document.fullscreenElement);
  // The cursor and click ring are recording aids, confined to this demo window.
  await page.evaluate(() => {
    const wall = document.fullscreenElement;
    const style = document.createElement("style");
    style.textContent = `
      .recording-pointer {position:fixed;left:0;top:0;width:24px;height:30px;pointer-events:none;z-index:2147483647;transition:opacity .2s;filter:drop-shadow(0 2px 3px #0008)}
      .controls-idle .recording-pointer {opacity:0}
      .recording-pointer::before {content:"";position:absolute;width:36px;height:36px;left:-17px;top:-17px;border:2px solid #c8a9ff;background:#bca1f533;border-radius:50%;opacity:0}
      .recording-pointer.clicked::before {animation:recording-click .38s ease-out}
      @keyframes recording-click {from{opacity:1;transform:scale(.45)}to{opacity:0;transform:scale(1.45)}}`;
    wall.append(style);
    const pointer = document.createElement("div");
    pointer.className = "recording-pointer";
    pointer.setAttribute("aria-hidden", "true");
    pointer.innerHTML = '<svg viewBox="0 0 24 30" width="24" height="30"><path d="M2 2 L2 24 L8 18 L12 27 L16 25 L12 16 L21 16 Z" fill="white" stroke="#272331" stroke-width="1.8" stroke-linejoin="round"/></svg>';
    wall.append(pointer);
    wall.addEventListener("pointermove", event => {
      pointer.style.transform = `translate(${event.clientX}px,${event.clientY}px)`;
    }, true);
    wall.addEventListener("pointerdown", () => {
      pointer.classList.remove("clicked");
      void pointer.offsetWidth;
      pointer.classList.add("clicked");
    }, true);
  });
  await page.mouse.move(900, 400, { steps: 12 });
  await page.waitForFunction(() => document.querySelector(".wall-panel").classList.contains("controls-idle"));
  await page.waitForTimeout(450);
}

async function recordFullscreen(page) {
  const chapters = [{ name: "全屏四画面", seconds: 0 }], began = Date.now();
  const chapter = name => {
    const item = { name, seconds: (Date.now() - began) / 1000 };
    chapters.push(item);
    console.log(`Recording: ${name}`);
  };
  const moveTo = async (locator, position) => {
    if (await page.locator(".wall-panel").evaluate(wall => wall.classList.contains("controls-idle"))) {
      await page.mouse.move(1200, 500, { steps: 12 });
      await page.waitForFunction(() => !document.querySelector(".wall-panel").classList.contains("controls-idle"));
    }
    const box = await locator.boundingBox();
    assert.ok(box);
    const cursor = await page.locator(".recording-pointer").boundingBox();
    const target = { x: box.x + (position?.x ?? box.width / 2), y: box.y + (position?.y ?? box.height / 2) };
    for (let step = 1; step <= 15; step++) {
      await page.mouse.move(cursor.x + (target.x - cursor.x) * step / 15, cursor.y + (target.y - cursor.y) * step / 15);
      await page.waitForTimeout(12);
    }
    await page.waitForTimeout(140);
  };
  const click = async locator => { await moveTo(locator); await locator.click(); };
  const wait = ms => page.waitForTimeout(ms);
  const tiles = page.locator(".video-tile");
  await wait(1400);
  chapter("主次布局");
  await click(page.getByRole("button", { name: "主次", exact: true }));
  await wait(1400);
  chapter("网格布局");
  await click(page.getByRole("button", { name: "网格", exact: true }));
  await wait(1300);
  chapter("双击放大");
  const expanded = tiles.nth(2);
  const zoomPoint = { x: 160, y: 140 };
  await moveTo(expanded.locator(".tile-shade"), zoomPoint);
  await expanded.locator(".tile-shade").dblclick({ position: zoomPoint });
  await page.waitForFunction(() => !!document.querySelector(".video-wall.is-zoomed"));
  await wait(3200);
  chapter("恢复四画面");
  await moveTo(expanded.locator(".tile-shade"), zoomPoint);
  await expanded.locator(".tile-shade").dblclick({ position: zoomPoint });
  await page.waitForFunction(() => !document.querySelector(".video-wall.is-zoomed"));
  await wait(1000);
  chapter("随机换片");
  await tiles.first().hover();
  const previous = await tiles.first().locator("video").getAttribute("src");
  await click(tiles.first().getByRole("button", { name: "随机替换此画面", exact: true }));
  await page.waitForFunction(previous => {
    const video = document.querySelector(".video-tile video");
    return video.getAttribute("src") !== previous && video.readyState >= 2;
  }, previous);
  await wait(1500);
  chapter("拖动交换");
  const before = await tiles.first().getAttribute("style");
  await moveTo(tiles.first());
  await tiles.first().dragTo(tiles.nth(1));
  await page.waitForFunction(before => document.querySelector(".video-tile").getAttribute("style") !== before, before);
  await wait(1300);
  chapter("六画面网格");
  await click(page.locator(".subtle-button"));
  await wait(400);
  await click(page.locator(".count-popover").getByRole("button", { name: "6", exact: true }));
  await page.waitForFunction(() => document.querySelectorAll(".video-tile video").length === 6);
  await wait(1700);
  chapter("六画面主次");
  await click(page.getByRole("button", { name: "主次", exact: true }));
  await wait(1400);
  chapter("统一进度与倍速");
  await click(page.getByRole("button", { name: "统一播放设置", exact: true }));
  await wait(700);
  await click(page.getByRole("button", { name: "全部 3 倍速", exact: true }));
  await wait(900);
  await click(page.getByRole("button", { name: "全部 1 倍速", exact: true }));
  const slider = page.getByRole("slider", { name: "统一进度", exact: true });
  const box = await slider.boundingBox();
  assert.ok(box);
  await page.mouse.move(box.x + box.width * .23, box.y + box.height / 2, { steps: 16 });
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * .43, box.y + box.height / 2, { steps: 28 });
  await page.mouse.up();
  await wait(650);
  await click(page.getByRole("button", { name: "收起统一播放设置", exact: true }));
  chapter("静止隐藏控件");
  await page.mouse.move(1150, 450, { steps: 20 });
  await page.waitForFunction(() => document.querySelector(".wall-panel").classList.contains("controls-idle"));
  await wait(1100);
  chapter("鼠标唤醒");
  await page.mouse.move(1250, 550, { steps: 24 });
  await page.waitForFunction(() => !document.querySelector(".wall-panel").classList.contains("controls-idle"));
  await wait(900);
  chapter("全屏六画面");
  await click(page.getByRole("button", { name: "网格", exact: true }));
  await page.mouse.move(1100, 400, { steps: 18 });
  await page.waitForFunction(() => document.querySelector(".wall-panel").classList.contains("controls-idle"));
  await wait(1400);
  assert.equal(await page.evaluate(() => !!document.fullscreenElement), true);
  return chapters;
}

function encode(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, ["-nostdin", "-hide_banner", "-loglevel", "error", "-y", ...args], { windowsHide: true });
    let stderr = "";
    child.stderr.on("data", chunk => { stderr = (stderr + chunk).slice(-4000); });
    child.on("error", reject);
    child.on("exit", code => code === 0 ? resolve() : reject(new Error(`FFmpeg failed (${code}): ${stderr}`)));
  });
}

async function main() {
  await mkdir(join(project, ".cache"), { recursive: true });
  temporary = await mkdtemp(join(project, ".cache/readme-demo-"));
  const data = join(temporary, "profile"), videos = join(temporary, "演示视频");
  const fixtures = join(project, ".cache/readme-demo-fixtures-v1");
  await Promise.all([mkdir(data), mkdir(videos), mkdir(output, { recursive: true }), mkdir(fixtures, { recursive: true })]);
  await writeFile(join(data, "settings.json"), JSON.stringify({
    theme: "dark", autoNext: false, randomStart: false, layout: "focus",
  }));
  const scenes = [
    ["alpine", "01-山间湖泊"], ["dunes", "02-沙漠峡谷"],
    ["forest", "03-森林漫步"], ["coast", "04-海边浪潮"],
    ["mountain", "05-远山云影"], ["night", "06-城市夜色"],
  ];
  const paths = [];
  for (const [asset, name] of scenes) {
    const file = join(fixtures, `${name}.mp4`);
    if (!(await stat(file).catch(() => null))?.size) await encode([
      "-loop", "1", "-i", join(project, `ui-preview/assets/${asset}.jpg`),
      "-vf", "scale=1600:-2,zoompan=z='min(1.10,1+on*0.00015)':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s=1280x720:fps=24,setsar=1",
      "-t", "30", "-an", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "27", "-pix_fmt", "yuv420p", "-threads", "2", file,
    ]);
    const demoFile = join(videos, `${name}.mp4`);
    await copyFile(file, demoFile);
    paths.push(demoFile);
    console.log(`Generated demo clip: ${name}`);
  }
  const executablePath = process.env.VEXA_TEST_EXECUTABLE ||
    ((await stat(join(project, `release/${version}/win-unpacked/Vexa Player.exe`)).catch(() => null))
      ? join(project, `release/${version}/win-unpacked/Vexa Player.exe`) : require("electron"));
  app = await _electron.launch({
    executablePath,
    args: [...(executablePath === require("electron") ? ["."] : []), `--user-data-dir=${data}`],
    cwd: project,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined, VEXA_DATA_DIR: data },
    timeout: 30000,
  });
  console.log("Opened isolated desktop app");
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1440, 1000));
  page = await app.firstWindow({ timeout: 30000 });
  page.setDefaultTimeout(10000);
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => {
    if (/^https?:/.test(request.url())) errors.push("Unexpected remote request during offline recording");
  });
  await page.getByRole("heading", { name: "你的私人放映室." }).waitFor();
  await app.evaluate(({ dialog }, paths) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: paths });
  }, paths);
  await page.getByRole("button", { name: "选择视频", exact: true }).click();
  await page.waitForFunction(async () => {
    const data = await window.vexa.queryLibrary({ limit: 50 });
    return data.total === 6 && data.items.every(item => item.status === "ready");
  });
  const scanClose = page.getByRole("button", { name: "关闭扫描状态", exact: true });
  if (await scanClose.count()) await scanClose.click();
  await page.locator(".library-card").first().waitFor();
  console.log("Imported six real demo videos");
  if (fullscreenDemo) {
    await prepareWall(page, scenes, 4);
    await prepareFullscreen(page);
  }
  const session = await app.context().newCDPSession(page);
  const frames = [], pending = [];
  const framesDir = join(temporary, "frames");
  await mkdir(framesDir);
  session.on("Page.screencastFrame", event => {
    const file = `frame-${String(frames.length).padStart(5, "0")}.jpg`;
    frames.push({ file, time: event.metadata.timestamp });
    pending.push(writeFile(join(framesDir, file), Buffer.from(event.data, "base64"))
      .then(() => session.send("Page.screencastFrameAck", { sessionId: event.sessionId }))
      .catch(error => errors.push(error.message)));
  });
  await session.send("Page.startScreencast", { format: "jpeg", quality: fullscreenDemo ? 88 : 85, maxWidth: fullscreenDemo ? 1920 : 1440, maxHeight: fullscreenDemo ? 1080 : 1000, everyNthFrame: fullscreenDemo ? 1 : 3 });
  let chapters;
  if (fullscreenDemo) {
    chapters = await recordFullscreen(page);
  } else {
  await page.waitForTimeout(900);
  for (const [, name] of scenes.slice(0, 3)) {
    await page.locator(".library-card").filter({ hasText: `${name}.mp4` }).click();
    await page.waitForTimeout(300);
  }
  await page.getByRole("button", { name: "创建播放墙", exact: true }).click();
  await page.waitForFunction(() => {
    const videos = [...document.querySelectorAll(".video-tile video")];
    return videos.length === 3 && videos.every(video => video.readyState >= 2 && !video.paused && video.currentTime > 0);
  });
  async function shot(name) {
    const dismiss = page.getByRole("button", { name: "关闭扫描状态", exact: true });
    if (await dismiss.isVisible()) await dismiss.click();
    await page.mouse.move(310, 110);
    await page.waitForTimeout(400);
    const png = join(temporary, `${name}.png`);
    await page.screenshot({ path: png, fullPage: true, animations: "disabled" });
    await encode(["-i", png, "-c:v", "libwebp", "-quality", "88", "-compression_level", "6", join(output, `${name}.webp`)]);
    console.log(`Captured actual UI: ${name}`);
  }
  await page.waitForTimeout(700);
  await shot("wall-dark");
  await page.getByRole("button", { name: "网格", exact: true }).click();
  await page.waitForTimeout(1400);
  await page.getByRole("button", { name: "主次", exact: true }).click();
  await page.waitForTimeout(1300);
  await page.getByRole("button", { name: "统一播放设置", exact: true }).click();
  await page.getByRole("region", { name: "统一播放控制", exact: true }).waitFor();
  await page.waitForTimeout(900);
  await page.getByRole("button", { name: "全部 3 倍速", exact: true }).click();
  await page.waitForTimeout(1000);
  await page.getByRole("button", { name: "全部 1 倍速", exact: true }).click();
  await shot("controls-dark");
  await page.getByRole("button", { name: "收起统一播放设置", exact: true }).click();
  await page.getByRole("button", { name: "切换浅色主题", exact: true }).click();
  await page.waitForTimeout(3700);
  await shot("wall-light");
  await page.getByRole("button", { name: /^视频库/ }).click();
  await page.waitForTimeout(1000);
  await shot("library-light");
  await page.getByRole("button", { name: /^播放墙/ }).click();
  await page.waitForTimeout(1000);
  }
  // Finish the recording on the playback wall before collecting the download UI.
  await session.send("Page.stopScreencast");
  await Promise.all(pending);
  await session.detach();
  assert.ok(frames.length >= 20, "Recording should contain actual interface frames");
  const segments = ["ffconcat version 1.0"];
  let exportDuration = 0;
  frames.forEach((frame, index) => {
    const duration = index < frames.length - 1 ? Math.max(0.001, Math.min(3, frames[index + 1].time - frame.time)) : 0.8;
    segments.push(`file '${frame.file}'`, `duration ${duration.toFixed(5)}`);
    exportDuration += duration;
  });
  segments.push(`file '${frames.at(-1).file}'`);
  const raw = join(framesDir, "capture.ffconcat");
  await writeFile(raw, segments.join("\n") + "\n");
  if (!fullscreenDemo) {
  await page.getByRole("button", { name: "下载", exact: true }).click();
  await page.getByRole("heading", { name: "留住喜欢的片刻." }).waitFor();
  await page.waitForTimeout(500);
  await shot("downloads-light");
  await page.getByRole("button", { name: "X 登录与隐私", exact: true }).click();
  await page.waitForTimeout(700);
  await shot("x-privacy-light");
  }
  const runtime = await app.evaluate(({ app }) => app.getVersion());
  assert.deepEqual(errors, []);
  await app.close();
  app = undefined;
  await encode(["-f", "concat", "-safe", "0", "-i", raw,
    "-vf", fullscreenDemo ? "fps=30,scale=1920:1080:force_original_aspect_ratio=decrease:flags=lanczos,pad=1920:1080:(ow-iw)/2:(oh-ih)/2" : "fps=20,scale=1440:1000:flags=lanczos", "-an", "-c:v", "libx264", "-preset", "slow", "-crf", "24", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-threads", "4", join(output, "vexa-demo.mp4")]);
  if (fullscreenDemo) {
    for (const [name, seconds] of [["fullscreen-grid", .4], ["fullscreen-zoom", chapters.find(item => item.name === "恢复四画面").seconds - .25]])
      await encode(["-ss", String(seconds), "-i", join(output, "vexa-demo.mp4"), "-frames:v", "1", "-c:v", "libwebp", "-quality", "90", join(output, `${name}.webp`)]);
  }
  await encode(["-i", join(output, "vexa-demo.mp4"), "-filter_complex",
    `${fullscreenDemo ? "trim=duration=16,setpts=PTS-STARTPTS,fps=8" : "fps=5"},scale=800:-2:flags=lanczos,split[scene][colors];[colors]palettegen=max_colors=96:stats_mode=diff[palette];[scene][palette]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`,
    "-loop", "0", join(output, "vexa-demo.gif")]);
  const result = { success: true, version: runtime, duration: exportDuration,
    files: fullscreenDemo ? ["vexa-demo.gif", "vexa-demo.mp4", "fullscreen-grid.webp", "fullscreen-zoom.webp"] : ["vexa-demo.gif", "vexa-demo.mp4", "wall-dark.webp", "wall-light.webp", "controls-dark.webp", "library-light.webp", "downloads-light.webp", "x-privacy-light.webp"],
    errors, recordedFrames: frames.length, fullscreenDemo, chapters, output };
  await writeFile(join(project, ".cache/readme-demo-last-result.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
}

main().catch(async error => {
  console.error(error);
  if (page && !page.isClosed()) await page.screenshot({ path: join(project, ".cache/fullscreen-demo-failure.png") }).catch(() => {});
  process.exitCode = 1;
}).finally(async () => {
  await app?.close().catch(() => {});
  const parent = resolve(project, ".cache") + sep;
  if (temporary && resolve(temporary).startsWith(parent) && resolve(temporary).split(sep).pop().startsWith("readme-demo-"))
    await rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
});
