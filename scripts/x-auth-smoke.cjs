// Exercises authorization storage with synthetic tokens; never uses a real account.
const { _electron } = require("playwright");
const assert = require("node:assert/strict");
const { mkdtemp, mkdir, readFile, writeFile, rm } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const project = resolve(__dirname, "..");
const results = { checks: [], errors: [] };
let root, app, page;
const token = "synthetic-token-for-desktop-test",
  csrf = "synthetic-csrf-for-desktop-test";
function check(name, value) {
  assert.ok(value, name);
  results.checks.push(name);
  console.log("PASS", name);
}
async function until(predicate) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((r) => setTimeout(r, 75));
  }
  throw new Error("Auth desktop state timed out");
}
async function launch() {
  app = await _electron.launch({
    executablePath: process.env.VEXA_TEST_EXECUTABLE || require("electron"),
    args: [
      ...(process.env.VEXA_TEST_EXECUTABLE ? [] : ["."]),
      `--user-data-dir=${root}`,
    ],
    cwd: project,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: undefined,
      VEXA_DATA_DIR: root,
    },
  });
  page = await app.firstWindow();
  page.on("pageerror", (error) => results.errors.push(error.message));
  await page.getByRole("heading", { name: "你的私人放映室." }).waitFor();
  await page.getByRole("button", { name: "下载", exact: true }).click();
}
const snapshot = () => page.evaluate(() => window.vexa.downloads.snapshot());
const loginPanel = () =>
  page.getByRole("dialog", { name: "X 登录与隐私", exact: true });
