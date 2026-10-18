const { spawnSync } = require("node:child_process");
const { dirname, join, resolve } = require("node:path");

const project = resolve(__dirname, "..");
const builderRoot = dirname(require.resolve("electron-builder/package.json"));
const result = spawnSync(
  process.execPath,
  [join(builderRoot, "cli.js"), ...process.argv.slice(2)],
  {
    cwd: project,
    stdio: "inherit",
    windowsHide: true,
    env: {
      ...process.env,
      ELECTRON_BUILDER_CACHE:
        process.env.ELECTRON_BUILDER_CACHE ||
        join(project, ".cache", "electron-builder"),
      // Offline installers can use solid compression; BCJ2 improves native-code compression.
      ELECTRON_BUILDER_7Z_FILTER:
        process.env.ELECTRON_BUILDER_7Z_FILTER || "BCJ2",
    },
  },
);
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
