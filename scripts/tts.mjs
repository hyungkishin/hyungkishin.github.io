#!/usr/bin/env node
// 발행 글을 낭독용 텍스트로 바꿔 Google Cloud TTS로 합성한다. 결과는 static/tts/<slug>.mp3.
// 사용: node scripts/tts.mjs contents/posts/<경로>/index.md [...]
//       node scripts/tts.mjs --all          변경된 글만 다시 만든다
//       node scripts/tts.mjs --dry <파일>   합성 없이 낭독 텍스트만 출력한다
// 키는 GOOGLE_TTS_API_KEY 또는 gcloud 토큰. 어느 쪽도 클라이언트 번들에 들어가지 않는다.
// TTS_MAX_CHARS 기본값이 0이라 명시하지 않으면 합성이 일어나지 않는다.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "static", "tts");
const MANIFEST = path.join(ROOT, "src", "data", "ttsManifest.json");
const POSTS_DIR = path.join(ROOT, "contents", "posts");

const API_KEY = process.env.GOOGLE_TTS_API_KEY || "";
const VOICE = process.env.TTS_VOICE || "ko-KR-Chirp3-HD-Achernar";
const RATE = Number(process.env.TTS_RATE || 1);
const BITRATE = process.env.TTS_BITRATE || "48k";
// TTS_ENGINE=say 는 macOS 음성으로 미리 듣기용 파일을 만든다. 발행용은 google 이다.
const ENGINE = process.env.TTS_ENGINE || "google";
// 키 대신 gcloud 토큰을 쓸 때 청구 대상이 되는 프로젝트.
const PROJECT = process.env.GOOGLE_CLOUD_PROJECT || "";
// 안전 기본값은 0이다. 실수로 돌려도 Google을 부르지 않는다.
// 실제로 만들 때만 TTS_MAX_CHARS를 명시해서 연다. 전체 64편이 약 25만 자다.
const MAX_CHARS = Number(process.env.TTS_MAX_CHARS || 0);

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const all = args.includes("--all");
const targets = args.filter(a => !a.startsWith("--"));

// ── 낭독용 텍스트 ──────────────────────────────────────────────

// 백틱 안의 식별자는 읽히는 모양으로 편다. next/image 는 "next image" 로 나간다.
const softenIdentifier = s =>
  s
    .replace(/@/g, "")
    .replace(/::/g, " ")
    .replace(/[-_/\\]/g, " ")
    .replace(/:/g, ", ")
    .replace(/\s+/g, " ")
    .trim();

