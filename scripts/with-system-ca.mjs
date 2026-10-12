import { spawn } from "node:child_process";

/**
 * Windows local dev needs Node's system certificate store.
 * `tsx watch` starts a child process. `--use-system-ca` on the parent
 * does not reach that child. `NODE_OPTIONS` does.
 * Render/Linux does not need this wrapper.
 */
const watch = process.argv.includes("--watch");
const prior = process.env.NODE_OPTIONS ?? "";
if (!/(^|\s)--use-system-ca(\s|$)/.test(prior)) {
  process.env.NODE_OPTIONS = `${prior} --use-system-ca`.trim();
}

const child = spawn(
  process.execPath,
  [
    "--use-system-ca",
    "-r",
    "./server/preload-ca.cjs",
    "./node_modules/tsx/dist/cli.mjs",
    ...(watch ? ["watch"] : []),
    "server/index.ts",
  ],
  { stdio: "inherit", env: process.env }
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
