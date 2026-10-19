const { _electron } = require("playwright");
const { selectOption } = require("./select-menu.cjs");
const {
  mkdtemp,
  mkdir,
  copyFile,
  writeFile,
  readFile,
  rm,
  stat,
} = require("node:fs/promises");
const { join, resolve } = require("node:path");
const { tmpdir } = require("node:os");
const { spawnSync } = require("node:child_process");
const assert = require("node:assert/strict");
const ffmpeg = require("ffmpeg-static");
const initSqlJs = require("sql.js");
const { createHash } = require("node:crypto");
const project = resolve(__dirname, "..");
const screenshots = resolve(
  process.env.VEXA_TEST_SCREENSHOTS || join(project, "docs", "screenshots"),
);
const output = join(project, "test-results");
const results = {
  checks: [],
  performance: [],
  errors: [],
  externalRequests: [],
};
let app, page, temporary;
const check = (name, passed, detail) => {
  assert.ok(passed, `${name}: ${JSON.stringify(detail)}`);
  results.checks.push({ name, passed, ...(detail ? { detail } : {}) });
  console.log(`PASS ${name}`);
};
async function until(predicate, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error("Timed out waiting for desktop state");
}
async function waitForFullscreen(active) {
  await page.waitForFunction(expected => !!document.fullscreenElement === expected, active, { timeout: 15000 });
  if (process.platform === "darwin")
    await until(() => app.evaluate((_electron, expected) => global.__vexaNativeFullscreen === expected, active), 15000);
}
async function exitFullscreen() {
  await page.evaluate(() => { void document.exitFullscreen(); });
  await waitForFullscreen(false);
}
async function launch(dataDir) {
  const executablePath =
    process.env.VEXA_TEST_EXECUTABLE || require("electron");
  app = await _electron.launch({
    executablePath,
    args: [
      ...(process.env.VEXA_TEST_EXECUTABLE ? [] : ["."]),
      `--user-data-dir=${dataDir}`,
    ],
    cwd: project,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: undefined,
      VEXA_DATA_DIR: dataDir,
    },
    timeout: 30000,
  });
  app.process().stderr.on("data", (data) => {
    const text = data.toString();
    if (
      text.includes("Error occurred in handler") ||
      text.includes("UnhandledPromiseRejection")
    )
      results.errors.push(text);
  });
  page = await app.firstWindow();
  // CDP input still reaches the renderer; physical mouse movement on the shared
  // desktop must not reset the inactivity timer during this automated run.
  await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    window.setIgnoreMouseEvents(true);
    // macOS native fullscreen transitions complete after the renderer event.
    global.__vexaNativeFullscreen = window.isFullScreen();
    window.on("enter-full-screen", () => { global.__vexaNativeFullscreen = true; });
    window.on("leave-full-screen", () => { global.__vexaNativeFullscreen = false; });
  });
  page.on("pageerror", (error) => results.errors.push(error.message));
  page.on("request", (request) => {
    if (/^https?:/.test(request.url()))
      results.externalRequests.push(request.url());
  });
  await page.waitForFunction(() => !!window.vexa);
  await page.getByRole("heading", { name: "你的私人放映室." }).waitFor();
}
async function take(name) {
  const scanClose = page.getByRole("button", {
    name: "关闭扫描状态",
    exact: true,
  });
  if (await scanClose.count()) await scanClose.click();
  await page.mouse.move(300, 75);
  await page.waitForTimeout(300);
  await page.screenshot({
    path: join(screenshots, name),
    fullPage: await page.evaluate(
      () => document.documentElement.scrollHeight < 10000,
    ),
    animations: "disabled",
  });
}
async function exercisePlaybackControls() {
  const wall = page.locator(".wall-panel"),
    tile = page.locator(".video-tile").first(),
    progress = tile.locator(".tile-progress");
  await wall.evaluate((el) => {
    window.__idleTrace = [];
    const record = (type, target) => {
      window.__idleTrace.push({
        time: Math.round(performance.now()), type,
        target: target?.className, idle: el.classList.contains("controls-idle"),
        focus: document.activeElement?.className,
      });
      if (window.__idleTrace.length > 40) window.__idleTrace.shift();
    };
    for (const type of ["pointermove", "pointerenter", "focusin", "focusout"])
      el.addEventListener(type, (event) => record(type, event.target), true);
    new MutationObserver(() => record("class", el)).observe(el, {
      attributes: true, attributeFilter: ["class"],
    });
  });
  const resetProgress = () =>
    page.locator('[aria-label="全局百分比跳转"]').evaluate((el) => {
      el.value = "0";
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });
  async function dragRange(input, ratio, hold = 0) {
    const box = await input.boundingBox();
    assert.ok(box, "Range input is not visible");
    await page.mouse.move(box.x + 9, box.y + box.height / 2);
    await page.mouse.down();
    if (hold) await page.waitForTimeout(hold);
    await page.mouse.move(
      box.x + 9 + (box.width - 18) * ratio,
      box.y + box.height / 2,
      { steps: 12 },
    );
    await page.mouse.up();
  }
  await resetProgress();
  await tile.locator(".tile-shade").hover({ position: { x: 25, y: 50 } });
  check(
    "fullscreen timeline has a larger hover track and drag target",
    await progress.evaluate(
      (el) =>
        el.getBoundingClientRect().height >= 32 &&
        parseFloat(getComputedStyle(el).getPropertyValue("--track-size")) >= 9,
    ),
  );
  await until(
    async () =>
      await wall.evaluate((el) => el.classList.contains("controls-idle")),
    6000,
  );
  await until(
    async () =>
      await wall.evaluate(
        (el) =>
          getComputedStyle(el.querySelector(".wall-toolbar")).visibility ===
            "hidden" &&
          getComputedStyle(el.querySelector(".tile-bottom")).visibility ===
            "hidden",
      ),
  );
  // Hiding a previously focused control can cause focusout; it must stay idle.
  await page.waitForTimeout(500);
  const idleState = await wall.evaluate((el) => ({
    toolbar: getComputedStyle(el.querySelector(".wall-toolbar")).visibility,
    overlay: getComputedStyle(el.querySelector(".tile-bottom")).visibility,
    cursor: getComputedStyle(el).cursor,
    trace: window.__idleTrace,
  }));
  check(
    "fullscreen inactivity hides toolbar, video overlays and cursor",
    idleState.toolbar === "hidden" && idleState.overlay === "hidden" &&
      idleState.cursor === "none",
    idleState,
  );
  await page.screenshot({
    path: join(screenshots, "fullscreen-idle.png"),
    animations: "disabled",
  });
  await page.mouse.move(240, 170);
  await until(
    async () =>
      !(await wall.evaluate((el) => el.classList.contains("controls-idle"))),
  );
  check("mouse movement immediately restores fullscreen controls", true);
  await dragRange(progress, 0.3, 3100);
  await until(
    async () =>
      await tile
        .locator("video")
        .evaluate((v) => v.currentTime > 5 && v.currentTime < 11),
  );
  check(
    "thick timeline remains draggable without rearranging the tile",
    !(await wall.evaluate((el) => el.classList.contains("controls-idle"))),
  );
  const fullscreenVideoHeight = await page
    .locator(".video-wall")
    .evaluate((el) => el.getBoundingClientRect().height);
  await page.getByRole("button", { name: "统一播放设置", exact: true }).click();
  const popup = page.getByRole("region", { name: "统一播放控制", exact: true });
  await popup.waitFor();
  await page.waitForTimeout(700);
  const position = await popup.evaluate((el) => {
    const r = el.getBoundingClientRect(),
      b = document
        .querySelector(".wall-controls-trigger")
        .getBoundingClientRect();
    return {
      below: r.top >= b.bottom,
      width: r.width,
      height: r.height,
      bottom: r.bottom,
      viewport: innerHeight,
      inside: document.fullscreenElement.contains(el),
    };
  });
  check(
    "unified controls open as a compact dropdown below the fullscreen button",
    position.below &&
      position.width <= 360 &&
      position.height < 320 &&
      position.bottom <= position.viewport &&
      position.inside &&
      (await page.locator(".modal-backdrop").count()) === 0,
    position,
  );
  check(
    "fullscreen dropdown keeps the video area unchanged",
    Math.abs(
      (await page
        .locator(".video-wall")
        .evaluate((el) => el.getBoundingClientRect().height)) -
        fullscreenVideoHeight,
    ) < 1,
  );
  await page.screenshot({
    path: join(screenshots, "fullscreen-controls.png"),
    animations: "disabled",
  });
  await page.waitForTimeout(3100);
  check(
    "open dropdown stays visible during inactivity",
    !(await wall.evaluate((el) => el.classList.contains("controls-idle"))) &&
      (await popup.isVisible()),
  );
  await dragRange(
    popup.getByRole("slider", { name: "统一进度", exact: true }),
    0.4,
  );
  await until(
    async () =>
      await page
        .locator(".video-tile video")
        .evaluateAll((v) =>
          v.every((x) => x.currentTime > 8 && x.currentTime < 12),
        ),
  );
  check("unified progress seeks every video", true);
  await dragRange(
    popup.getByRole("slider", { name: "统一音量", exact: true }),
    0.3,
  );
  check(
    "unified volume preserves focus-only audio routing",
    await page
      .locator(".video-tile video")
      .evaluateAll(
        (v) =>
          v.every((x) => Math.abs(x.volume - 0.3) < 0.03) &&
          v.filter((x) => !x.muted).length === 1,
      ),
  );
  await popup
    .getByRole("button", { name: "全部画面同时发声", exact: true })
    .click();
  await until(async () => page.locator(".video-tile video").evaluateAll(
    (videos) => videos.every((video) => !video.muted),
  ));
  check("all-audio mode unmutes every real player", true);
  await page.screenshot({
    path: join(screenshots, "all-audio-controls.png"),
    animations: "disabled",
  });
  await popup.getByRole("button", { name: "统一静音", exact: true }).click();
  check(
    "global mute still silences every player in all-audio mode",
    await page.locator(".video-tile video").evaluateAll(
      (videos) => videos.every((video) => video.muted),
    ),
  );
  await popup.getByRole("button", { name: "取消统一静音", exact: true }).click();
  await until(async () => page.locator(".video-tile video").evaluateAll(
    (videos) => videos.every((video) => !video.muted),
  ));
  await popup
    .getByRole("button", { name: "仅选中画面发声", exact: true })
    .click();
  check(
    "focus-only mode restores a single audible player",
    await page.locator(".video-tile video").evaluateAll(
      (videos) => videos.filter((video) => !video.muted).length === 1,
    ),
  );
  await popup
    .getByRole("button", { name: "全部 1.5 倍速", exact: true })
    .click();
  check(
    "unified speed reaches every real player",
    await page
      .locator(".video-tile video")
      .evaluateAll((v) => v.every((x) => x.playbackRate === 1.5)),
  );
  await popup
    .getByRole("button", { name: "收起统一播放设置", exact: true })
    .click();
  await tile.locator(".tile-shade").click({ position: { x: 25, y: 50 } });
  await page.keyboard.press("Space");
  await until(
    async () =>
      await page
        .locator(".video-tile video")
        .evaluateAll((v) => v.every((x) => x.paused)),
  );
  await page.getByRole("button", { name: "统一播放设置", exact: true }).click();
  await dragRange(
    popup.getByRole("slider", { name: "统一进度", exact: true }),
    0.2,
  );
  await popup
    .getByRole("button", { name: "全部 1.25 倍速", exact: true })
    .click();
  check(
    "unified seeking and speed changes keep paused players paused",
    await page
      .locator(".video-tile video")
      .evaluateAll((v) =>
        v.every(
          (x) =>
            x.paused &&
            x.playbackRate === 1.25 &&
            x.currentTime > 3 &&
            x.currentTime < 7,
        ),
      ),
  );
  await popup.getByRole("button", { name: "全部 1 倍速", exact: true }).click();
  await popup.getByRole("button", { name: "统一静音", exact: true }).click();
  await popup
    .getByRole("button", { name: "收起统一播放设置", exact: true })
    .click();
  await tile.locator(".tile-shade").click({ position: { x: 25, y: 50 } });
  await page.keyboard.press("Space");
  await resetProgress();
  await until(
    async () =>
      await wall.evaluate((el) => el.classList.contains("controls-idle")),
    6000,
  );
  await page.keyboard.press("Tab");
  await page.waitForTimeout(3100);
  check(
    "keyboard navigation restores controls and keeps focused actions visible",
    await wall.evaluate(
      (el) =>
        !el.classList.contains("controls-idle") &&
        el.querySelector(".wall-toolbar").contains(document.activeElement),
    ),
  );
  await exitFullscreen();
  await page.waitForTimeout(650);
  await page.getByRole("button", { name: "统一播放设置", exact: true }).click();
  await page.waitForTimeout(650);
  await take("light-unified-controls.png");
  const normal = await popup.evaluate((el) => {
    const r = el.getBoundingClientRect(),
      b = document
        .querySelector(".wall-controls-trigger")
        .getBoundingClientRect();
    return r.top >= b.bottom && r.width < 360 && !document.fullscreenElement;
  });
  await page.locator(".page-heading h1").click();
  await popup.waitFor({ state: "detached" });
  check(
    "windowed dropdown stays compact and dismisses on outside click",
    normal && (await popup.count()) === 0,
  );
  await page.getByRole("button", { name: "统一播放设置", exact: true }).click();
  await popup
    .getByRole("slider", { name: "统一进度", exact: true })
    .press("Escape");
  await popup.waitFor({ state: "detached" });
  check(
    "Escape dismisses the dropdown and restores button focus",
    (await popup.count()) === 0 &&
      (await page
        .getByRole("button", { name: "统一播放设置", exact: true })
        .evaluate((el) => el === document.activeElement)),
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await resetProgress();
  if (await page.getByRole("button", { name: "全部暂停", exact: true }).count())
    await page.getByRole("button", { name: "全部暂停", exact: true }).click();
  await page.getByRole("button", { name: "播放全部", exact: true }).click();
}
async function exerciseWallEditing(fixtures) {
  const videos = page.locator(".video-tile video");
  await page.locator('[aria-label="全局百分比跳转"]').evaluate((el) => {
    el.value = "0";
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
  const play = page.getByRole("button", { name: "播放全部", exact: true });
  if (await play.count()) await play.click();
  const original = await videos.first().elementHandle();
  const replacement = await videos.nth(1).elementHandle();
  const originalSource = await original.getAttribute("src");
  const wallSize = await page.locator(".video-wall").boundingBox();
  await page.getByRole("button", { name: "播放中添加视频", exact: true }).click();
  const drawer = page.getByRole("region", { name: "播放墙选片", exact: true });
  await drawer.waitFor();
  const unchangedSize = await page.locator(".video-wall").boundingBox();
  check("selection drawer leaves the wall size and player instances unchanged",
    Math.abs(wallSize.width - unchangedSize.width) < 1 &&
    Math.abs(wallSize.height - unchangedSize.height) < 1 &&
    await page.locator(".modal-backdrop").count() === 0 &&
    await original.evaluate(video => video.isConnected));
  await drawer.getByRole("searchbox", { name: "选片搜索", exact: true }).fill("04-coast.mp4");
  await drawer.getByRole("button", { name: "添加 04-coast.mp4", exact: true }).click();
  await until(async () => await videos.count() === 4);
  check("drawer adds a video without stopping the existing player",
    await original.evaluate(video => video.isConnected && !video.paused && video.currentTime > 0));
  // A mounted video element can precede metadata delivery, especially on macOS.
  await until(async () => await videos.last().evaluate(video =>
    video.readyState >= 2 && Number.isFinite(video.duration) && video.duration > 0));
  const endingSource = await videos.last().getAttribute("src");
  await videos.last().evaluate(video => { video.currentTime = video.duration - 0.05; });
  await until(async () => await videos.last().evaluate(video => video.ended && video.paused));
  check("default playback ends without replacing the selected video",
    await videos.last().getAttribute("src") === endingSource);
  await drawer.getByRole("button", { name: "关闭选片侧栏", exact: true }).click();
  await drawer.waitFor({ state: "detached" });
  await page.locator(".video-tile").last().hover();
  await page.locator(".video-tile").last().getByRole("button", { name: "播放此画面", exact: true }).click();
  await page.getByRole("button", { name: "播放中添加视频", exact: true }).click();
  await drawer.waitFor();
  await page.locator(".video-tile").last().locator(".tile-progress").evaluate(el => {
    el.value = "28";
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await until(async () => await videos.last().evaluate(video => video.currentTime >= 7));
  await drawer.getByRole("button", { name: /^正在播放/ }).click();
  await drawer.getByRole("button", { name: "移出第 4 个画面", exact: true }).click();
  await until(async () => await videos.count() === 3);
  await page.getByRole("button", { name: "撤销移出画面", exact: true }).click();
  await until(async () => await videos.count() === 4 && await videos.last().evaluate(video => video.readyState >= 2));
  check("removal can be undone without recreating unaffected players",
    await original.evaluate(video => video.isConnected && !video.paused) &&
    await videos.last().evaluate(video => video.currentTime >= 6.8 && video.currentTime < 10));
  await drawer.getByRole("button", { name: "移出第 4 个画面", exact: true }).click();
  await until(async () => await videos.count() === 3);
  await drawer.getByRole("button", { name: "替换第 2 个画面", exact: true }).click();
  const positions = () => page.locator(".video-tile").evaluateAll(tiles =>
    tiles.map(tile => [tile.style.left, tile.style.top, tile.style.width, tile.style.height]));
  const beforePositions = await positions();
  const beforeReplacement = await replacement.getAttribute("src");
  await drawer.getByRole("button", { name: "替换为 04-coast.mp4", exact: true }).click();
  await until(async () => await replacement.getAttribute("src") !== beforeReplacement &&
    await replacement.evaluate(video => video.readyState >= 2));
  check("targeted replacement preserves the other video and the target element",
    await original.evaluate(video => video.isConnected && !video.paused) &&
    await original.getAttribute("src") === originalSource &&
    await replacement.evaluate(video => video.isConnected));
  check("replacement keeps every existing slot fixed",
    JSON.stringify(await positions()) === JSON.stringify(beforePositions));
  const beforeReflowTime = await original.evaluate(video => video.currentTime);
  await page.getByRole("button", { name: "重新排布画面", exact: true }).click();
  check("manual reflow keeps playback and video elements alive",
    await original.evaluate((video, time) => video.isConnected && !video.paused && video.currentTime >= time - 0.1, beforeReflowTime));
  await page.locator(".wall-panel").screenshot({ path: join(screenshots, "wall-media-drawer.png"), animations: "disabled" });
  await page.getByRole("button", { name: "全部暂停", exact: true }).click();
  await drawer.getByRole("searchbox", { name: "选片搜索", exact: true }).fill("05-video.mp4");
  const beforePausedReplacement = await replacement.getAttribute("src");
  await drawer.getByRole("button", { name: "替换为 05-video.mp4", exact: true }).click();
  await until(async () => await replacement.getAttribute("src") !== beforePausedReplacement && await replacement.evaluate(video => video.readyState >= 2));
  check("replacement preserves global pause", await videos.evaluateAll(list => list.every(video => video.paused)));
  await drawer.getByRole("searchbox", { name: "选片搜索", exact: true }).press("Escape");
  await drawer.waitFor({ state: "detached" });
  check("Escape closes the drawer and restores its trigger focus",
    await page.getByRole("button", { name: "播放中添加视频", exact: true }).evaluate(el => el === document.activeElement));
  await page.getByRole("button", { name: "播放全部", exact: true }).click();
  await page.getByRole("button", { name: "全屏播放墙", exact: true }).click();
  await waitForFullscreen(true);
  await page.getByRole("button", { name: "播放中添加视频", exact: true }).click();
  await drawer.waitFor();
  await page.waitForTimeout(3100);
  check("fullscreen drawer stays inside the wall and keeps controls visible",
    await drawer.evaluate(el => document.fullscreenElement.contains(el)) &&
    !await page.locator(".wall-panel").evaluate(el => el.classList.contains("controls-idle")));
  await drawer.getByRole("searchbox", { name: "选片搜索", exact: true }).fill("06-video.mp4");
  await drawer.getByRole("button", { name: "添加 06-video.mp4", exact: true }).click();
  await until(async () => await videos.count() === 4);
  await drawer.getByRole("button", { name: "关闭选片侧栏", exact: true }).click();
  await videos.last().locator("..").hover();
  await page.locator(".video-tile").last().getByRole("button", { name: "关闭画面", exact: true }).click();
  await until(async () => await videos.count() === 3);
  check("fullscreen add and remove preserve unrelated playback",
    await original.evaluate(video => video.isConnected && !video.paused));
  await exitFullscreen();
  await page.getByRole("button", { name: "播放中添加视频", exact: true }).click();
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
  }, join(fixtures, "01-alpine.mp4"));
  await drawer.getByRole("button", { name: "播放中导入视频", exact: true }).click();
  await page.waitForTimeout(700);
  check("import from the drawer keeps the wall and drawer open",
    await drawer.isVisible() && await original.evaluate(video => video.isConnected) &&
    await page.locator(".library-view").isHidden());
  await drawer.getByRole("button", { name: "关闭选片侧栏", exact: true }).click();
  await page.locator('[aria-label="全局百分比跳转"]').evaluate((el) => {
    el.value = "0";
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
  if (await play.count()) await play.click();
}
async function main() {
  temporary = await mkdtemp(join(tmpdir(), "vexa-desktop-test-"));
  const fixtures = join(output, "fixtures", "测试视频 with spaces"),
    dataDir = join(temporary, "data");
  await mkdir(fixtures, { recursive: true });
  await mkdir(screenshots, { recursive: true });
  await mkdir(output, { recursive: true });
  const images = ["alpine", "dunes", "forest", "coast"];
  for (let i = 0; i < 4; i++) {
    if (
      (
        await stat(
          join(fixtures, `${String(i + 1).padStart(2, "0")}-${images[i]}.mp4`),
        ).catch(() => null)
      )?.size > 1000
    )
      continue;
    const result = spawnSync(
      ffmpeg,
      [
        "-nostdin",
        "-v",
        "error",
        "-loop",
        "1",
        "-i",
        join(project, "ui-preview", "assets", `${images[i]}.jpg`),
        "-f",
        "lavfi",
        "-i",
        "anullsrc=r=48000:cl=stereo",
        "-t",
        "25",
        "-vf",
        "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2",
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-crf",
        "30",
        "-pix_fmt",
        "yuv420p",
        "-r",
        "30",
        "-c:a",
        "aac",
        "-threads",
        "2",
        "-y",
        join(fixtures, `${String(i + 1).padStart(2, "0")}-${images[i]}.mp4`),
      ],
      { windowsHide: true, timeout: 60000 },
    );
    assert.equal(result.status, 0, result.stderr?.toString());
  }
  for (let i = 5; i <= 16; i++)
    await copyFile(
      join(fixtures, "01-alpine.mp4"),
      join(fixtures, `${String(i).padStart(2, "0")}-video.mp4`),
    );
  await writeFile(
    join(fixtures, "broken.mp4"),
    "deliberately damaged test fixture",
  );
  await writeFile(join(fixtures, "notes.txt"), "not media");
  await launch(dataDir);
  const freshDefaults = await page.evaluate(() => window.vexa.getSettings());
  check("fresh preferences disable both automatic replacement modes",
    freshDefaults.autoNext === false && freshDefaults.switchInterval === 0);
  check(
    "sandboxed renderer",
    await page.evaluate(
      () =>
        typeof window.require === "undefined" &&
        typeof window.process === "undefined",
    ),
  );
  const scanDenied = await page.evaluate(async () => {
    try {
      await window.vexa.scan({ paths: ["C:\\Windows"], recursive: true });
      return false;
    } catch {
      return true;
    }
  });
  check("arbitrary path IPC denied", scanDenied);
  results.errors = results.errors.filter(
    (message) => !message.includes("'library:scan'"),
  );
  await page.getByRole("button", { name: "切换浅色主题", exact: true }).click();
  await page.waitForFunction(
    () => document.documentElement.dataset.theme === "light",
  );
  await page.getByRole("button", { name: "偏好设置", exact: true }).click();
  await page.getByRole("button", { name: "跟随系统", exact: true }).click();
  await page.waitForFunction(
    async () => (await window.vexa.getSettings()).theme === "system",
  );
  await page.waitForTimeout(100);
  await app.evaluate(({ nativeTheme }) => {
    nativeTheme.themeSource = "light";
  });
  await page.waitForFunction(
    () => document.documentElement.dataset.theme === "light",
  );
  await app.evaluate(({ nativeTheme }) => {
    nativeTheme.themeSource = "dark";
  });
  await page.waitForFunction(
    () => document.documentElement.dataset.theme === "dark",
  );
  check("system appearance changes apply live", true);
  await page.getByRole("button", { name: "深色", exact: true }).click();
  const intervalControl = page.getByRole("combobox", {
    name: "自动换片间隔",
    exact: true,
  });
  await selectOption(intervalControl, "600");
  await until(
    async () =>
      (await page.evaluate(() => window.vexa.getSettings())).switchInterval ===
      600,
  );
  check(
    "custom settings menu persists numeric values through desktop IPC",
    true,
  );
  await intervalControl.click();
  const intervalMenu = page.getByRole("listbox", {
    name: "自动换片间隔",
    exact: true,
  });
  await intervalMenu.waitFor();
  await page.screenshot({
    path: join(screenshots, "select-menu-dark.png"),
    animations: "disabled",
  });
  await intervalControl.press("Escape");
  check(
    "Escape dismisses the selection menu while keeping preferences open",
    (await page
      .getByRole("button", { name: "关闭弹窗", exact: true })
      .isVisible()) &&
      (await intervalControl.evaluate(
        (control) => control === document.activeElement,
      )),
  );
  await page.getByRole("button", { name: "浅色", exact: true }).click();
  await intervalControl.click();
  await intervalMenu.waitFor();
  await page.screenshot({
    path: join(screenshots, "select-menu-light.png"),
    animations: "disabled",
  });
  await intervalControl.press("Escape");
  await selectOption(intervalControl, "0");
  await page.getByRole("button", { name: "关闭弹窗" }).click();
  await take("light-welcome.png");
  await app.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [folder],
    });
  }, fixtures);
  await page.getByRole("button", { name: "导入文件夹", exact: true }).click();
  await until(async () => {
    const library = await page.evaluate(() =>
      window.vexa.queryLibrary({ limit: 100 }),
    );
    return (
      library.total === 17 &&
      library.items.filter((m) => m.status === "ready").length === 16 &&
      library.items.filter((m) => m.thumbnail).length === 16 &&
      library.items.filter((m) => m.status === "error").length === 1
    );
  }, 60000);
  await page.waitForTimeout(600);
  const library = await page.evaluate(() =>
    window.vexa.queryLibrary({ limit: 100 }),
  );
  check(
    "real file import, metadata, thumbnails and corrupt file isolation",
    library.total === 17 &&
      library.items.filter((m) => m.status === "error").length === 1,
    {
      total: library.total,
      statuses: library.items.map((m) => [m.name, m.status]),
    },
  );
  const good = library.items.find((m) => m.status === "ready");
  const bytes = await app.evaluate(async ({ net }, id) => {
    const response = await net.fetch(`vexa-media://media/${id}`, {
      headers: { Range: "bytes=0-31" },
    });
    return {
      status: response.status,
      length: (await response.arrayBuffer()).byteLength,
      range: response.headers.get("content-range"),
    };
  }, good.id);
  check(
    "media seeking uses exact byte ranges",
    bytes.status === 206 && bytes.length === 32,
    bytes,
  );
  await selectOption(
    page.getByRole("combobox", { name: "按时长筛选", exact: true }),
    "short",
  );
  await selectOption(
    page.getByRole("combobox", { name: "按分辨率筛选", exact: true }),
    "fhd",
  );
  await selectOption(
    page.getByRole("combobox", { name: "按横竖屏筛选", exact: true }),
    "landscape",
  );
  await selectOption(
    page.getByRole("combobox", { name: "按文件状态筛选", exact: true }),
    "ready",
  );
  await until(
    async () =>
      (await page.locator(".virtual-media-grid").getAttribute("data-total")) ===
      "16",
  );
  check(
    "combined property filters match real metadata",
    await page.evaluate(async () => {
      const p = await window.vexa.queryLibrary({
        maxDuration: 600,
        resolution: "fhd",
        orientation: "landscape",
        status: "ready",
      });
      return p.total === 16 && p.items.every((m) => m.height === 1080);
    }),
  );
  await take("light-library.png");
  await selectOption(
    page.getByRole("combobox", { name: "按横竖屏筛选", exact: true }),
    "portrait",
  );
  await page
    .getByRole("heading", { name: "还没有找到这个画面", exact: true })
    .waitFor();
  check(
    "empty filtered results provide a clear reset",
    (await page
      .getByRole("button", { name: "清除筛选", exact: true })
      .count()) === 2,
  );
  await page.locator(".filter-reset").click();
  await until(
    async () =>
      (await page.locator(".virtual-media-grid").getAttribute("data-total")) ===
      "17",
  );
  await page.getByRole("button", { name: "小缩略图", exact: true }).click();
  await page.locator(".library-card").nth(0).click();
  await page.locator(".library-card").nth(1).click();
  await page.locator(".library-card").nth(2).click();
  await page.getByRole("button", { name: "创建播放墙", exact: true }).click();
  await page.waitForFunction(
    () =>
      document.querySelectorAll(".video-tile video").length === 3 &&
      [...document.querySelectorAll(".video-tile video")].every(
        (v) =>
          v.readyState >= 2 &&
          !v.paused &&
          v.videoWidth >= 1900 &&
          v.videoHeight === 1080,
      ),
  );
  check("three real 1080p H.264/AAC videos play", true);
  await take("light-wall.png");
  const handle = await page
    .locator(".video-tile video")
    .first()
    .elementHandle();
  await page.evaluate(() => {
    window.__metadataLoads = 0;
    document
      .querySelectorAll(".video-tile video")
      .forEach((v) =>
        v.addEventListener("loadedmetadata", () => window.__metadataLoads++),
      );
  });
  const positionBefore = await handle.evaluate((v) => v.currentTime);
  await page.getByRole("button", { name: "网格", exact: true }).click();
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: "智能", exact: true }).click();
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: "主次", exact: true }).click();
  await page.waitForTimeout(700);
  check(
    "layout switches preserve instances and playback",
    (await handle.evaluate(
      (v, before) => v.isConnected && v.currentTime > before && !v.paused,
      positionBefore,
    )) && (await page.evaluate(() => window.__metadataLoads === 0)),
  );
  await page.locator(".video-tile").first().hover();
  await page
    .locator(".video-tile")
    .first()
    .getByRole("button", { name: "暂停此画面", exact: true })
    .click();
  check(
    "independent pause keeps other streams playing",
    await page
      .locator(".video-tile video")
      .evaluateAll(
        (videos) => videos[0].paused && videos.slice(1).every((v) => !v.paused),
      ),
  );
  await page
    .locator(".video-tile")
    .first()
    .getByRole("button", { name: "播放此画面", exact: true })
    .click();
  await page.locator(".video-tile").nth(2).hover();
  // Exercise keyboard activation here: on compact tiles the title can overlap
  // the center hit point. The first tile above already tests pointer activation.
  await page
    .locator(".video-tile")
    .nth(2)
    .getByRole("button", { name: "暂停此画面", exact: true })
    .press("Space");
  await page.getByRole("button", { name: "暂停非主画面", exact: true }).click();
  await until(
    async () =>
      await page
        .locator(".video-tile video")
        .evaluateAll((v) => !v[0].paused && v.slice(1).every((x) => x.paused)),
  );
  check("resource mode pauses non-main streams", true);
  await page.getByRole("button", { name: "恢复暂停画面", exact: true }).click();
  await until(
    async () =>
      await page
        .locator(".video-tile video")
        .evaluateAll((v) => !v[0].paused && !v[1].paused && v[2].paused),
  );
  check("resource mode preserves manual pauses on restore", true);
  await page.getByRole("button", { name: "偏好设置", exact: true }).click();
  await page
    .getByRole("button", { name: "放大时暂停其他画面", exact: true })
    .click();
  await page.getByRole("button", { name: "关闭弹窗", exact: true }).click();
  await page
    .locator(".video-tile")
    .nth(1)
    .locator(".tile-shade")
    .dblclick({ position: { x: 25, y: 50 } });
  await until(
    async () =>
      await page
        .locator(".video-tile video")
        .evaluateAll((v) => v[0].paused && !v[1].paused && v[2].paused),
  );
  await page.keyboard.press("Escape");
  await until(
    async () =>
      await page
        .locator(".video-tile video")
        .evaluateAll((v) => !v[0].paused && !v[1].paused && v[2].paused),
  );
  check("zoom suspension restores only previously playing streams", true);
  await page.locator(".video-tile").nth(2).hover();
  await page
    .locator(".video-tile")
    .nth(2)
    .getByRole("button", { name: "播放此画面", exact: true })
    .click();
  await selectOption(
    page
      .locator(".video-tile")
      .first()
      .getByRole("combobox", { name: "此画面倍速", exact: true }),
    "1.5",
  );
  check(
    "independent speed does not alter other streams",
    await page
      .locator(".video-tile video")
      .evaluateAll(
        (videos) =>
          videos[0].playbackRate === 1.5 &&
          videos.slice(1).every((v) => v.playbackRate === 1),
      ),
  );
  await selectOption(
    page
      .locator(".video-tile")
      .first()
      .getByRole("combobox", { name: "此画面倍速", exact: true }),
    "1",
  );
  const speedControl = page
    .locator(".video-tile")
    .first()
    .getByRole("combobox", { name: "此画面倍速", exact: true });
  await speedControl.focus();
  await speedControl.press("ArrowDown");
  await speedControl.press("Home");
  await speedControl.press("Enter");
  check(
    "custom speed menu keyboard selection changes the actual playback rate",
    await page
      .locator(".video-tile video")
      .first()
      .evaluate((video) => video.playbackRate === 0.5),
  );
  await speedControl.press("ArrowDown");
  await speedControl.press("End");
  await speedControl.press("Escape");
  check(
    "Escape cancels pending speed selection and keeps focus",
    (await speedControl.getAttribute("aria-expanded")) === "false" &&
      (await speedControl.evaluate(
        (control) => control === document.activeElement,
      )) &&
      (await page
        .locator(".video-tile video")
        .first()
        .evaluate((video) => video.playbackRate === 0.5)),
  );
  await selectOption(speedControl, "1");
  await page
    .locator(".video-tile")
    .first()
    .locator(".tile-shade")
    .click({ position: { x: 25, y: 50 } });
  await page.getByRole("button", { name: "取消全局静音", exact: true }).click();
  check(
    "only focus stream is audible",
    await page
      .locator(".video-tile video")
      .evaluateAll(
        (videos) => !videos[0].muted && videos.slice(1).every((v) => v.muted),
      ),
  );
  await page.getByRole("button", { name: "全局静音", exact: true }).click();
  await page.getByRole("button", { name: "全屏播放墙", exact: true }).click();
  await waitForFullscreen(true);
  check(
    "fullscreen fills the available wall",
    await page
      .locator(".wall-panel")
      .evaluate((el) => el.classList.contains("is-fullscreen")),
  );
  await page.locator(".video-tile").first().hover();
  await speedControl.click();
  const speedMenu = page.getByRole("listbox", {
    name: "此画面倍速",
    exact: true,
  });
  await speedMenu.waitFor();
  check(
    "custom dropdown stays inside the fullscreen element and has no native select",
    (await speedMenu.evaluate((menu) =>
      document.fullscreenElement.contains(menu),
    )) && (await page.locator("select").count()) === 0,
  );
  await page.waitForTimeout(3100);
  check(
    "open speed menu keeps fullscreen controls visible",
    (await speedMenu.isVisible()) &&
      (await page
        .locator(".wall-panel")
        .evaluate((wall) => !wall.classList.contains("controls-idle"))),
  );
  await page.screenshot({
    path: join(screenshots, "fullscreen-speed-menu.png"),
    animations: "disabled",
  });
  await speedControl.press("Escape");
  await exercisePlaybackControls();
  await exerciseWallEditing(fixtures);
  const leftBefore = await page
    .locator(".video-tile")
    .first()
    .evaluate((el) => el.style.left + "," + el.style.top);
  await page
    .locator(".video-tile")
    .first()
    .dragTo(page.locator(".video-tile").nth(1));
  await page.waitForTimeout(750);
  check(
    "drag exchange preserves the original video element",
    leftBefore !==
      (await page
        .locator(".video-tile")
        .first()
        .evaluate((el) => el.style.left + "," + el.style.top)) &&
      (await handle.evaluate((v) => v.isConnected && !v.paused)),
  );
  await page.locator(".video-tile").first().hover();
  await page
    .locator(".video-tile")
    .first()
    .getByRole("button", { name: "锁定画面", exact: true })
    .click();
  const lockedSource = await page
    .locator(".video-tile video")
    .first()
    .getAttribute("src");
  await page.getByRole("button", { name: "随机换片", exact: true }).click();
  await page.waitForTimeout(800);
  check(
    "locked frame survives random replacement",
    lockedSource ===
      (await page.locator(".video-tile video").first().getAttribute("src")),
  );
  await page.locator(".video-tile").first().hover();
  await page
    .locator(".video-tile")
    .first()
    .getByRole("button", { name: "解锁画面", exact: true })
    .click();
  await page.getByRole("button", { name: "全部暂停", exact: true }).click();
  check(
    "global pause reaches every video",
    await page
      .locator(".video-tile video")
      .evaluateAll((videos) => videos.every((v) => v.paused)),
  );
  await page.locator(".discovery-card").nth(4).click();
  await page.waitForTimeout(500);
  check(
    "adding while paused preserves global pause",
    await page
      .locator(".video-tile video")
      .evaluateAll(
        (videos) => videos.length === 4 && videos.every((v) => v.paused),
      ),
  );
  await page.getByRole("button", { name: "偏好设置", exact: true }).click();
  await page.getByRole("button", { name: "深色", exact: true }).click();
  const autoNext = page.getByRole("button", { name: "结束后自动换片", exact: true });
  if (await autoNext.getAttribute("aria-pressed") === "true") await autoNext.click();
  await page.getByRole("button", { name: "关闭弹窗" }).click();
  for (const count of [4, 9, 16]) {
    await page.locator(".subtle-button").click();
    await page
      .locator(".count-popover")
      .getByRole("button", { name: String(count), exact: true })
      .click();
    await page.waitForFunction(
      (n) =>
        document.querySelectorAll(".video-tile video").length === n &&
        [...document.querySelectorAll(".video-tile video")].every(
          (v) => v.readyState >= 2,
        ),
      count,
      { timeout: 30000 },
    );
    if (
      await page.getByRole("button", { name: "全部暂停", exact: true }).count()
    )
      await page.getByRole("button", { name: "全部暂停", exact: true }).click();
    await page.locator('[aria-label="全局百分比跳转"]').evaluate((el) => {
      el.value = "0";
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await page.getByRole("button", { name: "播放全部", exact: true }).click();
    const baseline = await page
      .locator(".video-tile video")
      .evaluateAll((videos) =>
        videos.map((v) => {
          const q = v.getVideoPlaybackQuality();
          return { frames: q.totalVideoFrames, dropped: q.droppedVideoFrames };
        }),
      );
    await page.waitForTimeout(4000);
    const stats = await page
      .locator(".video-tile video")
      .evaluateAll((videos) =>
        videos.map((v) => {
          const q = v.getVideoPlaybackQuality();
          return {
            width: v.videoWidth,
            height: v.videoHeight,
            currentTime: v.currentTime,
            paused: v.paused,
            error: v.error?.code || null,
            frames: q.totalVideoFrames,
            dropped: q.droppedVideoFrames,
          };
        }),
      );
    check(
      `${count}-stream 1080p playback smoke`,
      stats.length === count &&
        stats.every(
          (s) =>
            s.width >= 1900 &&
            s.height === 1080 &&
            s.currentTime > 1 &&
            !s.error &&
            !s.paused,
        ),
    );
    stats.forEach((stat, index) => {
      stat.frames -= baseline[index].frames;
      stat.dropped -= baseline[index].dropped;
    });
    results.performance.push({
      streams: count,
      sampleSeconds: 4,
      syntheticLowComplexity: true,
      stats,
    });
    if (count === 16) {
      await page.getByRole("button", { name: "全屏播放墙", exact: true }).click();
      await waitForFullscreen(true);
      const withNotice = await page.locator(".video-wall").boundingBox();
      await page.getByRole("button", { name: "暂停非主画面", exact: true }).click();
      await page.locator(".performance-notice").waitFor({ state: "detached" });
      const withoutNotice = await page.locator(".video-wall").boundingBox();
      check("fullscreen resource notice does not resize the playback wall",
        Math.abs(withNotice.height - withoutNotice.height) < 1 &&
        Math.abs(withNotice.width - withoutNotice.width) < 1);
      await page.getByRole("button", { name: "恢复暂停画面", exact: true }).click();
      await exitFullscreen();
    }
  }
  await page.locator(".subtle-button").click();
  await page
    .locator(".count-popover")
    .getByRole("button", { name: "3", exact: true })
    .click();
  await page.waitForTimeout(800);
  await take("dark-wall.png");
  const search = page.getByRole("textbox", { name: "搜索视频" });
  await search.focus();
  await page.keyboard.press("Control+Shift+H");
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].restore();
    BrowserWindow.getAllWindows()[0].show();
  });
  await page.getByRole("button", { name: "回到放映室", exact: true }).click();
  check(
    "privacy hide from text input restores paused and muted",
    await page
      .locator(".video-tile video")
      .evaluateAll((videos) => videos.every((v) => v.paused && v.muted)),
  );
  await page
    .getByRole("button", { name: "视频库", exact: false })
    .first()
    .click();
  await search.fill("R M ");
  await page.waitForTimeout(350);
  check(
    "typing shortcuts does not trigger playback",
    (await search.inputValue()) === "R M " &&
      (await page
        .locator(".video-tile video")
        .evaluateAll((videos) => videos.every((v) => v.paused))),
  );
  await search.fill("");
  await page.waitForTimeout(350);
  const wallCountBeforeFavorite = await page.locator(".video-tile").count();
  await page
    .locator(".library-card")
    .first()
    .getByRole("button", { name: /^收藏/ })
    .press("Enter");
  check(
    "keyboard favorite does not trigger card playback",
    (await page.locator(".video-tile").count()) === wallCountBeforeFavorite,
  );
  await page.getByRole("button", { name: "我的收藏", exact: true }).click();
  // Navigation starts an asynchronous library query; wait for its rendered result.
  await until(async () => (await page.locator(".library-card").count()) === 1);
  check(
    "favorite filter shows persisted selection",
    (await page.locator(".library-card").count()) === 1,
  );
  await page.getByRole("button", { name: "偏好设置", exact: true }).click();
  await page.getByRole("button", { name: "浅色", exact: true }).click();
  await take("light-settings.png");
  await page.getByRole("button", { name: "跟随系统", exact: true }).click();
  await page.getByRole("button", { name: "浅色", exact: true }).click();
  await page.getByRole("button", { name: "保存封面缓存", exact: true }).click();
  await page.getByRole("button", { name: "清理", exact: true }).click();
  await page.waitForFunction(async () => (await window.vexa.cacheSize()) === 0);
  check(
    "cache cleared without removing videos",
    (await page.evaluate(() => window.vexa.queryLibrary({ limit: 1 })))
      .total === 17,
  );
  await page.getByRole("button", { name: "关闭弹窗" }).click();
  await page.waitForTimeout(300);
  await app.close();
  app = undefined;
  await launch(dataDir);
  check(
    "theme persisted across app restart",
    await page.evaluate(
      () =>
        document.documentElement.dataset.theme === "light" &&
        !document.querySelector(".video-tile"),
    ),
  );
  const restored = await page.evaluate(async () => ({
    settings: await window.vexa.getSettings(),
    library: await window.vexa.queryLibrary({ limit: 1 }),
    favorites: await window.vexa.queryLibrary({ favorites: true }),
  }));
  check(
    "SQLite library and favorites survive restart",
    restored.library.total === 17 &&
      restored.favorites.total === 1 &&
      restored.settings.theme === "light" &&
      restored.settings.thumbnailSize === "small" &&
      restored.settings.pauseHidden === true,
  );
  await app.close();
  app = undefined;
  // Seed only this test's temporary SQLite database to exercise large-list rendering.
  // This verifies browsing, not filesystem scanning of 3,000 real files.
  const SQL = await initSqlJs({
    locateFile: (file) => require.resolve(`sql.js/dist/${file}`),
  });
  const databasePath = join(dataDir, "library.sqlite"),
    db = new SQL.Database(await readFile(databasePath));
  db.run("BEGIN");
  const insert = db.prepare(
    "INSERT INTO media(id,path,name,size,mtime,duration,width,height,fps,codec,audioCodec,status,thumbnail,favorite,error) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
  );
  for (let i = 0; i < 3000; i++) {
    const name = `bulk-${String(i).padStart(5, "0")}.mp4`,
      path = join(temporary, "seeded-library", name);
    insert.run([
      createHash("sha256").update(path).digest("hex").slice(0, 32),
      path,
      name,
      1048576,
      Date.now(),
      900,
      i % 2 ? 1080 : 1920,
      i % 2 ? 1920 : 1080,
      30,
      "h264",
      "aac",
      "missing",
      0,
      0,
      "Seeded browse test",
    ]);
  }
  insert.free();
  db.run("COMMIT");
  await writeFile(databasePath, db.export());
  db.close();
  await launch(dataDir);
  await page
    .locator(".main-nav")
    .getByRole("button", { name: /视频库/ })
    .click();
  await until(
    async () =>
      (await page.locator(".virtual-media-grid").getAttribute("data-total")) ===
      "3017",
  );
  check(
    "large library renders a bounded number of cards",
    (await page.locator(".library-card").count()) < 60,
    { indexed: 3017, rendered: await page.locator(".library-card").count() },
  );
  await page.locator(".library-card").first().click();
  await page.evaluate(() =>
    window.scrollTo(0, document.documentElement.scrollHeight),
  );
  await until(
    async () =>
      (await page
        .locator(".library-card")
        .last()
        .getAttribute("aria-label")) === "bulk-02999.mp4",
  );
  check(
    "scrolling loads the final page without keeping all cards mounted",
    (await page.locator(".library-card").count()) < 60,
  );
  await page
    .locator(".library-card")
    .last()
    .click({ modifiers: ["Shift"] });
  await until(
    async () =>
      (await page.locator(".selection-bar strong").textContent()) === "3017",
  );
  check("shift selection spans unloaded library pages", true);
  await page.getByRole("button", { name: "取消选择", exact: true }).click();
  await page.locator(".library-card").last().focus();
  await page.keyboard.press("ControlOrMeta+a");
  await until(
    async () =>
      (await page.locator(".selection-bar strong").textContent()) === "3017",
  );
  check("select all includes the complete filtered library", true);
  await page.getByRole("button", { name: "取消选择", exact: true }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await selectOption(
    page.getByRole("combobox", { name: "按分辨率筛选", exact: true }),
    "fhd",
  );
  await selectOption(
    page.getByRole("combobox", { name: "按横竖屏筛选", exact: true }),
    "portrait",
  );
  await selectOption(
    page.getByRole("combobox", { name: "按文件状态筛选", exact: true }),
    "missing",
  );
  await until(
    async () =>
      (await page.locator(".virtual-media-grid").getAttribute("data-total")) ===
      "1500",
  );
  check("portrait 1080p uses short edge resolution with status filter", true);
  await page.getByRole("button", { name: "全选当前列表", exact: true }).click();
  await until(async () =>
    (await page.locator(".selection-bar strong").textContent()) === "1500",
  );
  check("visible select-all action selects every filtered page", true);
  await page.getByRole("button", { name: "取消选择", exact: true }).click();
  check(
    "cancel clears the complete filtered selection",
    await page.locator(".selection-bar").count() === 0,
  );
  await page.locator(".filter-reset").click();
  await until(
    async () =>
      (await page.locator(".virtual-media-grid").getAttribute("data-total")) ===
      "3017",
  );
  const widths = [];
  for (const label of ["小缩略图", "中缩略图", "大缩略图"]) {
    await page.getByRole("button", { name: label, exact: true }).click();
    await page.waitForTimeout(200);
    widths.push(
      await page
        .locator(".virtual-media-cell")
        .first()
        .evaluate((el) => el.getBoundingClientRect().width),
    );
  }
  check(
    "thumbnail size controls change card density",
    widths[0] < widths[1] && widths[1] < widths[2],
    widths,
  );
  await page.getByRole("button", { name: "切换深色主题", exact: true }).click();
  await take("dark-library.png");
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(900, 700),
  );
  await page.waitForTimeout(250);
  check(
    "library filters fit a narrow desktop window",
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.getByRole("button", { name: "刷新文件夹", exact: true }).count();
  await page.locator(".main-nav").getByRole("button", { name: /播放墙/ }).click();
  await page.getByRole("button", { name: "播放中添加视频", exact: true }).click();
  const libraryDrawer = page.getByRole("region", { name: "播放墙选片", exact: true });
  await libraryDrawer.getByRole("searchbox", { name: "选片搜索", exact: true }).fill("bulk-");
  await until(async () => await libraryDrawer.locator(".picker-item").count() === 40);
  await libraryDrawer.getByRole("button", { name: "选片下一页", exact: true }).click();
  await until(async () => await libraryDrawer.locator(".picker-info strong").first().textContent() === "bulk-00040.mp4");
  check("drawer independently searches and pages a large library with bounded rows",
    await libraryDrawer.locator(".picker-item").count() === 40 &&
    await page.locator(".library-view").isHidden());
  await libraryDrawer.getByRole("searchbox", { name: "选片搜索", exact: true }).press("Control+Shift+H");
  await libraryDrawer.waitFor({ state: "detached" });
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].restore();
    BrowserWindow.getAllWindows()[0].show();
  });
  await page.getByRole("button", { name: "回到放映室", exact: true }).click();
  check("privacy shortcut inside the picker closes the drawer and hides safely",
    await libraryDrawer.count() === 0);
  check(
    "no unexpected renderer errors",
    results.errors.length === 0,
    results.errors,
  );
  check(
    "no external requests",
    results.externalRequests.length === 0,
    results.externalRequests,
  );
  results.runtime = await app.evaluate(({ app }) => ({
    platform: process.platform,
    arch: process.arch,
    versions: process.versions,
    version: app.getVersion(),
  }));
  await app.close();
  app = undefined;
  results.success = true;
}
main()
  .catch(async (error) => {
    results.success = false;
    results.failure = error.stack;
    console.error(error);
    if (page && !page.isClosed())
      results.failureState = await page.evaluate(() => ({
        videos: [...document.querySelectorAll(".video-tile video")].map((video) => ({
          currentTime: video.currentTime, paused: video.paused, ended: video.ended,
        })),
        focused: document.activeElement?.className,
        idleTrace: window.__idleTrace,
      })).catch(() => null);
    if (page && !page.isClosed())
      await page
        .screenshot({ path: join(output, "desktop-failure.png") })
        .catch(() => {});
  })
  .finally(async () => {
    if (app) await app.close().catch(() => {});
    await mkdir(output, { recursive: true });
    await writeFile(
      join(output, "desktop-results.json"),
      JSON.stringify(results, null, 2),
    );
    if (
      temporary &&
      resolve(temporary).startsWith(resolve(tmpdir())) &&
      temporary.includes("vexa-desktop-test-")
    )
      await rm(temporary, { recursive: true, force: true });
    if (!results.success) process.exitCode = 1;
  });