// 소리로 나오지 않는 기호는 말로 바꾸거나 지운다. 남기면 문장이 끊긴 채로 읽힌다.
const speakSymbols = s =>
  s
    .replace(/\s*→\s*/g, "에서 ")
    .replace(/\s*←\s*/g, "로부터 ")
    .replace(/\s*↔\s*/g, "와 ")
    .replace(/\s*·\s*/g, ", ")
    .replace(/…/g, "")
    .replace(/(^|[\s(])@(?=[A-Za-z])/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s*≈\s*/g, " 약 ")
    .replace(/\s*≥\s*/g, " 이상 ")
    .replace(/\s*≤\s*/g, " 이하 ");

// 숫자에 붙은 단위는 한국어로 편다. 순서가 중요하다. KB와 MB를 B보다 먼저 본다.
const expandUnits = s =>
  speakSymbols(s)
    .replace(/(\d)\s?KB\b/g, "$1킬로바이트")
    .replace(/(\d)\s?MB\b/g, "$1메가바이트")
    .replace(/(\d)\s?B\b/g, "$1바이트")
    .replace(/(\d)\s?ms\b/g, "$1밀리초")
    .replace(/(\d)\s?px\b/g, "$1픽셀")
    .replace(/(\d)%/g, "$1퍼센트")
    .replace(/(\d)\s?×\s?(\d)/g, "$1 곱하기 $2")
    .replace(/(\d):(\d)/g, "$1 대 $2")
    .replace(/(\d)\s?~\s?(\d)/g, "$1에서 $2");

const cleanInline = s =>
  expandUnits(
    s
      .replace(/`([^`]+)`/g, (_, code) => softenIdentifier(code))
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/[ \t]+/g, " ")
  ).trim();

// 블록마다 뒤에 넣을 무음 길이(초)를 함께 돌려준다. 절 제목 앞이 가장 길다.
const toSpokenBlocks = markdown => {
  const fm = markdown.match(/^---\n([\s\S]*?)\n---/);
  const head = fm ? fm[1] : "";
  // 본문에 박아 둔 style과 script는 통째로 뺀다. 남기면 CSS가 그대로 낭독된다.
  const body = (fm ? markdown.slice(fm[0].length) : markdown)
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "");
  const title = (head.match(/^title:\s*"?(.*?)"?\s*$/m) || [])[1] || "";

  const blocks = [];
  if (title) blocks.push({ text: cleanInline(title), pause: 1.0 });

  let inFence = false;
  let para = [];

  const flush = () => {
    if (!para.length) return;
    const text = cleanInline(para.join(" "));
    if (text) blocks.push({ text, pause: 0.45 });
    para = [];
  };

  for (const raw of body.split("\n")) {
    const line = raw.trimEnd();

    if (/^[ \t]*```/.test(line)) {
      flush();
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    if (!line.trim()) {
      flush();
      continue;
    }
    if (/^[ \t]*\|/.test(line)) continue; // 표는 건너뛴다
    if (/^[ \t]*!\[/.test(line)) continue; // 그림도 건너뛴다

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flush();
      const text = cleanInline(heading[2]);
      if (text) blocks.push({ text: `${text}.`, pause: 0.7, heading: true });
      continue;
    }

    if (/^[ \t]*>/.test(line)) {
      flush();
      const text = cleanInline(line.replace(/^[ \t]*>\s?/, "")).replace(
        /^([^:]{1,12}):\s*/,
        "$1. "
      );
      if (text) blocks.push({ text, pause: 0.6 });
      continue;
    }

    if (/^[ \t]*[-*]\s+/.test(line)) {
      flush();
      const text = cleanInline(line.replace(/^[ \t]*[-*]\s+/, ""));
      if (text) blocks.push({ text, pause: 0.35 });
      continue;
    }

    para.push(line.trim());
  }
  flush();

  // TL;DR 라벨은 그대로 읽으면 어색하다.
  return blocks.map(b =>
    /^TL;?DR\.?$/i.test(b.text) ? { ...b, text: "요약." } : b
  );
};

// 한 요청 4500바이트를 넘지 않게 문장 단위로 자른다.
const splitForApi = text => {
  const LIMIT = 4500;
  if (Buffer.byteLength(text, "utf8") <= LIMIT) return [text];
  const parts = text.split(/(?<=[.?!])\s+/);
  const out = [];
  let cur = "";
  for (const p of parts) {
    const next = cur ? `${cur} ${p}` : p;
    if (Buffer.byteLength(next, "utf8") > LIMIT && cur) {
      out.push(cur);
      cur = p;
    } else {
      cur = next;
    }
  }
  if (cur) out.push(cur);
  return out;
};

// ── Google Cloud TTS ──────────────────────────────────────────

// 키가 없으면 gcloud 액세스 토큰으로 부른다. 로컬 생성 전용이라 키를 만들 이유가 없다.
let cachedToken = null;
const bearer = () => {
  if (!cachedToken) {
    const r = spawnSync("gcloud", ["auth", "print-access-token"], { encoding: "utf8" });
    if (r.status !== 0) throw new Error(`gcloud 토큰 실패: ${r.stderr}`);
    cachedToken = r.stdout.trim();
  }
  return { Authorization: `Bearer ${cachedToken}`, "x-goog-user-project": PROJECT };
};

const api = (endpoint, init = {}) => {
  const base = `https://texttospeech.googleapis.com/v1/${endpoint}`;
  if (API_KEY) {
    return fetch(`${base}${base.includes("?") ? "&" : "?"}key=${API_KEY}`, init);
  }
  return fetch(base, { ...init, headers: { ...(init.headers || {}), ...bearer() } });
};

