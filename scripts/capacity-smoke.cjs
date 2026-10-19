const { _electron } = require("playwright");
const { selectOption } = require("./select-menu.cjs");
const assert = require("node:assert/strict");
const {
  mkdtemp,
  mkdir,
  copyFile,
  writeFile,
  stat,
  rm,
} = require("node:fs/promises");
const { join, resolve } = require("node:path");
const { tmpdir } = require("node:os");
const { spawnSync } = require("node:child_process");
const project = resolve(__dirname, "..");
const screenshots =
  process.env.VEXA_TEST_SCREENSHOTS || join(project, "docs/screenshots");
const results = { checks: [], errors: [], performance: null };
let root, app, page;
function check(name, value) {
  assert.ok(value, name);
  results.checks.push(name);
  console.log("PASS", name);
}
async function until(fn, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await fn()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Wall capacity state timed out");
}
async function count(value) {
  await page.locator(".subtle-button").click();
  await page
    .locator(".count-popover")
    .getByRole("button", { name: String(value), exact: true })
    .click();
  await until(() =>
    page
      .locator(".video-tile")
      .count()
      .then((amount) => amount === value),
  );
}
(async () => {
  root = await mkdtemp(join(tmpdir(), "vexa-capacity-desktop-"));
  const data = join(root, "data"),
    files = join(root, "videos");
  await mkdir(data);
  await mkdir(files);
  await writeFile(
    join(data, "settings.json"),
    JSON.stringify({ autoNext: false, randomStart: false, theme: "dark" }),
  );
  let fixture = join(
    project,
    "test-results/fixtures/测试视频 with spaces/01-alpine.mp4",
  );
  if (!(await stat(fixture).catch(() => null))) {
    fixture = join(root, "fixture.mp4");
    const encoded = spawnSync(
      require("ffmpeg-static"),
      [
        "-nostdin",
        "-v",
        "error",
        "-loop",
        "1",
        "-i",
        join(project, "ui-preview/assets/alpine.jpg"),
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
        fixture,
      ],
      { windowsHide: true, timeout: 60000 },
    );
    assert.equal(encoded.status, 0, encoded.stderr?.toString());
  }
  for (let index = 0; index < 33; index++)
    await copyFile(
      fixture,
      join(files, `${String(index + 1).padStart(2, "0")}-sample.mp4`),
    );
  app = await _electron.launch({
    executablePath: process.env.VEXA_TEST_EXECUTABLE || require("electron"),
    cwd: project,
    args: [
      ...(process.env.VEXA_TEST_EXECUTABLE ? [] : ["."]),
      `--user-data-dir=${data}`,
    ],
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: undefined,
      VEXA_DATA_DIR: data,
    },
  });
  page = await app.firstWindow();
  page.on("pageerror", (error) => results.errors.push(error.message));
  await page.getByRole("heading", { name: "你的私人放映室." }).waitFor();
  await app.evaluate(({ dialog }, files) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [files],
    });
  }, files);
  await page.getByRole("button", { name: "导入文件夹", exact: true }).click();
  await until(
    async () =>
      (
        await page.evaluate(() => window.vexa.queryLibrary({ limit: 100 }))
      ).items.filter((item) => item.status === "ready").length === 33,
    60000,
  );
  await page.locator(".library-card").first().waitFor();
  await page.keyboard.press("Control+a");
  await until(
    async () =>
      (await page.locator(".selection-bar strong").textContent()) === "33",
  );
  await page.getByRole("button", { name: "创建播放墙", exact: true }).click();
  await page
    .getByText("最多同时播放 32 个，请减少选择", { exact: true })
    .waitFor();
  check(
    "33 selected videos are rejected without losing the selection",
    (await page.locator(".video-tile").count()) === 0 &&
      (await page.locator(".selection-bar strong").textContent()) === "33",
  );
  await page.locator(".library-card").first().click();
  await page.getByRole("button", { name: "创建播放墙", exact: true }).click();
  await until(async () => (await page.locator(".video-tile").count()) === 32);
  check("32 selected files create 32 independent players", true);
  const notice = page.locator(".performance-notice");
  await notice.waitFor();
  check(
    "many videos show a nonblocking resource hint",
    (await notice.textContent()).includes("资源") &&
      (await page.getByRole("dialog").count()) === 0,
  );
  const loadingStarted = Date.now();
  let loadingReported = false;
  await until(async () => {
    if (!loadingReported && Date.now() - loadingStarted > 5000) {
      loadingReported = true;
      console.log(
        "32-player loading state",
        await page.locator(".video-tile video").evaluateAll((videos) =>
          videos.reduce((counts, video) => {
            const key = `ready=${video.readyState},error=${video.error?.code || 0},size=${video.videoWidth}x${video.videoHeight}`;
            counts[key] = (counts[key] || 0) + 1;
            return counts;
          }, {}),
        ),
      );
    }
    return await page
      .locator(".video-tile video")
      .evaluateAll(
        (videos) =>
          videos.length === 32 &&
          videos.every(
            (video) =>
              video.readyState >= 2 &&
              video.videoWidth >= 1900 &&
              video.videoHeight === 1080,
          ),
      );
  }, 45000);
  await page.locator('[aria-label="全局百分比跳转"]').evaluate((input) => {
    input.value = "0";
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  const baseline = await page
    .locator(".video-tile video")
    .evaluateAll((videos) =>
      videos.map((video) => video.getVideoPlaybackQuality().totalVideoFrames),
    );
  await page.waitForTimeout(4000);
  const stats = await page.locator(".video-tile video").evaluateAll((videos) =>
    videos.map((video) => ({
      time: video.currentTime,
      paused: video.paused,
      error: video.error?.code || null,
      frames: video.getVideoPlaybackQuality().totalVideoFrames,
      dropped: video.getVideoPlaybackQuality().droppedVideoFrames,
    })),
  );
  results.performance = {
    streams: 32,
    seconds: 4,
    syntheticLowComplexity: true,
    stats: stats.map((item, index) => ({
      ...item,
      advancedFrames: item.frames - baseline[index],
    })),
  };
  check(
    "32 actual 1080p players advance without decode errors",
    stats.every(
      (item, index) =>
        item.time > 1 &&
        !item.paused &&
        !item.error &&
        item.frames > baseline[index],
    ),
  );
  await mkdir(screenshots, { recursive: true });
  await page.screenshot({
    path: join(screenshots, "wall-32.png"),
    fullPage: true,
    animations: "disabled",
  });
  await notice.getByRole("button", { name: "开启省资源", exact: true }).click();
  await until(() =>
    page
      .locator(".video-tile video")
      .evaluateAll(
        (videos) =>
          !videos[0].paused && videos.slice(1).every((video) => video.paused),
      ),
  );
  check("resource hint action pauses all 31 non-main streams", true);
  await page.getByRole("button", { name: "恢复暂停画面", exact: true }).click();
  await until(() =>
    page
      .locator(".video-tile video")
      .evaluateAll((videos) => videos.every((video) => !video.paused)),
  );
  check("restoring resources resumes the previously playing streams", true);
  await count(24);
  await count(32);
  check(
    "count presets grow from 24 to 32 without duplicate media",
    await page
      .locator(".video-tile video")
      .evaluateAll(
        (videos) =>
          new Set(videos.map((video) => video.currentSrc)).size === 32,
      ),
  );
  await count(1);
  await until(() =>
    page
      .locator(".video-tile video")
      .first()
      .evaluate((video) => video.readyState >= 2),
  );
  const speed = page.getByRole("combobox", { name: "此画面倍速", exact: true });
  await page.getByRole("button", { name: "全部暂停", exact: true }).click();
  for (const value of [3, 5]) {
    await selectOption(speed, String(value));
    check(
      `single-player ${value}× reaches the actual player without resuming pause`,
      await page
        .locator(".video-tile video")
        .evaluate(
          (video, value) => video.playbackRate === value && video.paused,
          value,
        ),
    );
  }
  await page.getByRole("button", { name: "统一播放设置", exact: true }).click();
  for (const value of [3, 5]) {
    await page
      .getByRole("button", { name: `全部 ${value} 倍速`, exact: true })
      .click();
    check(
      `unified ${value}× reaches the actual player`,
      await page
        .locator(".video-tile video")
        .evaluate(
          (video, value) => video.playbackRate === value && video.paused,
          value,
        ),
    );
  }
  await page.getByRole("button", { name: "全部 1 倍速", exact: true }).click();
  await page
    .getByRole("button", { name: "收起统一播放设置", exact: true })
    .click();
  check("no renderer exceptions", results.errors.length === 0);
})()
  .catch(async (error) => {
    if (page) {
      results.failureState = await page
        .locator(".video-tile video")
        .evaluateAll((videos) =>
          videos.map((video) => ({
            ready: video.readyState,
            width: video.videoWidth,
            height: video.videoHeight,
            time: video.currentTime,
            paused: video.paused,
            error: video.error?.code || null,
          })),
        )
        .catch(() => []);
      console.log("Player failure state", JSON.stringify(results.failureState));
    }
    results.errors.push(error.message);
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await app?.close().catch(() => {});
    await mkdir(join(project, "test-results"), { recursive: true });
    await writeFile(
      join(project, "test-results/capacity-results.json"),
      JSON.stringify(results, null, 2),
    );
    if (root?.startsWith(join(tmpdir(), "vexa-capacity-desktop-")))
      await rm(root, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 300,
      });
  });
