// Native tray and window lifecycle, with real video playback and an isolated profile.
const { _electron } = require("playwright");
const { mkdtemp, mkdir, writeFile, readFile, stat } = require("node:fs/promises");
const { spawnSync } = require("node:child_process");
const { join, resolve } = require("node:path");
const { tmpdir } = require("node:os");
const assert = require("node:assert/strict");
const project = resolve(__dirname, "..");
const output = join(project, "test-results/branding-tray");
const report = { checks: [], errors: [] };
let app, page;
function check(name, value) { assert.ok(value, name); report.checks.push(name); console.log("PASS",name); }
async function until(predicate, timeout=20000) {
  const end=Date.now()+timeout;
  while(Date.now()<end){if(await predicate())return;await new Promise(r=>setTimeout(r,100));}
  throw Error("Tray lifecycle state timed out");
}
async function main() {
  await mkdir(output,{recursive:true});
  const temporary=await mkdtemp(join(tmpdir(),"vexa-tray-smoke-"));
  const data=join(temporary,"new-profile");
  const bootstrap=join(temporary,"bootstrap.cjs"), stopped=join(temporary,"tray-destroyed.json");
  // Observe actual Electron tray objects before the production entry point loads.
  // No test hooks or extra IPC endpoints are included in the shipped application.
  await writeFile(bootstrap, `
const e=require('electron');
const fs=require('node:fs');
e.app.setAppPath(${JSON.stringify(project)});
const original=e.Tray.prototype.setContextMenu;
e.Tray.prototype.setContextMenu=function(menu){global.traySmoke={tray:this,menu};return original.call(this,menu)};
const destroy=e.Tray.prototype.destroy;
e.Tray.prototype.destroy=function(){fs.writeFileSync(${JSON.stringify(stopped)},JSON.stringify({destroyed:true}));return destroy.call(this)};
require(${JSON.stringify(join(project,"out/main/index.cjs"))});
`);
  app=await _electron.launch({args:[bootstrap,`--user-data-dir=${data}`],cwd:project,env:{...process.env,ELECTRON_RUN_AS_NODE:undefined,VEXA_DATA_DIR:data}});
  page=await app.firstWindow();page.setDefaultTimeout(20000);
  page.on("pageerror",error=>report.errors.push(error.message));
  await page.getByRole("heading",{name:"你的私人放映室."}).waitFor();
  await until(()=>app.evaluate(()=>!!global.traySmoke));
  check("application name is Vexa Player",await app.evaluate(({app})=>app.getName()==="Vexa Player"));
  check("branding preserves the existing data and session locations",await app.evaluate(({app},folder)=>app.getPath("userData")===folder&&app.getPath("sessionData")===folder,data));
  check("first launch creates a missing profile directory",(await stat(data)).isDirectory());
  check("native tray has restore and explicit exit actions",await app.evaluate(()=>!global.traySmoke.tray.isDestroyed()&&!!global.traySmoke.menu.getMenuItemById("show-window")&&!!global.traySmoke.menu.getMenuItemById("quit-app")));
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1440,1000));
  await page.getByRole("button",{name:"下载",exact:true}).click();
  await page.getByRole("textbox",{name:"X 帖子链接"}).fill("https://x.com/user/status/12345");
  for(const theme of ["dark","light"]){
    if(await page.locator("html").getAttribute("data-theme")!==theme) await page.getByRole("button",{name:theme==="light"?"切换浅色主题":"切换深色主题",exact:true}).click();
    await until(()=>page.locator("html").getAttribute("data-theme").then(value=>value===theme));
    for(const width of [1440,960]){
      await app.evaluate(({BrowserWindow},width)=>BrowserWindow.getAllWindows()[0].setContentSize(width,1000),width);
      await page.waitForTimeout(150);
      const input=await page.locator(".download-link").boundingBox(),button=await page.locator(".download-link-row > .button").boundingBox();
      check(`${theme} download input and parse button align at ${width}px`,Math.abs(input.y-button.y)<.5&&Math.abs(input.height-button.height)<.5);
    }
    await page.locator(".download-composer").screenshot({path:join(output,`download-alignment-${theme}.png`)});
  }
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1440,1000));
  const video=join(data,"tray-playback.mp4");
  const generated=spawnSync(require("ffmpeg-static"),["-nostdin","-v","error","-loop","1","-i",join(project,"ui-preview/assets/coast.jpg"),"-t","60","-vf","scale=960:540","-r","12","-an","-c:v","libx264","-preset","ultrafast","-crf","30","-pix_fmt","yuv420p","-threads","2","-y",video],{windowsHide:true,timeout:60000});
  assert.equal(generated.status,0,generated.stderr?.toString());
  await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]})},video);
  await page.getByRole("button",{name:"导入本地视频",exact:true}).click();
  await page.getByRole("button",{name:"选择视频",exact:true}).click();
  await until(()=>page.evaluate(async()=>{const q=await window.vexa.queryLibrary({limit:10});return q.total===1&&q.items[0].status==="ready"}));
  await page.getByRole("button",{name:/^视频库/}).click();
  const scan=page.getByRole("button",{name:"关闭扫描状态",exact:true});if(await scan.isVisible())await scan.click();
  await page.locator(".library-card").first().click();
  await page.getByRole("button",{name:"创建播放墙",exact:true}).click();
  await until(()=>page.locator(".video-tile video").evaluate(e=>e.currentTime>0&&!e.paused));
  await page.getByRole("button",{name:"切换深色主题",exact:true}).click();
  if(process.platform==="darwin") await app.evaluate(({BrowserWindow})=>{
    const window=BrowserWindow.getAllWindows()[0];
    global.traySmoke.fullscreenReady=false;
    window.once("enter-full-screen",()=>{global.traySmoke.fullscreenReady=true});
  });
  await page.getByRole("button",{name:"全屏播放墙",exact:true}).click();
  await until(()=>page.evaluate(()=>!!document.fullscreenElement));
  if(process.platform==="darwin") await until(()=>app.evaluate(()=>global.traySmoke.fullscreenReady));
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].close());
  await until(()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().length===1&&!BrowserWindow.getAllWindows()[0].isVisible()));
  await until(()=>page.locator(".video-tile video").evaluate(e=>e.paused));
  check("closing a fullscreen window pauses video and keeps the application alive",true);
  check("hidden window is immediately muted",await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.isAudioMuted()));
  check("download manager remains available while hidden",!!(await page.evaluate(()=>window.vexa.downloads.snapshot())).engine);
  await app.evaluate(()=>{const item=global.traySmoke.menu.getMenuItemById("show-window");item.click(item)});
  await until(()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isVisible()));
  await page.waitForTimeout(600);
  check("tray restore preserves video and waits for manual playback",await page.locator(".video-tile video").evaluate(e=>e.paused&&e.currentTime>0));
  check("restored window no longer has forced audio muting",await app.evaluate(({BrowserWindow})=>!BrowserWindow.getAllWindows()[0].webContents.isAudioMuted()));
  await page.locator(".video-tile").first().hover();
  await page.getByRole("button",{name:"播放此画面",exact:true}).click();
  await until(()=>page.locator(".video-tile video").evaluate(e=>!e.paused));
  check("manual playback works after restoring",true);
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].close());
  await until(()=>page.locator(".video-tile video").evaluate(e=>e.paused));
  await app.evaluate(()=>global.traySmoke.tray.emit("double-click"));
  await until(()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isVisible()));
  check("double-clicking the tray restores the same window",(await app.windows()).length===1);
  const exited=new Promise(resolve=>app.process().once("exit",resolve));
  await app.evaluate(()=>{const item=global.traySmoke.menu.getMenuItemById("quit-app");item.click(item)});
  let exitTimer;
  try { await Promise.race([exited,new Promise((_,reject)=>{exitTimer=setTimeout(()=>reject(Error("Tray exit timed out")),15000)})]); }
  finally { clearTimeout(exitTimer); }
  check("explicit tray exit ends the process and removes the tray icon",JSON.parse(await readFile(stopped,"utf8")).destroyed);
  app=null;
  check("no renderer errors",report.errors.length===0);
  report.success=true;
}
main().catch(async error=>{report.errors.push(error.message);console.error(error);process.exitCode=1;if(page&&!page.isClosed())await page.screenshot({path:join(output,"failure.png")}).catch(()=>{});}).finally(async()=>{await app?.close().catch(()=>{});await writeFile(join(output,"results.json"),JSON.stringify(report,null,2));});
