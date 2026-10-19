const { spawn } = require("node:child_process");
const { mkdir } = require("node:fs/promises");
const { join, resolve } = require("node:path");
const project = resolve(__dirname, "..");

function run(executable, args, env = process.env, windowsHide = true) {
  return new Promise((accept, reject) => {
    const child = spawn(executable, args, {
      cwd: project,
      env,
      stdio: "inherit",
      windowsHide,
      shell: false,
    });
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0 ? accept() : reject(new Error(`启动失败，退出代码 ${code}`)),
    );
  });
}
(async () => {
  const dataDir = join(project, ".cache", "local-test-profile");
  await mkdir(dataDir, { recursive: true });
  console.log(
    "正在准备本地测试版，不生成安装包。测试数据独立保存在 .cache/local-test-profile。",
  );
  await run(process.execPath, [
    join(project, "node_modules/electron-vite/bin/electron-vite.js"),
    "build",
  ]);
  const env = { ...process.env, VEXA_DATA_DIR: dataDir };
  delete env.ELECTRON_RUN_AS_NODE;
  await run(require("electron"), [project, `--user-data-dir=${dataDir}`], env, false);
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