const listVoices = async () => {
  const res = await api("voices?languageCode=ko-KR");
  if (!res.ok) throw new Error(`voices.list ${res.status}: ${await res.text()}`);
  return (await res.json()).voices || [];
};

// 키 없이 끊김과 호흡만 확인할 때 쓴다. macOS 전용이고 발행용이 아니다.
const synthesizeLocal = text => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "say-"));
  const aiff = path.join(tmp, "a.aiff");
  const mp3 = path.join(tmp, "a.mp3");
  try {
    run("say", ["-v", process.env.TTS_SAY_VOICE || "Yuna", "-r", String(Math.round(180 * RATE)), "-o", aiff, text]);
    run("ffmpeg", ["-y", "-i", aiff, "-c:a", "libmp3lame", "-b:a", BITRATE, "-ar", "24000", "-ac", "1", mp3]);
    return fs.readFileSync(mp3);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
};

const synthesize = async text => {
  if (ENGINE === "say") return synthesizeLocal(text);
  // Chirp3-HD는 SSML과 pitch를 받지 않는다. 평문과 speakingRate만 보낸다.
  const res = await api("text:synthesize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      input: { text },
      voice: { languageCode: "ko-KR", name: VOICE },
      audioConfig: {
        audioEncoding: "MP3",
        sampleRateHertz: 24000,
        speakingRate: RATE,
      },
    }),
  });
  if (!res.ok) throw new Error(`synthesize ${res.status}: ${await res.text()}`);
  return Buffer.from((await res.json()).audioContent, "base64");
};

// ── ffmpeg ────────────────────────────────────────────────────

const run = (cmd, cmdArgs) => {
  const r = spawnSync(cmd, cmdArgs, { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`${cmd} 실패: ${r.stderr || r.stdout}`);
};

const makeSilence = (file, seconds) =>
  run("ffmpeg", [
    "-y", "-f", "lavfi",
    "-i", "anullsrc=r=24000:cl=mono",
    "-t", String(seconds),
    "-c:a", "libmp3lame", "-b:a", BITRATE,
    file,
  ]);

// 무음을 사이에 끼워 한 파일로 만든다. 전부 다시 인코딩해서 파라미터를 맞춘다.
const concat = (files, out) => {
  const listFile = path.join(path.dirname(out), ".concat.txt");
  fs.writeFileSync(listFile, files.map(f => `file '${f}'`).join("\n"));
  run("ffmpeg", [
    "-y", "-f", "concat", "-safe", "0",
    "-i", listFile,
    "-c:a", "libmp3lame", "-b:a", BITRATE, "-ar", "24000", "-ac", "1",
    out,
  ]);
  fs.unlinkSync(listFile);
};

// ── 대상 수집 ──────────────────────────────────────────────────

// createFilePath와 같은 규칙. index.md는 디렉토리까지, 그 외는 파일명까지가 경로다.
const slugOf = file => {
  const abs = path.resolve(file);
  const base = path.basename(abs, ".md");
  const parts = path.relative(POSTS_DIR, path.dirname(abs)).split(path.sep);
  if (base !== "index") parts.push(base);
  return parts.join("-");
};

const collectAll = () => {
  const out = [];
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/^[^.].*\.md$/.test(entry.name)) out.push(full);
    }
  };
  walk(POSTS_DIR);
  return out;
};

// ── 본 작업 ────────────────────────────────────────────────────

const files = all ? collectAll() : targets;

if (!files.length) {
  console.error("대상이 없다. 파일 경로를 주거나 --all 을 쓴다.");
  process.exit(2);
}

if (dry) {
  for (const file of files) {
    const blocks = toSpokenBlocks(fs.readFileSync(file, "utf8"));
    const chars = blocks.reduce((n, b) => n + b.text.length, 0);
    console.log(`\n=== ${file} (${blocks.length}블록 ${chars}자) ===`);
    for (const b of blocks) console.log(`[${b.pause}s] ${b.text}`);
  }
  process.exit(0);
}

