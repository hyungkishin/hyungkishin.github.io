import { parse as parseJs, parseExpression } from "@babel/parser";
import entities from "entities";
import parse5 from "parse5";
import fromParse5 from "hast-util-from-parse5";
import raw from "hast-util-raw";
import toHast from "mdast-util-to-hast";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import unified from "unified";
import vfile from "vfile";
import yaml from "js-yaml";
import { visibleErrors, punctuationErrors } from "./prose-rules.mjs";

const markdown = unified().use(remarkParse).use(remarkGfm);
const visibleAttrs = new Set(["title", "alt", "aria-label", "aria-description", "ariaLabel", "ariaDescription", "placeholder", "label"]);
const copyName = /(?:title|label|name|summary|description|caption|tagline|message|subtitle|heading|intro|body|text|notice|hint|kicker|badge|copy|detail|status|markup|html|textContent|tags)$/i;
const fragments = /^(?:\s*<!doctype|\s*<[a-zA-Z][\w-]*(?:\s|>))/i;
const inlineTags = new Set(["a", "abbr", "b", "bdi", "bdo", "cite", "del", "em", "i", "ins", "mark", "s", "small", "span", "strong", "sub", "sup", "time", "tspan", "u"]);
const disguisedPunctuation = /^(?:·|§(?:\s*\d+(?:\.\d+)*)?)$/;
const omitted = new Set(["code", "pre", "kbd", "samp", "style"]);

