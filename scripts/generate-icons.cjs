// Reuse electron-builder's pinned SVG converter; no extra graphics dependency.
const { readFile, writeFile, mkdir } = require("node:fs/promises");
const { join, resolve } = require("node:path");
const { runIconsTool } = require("app-builder-lib/out/toolsets/icons");
const { spawnSync } = require("node:child_process");
const root = resolve(__dirname, "..");
const output = join(root, "resources/branding");
process.env.ELECTRON_BUILDER_CACHE ||= join(root, ".cache/electron-builder");
function frames(data) {
  const result = new Map();
  if (data.toString("ascii", 0, 4) !== "icns") throw Error("Invalid ICNS output");
  for (let at = 8; at < data.length;) {
    const type = data.toString("ascii", at, at + 4), length = data.readUInt32BE(at + 4);
    if (length < 8 || at + length > data.length) throw Error("Invalid ICNS frame");
    result.set(type, data.subarray(at + 8, at + length));
    at += length;
  }
  return result;
}
async function main() {
  // Cached helper .js files are CommonJS, even when this project is an ES module.
  await mkdir(process.env.ELECTRON_BUILDER_CACHE, { recursive: true });
  await writeFile(join(process.env.ELECTRON_BUILDER_CACHE, "package.json"), '{"private":true,"type":"commonjs"}\n');
  await runIconsTool({ inputFile: join(output, "icon.svg"), outputFormat: "ico", outDir: output });
  await runIconsTool({ inputFile: join(output, "icon.svg"), outputFormat: "icns", outDir: output });
  const appFrames = frames(await readFile(join(output, "icon.icns")));
  await writeFile(join(output, "icon.png"), appFrames.get("ic10"));
  const temp = join(root, ".cache/brand-icons/template");
  await mkdir(temp, { recursive: true });
  await runIconsTool({ inputFile: join(output, "trayTemplate.svg"), outputFormat: "icns", outDir: temp });
  const templateFrames = frames(await readFile(join(temp, "icon.icns")));
  await writeFile(join(output, "trayTemplate.png"), templateFrames.get("icp4"));
  await writeFile(join(output, "trayTemplate@2x.png"), templateFrames.get("icp5"));
  // Assisted NSIS installers use bitmap artwork separately from the EXE icon.
  for (const [name, size, background, filter] of [
    ["installerSidebar.bmp", "164x314", "0x17131f", "[1:v]scale=132:132[mark];[0:v][mark]overlay=16:32:format=rgb,drawbox=x=28:y=211:w=108:h=3:color=0xb8a0ed:t=fill,drawbox=x=28:y=227:w=76:h=2:color=0x66527f:t=fill,drawbox=x=28:y=239:w=94:h=2:color=0x66527f:t=fill"],
    ["installerHeader.bmp", "150x57", "white", "[1:v]scale=48:48[mark];[0:v][mark]overlay=96:4:format=rgb"],
  ]) {
    const result=spawnSync(require("ffmpeg-static"),["-nostdin","-v","error","-f","lavfi","-i",`color=c=${background}:s=${size},format=rgba`,"-i",join(output,"icon.png"),"-filter_complex",filter,"-frames:v","1","-pix_fmt","bgr24","-y",join(output,name)],{windowsHide:true,timeout:30000});
    if(result.status!==0)throw Error(result.stderr?.toString()||"Installer artwork export failed");
  }
  console.log("Generated Vexa ICO, ICNS, 1024px PNG and macOS template tray icons.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
