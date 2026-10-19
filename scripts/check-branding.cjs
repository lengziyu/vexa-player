const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { join, resolve } = require("node:path");
const { Data, Resource, NtExecutable, NtExecutableResource } = require("resedit");
const pkg = require("../package.json");
const root = resolve(__dirname, "..");
async function checkBrandingAssets() {
  const ico = await readFile(join(root, pkg.build.win.icon));
  const frames = Data.IconFile.from(ico).icons;
  assert.ok([16, 24, 32, 48, 64, 128, 256].every(size => frames.some(f => f.data.width === size)), "Windows icons must include every required size");
  const icns = await readFile(join(root, pkg.build.mac.icon));
  assert.equal(icns.toString("ascii", 0, 4), "icns");
  assert.equal(icns.readUInt32BE(4), icns.length);
  const sizes = new Set();
  for (let at=8; at<icns.length;) {
    const length=icns.readUInt32BE(at+4);
    assert.ok(length >= 8 && at+length <= icns.length, "macOS icon frame must be complete");
    sizes.add(icns.toString("ascii",at,at+4));
    at+=length;
  }
  assert.ok(["icp4","icp5","ic08","ic09","ic10"].every(type=>sizes.has(type)), "macOS icons must cover 16px through 1024px");
  for (const [name,size] of [["icon.png",1024],["trayTemplate.png",16],["trayTemplate@2x.png",32]]) {
    const png=await readFile(join(root,"resources/branding",name));
    assert.equal(png.subarray(1,4).toString(),"PNG");
    assert.equal(png.readUInt32BE(16),size);
    assert.equal(png.readUInt32BE(20),size);
  }
  for(const [name,width,height] of [["installerSidebar.bmp",164,314],["installerHeader.bmp",150,57]]) {
    const bitmap=await readFile(join(root,"resources/branding",name));
    assert.equal(bitmap.toString("ascii",0,2),"BM");
    assert.equal(bitmap.readInt32LE(18),width);
    assert.equal(Math.abs(bitmap.readInt32LE(22)),height);
    assert.equal(bitmap.readUInt16LE(28),24,"Installer artwork must be 24-bit RGB");
  }
  return frames;
}
async function checkWindowsBranding(file) {
  const source=await checkBrandingAssets();
  const executable=NtExecutable.from(await readFile(file),{ignoreCert:true});
  const entries=NtExecutableResource.from(executable).entries;
  const icons=Resource.IconGroupEntry.fromEntries(entries).flatMap(group=>group.getIconItemsFromEntries(entries));
  assert.ok(source.every(frame=>icons.some(icon=>icon.isRaw() && Buffer.from(icon.bin).equals(Buffer.from(frame.data.bin)))), "Executable must embed all Vexa icon sizes, rather than Electron or NSIS icons");
  const versions=Resource.VersionInfo.fromEntries(entries);
  assert.ok(versions.some(version=>version.getAllLanguagesForStringValues().some(lang=>version.getStringValues(lang).ProductName === pkg.build.productName)), "Executable product name must be Vexa Player");
  return true;
}
module.exports={checkBrandingAssets,checkWindowsBranding};
if(require.main===module) (async()=>{
  await checkBrandingAssets();
  for(const file of process.argv.slice(2)) await checkWindowsBranding(resolve(file));
  console.log("PASS Vexa application, Windows installer and macOS icon assets" + (process.argv.length>2 ? "; executable names and embedded icons verified" : ""));
})().catch(error=>{console.error(error);process.exitCode=1;});
