// Packs the game into one self-contained diablo.html that runs from file://.
//
// Node builtins only. Rather than concatenating the modules flat — which would
// collide the moment two files declare the same top-level name, and they do —
// each module is wrapped in a function and wired through a twenty-line loader.
//
//   node build.js

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');
const ENTRY = 'main.js';
const OUT = path.join(ROOT, 'diablo.html');

const IMPORT_NAMED = /import\s*\{([\s\S]*?)\}\s*from\s*['"]([^'"]+)['"]\s*;?/g;
const IMPORT_NS = /import\s*\*\s*as\s+(\w+)\s*from\s*['"]([^'"]+)['"]\s*;?/g;
const IMPORT_BARE = /import\s+['"]([^'"]+)['"]\s*;?/g;
const EXPORT_LIST = /export\s*\{([\s\S]*?)\}\s*;?/g;
const EXPORT_DECL = /export\s+(const|let|var|function\*?|class|async\s+function)\s+/g;

function resolve(fromKey, spec) {
  const dir = path.posix.dirname(fromKey);
  let p = path.posix.normalize(path.posix.join(dir, spec));
  if (p.startsWith('./')) p = p.slice(2);
  return p;
}

// Rewrite one module's source into a function body and collect what it exports.
function transform(key, src) {
  const deps = new Set();
  const exported = new Set();
  let out = src;

  out = out.replace(IMPORT_NS, (_m, ns, spec) => {
    const dep = resolve(key, spec);
    deps.add(dep);
    return `const ${ns} = __require(${JSON.stringify(dep)});`;
  });

  out = out.replace(IMPORT_NAMED, (_m, names, spec) => {
    const dep = resolve(key, spec);
    deps.add(dep);
    const binding = names.split(',').map((n) => n.trim()).filter(Boolean).map((n) => {
      const m2 = n.match(/^(\w+)\s+as\s+(\w+)$/);
      return m2 ? `${m2[1]}: ${m2[2]}` : n;
    }).join(', ');
    return `const { ${binding} } = __require(${JSON.stringify(dep)});`;
  });

  out = out.replace(IMPORT_BARE, (_m, spec) => {
    const dep = resolve(key, spec);
    deps.add(dep);
    return `__require(${JSON.stringify(dep)});`;
  });

  // `export { a, b as c }` only registers names; it declares nothing.
  out = out.replace(EXPORT_LIST, (_m, names) => {
    for (const n of names.split(',').map((s) => s.trim()).filter(Boolean)) {
      const m2 = n.match(/^(\w+)\s+as\s+(\w+)$/);
      if (m2) exported.add(`${m2[2]}: ${m2[1]}`);
      else exported.add(n);
    }
    return '';
  });

  // `export const X` / `export function X` / `export class X`
  out = out.replace(EXPORT_DECL, (m, kind, offset) => {
    const rest = out.slice(offset + m.length);
    const nameMatch = rest.match(/^\s*(\w+)/);
    if (nameMatch) exported.add(nameMatch[1]);
    return `${kind} `;
  });

  if (/\bexport\b/.test(out.replace(/\/\/.*$/gm, ''))) {
    const leftover = out.match(/^.*\bexport\b.*$/m);
    throw new Error(`${key}: unhandled export form -> ${leftover && leftover[0].trim()}`);
  }

  const assign = exported.size
    ? `\nObject.assign(__exports, { ${[...exported].join(', ')} });`
    : '';
  return { code: out + assign, deps: [...deps] };
}

function collect(entry) {
  const modules = new Map();
  const queue = [entry];
  while (queue.length) {
    const key = queue.shift();
    if (modules.has(key)) continue;
    const file = path.join(SRC, key);
    if (!fs.existsSync(file)) throw new Error(`missing module: ${key}`);
    const t = transform(key, fs.readFileSync(file, 'utf8'));
    modules.set(key, t);
    for (const d of t.deps) if (!modules.has(d)) queue.push(d);
  }
  return modules;
}

function build() {
  const modules = collect(ENTRY);

  const parts = [];
  parts.push(`// Sanctuary - generated bundle, ${modules.size} modules. Do not edit; run node build.js.`);
  parts.push('(function () {');
  parts.push('"use strict";');
  parts.push('var __defs = {}, __cache = {};');
  parts.push('function __require(k) {');
  parts.push('  if (__cache[k]) return __cache[k];');
  parts.push('  var e = {}; __cache[k] = e;');
  parts.push('  __defs[k](e, __require);');
  parts.push('  return e;');
  parts.push('}');
  for (const [key, mod] of modules) {
    parts.push(`__defs[${JSON.stringify(key)}] = function (__exports, __require) {`);
    parts.push(mod.code);
    parts.push('};');
  }
  parts.push(`__require(${JSON.stringify(ENTRY)});`);
  parts.push('})();');
  const bundle = parts.join('\n');

  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
    .replace(/<script[^>]*src=["'][^"']*["'][^>]*><\/script>/, `<script>\n${bundle}\n</script>`);

  fs.writeFileSync(OUT, html);
  const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
  console.log(`wrote ${path.relative(ROOT, OUT)}  ${modules.size} modules  ${kb} KB`);
  console.log('open it directly in a browser; no server needed.');
}

build();
