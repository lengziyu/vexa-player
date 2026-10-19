import type { XLoginDiagnostic } from "../src/shared/downloads";

const xHosts = ["x.com", "twitter.com"];
const resourceHosts = [
  ...xHosts,
  "twimg.com",
  "arkoselabs.com",
  "hcaptcha.com",
  "gstatic.com",
];
const signInHosts = ["accounts.google.com", "appleid.cdn-apple.com"];
const under = (host: string, root: string) =>
  host === root || host.endsWith(`.${root}`);

function secureURL(input: string): URL | null {
  try {
    const url = new URL(input);
    if (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port
    )
      return url;
  } catch {}
  return null;
}

export function allowXLoginResource(input: string): boolean {
  const url = secureURL(input);
  return (
    !!url &&
    (resourceHosts.some((root) => under(url.hostname, root)) ||
      signInHosts.includes(url.hostname))
  );
}

export function allowXLoginNavigation(
  input: string,
  isMainFrame: boolean,
): boolean {
  const url = secureURL(input);
  if (!url) return false;
  // Challenges redirect inside their own frames. Only the main page must stay on X.
  return isMainFrame
    ? /^(?:www\.)?(?:x|twitter)\.com$/.test(url.hostname)
    : allowXLoginResource(input);
}

export function xLoginUserAgent(userAgent: string): string {
  // Keep the actual Chromium version and platform; remove application branding only.
  return userAgent.replace(
    /\s+(?:Electron|vexa-player|VexaPlayer|Vexa)\/[^\s]+/gi,
    "",
  );
}

function serviceName(input: string): string | null {
  const url = secureURL(input);
  if (!url) return null;
  const host = url.hostname;
  if (xHosts.some((root) => under(host, root))) return "X 登录服务";
  if (under(host, "twimg.com")) return "X 页面资源";
  if (under(host, "arkoselabs.com")) return "Arkose 安全验证";
  if (under(host, "hcaptcha.com")) return "hCaptcha 安全验证";
  if (under(host, "gstatic.com")) return "Google 静态资源";
  if (host === "accounts.google.com") return "Google 登录";
  if (host === "appleid.cdn-apple.com") return "Apple 登录资源";
  return null;
}

export class XLoginDiagnostics {
  private entries: XLoginDiagnostic[] = [];
  clear(): void {
    this.entries = [];
  }
  snapshot(): XLoginDiagnostic[] {
    return this.entries.map((entry) => ({ ...entry }));
  }
  record(
    input: string,
    kind: "blocked" | "http" | "network",
    code?: number | string,
  ): boolean {
    // Store service labels and status codes only, never URLs, headers, bodies or credentials.
    const service = serviceName(input);
    if (!service) return false;
    let message: string;
    if (kind === "blocked")
      message = "页面跳转被限制；第三方登录请使用浏览器后导入登录文件";
    else if (kind === "http") {
      if (
        typeof code !== "number" ||
        !Number.isInteger(code) ||
        code < 400 ||
        code > 599
      )
        return false;
      message = `请求返回 HTTP ${code}`;
      if (code === 429) message += "，请稍后重试";
    } else {
      if (
        typeof code !== "string" ||
        !/^net::ERR_[A-Z0-9_]{1,64}$/.test(code) ||
        ["net::ERR_ABORTED", "net::ERR_BLOCKED_BY_CLIENT"].includes(code)
      )
        return false;
      message = `网络请求失败（${code}），请检查连接或代理`;
    }
    if (
      this.entries.some(
        (entry) => entry.service === service && entry.message === message,
      )
    )
      return false;
    this.entries.push({ service, message });
    if (this.entries.length > 8) this.entries.shift();
    return true;
  }
}