if (ENGINE === "google" && !API_KEY && !PROJECT) {
  console.error("GOOGLE_TTS_API_KEY 또는 GOOGLE_CLOUD_PROJECT 가 필요하다.");
  console.error("--dry 로 텍스트만 보거나 TTS_ENGINE=say 로 미리 들을 수 있다.");
  process.exit(2);
}

const voices = ENGINE === "google" ? await listVoices() : [{ name: VOICE }];
if (!voices.some(v => v.name === VOICE)) {
  const names = voices.map(v => v.name);
  const chirp = names.filter(n => n.includes("Chirp"));
  console.error(`TTS_VOICE=${VOICE} 는 ko-KR 목록에 없다.`);
  console.error(`Chirp 계열 ${chirp.length}개: ${chirp.join(", ") || "없음"}`);
  console.error(`전체 ${names.length}개: ${names.join(", ")}`);
  process.exit(2);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const manifest = fs.existsSync(MANIFEST)
  ? JSON.parse(fs.readFileSync(MANIFEST, "utf8"))
  : {};

// 보내기 전에 이번 실행의 총량을 세고 상한을 넘으면 멈춘다. 청구는 문자 수를 따른다.
const planned = files.reduce((sum, file) => {
  const blocks = toSpokenBlocks(fs.readFileSync(file, "utf8"));
  const slug = slugOf(file);
  if (manifest[slug] && fs.existsSync(path.join(OUT_DIR, `${slug}.mp3`))) {
    const same = crypto
      .createHash("sha256")
      .update(blocks.map(b => `${b.pause}|${b.text}`).join("\n"))
      .update(`${VOICE}|${RATE}|${BITRATE}`)
      .digest("hex")
      .slice(0, 16);
    if (manifest[slug].hash === same) return sum;
  }
  return sum + blocks.reduce((n, b) => n + b.text.length, 0);
}, 0);

const already = Object.values(manifest).reduce((n, e) => n + (e.chars || 0), 0);
console.log(`이번 실행 ${planned.toLocaleString()}자, 지금까지 만든 총량 ${already.toLocaleString()}자`);

if (ENGINE === "google" && planned > MAX_CHARS) {
  console.error(`상한 ${MAX_CHARS.toLocaleString()}자를 넘어 멈춘다. 만들려면 TTS_MAX_CHARS=${planned} 처럼 명시한다.`);
  process.exit(2);
}
if (planned === 0) {
  console.log("바뀐 글이 없다.");
  process.exit(0);
}

for (const file of files) {
  const markdown = fs.readFileSync(file, "utf8");
  const blocks = toSpokenBlocks(markdown);
  if (!blocks.length) continue;

  const slug = slugOf(file);
  const out = path.join(OUT_DIR, `${slug}.mp3`);
  const hash = crypto
    .createHash("sha256")
    .update(blocks.map(b => `${b.pause}|${b.text}`).join("\n"))
    .update(`${VOICE}|${RATE}|${BITRATE}`)
    .digest("hex")
    .slice(0, 16);

  if (manifest[slug]?.hash === hash && fs.existsSync(out)) {
    console.log(`건너뜀 ${slug} (변경 없음)`);
    continue;
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tts-"));
  const parts = [];
  let index = 0;
  let chars = 0;

  try {
    for (const block of blocks) {
      for (const chunk of splitForApi(block.text)) {
        const partFile = path.join(tmp, `p${String(index++).padStart(4, "0")}.mp3`);
        fs.writeFileSync(partFile, await synthesize(chunk));
        parts.push(partFile);
        chars += chunk.length;
      }
      const silenceFile = path.join(tmp, `s${String(index++).padStart(4, "0")}.mp3`);
      makeSilence(silenceFile, block.pause);
      parts.push(silenceFile);
    }
    concat(parts, out);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  const bytes = fs.statSync(out).size;
  manifest[slug] = { hash, voice: VOICE, chars, bytes };
  fs.mkdirSync(path.dirname(MANIFEST), { recursive: true });
  fs.writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`생성 ${slug}.mp3 (${chars}자, ${(bytes / 1024 / 1024).toFixed(1)}MB)`);
}