async function openLoginPanel() {
  const trigger = page.getByRole("button", {
    name: "X 登录与隐私",
    exact: true,
  });
  if ((await trigger.getAttribute("aria-expanded")) !== "true") {
    await trigger.click();
  }
  await loginPanel().waitFor();
  await until(() =>
    loginPanel().evaluate(
      (panel) =>
        !panel.classList.contains("x-login-popover-enter-active") &&
        !panel.classList.contains("x-login-popover-leave-active"),
    ),
  );
}
(async () => {
  root = await mkdtemp(join(tmpdir(), "vexa-x-auth-desktop-"));
  await launch();
  check(
    "X authorization starts disconnected",
    !(await snapshot()).authentication.connected,
  );
  check(
    "local app has no account avatar or automatic X login window",
    (await page.locator(".topbar .avatar").count()) === 0 &&
      (await app.windows()).length === 1 &&
      !(await loginPanel().isVisible()),
  );
  await openLoginPanel();
  check(
    "optional login explains access limits and account-session privacy",
    (await loginPanel()
      .getByText("什么时候需要登录？", { exact: true })
      .isVisible()) &&
      (await loginPanel()
        .getByText(/并非仅限下载的独立授权/)
        .isVisible()),
  );
  const panelBox = await loginPanel().boundingBox(),
    viewport = await page.evaluate(() => ({
      width: innerWidth,
      height: innerHeight,
    }));
  check(
    "login opens in a small nonmodal panel within the viewport",
    panelBox.width <= 420 &&
      panelBox.height <= 560 &&
      panelBox.x >= 0 &&
      panelBox.y >= 0 &&
      panelBox.x + panelBox.width <= viewport.width &&
      panelBox.y + panelBox.height <= viewport.height &&
      (await loginPanel().getAttribute("aria-modal")) === "false",
  );
  await page.getByRole("textbox", { name: "X 帖子链接" }).click();
  await loginPanel().waitFor({ state: "hidden" });
  check(
    "clicking outside closes the popover without blocking the link field",
    await page
      .getByRole("textbox", { name: "X 帖子链接" })
      .evaluate((input) => input === document.activeElement),
  );
  await openLoginPanel();
  await loginPanel().press("Escape");
  await loginPanel().waitFor({ state: "hidden" });
  check(
    "Escape closes the login panel and restores the trigger focus",
    await page
      .getByRole("button", { name: "X 登录与隐私", exact: true })
      .evaluate((button) => button === document.activeElement),
  );
  const screenshots =
    process.env.VEXA_TEST_SCREENSHOTS || join(project, "docs/screenshots");
  await mkdir(screenshots, { recursive: true });
  await openLoginPanel();
  await loginPanel().screenshot({
    path: join(screenshots, "x-login-dark.png"),
    animations: "disabled",
  });
  await page.getByRole("button", { name: "切换浅色主题", exact: true }).click();
  await openLoginPanel();
  await loginPanel().screenshot({
    path: join(screenshots, "x-login-light.png"),
    animations: "disabled",
  });
  check(
    "the login popover follows the light theme",
    await page.evaluate(
      () => document.documentElement.dataset.theme === "light",
    ),
  );
  await page.getByRole("button", { name: "切换深色主题", exact: true }).click();
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((window) => !window.getParentWindow())
      .setSize(920, 650),
  );
  await openLoginPanel();
  const compactBox = await loginPanel().boundingBox(),
    compactViewport = await page.evaluate(() => ({
      width: innerWidth,
      height: innerHeight,
      overflow: document.documentElement.scrollWidth > innerWidth,
    }));
  check(
    "popover fits a small desktop window without horizontal overflow",
    compactBox.x >= 0 &&
      compactBox.y >= 0 &&
      compactBox.x + compactBox.width <= compactViewport.width &&
      compactBox.y + compactBox.height <= compactViewport.height &&
      !compactViewport.overflow,
  );
  await loginPanel()
    .getByRole("button", { name: "关闭 X 登录面板", exact: true })
    .click();
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((window) => !window.getParentWindow())
      .setSize(1440, 940),
  );
  const file = join(root, "synthetic-cookies.txt");
  await writeFile(
    file,
    `# Netscape HTTP Cookie File\n.x.com\tTRUE\t/\tTRUE\t0\tauth_token\t${token}\n.x.com\tTRUE\t/\tTRUE\t0\tct0\t${csrf}\n`,
  );
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
  }, file);
  await openLoginPanel();
  await loginPanel().getByText("使用浏览器或登录文件", { exact: true }).click();
  await page
    .getByRole("button", { name: "导入 X 登录文件", exact: true })
    .click();
  await until(async () => (await snapshot()).authentication.connected);
  check("explicit local cookie import connects X", true);
  const encrypted = await readFile(join(root, "x-auth/session.bin"));
  check(
    "real OS encryption keeps tokens out of the persisted file",
    !encrypted.includes(token) && !encrypted.includes(csrf),
  );
  check(
    "renderer snapshots contain no credentials",
    !JSON.stringify(await snapshot()).includes(token),
  );
  await app.close();
  app = null;
  await launch();
  check(
    "authorization restores locally without browser account access",
    (await snapshot()).authentication.connected,
  );
  await openLoginPanel();
  await loginPanel()
    .getByRole("button", { name: "断开并清除登录", exact: true })
    .click();
  await until(async () => !(await snapshot()).authentication.connected);
  check(
    "disconnect clears the encrypted session",
    await readFile(join(root, "x-auth/session.bin")).then(
      () => false,
      () => true,
    ),
  );
  await app.evaluate(async ({ session }) => {
    // Intercept only the isolated login session. Exercise actual Chromium requests,
    // scripts and cross-origin frame redirects without submitting any real account.
    await session
      .fromPartition("vexa-x-login")
      .protocol.handle("https", (request) => {
        const url = new URL(request.url);
        if (url.hostname === "client-api.arkoselabs.com") {
          if (url.pathname === "/start")
            return new Response(null, {
              status: 302,
              headers: {
                Location: "https://client-api.arkoselabs.com/challenge",
              },
            });
          return new Response("<html><body>安全验证测试页面</body></html>", {
            headers: { "Content-Type": "text/html; charset=utf-8" },
          });
        }
        if (url.hostname === "accounts.google.com")
          return new Response("window.googleSignInFixtureLoaded = true;", {
            headers: { "Content-Type": "application/javascript" },
          });
        if (url.hostname === "appleid.cdn-apple.com")
          return new Response("window.appleSignInFixtureLoaded = true;", {
            headers: { "Content-Type": "application/javascript" },
          });
        if (url.pathname === "/fixture-status")
          return new Response("Test error without credentials", {
            status: 403,
          });
        return new Response(
          `<!doctype html><title>连接 X · 测试页面</title><body>
        <script src="https://accounts.google.com/gsi/client"></script>
        <script src="https://appleid.cdn-apple.com/fixture.js"></script>
        <iframe title="challenge" src="https://client-api.arkoselabs.com/start"></iframe>
        <a href="https://accounts.google.com/fixture-login">第三方登录测试</a>
        <a href="https://example.invalid/fixture">外部跳转测试</a>
      </body>`,
          { headers: { "Content-Type": "text/html; charset=utf-8" } },
        );
      });
  });
  await page.getByRole("button", { name: "连接 X", exact: true }).click();
  await until(async () => (await app.windows()).length === 2);
  check(
    "login uses a separate sandbox without preload or Node",
    await app.evaluate(({ BrowserWindow }) => {
      const prefs = BrowserWindow.getAllWindows()
        .find((window) => window.getParentWindow())
        ?.webContents.getLastWebPreferences();
      return (
        !!prefs &&
        prefs.sandbox &&
        prefs.contextIsolation &&
        !prefs.nodeIntegration &&
        !prefs.preload
      );
    }),
  );
  let popup = (await app.windows()).find((window) => window !== page);
  await popup
    .frameLocator('iframe[title="challenge"]')
    .getByText("安全验证测试页面")
    .waitFor();
  check("challenge subframe follows its official redirect", true);
  check(
    "official Google and Apple sign-in scripts load inside the login session",
    await popup.evaluate(
      () => window.googleSignInFixtureLoaded && window.appleSignInFixtureLoaded,
    ),
  );
  check(
    "login navigator keeps the actual Chromium version without app branding",
    await popup.evaluate(
      () =>
        /Chrome\//.test(navigator.userAgent) &&
        !/Electron\/|vexa-player\//i.test(navigator.userAgent),
    ),
  );
  // DOM clicks avoid Playwright waiting for a navigation intentionally canceled by Electron.
  await popup.evaluate(() =>
    document
      .querySelector('a[href="https://accounts.google.com/fixture-login"]')
      .click(),
  );
  await until(
    async () => (await snapshot()).authentication.diagnostics.length > 0,
  );
  check(
    "top-level third-party navigation is blocked while the X page remains usable",
    popup.url() === "https://x.com/i/flow/login",
  );
  await app.evaluate(({ BrowserWindow }) => {
    const contents = BrowserWindow.getAllWindows().find((window) =>
      window.getParentWindow(),
    ).webContents;
    contents.on("will-frame-navigate", (event) => {
      if (event.url === "https://example.invalid/fixture")
        global.__externalNavigationPrevented = event.defaultPrevented;
    });
  });
  await popup.evaluate(() =>
    document.querySelector('a[href="https://example.invalid/fixture"]').click(),
  );
  await until(() =>
    app.evaluate(() => global.__externalNavigationPrevented === true),
  );
  check(
    "arbitrary external top-level navigation is blocked",
    popup.url() === "https://x.com/i/flow/login",
  );
  await popup.evaluate(() =>
    fetch("https://x.com/fixture-status?password=synthetic-query-secret").then(
      () => undefined,
    ),
  );
  await until(async () =>
    (await snapshot()).authentication.diagnostics.some((entry) =>
      entry.message.includes("HTTP 403"),
    ),
  );
  check(
    "HTTP failures publish status-only diagnostics without URL parameters",
    !JSON.stringify((await snapshot()).authentication).includes(
      "synthetic-query-secret",
    ),
  );
  await page.getByText(/登录连接诊断 ·/).click();
  await page
    .getByText("X 登录服务：请求返回 HTTP 403", { exact: true })
    .waitFor();
  check("diagnostic feedback is visible in the downloads page", true);
  await app.evaluate(({ shell }) => {
    shell.openExternal = async (url) => {
      global.__authExternalURL = url;
    };
  });
  await loginPanel().getByText("使用浏览器或登录文件", { exact: true }).click();
  await page
    .getByRole("button", { name: "在浏览器打开 X", exact: true })
    .click();
  check(
    "browser fallback opens only the fixed official X login address",
    await app.evaluate(
      () => global.__authExternalURL === "https://x.com/i/flow/login",
    ),
  );
  await app.evaluate(
    async ({ session }, values) => {
      const cookies = session.fromPartition("vexa-x-login").cookies;
      await cookies.set({
        url: "https://x.com",
        name: "ct0",
        value: values.csrf,
        domain: ".x.com",
        path: "/",
        secure: true,
      });
      await cookies.set({
        url: "https://x.com",
        name: "auth_token",
        value: values.token,
        domain: ".x.com",
        path: "/",
        secure: true,
        httpOnly: true,
      });
    },
    { token, csrf },
  );
  await until(
    async () =>
      (await snapshot()).authentication.connected &&
      !(await snapshot()).authentication.connecting,
  );
  check(
    "login completion saves authorization and closes its own window",
    (await app.windows()).length === 1,
  );
  await loginPanel()
    .getByRole("button", { name: "断开并清除登录", exact: true })
    .click();
  await until(async () => !(await snapshot()).authentication.connected);
  check("synthetic login state is fully removed", true);
  await page.getByRole("button", { name: "连接 X", exact: true }).click();
  await until(async () => (await app.windows()).length === 2);
  await app.evaluate(async ({ BrowserWindow }) => {
    const popup = BrowserWindow.getAllWindows().find((window) =>
      window.getParentWindow(),
    );
    await popup.webContents.executeJavaScript(
      "window.onbeforeunload = () => false; void 0",
    );
  });
  const closedAt = Date.now();
  await app.close();
  app = null;
  check(
    "application exit closes a login page even if it vetoes ordinary close",
    Date.now() - closedAt < 5000,
  );
  check("no renderer exceptions", results.errors.length === 0);
})()
  .catch((error) => {
    results.errors.push(error.message);
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await app?.close().catch(() => {});
    await mkdir(join(project, "test-results"), { recursive: true });
    await writeFile(
      join(project, "test-results/x-auth-results.json"),
      JSON.stringify(results, null, 2),
    );
    if (root?.startsWith(join(tmpdir(), "vexa-x-auth-desktop-")))
      await rm(root, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 300,
      });
  });
