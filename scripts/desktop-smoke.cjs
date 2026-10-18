const { _electron } = require("playwright");
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
const screenshots = join(project, "docs", "screenshots");
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
async function launch(dataDir) {
  const executablePath =
    process.env.VEXA_TEST_EXECUTABLE || require("electron");
  app = await _electron.launch({
    executablePath,
    args: process.env.VEXA_TEST_EXECUTABLE ? [] : ["."],
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
  await page.getByRole("button", { name: "浅色", exact: true }).click();
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
  await page
    .getByRole("combobox", { name: "按时长筛选", exact: true })
    .selectOption("short");
  await page
    .getByRole("combobox", { name: "按分辨率筛选", exact: true })
    .selectOption("fhd");
  await page
    .getByRole("combobox", { name: "按横竖屏筛选", exact: true })
    .selectOption("landscape");
  await page
    .getByRole("combobox", { name: "按文件状态筛选", exact: true })
    .selectOption("ready");
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
  await page
    .getByRole("combobox", { name: "按横竖屏筛选", exact: true })
    .selectOption("portrait");
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
  await page
    .locator(".video-tile")
    .nth(2)
    .getByRole("button", { name: "暂停此画面", exact: true })
    .click();
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
  await page
    .locator(".video-tile")
    .first()
    .getByRole("combobox", { name: "此画面倍速", exact: true })
    .selectOption("1.5");
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
  await page
    .locator(".video-tile")
    .first()
    .getByRole("combobox", { name: "此画面倍速", exact: true })
    .selectOption("1");
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
  await page.waitForFunction(() => !!document.fullscreenElement);
  check(
    "fullscreen fills the available wall",
    await page
      .locator(".wall-panel")
      .evaluate((el) => el.classList.contains("is-fullscreen")),
  );
  await page.evaluate(() => document.exitFullscreen());
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
  await page
    .getByRole("button", { name: "结束后自动换片", exact: true })
    .click();
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
  await page.keyboard.press("Control+a");
  await until(
    async () =>
      (await page.locator(".selection-bar strong").textContent()) === "3017",
  );
  check("select all includes the complete filtered library", true);
  await page.getByRole("button", { name: "取消选择", exact: true }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page
    .getByRole("combobox", { name: "按分辨率筛选", exact: true })
    .selectOption("fhd");
  await page
    .getByRole("combobox", { name: "按横竖屏筛选", exact: true })
    .selectOption("portrait");
  await page
    .getByRole("combobox", { name: "按文件状态筛选", exact: true })
    .selectOption("missing");
  await until(
    async () =>
      (await page.locator(".virtual-media-grid").getAttribute("data-total")) ===
      "1500",
  );
  check("portrait 1080p uses short edge resolution with status filter", true);
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
  .catch((error) => {
    results.success = false;
    results.failure = error.stack;
    console.error(error);
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