export function publicProseErrors(file, source) {
  const errors = [];
  function inspect(text, line) {
    if (typeof text === "string" && text.trim()) errors.push(...visibleErrors(text, line));
  }
  function html(text, line = 1) {
    const tree = fromParse5(parse5.parseFragment(text, { sourceCodeLocationInfo: true }), vfile(text));
    walkHtml(tree, line - 1);
  }
  function walkHtml(tree, offset) {
    let parts = [];
    function flush() {
      if (!parts.length) return;
      const text = parts.map(part => part.text).join("");
      const lineAt = index => {
        for (const part of parts) {
          if (index < part.text.length) return part.line + part.text.slice(0, index).split("\n").length - 1;
          index -= part.text.length;
        }
        return parts[parts.length - 1].line;
      };
      if (text.trim()) errors.push(...visibleErrors(text, 1, lineAt));
      parts = [];
    }
    function visit(node) {
      const line = offset + (node.position?.start?.line || 1);
      if (node.type === "text") { parts.push({ text: node.value, line }); return; }
      if (node.type === "comment") return;
      const block = !inlineTags.has(node.tagName);
      if (block) flush();
      const props = node.properties || {};
      if (node.tagName === "pre") {
        const code = node.children?.[0];
        if (code?.properties?.className?.includes("language-mermaid")) {
          const rows = code.children.map(child => child.value).join("").split("\n");
          rows.forEach((row, i) => {
            if (!/^\s*(?:%%|classDef |style |linkStyle |click )/.test(row)) inspect(entities.decodeHTML(row), line + i + 1);
          });
        }
        return;
      }
      if (node.tagName === "code" && !props.hidden) {
        const text = plainText(node);
        if (disguisedPunctuation.test(text.trim())) inspect(text, line);
      }
      if (omitted.has(node.tagName) || props.hidden) return;
      if (node.tagName === "script") {
        const data = node.children[0];
        if (!data || props.src || !data.value.trim()) return;
        const base = offset + (data.position?.start?.line || node.position?.start?.line || 1);
        if (["application/json", "application/ld+json"].includes(props.type)) {
          visitData(JSON.parse(data.value), base);
        } else if (!props.type || /javascript|module/.test(props.type)) javascript(data.value, base);
        return;
      }
      for (const [attr, value] of Object.entries(props)) {
        if (visibleAttrs.has(attr) || (attr === "content" && /description|title/i.test(props.name || props.property || ""))) inspect(value, line);
      }
      for (const child of node.children || []) visit(child);
      if (block) flush();
    }
    visit(tree);
    flush();
  }
  function visitData(item, line, key = "") {
    if (Array.isArray(item)) { for (const value of item) visitData(value, line, key); }
    else if (item && typeof item === "object") { for (const [field, value] of Object.entries(item)) visitData(value, line, field); }
    else if (copyName.test(key)) inspect(item, line);
  }
  function javascript(text, base = 1) {
    const doc = parseJs(text, { sourceType: "unambiguous", plugins: ["jsx", "typescript"] });
    // Track display contexts. A source string in a selector, URL or command is still code.
    function visit(node, display = false) {
      if (!node || typeof node !== "object") return;
      const line = base + (node.loc?.start?.line || 1) - 1;
      if (node.type === "JSXElement") {
        if (node.openingElement.name.name === "code") {
          const text = node.children.map(child => child.value ?? child.expression?.value ?? "").join("");
          if (disguisedPunctuation.test(text.trim())) inspect(text, line);
        }
        if (omitted.has(node.openingElement.name.name)) return;
        for (const attr of node.openingElement.attributes) {
          if (attr.type === "JSXAttribute" && visibleAttrs.has(attr.name.name)) visit(attr.value, true);
        }
        for (const child of node.children) visit(child, true);
        return;
      }
      if (node.type === "TemplateLiteral") {
        const rendered = node.quasis.map(part => part.value.cooked || "").join(" ");
        if (fragments.test(rendered)) html(rendered, line);
        else if (display) for (const part of node.quasis) inspect(part.value.cooked, base + part.loc.start.line - 1);
        for (const expr of node.expressions) visit(expr, display);
        return;
      }
      if (node.type === "JSXText" || (node.type === "StringLiteral" && display)) {
        if (fragments.test(node.value)) html(node.value, line);
        else inspect(node.value, line);
        return;
      }
      if (node.type === "VariableDeclarator") { visit(node.init, copyName.test(node.id.name)); return; }
      if (node.type === "ObjectProperty") { visit(node.value, copyName.test(node.key.name || node.key.value)); return; }
      if (node.type === "AssignmentExpression") {
        const key = node.left.property?.name || node.left.property?.value || node.left.name;
        if (/^(?:inner|outer)HTML$/i.test(key) && node.right.type === "StringLiteral") html(node.right.value, base + node.right.loc.start.line - 1);
        else visit(node.right, copyName.test(key));
        return;
      }
      if (display && node.type === "CallExpression" && node.callee.property?.name === "join") {
        visit(node.callee.object, display);
        for (const arg of node.arguments) visit(arg, display);
        return;
      }
      if (node.type === "CallExpression" && node.callee.property?.name === "setAttribute") {
        if (visibleAttrs.has(node.arguments[0]?.value)) visit(node.arguments[1], true);
        return;
      }
      if (node.type === "ConditionalExpression") { visit(node.consequent, display); visit(node.alternate, display); return; }
      const pass = node.type === "JSXFragment" || (display && ["JSXExpressionContainer", "BinaryExpression", "LogicalExpression", "ArrayExpression", "ParenthesizedExpression"].includes(node.type));
      for (const [key, value] of Object.entries(node)) {
        if (["loc", "extra", "comments", "leadingComments", "trailingComments"].includes(key)) continue;
        if (Array.isArray(value)) value.forEach(child => visit(child, pass));
        else if (value && typeof value === "object") visit(value, pass);
      }
    }
    visit(doc);
  }
  if (file.endsWith("contents/resume/data.json")) {
    JSON.parse(source);
    // Babel retains line numbers, including for JSON escapes, whereas JSON.parse only returns values.
    function visitResume(node) {
      if (node.type === "ObjectExpression") node.properties.forEach(field => visitResume(field.value));
      else if (node.type === "ArrayExpression") node.elements.forEach(visitResume);
      else if (node.type === "StringLiteral") errors.push(...punctuationErrors(node.value, node.loc.start.line));
    }
    visitResume(parseExpression(source));
  } else if (/\.(?:jsx?|tsx?|mjs)$/i.test(file)) javascript(source);
  else if (/\.(?:html?|svg)$/i.test(file)) html(source);
  else {
    const front = /^---\r?\n([\s\S]*?)\r?\n---(?=\r?\n|$)/.exec(source);
    let body = source;
    if (front) {
      const data = yaml.safeLoad(front[1]);
      const lines = front[1].split("\n");
      for (const field of ["title", "description", "tags"]) {
        const values = [].concat(data?.[field] || []);
        let line = lines.findIndex(row => row.startsWith(field + ":")) + 2;
        for (const value of values) {
          if (typeof value !== "string") continue;
          const idx = lines.findIndex((row, i) => i + 2 >= line && row.includes(value));
          if (idx >= 0) line = idx + 2;
          inspect(entities.decodeHTML(value), line);
        }
      }
      body = front[0].replace(/[^\n]/g, " ") + source.slice(front[0].length);
    }
    const tree = markdown.parse(body);
    const markup = raw(toHast(tree, { allowDangerousHtml: true }), vfile(body));
    walkHtml(markup, 0);
  }
  return errors;
}

function plainText(node) {
  if (node.type === "text") return node.value;
  return (node.children || []).map(plainText).join("");
}

export function isPublicSource(file) {
  return /^(?:contents\/posts|static)\/.*\.(?:md|mdx|html?|svg)$/i.test(file) || file === "static/llms.txt" || file === "contents/resume/data.json" || /^static\/.*\.(?:mjs|js)$/i.test(file) ||
    file === "blog-config.js" || (/^src\/.*\.(?:jsx?|tsx?|mjs)$/.test(file) && !/(?:__tests__\/|\.test\.)/.test(file));
}
