import { readFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const extension = path.join(root, 'extension');
const manifest = JSON.parse(await readFile(path.join(extension, 'manifest.json'), 'utf8'));
assert.equal(manifest.manifest_version, 3);
assert.deepEqual(manifest.host_permissions, ['https://scholar.google.com/*']);
assert(!manifest.permissions.includes('debugger'));
assert(!manifest.permissions.includes('cookies'));
assert(!manifest.permissions.includes('webRequest'));
for (const file of [manifest.background.service_worker, manifest.action.default_popup, ...Object.values(manifest.icons)]) {
  assert((await stat(path.join(extension, file))).isFile(), `Missing manifest asset: ${file}`);
}
async function walk(dir) {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    result.push(...(entry.isDirectory() ? await walk(file) : [file]));
  }
  return result;
}
const files = await walk(extension);
for (const file of files) {
  if (file.endsWith('.js')) {
    const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    assert.equal(check.status, 0, check.stderr);
  }
  if (file.endsWith('.html')) {
    const html = await readFile(file, 'utf8');
    assert(!/<script\b(?![^>]*\bsrc=)[^>]*>/i.test(html), `${file}: inline script violates MV3 CSP`);
    assert(!/\bon(?:click|load|error|change)\s*=/i.test(html), `${file}: inline event handler`);
    assert(!/(?:src|href)=["']https?:\/\//i.test(html), `${file}: remote resource in packaged HTML`);
  }
}
console.log(`Checked MV3 manifest, ${files.length} packaged files, JavaScript syntax, and local resources.`);
