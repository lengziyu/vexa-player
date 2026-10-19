import { BrowserWindow, safeStorage, session, type Session } from "electron";
import { XCredentials, parseXCookieFile } from "./x-credentials";
import type { DownloadPreferences } from "../src/shared/downloads";
import { readFile, stat } from "node:fs/promises";
import {
  allowXLoginResource,
  allowXLoginNavigation,
  xLoginUserAgent,
  XLoginDiagnostics,
} from "./x-login-policy";
import type { DownloadSnapshot } from "../src/shared/downloads";

export class XAuthentication {
  readonly credentials: XCredentials;
  private loginSession: Session;
  private popup: BrowserWindow | null = null;
  private capturing = false;
  private captureAgain = false;
  private epoch = 0;
  private opening: Promise<void> | null = null;
  private error: string | null = null;
  private diagnostics = new XLoginDiagnostics();
  constructor(
    private changed: () => void,
    dataDir: string,
  ) {
    this.credentials = new XCredentials({
      dataDir,
      encrypt: async (text) => {
        if (!(await safeStorage.isAsyncEncryptionAvailable()))
          throw new Error("系统安全存储不可用，无法保存 X 登录信息");
        return safeStorage.encryptStringAsync(text);
      },
      decrypt: async (data) =>
        (await safeStorage.decryptStringAsync(data)).result,
    });
    this.loginSession = session.fromPartition("vexa-x-login", { cache: false });
    this.loginSession.setUserAgent(
      xLoginUserAgent(this.loginSession.getUserAgent()),
    );
    this.loginSession.setPermissionRequestHandler(
      (_contents, _permission, callback) => callback(false),
    );
    this.loginSession.setPermissionCheckHandler(() => false);
    this.loginSession.webRequest.onBeforeRequest((details, callback) => {
      callback({ cancel: !allowXLoginResource(details.url) });
    });
    this.loginSession.webRequest.onCompleted((details) => {
      if (
        this.popup &&
        this.diagnostics.record(details.url, "http", details.statusCode)
      )
        this.changed();
    });
    this.loginSession.webRequest.onErrorOccurred((details) => {
      if (
        this.popup &&
        this.diagnostics.record(details.url, "network", details.error)
      )
        this.changed();
    });
    this.loginSession.cookies.on("changed", () => {
      if (this.popup) {
        if (this.capturing) this.captureAgain = true;
        else void this.capture();
      }
    });
  }
  state(): DownloadSnapshot["authentication"] {
    return {
      connected: this.credentials.connected,
      connecting: !!this.popup || !!this.opening,
      error: this.error,
      diagnostics: this.diagnostics.snapshot(),
    };
  }
  async init(): Promise<void> {
    await this.credentials.init();
  }
  connect(
    parent: BrowserWindow,
    preferences: DownloadPreferences,
  ): Promise<void> {
    if (this.popup) {
      this.popup.show();
      this.popup.focus();
      return Promise.resolve();
    }
    if (this.opening) return this.opening;
    this.opening = this.openWindow(parent, preferences).finally(() => {
      this.opening = null;
      this.changed();
    });
    this.changed();
    return this.opening;
  }
  private async openWindow(
    parent: BrowserWindow,
    preferences: DownloadPreferences,
  ): Promise<void> {
    if (this.popup) {
      this.popup.show();
      this.popup.focus();
      return;
    }
    const epoch = ++this.epoch;
    await this.loginSession.clearStorageData();
    await this.loginSession.setProxy(
      preferences.connection === "manual"
        ? { mode: "fixed_servers", proxyRules: preferences.proxy }
        : { mode: preferences.connection },
    );
    await this.loginSession.closeAllConnections();
    if (epoch !== this.epoch) return;
    this.error = null;
    this.diagnostics.clear();
    const popup = new BrowserWindow({
      parent,
      width: 560,
      height: 780,
      title: "连接 X · 登录信息仅保存在本机",
      autoHideMenuBar: true,
      show: false,
      webPreferences: {
        session: this.loginSession,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webviewTag: false,
        webSecurity: true,
        navigateOnDragDrop: false,
      },
    });
    this.popup = popup;
    this.changed();
    popup.webContents.setWindowOpenHandler(({ url }) => {
      if (this.diagnostics.record(url, "blocked")) this.changed();
      return { action: "deny" };
    });
    popup.webContents.on("will-attach-webview", (event) =>
      event.preventDefault(),
    );
    const navigate = (
      event: Electron.Event & { url: string; isMainFrame: boolean },
    ) => {
      if (allowXLoginNavigation(event.url, event.isMainFrame)) return;
      event.preventDefault();
      if (this.diagnostics.record(event.url, "blocked")) this.changed();
    };
    popup.webContents.on("will-frame-navigate", navigate);
    popup.webContents.on("will-redirect", navigate);
    popup.once("ready-to-show", () => popup.show());
    popup.once("closed", () => {
      if (this.popup === popup) this.popup = null;
      this.changed();
    });
    try {
      await popup.loadURL("https://x.com/i/flow/login");
    } catch {
      if (popup.isDestroyed()) return;
      this.error = "X 登录页加载失败，请检查代理设置，或手动导入登录文件";
      popup.destroy();
      this.changed();
      throw new Error(this.error);
    }
  }
  private async capture(): Promise<void> {
    const epoch = this.epoch;
    this.capturing = true;
    try {
      const cookies = await this.loginSession.cookies.get({
        url: "https://x.com",
      });
      const token = cookies.find((cookie) => cookie.name === "auth_token"),
        csrf = cookies.find((cookie) => cookie.name === "ct0");
      if (!token || !csrf || epoch !== this.epoch || !this.popup) return;
      await this.credentials.save({
        authToken: token.value,
        csrf: csrf.value,
        expires: token.expirationDate || null,
      });
      if (epoch !== this.epoch) return;
      this.error = null;
      this.diagnostics.clear();
      this.popup?.destroy();
      this.changed();
    } catch {
      this.error = "登录信息未能保存，请重试或手动导入登录文件";
      this.changed();
    } finally {
      this.capturing = false;
      if (this.captureAgain && this.popup) {
        this.captureAgain = false;
        void this.capture();
      }
    }
  }
  async importFile(file: string): Promise<void> {
    this.epoch++;
    this.popup?.destroy();
    if ((await stat(file)).size > 2 * 1024 * 1024)
      throw new Error("登录文件过大，请只导出 X 站点的 Cookie");
    await this.credentials.save(parseXCookieFile(await readFile(file, "utf8")));
    this.error = null;
    this.diagnostics.clear();
    this.popup?.close();
    await this.loginSession.clearStorageData();
    this.changed();
  }
  async disconnect(): Promise<void> {
    this.epoch++;
    this.popup?.destroy();
    await this.credentials.clear();
    await this.loginSession.clearStorageData();
    this.error = null;
    this.diagnostics.clear();
    this.changed();
  }
  async close(): Promise<void> {
    this.epoch++;
    this.popup?.destroy();
    await this.credentials.flush();
    await this.loginSession.clearStorageData();
  }
}
