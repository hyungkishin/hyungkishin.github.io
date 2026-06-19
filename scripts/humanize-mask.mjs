#!/usr/bin/env node
// 코드블록(fenced ```)을 placeholder 한 줄로 치환/복원해서 윤문가가 코드를 못 건드리게 한다.
// 사용:
//   node humanize-mask.mjs mask <index.md> <out.prose.md> <out.codemap.json>
//   node humanize-mask.mjs restore <in.prose.md> <codemap.json> <out.index.md>
import fs from "node:fs";

const [, , mode, a, b, c] = process.argv;

if (mode === "mask") {
  const text = fs.readFileSync(a, "utf8");
  const blocks = [];
  // ```...``` / ````...```` 멀티라인. 같은 길이 펜스로 닫힘.
  const masked = text.replace(
    /^([ \t]*)(`{3,})[^\n]*\n[\s\S]*?\n[ \t]*\2[ \t]*$/gm,
    (m) => {
      const id = blocks.length;
      blocks.push(m);
      return `[[CODEBLOCK_${id}]]`;
    }
  );
  fs.writeFileSync(b, masked);
  fs.writeFileSync(c, JSON.stringify(blocks));
  const placeholders = (masked.match(/\[\[CODEBLOCK_\d+\]\]/g) || []).length;
  console.error(`masked ${placeholders} code block(s) -> ${b}`);
} else if (mode === "restore") {
  const prose = fs.readFileSync(a, "utf8");
  const blocks = JSON.parse(fs.readFileSync(b, "utf8"));
  let used = 0;
  const restored = prose.replace(/\[\[CODEBLOCK_(\d+)\]\]/g, (_, i) => {
    used++;
    return blocks[Number(i)];
  });
  if (used !== blocks.length) {
    console.error(`ERROR: placeholder ${used} != codeblocks ${blocks.length}. 복원 중단.`);
    process.exit(1);
  }
  fs.writeFileSync(c, restored);
  console.error(`restored ${used} code block(s) -> ${c}`);
} else {
  console.error("usage: mask|restore");
  process.exit(2);
}
