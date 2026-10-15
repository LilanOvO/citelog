import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const parserEntry = require.resolve('htmlparser2');
const parserRoot = path.resolve(path.dirname(parserEntry), '../..');
const entityEntry = createRequire(parserEntry).resolve('entities/decode');
const entityRoot = path.resolve(path.dirname(entityEntry), '../..');
const parserVersion = JSON.parse(await readFile(path.join(parserRoot, 'package.json'), 'utf8')).version;
const entityVersion = JSON.parse(await readFile(path.join(entityRoot, 'package.json'), 'utf8')).version;
assert.equal(parserVersion, '10.1.0');
assert.equal(entityVersion, '7.0.1');
const destination = path.join(root, 'extension/vendor');
const copied = new Set();

async function copyModule(packageRoot, name, relative) {
  const key = `${name}/${relative}`;
  if (copied.has(key)) return;
  copied.add(key);
  const source = path.join(packageRoot, 'dist/esm', relative);
  let code = await readFile(source, 'utf8');
  for (const match of code.matchAll(/(?:from\s*|import\s*)["']([^"']+)["']/g)) {
    const specifier = match[1];
    if (specifier.startsWith('.')) {
      const next = path.posix.normalize(path.posix.join(path.posix.dirname(relative), specifier));
      assert(!next.startsWith('..') && next.endsWith('.js'));
      await copyModule(packageRoot, name, next);
    } else {
      assert.equal(specifier, 'entities/decode');
      assert.equal(name, 'htmlparser2');
      await copyModule(entityRoot, 'entities', 'decode.js');
    }
  }
  code = code.replaceAll('"entities/decode"', '"../entities/decode.js"').replace(/^\/\/# sourceMappingURL=.*$/gm, '');
  const target = path.join(destination, key);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, code);
}
await copyModule(parserRoot, 'htmlparser2', 'Parser.js');
for (const [name, source] of [['htmlparser2', parserRoot], ['entities', entityRoot]]) {
  await writeFile(path.join(destination, name, 'LICENSE'), await readFile(path.join(source, 'LICENSE')));
}
await writeFile(path.join(destination, 'README.txt'), `Locally packaged parser modules; no CDN or runtime downloads.\nhtmlparser2 ${parserVersion} (MIT), entities ${entityVersion} (BSD-2-Clause).\nOnly the parser/tokenizer and entity decoder dependency graph is included.\nGenerated with npm run vendor. Import paths are localized and source-map links removed.\nOriginal licenses are in the corresponding directories.\n`);
console.log(`Vendored ${copied.size} modules with licenses.`);
