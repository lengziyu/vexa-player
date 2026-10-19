import { describe, expect, it } from "vitest";
import {
  allowXLoginNavigation,
  allowXLoginResource,
  xLoginUserAgent,
  XLoginDiagnostics,
} from "../electron/x-login-policy";

describe("X login browser compatibility and diagnostics", () => {
  it("preserves the real Chromium version and platform without the app tokens", () => {
    const ua =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) vexa-player/0.2.2 Chrome/152.0.7977.167 Electron/44.9.0 Safari/537.36";
    expect(xLoginUserAgent(ua)).toBe(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.7977.167 Safari/537.36",
    );
    expect(xLoginUserAgent("Chrome/152.0.7977.167 Safari/537.36")).toBe(
      "Chrome/152.0.7977.167 Safari/537.36",
    );
  });
  it("permits official login scripts and challenge redirects without allowing arbitrary sites", () => {
    for (const url of [
      "https://accounts.google.com/gsi/client",
      "https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js",
      "https://client-api.arkoselabs.com/challenge",
      "https://newassets.hcaptcha.com/captcha",
      "https://abs.twimg.com/script.js",
    ]) {
      expect(allowXLoginResource(url)).toBe(true);
      expect(allowXLoginNavigation(url, false)).toBe(true);
      expect(allowXLoginNavigation(url, true)).toBe(false);
    }
    expect(allowXLoginNavigation("https://x.com/i/flow/login", true)).toBe(
      true,
    );
    expect(
      allowXLoginNavigation("https://www.twitter.com/i/flow/login", true),
    ).toBe(true);
    for (const url of [
      "https://x.com.evil.test/login",
      "https://evilx.com/login",
      "https://evil.test/",
      "https://accounts.google.com.evil.test/",
      "https://evil.test@x.com/login",
      "https://x.com:8443/login",
      "http://x.com/login",
      "file:///C:/Windows",
      "javascript:alert(1)",
      "data:text/html,test",
    ]) {
      expect(allowXLoginResource(url)).toBe(false);
      expect(allowXLoginNavigation(url, false)).toBe(false);
      expect(allowXLoginNavigation(url, true)).toBe(false);
    }
  });
  it("keeps diagnostic data bounded, deduplicated and free of URLs and credentials", () => {
    const diagnostics = new XLoginDiagnostics();
    const url =
      "https://api.x.com/secret-path?password=synthetic-password&token=synthetic-token";
    expect(diagnostics.record(url, "http", 403)).toBe(true);
    expect(diagnostics.record(url, "http", 403)).toBe(false);
    expect(diagnostics.record(url, "http", 200)).toBe(false);
    expect(diagnostics.record(url, "http", 403.5)).toBe(false);
    expect(diagnostics.record(url, "network", "net::ERR_TIMED_OUT")).toBe(true);
    expect(diagnostics.record(url, "network", "secret token or body")).toBe(
      false,
    );
    expect(diagnostics.record(url, "network", "net::ERR_ABORTED")).toBe(false);
    expect(
      diagnostics.record(
        "https://o30969.ingest.us.sentry.io/telemetry",
        "network",
        "net::ERR_BLOCKED_BY_CLIENT",
      ),
    ).toBe(false);
    const text = JSON.stringify(diagnostics.snapshot());
    for (const secret of [
      "https://",
      "secret-path",
      "password",
      "synthetic",
      "token=",
    ])
      expect(text).not.toContain(secret);
    expect(text).not.toContain("密码错误");
    for (let status = 400; status < 420; status++)
      diagnostics.record(url, "http", status);
    expect(diagnostics.snapshot()).toHaveLength(8);
    const copy = diagnostics.snapshot();
    copy[0]!.message = "changed";
    expect(diagnostics.snapshot()[0]!.message).not.toBe("changed");
    diagnostics.clear();
    expect(diagnostics.snapshot()).toEqual([]);
  });
});
