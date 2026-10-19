const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { createReadStream } = require("node:fs");
const { mkdir, mkdtemp, readdir, lstat, stat, writeFile, rm } = require("node:fs/promises");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const { getRawHeader, extractFile } = require("@electron/asar");
const pkg = require("../package.json");
const root = resolve(__dirname, "..");
const output = resolve(root, pkg.build.directories.output.replaceAll("${version}", pkg.version));
const checks = [];
const result = { success: false, platform: process.platform, arch: process.arch, checks };

function check(name, value) {
  assert.ok(value, name);
  checks.push(name);
  console.log(`PASS ${name}`);
}
function run(command, args) {
  const child = spawnSync(command, args, { encoding: "utf8", timeout: 120000, maxBuffer: 4 * 1024 * 1024 });
  assert.equal(child.status, 0, `${command}: ${child.stderr || child.stdout || child.error?.message}`);
  return child.stdout.trim();
}
async function hash(file) {
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(file)) digest.update(chunk);
  return digest.digest("hex");
}
function archiveFiles(node, prefix = "", files = []) {
  for (const [name, entry] of Object.entries(node.files || {})) {
    const path = prefix ? `${prefix}/${name}` : name;
    if (entry.files) archiveFiles(entry, path, files);
    else files.push(path);
  }
  return files;
}
async function directorySize(path) {
  let bytes = 0;
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const file = join(path, entry.name);
    bytes += entry.isDirectory() ? await directorySize(file) : (await lstat(file)).size;
  }
  return bytes;
}

async function main() {
  assert.equal(process.platform, "darwin", "Run this audit on macOS using the target architecture");
  const arch = process.arch;
  const name = `${pkg.build.productName}.app`;
  const builtApp = join(output, arch === "x64" ? "mac" : `mac-${arch}`, name);
  const installer = join(output, `Vexa-Player-${pkg.version}-macOS-${arch}.dmg`);
  run("hdiutil", ["verify", installer]);
  check("DMG checksum verification succeeds", true);
  const auditRoot = join(root, ".cache", "mac-package-audit");
  await mkdir(auditRoot, { recursive: true });
  const directory = await mkdtemp(join(auditRoot, `${pkg.version}-${arch}-`));
  const mount = join(directory, "volume");
  await mkdir(mount);
  let attached = false;
  const app = join(directory, name);
  try {
    run("hdiutil", ["attach", "-readonly", "-nobrowse", "-mountpoint", mount, installer]);
    attached = true;
    check("DMG contains the app and Applications shortcut", (await stat(join(mount, name))).isDirectory() && (await lstat(join(mount, "Applications"))).isSymbolicLink());
    run("ditto", [join(mount, name), app]);
  } finally {
    if (attached) run("hdiutil", ["detach", mount]);
    await rm(mount, { recursive: true, force: true });
  }
  run("codesign", ["--verify", "--deep", "--strict", app]);
  check("app copied from the DMG passes strict nested code-signature verification", true);
  const contents = join(app, "Contents");
  const resources = join(contents, "Resources");
  const asar = join(resources, "app.asar");
  check("Electron and Chromium license files are retained", (await stat(join(resources, "LICENSE.electron.txt"))).size > 0 && (await stat(join(resources, "LICENSES.chromium.html"))).size > 0);
  check("DMG application archive matches the build output", await hash(asar) === await hash(join(builtApp, "Contents/Resources/app.asar")));
  const paths = archiveFiles(getRawHeader(asar).header);
  check("SQL runtime and WebAssembly are retained without unused distributions", paths.filter(path => path.startsWith("node_modules/sql.js/dist/")).sort().join("\n") === ["node_modules/sql.js/dist/sql-wasm.js", "node_modules/sql.js/dist/sql-wasm.wasm"].join("\n"));
  check("renderer dependencies are bundled without duplicate copies", !paths.some(path => /^node_modules\/(vue|pinia|@vue|@babel)\//.test(path)));
  check("third-party and optional downloader licenses are retained", ["Vue-MIT.txt", "Pinia-MIT.txt", "GPL-3.0.txt", "yt-dlp-LICENSE", "yt-dlp-THIRD_PARTY_LICENSES.txt"].every(name => paths.includes(`docs/licenses/${name}`)));
  check("test data, account sessions and optional downloader binaries are excluded", !paths.some(path => /(^|\/)(?:\.cache|test-results|download-engine|x-auth)(\/|$)|(^|\/)(?:session\.bin|cookies-[0-9a-f-]+\.txt|yt-dlp(?:\.exe|_macos)?)$/.test(path)));
  const plist = join(contents, "Info.plist");
  check("archive and macOS bundle versions match the release", JSON.parse(extractFile(asar, "package.json").toString()).version === pkg.version && run("/usr/libexec/PlistBuddy", ["-c", "Print :CFBundleShortVersionString", plist]) === pkg.version);
  check("macOS bundle identifier is correct", run("/usr/libexec/PlistBuddy", ["-c", "Print :CFBundleIdentifier", plist]) === pkg.build.appId);
  const framework = join(contents, "Frameworks/Electron Framework.framework/Versions/A");
  const locales = (await readdir(join(framework, "Resources"))).filter(name => name.endsWith(".lproj")).sort();
  check("English and Simplified Chinese Electron locales are retained", JSON.stringify(locales) === JSON.stringify(["en.lproj", "zh_CN.lproj"]));
  const executable = join(contents, "MacOS", run("/usr/libexec/PlistBuddy", ["-c", "Print :CFBundleExecutable", plist]));
  check("application and codec library match the target architecture", [executable, join(framework, "Libraries/libffmpeg.dylib")].every(file => run("lipo", ["-archs", file]).split(/\s+/).includes(arch === "x64" ? "x86_64" : arch)));
  const media = [];
  for (const relative of ["ffmpeg-static/ffmpeg", `@ffprobe-installer/darwin-${arch}/ffprobe`]) {
    const file = join(resources, "app.asar.unpacked/node_modules", relative);
    const built = join(builtApp, "Contents/Resources/app.asar.unpacked/node_modules", relative);
    check(`${relative} architecture and execution`, run("lipo", ["-archs", file]).split(/\s+/).includes(arch === "x64" ? "x86_64" : arch) && run(file, ["-version"]).includes("version"));
    const sha256 = await hash(file);
    check(`${relative} matches the signed build output`, sha256 === await hash(built));
    media.push({ path: relative, sha256, originalDependencySha256: await hash(join(root, "node_modules", relative)) });
  }
  Object.assign(result, {
    success: true, version: pkg.version, date: new Date().toISOString(),
    installer, installerBytes: (await stat(installer)).size, installerSha256: await hash(installer),
    installedApp: app, installedExecutable: executable, installedBytes: await directorySize(app),
    asarBytes: (await stat(asar)).size, locales, media,
    minimumSystemVersion: run("/usr/libexec/PlistBuddy", ["-c", "Print :LSMinimumSystemVersion", plist]),
    signing: spawnSync("codesign", ["-dv", app], { encoding: "utf8" }).stderr.trim(),
  });
  console.log(`Installed test executable: ${executable}`);
}
main().catch(error => {
  result.error = error.stack;
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await mkdir(join(root, "test-results"), { recursive: true });
  await writeFile(join(root, "test-results/package-mac-results.json"), JSON.stringify(result, null, 2));
});
