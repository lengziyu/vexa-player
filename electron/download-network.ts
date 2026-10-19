import { session, type Session } from "electron";
import type { DownloadPreferences } from "../src/shared/downloads";

function allowed(input: string): boolean {
  try {
    const url = new URL(input);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      [
        "github.com",
        "release-assets.githubusercontent.com",
        "objects.githubusercontent.com",
        "pbs.twimg.com",
        "video.twimg.com",
      ].includes(url.hostname)
    );
  } catch {
    return false;
  }
}

// A separate, memory-only session keeps the local renderer's network block intact.
export class DownloadNetwork {
  private connection: Session;
  private current = "";
  private configuring = Promise.resolve();
  constructor() {
    this.connection = session.fromPartition("vexa-download-network");
    this.connection.setPermissionRequestHandler(
      (_contents, _permission, callback) => callback(false),
    );
    this.connection.setPermissionCheckHandler(() => false);
    // Check redirects as well as initial URLs. Electron fetch rejects manual redirects.
    this.connection.webRequest.onBeforeRequest((details, callback) =>
      callback({ cancel: !allowed(details.url) }),
    );
  }
  private configure(preferences: DownloadPreferences): Promise<void> {
    this.configuring = this.configuring
      .catch(() => {})
      .then(async () => {
        const key = `${preferences.connection}:${preferences.proxy}`;
        if (key === this.current) return;
        await this.connection.setProxy(
          preferences.connection === "manual"
            ? { mode: "fixed_servers", proxyRules: preferences.proxy }
            : { mode: preferences.connection },
        );
        await this.connection.closeAllConnections();
        this.current = key;
      });
    return this.configuring;
  }
  async proxy(preferences: DownloadPreferences): Promise<string> {
    await this.configure(preferences);
    if (preferences.connection === "direct") return "";
    if (preferences.connection === "manual") return preferences.proxy;
    const route = (await this.connection.resolveProxy("https://x.com"))
      .split(";")[0]!
      .trim();
    if (route === "DIRECT") return "";
    const match = route.match(
      /^(PROXY|HTTPS|SOCKS5?|SOCKS4)\s+([A-Za-z0-9.\[\]:-]+)$/,
    );
    if (!match || match[1] === "SOCKS4")
      throw new Error(
        "系统代理无法用于下载，请在网络设置中填写 HTTP(S) / SOCKS5 代理",
      );
    return `${match[1] === "HTTPS" ? "https" : match[1]!.startsWith("SOCKS") ? "socks5" : "http"}://${match[2]}`;
  }
  async fetch(
    input: string,
    preferences: DownloadPreferences,
    signal: AbortSignal,
  ): Promise<Response> {
    await this.configure(preferences);
    const combined = AbortSignal.any([
      signal,
      AbortSignal.timeout(
        input.includes("/releases/download/") ? 180000 : 15000,
      ),
    ]);
    if (!allowed(input)) throw new Error("下载来源不受支持");
    return this.connection.fetch(input, {
      signal: combined,
      redirect: "follow",
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
  }
}
