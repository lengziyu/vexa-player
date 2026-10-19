const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { createReadStream } = require("node:fs");
const {
  readFile,
  writeFile,
  stat,
  readdir,
  mkdir,
} = require("node:fs/promises");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const { getRawHeader, extractFile } = require("@electron/asar");
const pkg = require("../package.json");
const { checkWindowsBranding } = require("./check-branding.cjs");
const root = resolve(__dirname, "..");
const output = resolve(
  root,
  process.env.VEXA_PACKAGE_DIR || pkg.build.directories.output.replaceAll("${version}", pkg.version),
);
const app = join(output, "win-unpacked");
const installer = join(output, `Vexa-Player-${pkg.version}-Windows-x64.exe`);
const baseline = {
  version: "0.2.0",
  installerBytes: 167455935,
  installedBytes: 597444605,
  asarBytes: 47135291,
  locales: 55,
};
const checks = [];
function check(name, condition) {
  assert.ok(condition, name);
  checks.push(name);
  console.log(`PASS ${name}`);
}
async function hash(path) {
  const h = createHash("sha256");
  for await (const data of createReadStream(path)) h.update(data);
  return h.digest("hex");
}
async function directorySize(path) {
  let bytes = 0;
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const file = join(path, entry.name);
    bytes += entry.isDirectory()
      ? await directorySize(file)
      : (await stat(file)).size;
  }
  return bytes;
}
function archiveFiles(node, base = "", result = []) {
  for (const [name, entry] of Object.entries(node.files || {})) {
    const path = base ? `${base}/${name}` : name;
    if (entry.files) archiveFiles(entry, path, result);
    else result.push({ path, ...entry });
  }
  return result;
}
async function main() {
  const asar = join(app, "resources/app.asar"),
    files = archiveFiles(getRawHeader(asar).header),
    paths = new Set(files.map((f) => f.path));
  check(
    "SQL runtime loader and WebAssembly are retained",
    paths.has("node_modules/sql.js/dist/sql-wasm.js") &&
      paths.has("node_modules/sql.js/dist/sql-wasm.wasm"),
  );
  check(
    "unused SQL distributions and zip archives are excluded",
    files.filter((f) => f.path.startsWith("node_modules/sql.js/dist/"))
      .length === 2,
  );
  check(
    "renderer dependencies are bundled instead of duplicated",
    !files.some((f) => /^node_modules\/(vue|pinia|@vue|@babel)\//.test(f.path)),
  );
  check(
    "renderer and third-party licenses are retained",
    ["Vue-MIT.txt", "Pinia-MIT.txt", "GPL-3.0.txt"].every((name) =>
      paths.has(`docs/licenses/${name}`),
    ),
  );
  check(
    "optional downloader license notices are retained",
    ["yt-dlp-LICENSE", "yt-dlp-THIRD_PARTY_LICENSES.txt"].every((name) =>
      paths.has(`docs/licenses/${name}`),
    ),
  );
  check(
    "test data and saved account sessions are excluded",
    !files.some(({ path }) =>
      /(^|\/)(?:\.cache|test-results|download-engine|x-auth)(\/|$)|(^|\/)(?:session\.bin|cookies-[0-9a-f-]+\.txt)$/.test(
        path,
      ),
    ),
  );
  check(
    "optional downloader executable is not bundled",
    !files.some(({ path }) => /(^|\/)yt-dlp(?:\.exe|_macos)?$/.test(path)),
  );
  check(
    "packaged app version matches the release",
    JSON.parse(extractFile(asar, "package.json").toString()).version ===
      pkg.version,
  );
  check("runtime branding and tray icons are packaged", ["icon.png", "icon.ico", "trayTemplate.png", "trayTemplate@2x.png"].every(name=>paths.has(`resources/branding/${name}`)));
  await checkWindowsBranding(join(app, "Vexa Player.exe"));
  check("application executable embeds the Vexa product name and icons", true);
  await checkWindowsBranding(installer);
  check("installer executable embeds the Vexa product name and icons", true);
  const locales = (await readdir(join(app, "locales"))).sort();
  check(
    "only the supported Electron locales are shipped",
    JSON.stringify(locales) === JSON.stringify(["en-US.pak", "zh-CN.pak"]),
  );
  for (const name of [
    "LICENSE.electron.txt",
    "LICENSES.chromium.html",
    "ffmpeg.dll",
    "vk_swiftshader.dll",
    "vulkan-1.dll",
  ])
    assert.ok(
      (await stat(join(app, name))).size > 0,
      `Required runtime file missing: ${name}`,
    );
  check("runtime codec, rendering fallback and legal files are retained", true);
  const media = [];
  for (const relative of [
    "ffmpeg-static/ffmpeg.exe",
    "@ffprobe-installer/win32-x64/ffprobe.exe",
  ]) {
    const source = await hash(join(root, "node_modules", relative)),
      packaged = await hash(
        join(app, "resources/app.asar.unpacked/node_modules", relative),
      );
    assert.equal(source, packaged, `Media binary changed: ${relative}`);
    media.push({ path: relative, sha256: packaged });
  }
  check("FFmpeg and FFprobe match the previously used binaries", true);
  const data = await readFile(installer),
    magic = Buffer.from("377abcaf271c", "hex");
  let payload = null;
  for (
    let at = data.indexOf(magic);
    at >= 0;
    at = data.indexOf(magic, at + 1)
  ) {
    if (at + 32 > data.length) continue;
    const length =
      32n + data.readBigUInt64LE(at + 12) + data.readBigUInt64LE(at + 20);
    if (
      length > 1048576n &&
      length <= BigInt(data.length - at) &&
      (!payload || length > BigInt(payload.length))
    )
      payload = { at, length: Number(length) };
  }
  assert.ok(payload, "Unable to locate the embedded installer archive");
  const temp = join(root, ".cache/package-audit", pkg.version);
  await mkdir(temp, { recursive: true });
  const payloadPath = join(temp, "payload.7z");
  await writeFile(
    payloadPath,
    data.subarray(payload.at, payload.at + payload.length),
  );
  process.env.ELECTRON_BUILDER_CACHE ||= join(root, ".cache/electron-builder");
  const sevenZip =
    await require("app-builder-lib/out/toolsets/7zip").getPath7za();
  const test = spawnSync(sevenZip, ["t", "-bd", payloadPath], {
    windowsHide: true,
    timeout: 120000,
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });
  assert.equal(
    test.status,
    0,
    `Installer archive verification failed: ${test.stderr || test.stdout || test.error?.message}`,
  );
  check("embedded installer archive passes decompression and CRC checks", true);
  const current = {
    version: pkg.version,
    installerBytes: data.length,
    installerSha256: await hash(installer),
    installedBytes: await directorySize(app),
    asarBytes: (await stat(asar)).size,
    locales: locales.length,
  };
  const result = {
    success: true,
    checks,
    baseline,
    current,
    savedInstallerBytes: baseline.installerBytes - current.installerBytes,
    savedInstallerPercent:
      100 * (1 - current.installerBytes / baseline.installerBytes),
    media,
  };
  await mkdir(join(root, "test-results"), { recursive: true });
  await writeFile(
    join(root, "test-results/package-results.json"),
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result, null, 2));
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
