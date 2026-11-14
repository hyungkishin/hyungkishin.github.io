#!/usr/bin/env node
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { publicProseErrors, isPublicSource } from "./public-prose.mjs";

const mode = process.argv[2];
if (!["--all", "--staged"].includes(mode)) {
  console.error("Usage: node scripts/check-public-prose.mjs --all | --staged");
  process.exit(2);
}
function git(...args) {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
}
const root = git("rev-parse", "--show-toplevel").trimEnd();
process.chdir(root);
const staged = mode === "--staged";
const paths = staged
  ? git("diff", "--cached", "--name-only", "--diff-filter=ACMRT", "-z")
  : git("ls-files", "--cached", "--others", "--exclude-standard", "-z");
let count = 0;
let issues = 0;
for (const file of new Set(paths.split("\0").filter(isPublicSource))) {
  if (!staged && !fs.existsSync(file)) continue;
  try {
    const content = staged ? git("show", ":" + file) : fs.readFileSync(file, "utf8");
    count++;
    for (const issue of publicProseErrors(file, content)) {
      console.error(`${file}:${issue.line}: ${issue.type}: "${issue.phrase}"  ${issue.guidance}`);
      issues++;
    }
  } catch (error) {
    console.error(`${file}: ${error.message}`);
    issues++;
  }
}
console.log(`공개 원고 ${count}개 검사, 오류 ${issues}개`);
process.exitCode = issues ? 1 : 0;
