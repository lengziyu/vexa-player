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
let temporary, app;
const errors = [];

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
  const page = await app.firstWindow({ timeout: 30000 });
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
  await session.send("Page.startScreencast", { format: "jpeg", quality: 85, maxWidth: 1440, maxHeight: 1000, everyNthFrame: 3 });
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
  // Finish the recording on the playback wall before collecting the download UI.
  await session.send("Page.stopScreencast");
  await Promise.all(pending);
  await session.detach();
  assert.ok(frames.length >= 20, "Recording should contain actual interface frames");
  const segments = ["ffconcat version 1.0"];
  let exportDuration = 0;
  frames.forEach((frame, index) => {
    const duration = index < frames.length - 1 ? Math.max(0.02, Math.min(3, frames[index + 1].time - frame.time)) : 0.8;
    segments.push(`file '${frame.file}'`, `duration ${duration.toFixed(5)}`);
    exportDuration += duration;
  });
  segments.push(`file '${frames.at(-1).file}'`);
  const raw = join(framesDir, "capture.ffconcat");
  await writeFile(raw, segments.join("\n") + "\n");
  await page.getByRole("button", { name: "下载", exact: true }).click();
  await page.getByRole("heading", { name: "留住喜欢的片刻." }).waitFor();
  await page.waitForTimeout(500);
  await shot("downloads-light");
  await page.getByRole("button", { name: "X 登录与隐私", exact: true }).click();
  await page.waitForTimeout(700);
  await shot("x-privacy-light");
  const runtime = await app.evaluate(({ app }) => app.getVersion());
  assert.deepEqual(errors, []);
  await app.close();
  app = undefined;
  await encode(["-f", "concat", "-safe", "0", "-i", raw,
    "-vf", "fps=20,scale=1440:1000:flags=lanczos", "-an", "-c:v", "libx264", "-preset", "slow", "-crf", "25", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-threads", "2", join(output, "vexa-demo.mp4")]);
  await encode(["-i", join(output, "vexa-demo.mp4"), "-filter_complex",
    "fps=5,scale=800:-2:flags=lanczos,split[scene][colors];[colors]palettegen=max_colors=96:stats_mode=diff[palette];[scene][palette]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle",
    "-loop", "0", join(output, "vexa-demo.gif")]);
  console.log(JSON.stringify({ success: true, version: runtime, duration: exportDuration,
    files: ["vexa-demo.gif", "vexa-demo.mp4", "wall-dark.webp", "wall-light.webp", "controls-dark.webp", "library-light.webp", "downloads-light.webp", "x-privacy-light.webp"],
    errors, recordedFrames: frames.length, output }));
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  await app?.close().catch(() => {});
  const parent = resolve(project, ".cache") + sep;
  if (temporary && resolve(temporary).startsWith(parent) && resolve(temporary).split(sep).pop().startsWith("readme-demo-"))
    await rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
});
