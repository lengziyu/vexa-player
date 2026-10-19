import { randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";

export interface XTokens {
  authToken: string;
  csrf: string;
  expires: number | null;
}
export function validateXTokens(input: unknown): XTokens {
  const value = input as XTokens;
  if (
    !value ||
    ![value.authToken, value.csrf].every(
      (part) => typeof part === "string" && /^[\x21-\x7e]{1,4096}$/.test(part),
    ) ||
    (value.expires !== null &&
      (typeof value.expires !== "number" ||
        !Number.isFinite(value.expires) ||
        value.expires <= Date.now() / 1000))
  )
    throw new Error("X 登录信息无效或已过期，请重新登录或导出登录文件");
  return {
    authToken: value.authToken,
    csrf: value.csrf,
    expires: value.expires,
  };
}
export function parseXCookieFile(text: string): XTokens {
  if (Buffer.byteLength(text) > 2 * 1024 * 1024)
    throw new Error("登录文件过大，请只导出 X 站点的 Cookie");
  const found = new Map<string, { value: string; expires: number }>();
  for (let line of text.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    if (line.startsWith("#HttpOnly_")) line = line.slice(10);
    else if (line.startsWith("#")) continue;
    const fields = line.split("\t");
    if (
      fields.length !== 7 ||
      !["x.com", ".x.com", "twitter.com", ".twitter.com"].includes(
        fields[0]!,
      ) ||
      !["auth_token", "ct0"].includes(fields[5]!) ||
      !/^\d+$/.test(fields[4]!)
    )
      continue;
    const expires = Number(fields[4]);
    if (expires && expires <= Date.now() / 1000) continue;
    found.set(fields[5]!, { value: fields[6]!, expires });
  }
  const token = found.get("auth_token"),
    csrf = found.get("ct0");
  if (!token || !csrf)
    throw new Error(
      "未找到有效的 X 登录信息，请在已登录 X 的浏览器中导出 Netscape 格式 Cookie 文件",
    );
  return validateXTokens({
    authToken: token.value,
    csrf: csrf.value,
    expires: token.expires || null,
  });
}
interface Options {
  dataDir: string;
  encrypt(text: string): Promise<Buffer>;
  decrypt(bytes: Buffer): Promise<string>;
}
export class XCredentials {
  private tokens: XTokens | null = null;
  private writes = Promise.resolve();
  private get directory(): string {
    return join(this.options.dataDir, "x-auth");
  }
  constructor(private options: Options) {}
  get connected(): boolean {
    return (
      !!this.tokens &&
      (!this.tokens.expires || this.tokens.expires > Date.now() / 1000)
    );
  }
  async init(): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    for (const name of await readdir(this.directory))
      if (/^cookies-[0-9a-f-]{36}\.txt$/.test(name))
        await rm(join(this.directory, name), { force: true });
    try {
      this.tokens = validateXTokens(
        JSON.parse(
          await this.options.decrypt(
            await readFile(join(this.directory, "session.bin")),
          ),
        ),
      );
    } catch {
      this.tokens = null;
    }
  }
  save(input: XTokens): Promise<void> {
    const tokens = validateXTokens(input);
    this.writes = this.writes
      .catch(() => {})
      .then(async () => {
        const encrypted = await this.options.encrypt(JSON.stringify(tokens));
        const target = join(this.directory, "session.bin");
        await writeFile(`${target}.tmp`, encrypted, { mode: 0o600 });
        await rename(`${target}.tmp`, target);
        this.tokens = tokens;
      });
    return this.writes;
  }
  async clear(): Promise<void> {
    await this.writes.catch(() => {});
    this.tokens = null;
    await rm(join(this.directory, "session.bin"), { force: true });
    await rm(join(this.directory, "session.bin.tmp"), { force: true });
  }
  async flush(): Promise<void> {
    await this.writes.catch(() => {});
  }
  async withCookies<T>(
    callback: (file: string | null) => Promise<T>,
  ): Promise<T> {
    if (!this.connected || !this.tokens) return callback(null);
    const { authToken, csrf, expires } = validateXTokens(this.tokens);
    const file = join(this.directory, `cookies-${randomUUID()}.txt`);
    const lines = ["# Netscape HTTP Cookie File"];
    for (const domain of [".x.com", ".twitter.com"])
      for (const [name, value] of [
        ["auth_token", authToken],
        ["ct0", csrf],
      ])
        lines.push(
          `${domain}\tTRUE\t/\tTRUE\t${expires ? Math.floor(expires) : 0}\t${name}\t${value}`,
        );
    try {
      await writeFile(file, lines.join("\n") + "\n", {
        flag: "wx",
        mode: 0o600,
      });
      return await callback(file);
    } finally {
      await rm(file, { force: true });
    }
  }
}
