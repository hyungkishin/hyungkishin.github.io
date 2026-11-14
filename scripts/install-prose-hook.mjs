#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

function git(...args) {
  return spawnSync("git", args, { encoding: "utf8" });
}
const tree = git("rev-parse", "--show-toplevel");
if (tree.status !== 0) process.exit(0);
const packageRoot = fileURLToPath(new URL("../", import.meta.url));
if (fs.realpathSync(tree.stdout.trimEnd()) !== fs.realpathSync(packageRoot)) process.exit(0);
const existing = git("config", "--get", "core.hooksPath");
if (existing.status === 0) {
  if (path.resolve(existing.stdout.trimEnd()) === path.resolve(packageRoot, ".githooks")) process.exit(0);
  console.log("core.hooksPath 설정을 유지했습니다. 기존 pre-commit에서 .githooks/pre-commit을 호출하면 원고 검사가 실행됩니다.");
  process.exit(0);
}
const location = git("rev-parse", "--git-path", "hooks/pre-commit");
if (location.status !== 0) throw new Error(location.stderr);
const hook = path.resolve(location.stdout.trimEnd());
// Git shares hooks across worktrees. Only source checkouts containing the tracked hook should run it.
const shim = '#!/bin/sh\n# hyungkishin.blog staged prose\nif test -x .githooks/pre-commit; then exec .githooks/pre-commit; fi\n';
try {
  fs.mkdirSync(path.dirname(hook), { recursive: true });
  fs.writeFileSync(hook, shim, { flag: "wx", mode: 0o755 });
} catch (error) {
  if (error.code !== "EEXIST") throw error;
  if (!fs.lstatSync(hook).isFile() || fs.readFileSync(hook, "utf8") !== shim) console.log("기존 pre-commit 훅을 유지했습니다. .githooks/pre-commit을 기존 훅에서 호출해 주세요.");
}
