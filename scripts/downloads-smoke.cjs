// Explicit online smoke test. Uses its own data directory and a public yt-dlp fixture.
const { _electron } = require("playwright");
const { selectOption } = require("./select-menu.cjs");
const assert = require("node:assert/strict");
const {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  rm,
  stat,
  realpath,
} = require("node:fs/promises");
const { join, resolve } = require("node:path");
const { tmpdir } = require("node:os");
const { spawnSync } = require("node:child_process");
const probe = require("@ffprobe-installer/ffprobe").path;
const project = resolve(__dirname, "..");
const screenshots =
  process.env.VEXA_TEST_SCREENSHOTS || join(project, "docs/screenshots");
const result = {
  date: new Date().toISOString(),
  source: "https://x.com/BrooklynNets/status/1349794411333394432",
  checks: [],
  errors: [],
};
let app, page, folder;
function check(name, value) {
  assert.ok(value, name);
  result.checks.push(name);
  console.log("PASS", name);
}
async function until(predicate, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("Desktop download state timed out");
}
(async () => {
  folder = await mkdtemp(join(tmpdir(), "vexa-x-desktop-"));
  const data = join(folder, "data"),
    destination = join(folder, "下载 videos");
  await mkdir(data);
  await mkdir(destination);
  await mkdir(join(project, "test-results"), { recursive: true });
  await mkdir(screenshots, { recursive: true });
  app = await _electron.launch({
    executablePath: process.env.VEXA_TEST_EXECUTABLE || require("electron"),
    args: [
      ...(process.env.VEXA_TEST_EXECUTABLE ? [] : ["."]),
      `--user-data-dir=${data}`,
    ],
    cwd: project,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: undefined,
      VEXA_DATA_DIR: data,
    },
  });
  page = await app.firstWindow();
  page.on("pageerror", (error) => result.errors.push(error.message));
  await page.getByRole("heading", { name: "你的私人放映室." }).waitFor();
  await page.getByRole("button", { name: "下载", exact: true }).click();
  await page.getByRole("heading", { name: "留住喜欢的片刻." }).waitFor();
  check(
    "download navigation and initial empty state",
    await page.getByText("还没有下载任务", { exact: true }).isVisible(),
  );
  check(
    "component is opt-in and absent on first launch",
    (await page.evaluate(() => window.vexa.downloads.snapshot())).engine
      .status === "missing",
  );
  await page.screenshot({
    path: join(screenshots, "downloads-dark.png"),
    fullPage: true,
    animations: "disabled",
  });
  await app.evaluate(({ dialog }, directory) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [directory],
    });
  }, destination);
  await page.getByRole("button", { name: "选择位置", exact: true }).click();
  const canonicalDestination = await realpath(destination);
  await until(
    async () =>
      (await page.evaluate(() => window.vexa.downloads.snapshot())).preferences
        .directory === canonicalDestination,
  );
  await page.getByRole("button", { name: "下载设置", exact: true }).click();
  await selectOption(
    page.getByRole("combobox", { name: "下载连接方式" }),
    "direct",
  );
  await page.getByRole("button", { name: "保存设置", exact: true }).click();
  await until(
    async () =>
      (await page.evaluate(() => window.vexa.downloads.snapshot())).preferences
        .connection === "direct",
  );
  check(
    "download directory and connection settings persist",
    JSON.parse(await readFile(join(data, "downloads.json"), "utf8"))
      .connection === "direct",
  );
  await page.getByRole("button", { name: "安装下载组件", exact: true }).click();
  await until(async () => {
    const state = await page.evaluate(() => window.vexa.downloads.snapshot());
    if (state.engine.status === "error") throw new Error(state.engine.error);
    return state.engine.status === "ready";
  }, 180000);
  check("official optional engine downloaded and checksum-verified", true);
  await page
    .getByRole("textbox", { name: "X 帖子链接" })
    .fill("https://x.com.evil.test/user/status/12345");
  await page.getByRole("button", { name: "解析链接", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "仅支持" }).waitFor();
  check("unsupported host rejected through desktop IPC", true);
  await page.getByRole("textbox", { name: "X 帖子链接" }).fill(result.source);
  await page.getByRole("button", { name: "解析链接", exact: true }).click();
  await page
    .getByRole("combobox", { name: "视频 1 清晰度" })
    .waitFor({ timeout: 100000 });
  check("real X post parsed into video and qualities", true);
  await selectOption(
    page.getByRole("combobox", { name: "视频 1 清晰度" }),
    "270",
  );
  await page
    .getByRole("button", { name: "下载选中的 1 个视频", exact: true })
    .click();
  await until(async () => {
    const task = (await page.evaluate(() => window.vexa.downloads.snapshot()))
      .tasks[0];
    if (task?.status === "failed") throw new Error(task.error);
    return task?.status === "complete" && (task.imported || !!task.importError);
  }, 180000);
  const task = (await page.evaluate(() => window.vexa.downloads.snapshot()))
    .tasks[0];
  check("actual X video downloaded and automatically indexed", task.imported);
  const metadata = spawnSync(
    probe,
    ["-v", "error", "-show_streams", "-show_format", "-of", "json", task.file],
    { windowsHide: true, encoding: "utf8", timeout: 15000 },
  );
  assert.equal(metadata.status, 0);
  const media = JSON.parse(metadata.stdout);
  check(
    "downloaded file has playable video and preserved audio",
    media.streams.some((s) => s.codec_type === "video" && s.height <= 270) &&
      media.streams.some((s) => s.codec_type === "audio"),
  );
  result.media = {
    size: (await stat(task.file)).size,
    duration: media.format.duration,
    codecs: media.streams.map((s) => s.codec_name),
    height: media.streams.find((s) => s.codec_type === "video").height,
  };
  await page
    .evaluate(async (id) => {
      try {
        await window.vexa.downloads.enqueue({
          previewId: "untrusted",
          selections: [{ id, quality: 0 }],
        });
        return false;
      } catch {
        return true;
      }
    }, task.video.id)
    .then((value) =>
      check("forged preview cannot download arbitrary content", value),
    );
  const rows = await page.evaluate(() =>
    window.vexa.queryLibrary({ limit: 10 }),
  );
  check(
    "completed download searchable in the local library",
    rows.total === 1 && rows.items[0].status === "ready",
  );
  await page
    .getByRole("button", { name: /^视频库\d*/ })
    .first()
    .click();
  await page.locator(".library-card").first().dblclick();
  await until(
    async () =>
      await page
        .locator(".video-tile video")
        .first()
        .evaluate(
          (video) =>
            !video.paused && video.currentTime > 1 && video.videoWidth > 0,
        ),
  );
  check("downloaded X video actually decodes and plays in the wall", true);
  await page.getByRole("button", { name: "下载", exact: true }).click();
  await page
    .getByRole("textbox", { name: "X 帖子链接" })
    .fill("https://x.com/primevideouk/status/1578401165338976258/video/2");
  await page.getByRole("button", { name: "解析链接", exact: true }).click();
  await page
    .getByRole("combobox", { name: "视频 2 清晰度" })
    .waitFor({ timeout: 100000 });
  check(
    "real multi-video post preserves the explicitly selected video",
    (await page
      .getByRole("checkbox", { name: "选择第 2 个视频", exact: true })
      .isChecked()) &&
      !(await page
        .getByRole("checkbox", { name: "选择第 1 个视频", exact: true })
        .isChecked()),
  );
  await page.getByRole("button", { name: "切换浅色主题", exact: true }).click();
  await page.screenshot({
    path: join(screenshots, "downloads-light.png"),
    fullPage: true,
    animations: "disabled",
  });
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(920, 760),
  );
  check(
    "narrow download page has no horizontal overflow",
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  );
  await selectOption(page.getByRole("combobox", { name: "视频 2 清晰度" }), {
    index: 2,
  });
  await page
    .getByRole("button", { name: "下载选中的 1 个视频", exact: true })
    .click();
  await until(async () => {
    const second = (await page.evaluate(() => window.vexa.downloads.snapshot()))
      .tasks[1];
    if (second?.status === "failed") throw new Error(second.error);
    return second?.status === "complete" && second.imported;
  }, 180000);
  check("selected second video downloads and indexes independently", true);
  await page.evaluate(() => window.vexa.downloads.clearFinished());
  check(
    "clearing task history preserves the downloaded file",
    (await stat(task.file)).size > 0 &&
      (await page.evaluate(() => window.vexa.downloads.snapshot())).tasks
        .length === 0,
  );
  check("no renderer exceptions", result.errors.length === 0);
  await app.close();
  app = null;
})()
  .catch((error) => {
    result.errors.push(error.message);
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (app) await app.close().catch(() => {});
    await mkdir(join(project, "test-results"), { recursive: true });
    await writeFile(
      join(project, "test-results/downloads-results.json"),
      JSON.stringify(result, null, 2),
    );
    if (folder && folder.startsWith(join(tmpdir(), "vexa-x-desktop-")))
      await rm(folder, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 300,
      });
  });
