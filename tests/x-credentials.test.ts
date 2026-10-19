import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import {
  XCredentials,
  parseXCookieFile,
  validateXTokens,
} from "../electron/x-credentials";

const fixture = {
  authToken: "fake-auth-for-tests",
  csrf: "fake-csrf-for-tests",
  expires: null,
};
const cookieText = (domain = ".x.com", expiry = "0", csrf = true) =>
  `# Netscape HTTP Cookie File\n#HttpOnly_${domain}\tTRUE\t/\tTRUE\t${expiry}\tauth_token\t${fixture.authToken}\n${csrf ? `${domain}\tTRUE\t/\tTRUE\t${expiry}\tct0\t${fixture.csrf}\n` : ""}`;
let directory: string, store: XCredentials;
let options: ConstructorParameters<typeof XCredentials>[0];
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "vexa-x-credentials-"));
  const key = randomBytes(32);
  options = {
    dataDir: directory,
    encrypt: async (text) => {
      const iv = randomBytes(12),
        cipher = createCipheriv("aes-256-gcm", key, iv);
      const data = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), data]);
    },
    decrypt: async (data) => {
      const decipher = createDecipheriv(
        "aes-256-gcm",
        key,
        data.subarray(0, 12),
      );
      decipher.setAuthTag(data.subarray(12, 28));
      return Buffer.concat([
        decipher.update(data.subarray(28)),
        decipher.final(),
      ]).toString("utf8");
    },
  };
  store = new XCredentials(options);
  await store.init();
});
afterEach(async () => {
  if (directory.startsWith(join(tmpdir(), "vexa-x-credentials-")))
    await rm(directory, { recursive: true, force: true });
});
describe("authorized local X credentials", () => {
  it("accepts only the X login cookies from Netscape exports", () => {
    expect(parseXCookieFile(cookieText())).toEqual(fixture);
    expect(parseXCookieFile(cookieText(".twitter.com"))).toEqual(fixture);
    for (const text of [
      cookieText(".x.com.evil.test"),
      cookieText(".other.com"),
      cookieText(".x.com", "1"),
      cookieText(".x.com", "0", false),
      "plain text",
    ])
      expect(() => parseXCookieFile(text)).toThrow();
  });
  it("rejects cookie line injection and expired or malformed token data", () => {
    expect(() =>
      validateXTokens({ ...fixture, authToken: "token\nother-cookie" }),
    ).toThrow();
    expect(() =>
      validateXTokens({ ...fixture, csrf: "value\tother" }),
    ).toThrow();
    expect(() => validateXTokens({ ...fixture, expires: -1 })).toThrow();
    expect(() => parseXCookieFile("x".repeat(2 * 1024 * 1024 + 1))).toThrow();
  });
  it("persists through the encryption provider and restores without plaintext tokens on disk", async () => {
    await store.save(fixture);
    const saved = await readFile(join(directory, "x-auth", "session.bin"));
    expect(saved.includes(fixture.authToken)).toBe(false);
    expect(saved.includes(fixture.csrf)).toBe(false);
    const restored = new XCredentials(options);
    await restored.init();
    expect(restored.connected).toBe(true);
  });
  it("creates unique cookie files only for active commands and removes them after success or failure", async () => {
    await store.save(fixture);
    const paths: string[] = [];
    await Promise.all(
      [1, 2].map(() =>
        store.withCookies(async (file) => {
          paths.push(file!);
          const text = await readFile(file!, "utf8");
          expect(text).toContain(".x.com\tTRUE");
          expect(text).toContain(fixture.authToken);
        }),
      ),
    );
    expect(new Set(paths).size).toBe(2);
    await expect(
      store.withCookies(async () => {
        throw new Error("cancelled");
      }),
    ).rejects.toThrow("cancelled");
    expect(
      (await readdir(join(directory, "x-auth"))).filter((name) =>
        name.endsWith(".txt"),
      ),
    ).toHaveLength(0);
  });
  it("clears persistent authorization and stops passing cookies after disconnect", async () => {
    await store.save(fixture);
    await store.clear();
    expect(store.connected).toBe(false);
    expect(await readdir(join(directory, "x-auth"))).toEqual([]);
    await store.withCookies(async (file) => {
      expect(file).toBeNull();
    });
  });
  it("removes only stale credential files after a crash and ignores corrupt encrypted state", async () => {
    const root = join(directory, "x-auth");
    await mkdir(root, { recursive: true });
    await writeFile(
      join(root, "cookies-11111111-1111-1111-1111-111111111111.txt"),
      "stale",
    );
    await writeFile(join(root, "unrelated.txt"), "keep");
    await writeFile(join(root, "session.bin"), "corrupt");
    await store.init();
    expect(store.connected).toBe(false);
    expect(await readFile(join(root, "unrelated.txt"), "utf8")).toBe("keep");
    expect(
      (await readdir(root)).some((name) => name.startsWith("cookies-")),
    ).toBe(false);
  });
});
