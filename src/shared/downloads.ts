export type DownloadConnection = "system" | "direct" | "manual";
export interface DownloadPreferences {
  directory: string;
  connection: DownloadConnection;
  proxy: string;
  autoImport: boolean;
}
export interface DownloadVideo {
  id: string;
  index: number;
  title: string;
  author: string;
  duration: number | null;
  thumbnail: string | null;
  qualities: number[];
}
export interface DownloadPreview {
  id: string;
  url: string;
  selectedIndex: number | null;
  videos: DownloadVideo[];
}
export type DownloadStatus =
  | "queued"
  | "downloading"
  | "processing"
  | "complete"
  | "failed"
  | "cancelled";
export interface DownloadTask {
  id: string;
  video: DownloadVideo;
  quality: number;
  status: DownloadStatus;
  progress: number | null;
  speed: number | null;
  eta: number | null;
  error: string | null;
  file: string | null;
  imported: boolean;
  importing: boolean;
  importError: string | null;
}
export interface XLoginDiagnostic {
  service: string;
  message: string;
}
export interface DownloadSnapshot {
  engine: {
    status: "missing" | "installing" | "ready" | "error" | "unsupported";
    progress: number | null;
    error: string | null;
    version: string;
    size: number;
  };
  preferences: DownloadPreferences;
  tasks: DownloadTask[];
  parsing: boolean;
  authentication: {
    connected: boolean;
    connecting: boolean;
    error: string | null;
    diagnostics: XLoginDiagnostic[];
  };
}
export interface DownloadApi {
  snapshot(): Promise<DownloadSnapshot>;
  installEngine(): Promise<void>;
  importEngine(): Promise<void>;
  openEngineSource(): Promise<void>;
  connectX(): Promise<void>;
  openXInBrowser(): Promise<void>;
  importXLogin(): Promise<void>;
  disconnectX(): Promise<void>;
  chooseDirectory(): Promise<string | null>;
  configure(input: Omit<DownloadPreferences, "directory">): Promise<void>;
  paste(): Promise<string>;
  parse(url: string): Promise<DownloadPreview>;
  enqueue(input: {
    previewId: string;
    selections: Array<{ id: string; quality: number }>;
  }): Promise<void>;
  cancel(id: string): Promise<void>;
  retry(id: string): Promise<void>;
  reveal(id: string): Promise<void>;
  importFile(id: string): Promise<void>;
  clearFinished(): Promise<void>;
  onChange(callback: (snapshot: DownloadSnapshot) => void): () => void;
}

export function parseXLink(input: unknown): {
  url: string;
  postId: string;
  index: number | null;
} {
  if (typeof input !== "string" || input.length > 2048)
    throw new Error("请粘贴 X / Twitter 帖子链接");
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error("链接格式不正确，请复制完整的帖子链接");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    !/^(?:(?:www|mobile|m)\.)?(?:x|twitter)\.com$/.test(url.hostname)
  )
    throw new Error("仅支持 https://x.com 或 twitter.com 的帖子链接");
  const match = url.pathname.match(
    /^\/(?:(?:i\/web|[A-Za-z0-9_]+)\/status|statuses)\/(\d{1,25})(?:\/(?:video|photo)\/([1-4]))?\/?$/,
  );
  if (!match)
    throw new Error("请复制单条帖子的链接，暂不支持主页、搜索或短链接");
  const index = match[2] ? Number(match[2]) : null;
  return {
    postId: match[1]!,
    index,
    url: `https://x.com/i/web/status/${match[1]}`,
  };
}

export function validateDownloadPreferences(
  input: unknown,
): Omit<DownloadPreferences, "directory"> {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("下载设置无效");
  const obj = input as Record<string, unknown>;
  if (
    Object.keys(obj).some(
      (key) => !["connection", "proxy", "autoImport"].includes(key),
    ) ||
    !["system", "direct", "manual"].includes(String(obj.connection)) ||
    typeof obj.proxy !== "string" ||
    obj.proxy.length > 512 ||
    typeof obj.autoImport !== "boolean"
  )
    throw new Error("下载设置无效");
  let proxy = obj.proxy.trim();
  if (proxy) {
    let url: URL;
    try {
      url = new URL(proxy);
    } catch {
      throw new Error("代理格式示例：http://127.0.0.1:7890");
    }
    if (
      !["http:", "https:", "socks5:"].includes(url.protocol) ||
      !url.hostname ||
      url.username ||
      url.password ||
      (url.pathname && url.pathname !== "/") ||
      url.search ||
      url.hash
    )
      throw new Error("代理仅支持 HTTP(S) / SOCKS5 地址，暂不支持带账号密码");
    proxy = url.origin === "null" ? `${url.protocol}//${url.host}` : url.origin;
  }
  if (obj.connection === "manual" && !proxy) throw new Error("请输入代理地址");
  return {
    connection: obj.connection as DownloadConnection,
    proxy,
    autoImport: obj.autoImport,
  };
}

export function downloadError(raw: string): string {
  if (/ENOSPC|not enough space|No space left/i.test(raw))
    return "磁盘空间不足，请清理空间后重试";
  if (/EACCES|EPERM|Permission denied|Access is denied/i.test(raw))
    return "无法写入保存目录，请检查权限或选择其他目录";
  if (/429|rate.?limit|Too Many Requests/i.test(raw))
    return "X 暂时限制了请求，请稍后重试";
  if (
    /login|log in|sign in|authenticate|protected|not authorized|age.restrict/i.test(
      raw,
    )
  )
    return "X 要求登录或授权，请连接 X 登录后重试；已连接时可重新登录";
  if (/No video|No formats|not contain any video/i.test(raw))
    return "未能获取视频信息，可能需要 X 登录、访问受限或解析暂不兼容；请连接 X 后重试";
  if (/404|not found|does not exist|unavailable|deleted/i.test(raw))
    return "帖子或视频已不可用，请检查链接是否仍可访问";
  if (
    /timed? ?out|timeout|ECONN|ENOTFOUND|Unable to download|proxy|403|Forbidden|network|fetch failed/i.test(
      raw,
    )
  )
    return "连接失败或访问受限，请检查网络、代理设置后重试";
  if (/Requested format|format.*not available/i.test(raw))
    return "所选画质已不可用，请重新解析链接并选择画质";
  return "下载未完成，请重试；若持续失败，可重新解析链接或检查网络设置";
}
