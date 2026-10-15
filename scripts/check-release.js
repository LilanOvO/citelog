import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { releaseSourceFiles, walkFiles } from './release-files.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = path.join(root, 'dist');
const manifest = JSON.parse(await readFile(path.join(root, 'extension/manifest.json'), 'utf8'));
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const lock = JSON.parse(await readFile(path.join(root, 'package-lock.json'), 'utf8'));
assert.equal(manifest.name, 'CiteLog');
assert.equal(pkg.version, manifest.version, 'Package and manifest versions differ');
assert.equal(lock.version, manifest.version, 'Lockfile and manifest versions differ');
assert.equal(lock.packages[''].version, manifest.version, 'Lockfile root version differs');
assert.equal(pkg.license, 'MIT');

function unzip(archive, args, encoding = null) {
  const result = spawnSync('unzip', [...args.slice(0, 1), archive, ...args.slice(1)], {
    encoding, maxBuffer: 32 * 1024 * 1024
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, String(result.stderr || `Unable to read ${path.basename(archive)}`));
  return result.stdout;
}

function inspectPath(file) {
  assert(!file.startsWith('/') && !file.includes('\\'), `Unsafe archive path: ${file}`);
  assert(!file.split('/').some(part => !part || part === '..' || part === '.'), `Unsafe archive path: ${file}`);
  assert(!/(?:^|\/)(?:node_modules|dist|work|coverage|\.git|\.DS_Store|__MACOSX|\.env(?:\.[^/]*)?)(?:\/|$)/.test(file), `Private or generated path: ${file}`);
  assert(!/\.(?:log|pem|key|p12|pfx|sqlite|db)$/i.test(file), `Private or generated file: ${file}`);
}

function inspectText(file, bytes) {
  if (!/\.(?:js|json|html|css|md|txt|ya?ml|svg|py)$/.test(file) && !file.endsWith('LICENSE')) return;
  const text = bytes.toString('utf8');
  // A focused accidental-data check, not a substitute for reviewing release files.
  const forbidden = [
    [/\/(?:Users|home)\/[^\s/"'<>]+\//, 'local machine path'],
    [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, 'private key'],
    [/\b(?:ghp_|github_pat_|gho_)[A-Za-z0-9_]{20,}\b/, 'GitHub credential'],
    [/\bAKIA[0-9A-Z]{16}\b/, 'AWS access key'],
    [/[?&](?:amp;)?user=[A-Za-z0-9_-]{12}(?![A-Za-z0-9_-])/, 'real-looking Scholar profile ID']
  ];
  for (const [pattern, label] of forbidden) assert(!pattern.test(text), `${file}: possible ${label}; use synthetic examples only`);
}

async function checkArchive(name, expected, sourcePath) {
  const archive = path.join(dist, name);
  unzip(archive, ['-tqq']);
  const files = unzip(archive, ['-Z1'], 'utf8').trim().split('\n');
  assert.equal(new Set(files).size, files.length, `${name}: duplicate ZIP paths`);
  files.forEach(inspectPath);
  assert.deepEqual([...files].sort(), [...expected].sort(), `${name}: missing or unexpected archive contents`);
  for (const file of files) {
    const bytes = unzip(archive, ['-p', file]);
    inspectText(file, bytes);
    const source = sourcePath(file);
    if (source) {
      const original = await readFile(path.join(root, source));
      assert.equal(createHash('sha256').update(bytes).digest('hex'), createHash('sha256').update(original).digest('hex'), `${name}: ${file} differs from source`);
    }
  }
  return { archive, files };
}

const extensionFiles = await walkFiles(path.join(root, 'extension'));
const runtime = await checkArchive('citelog-chrome.zip', [...extensionFiles, 'LICENSE', 'PRIVACY.md', 'INSTALL.txt'], file => {
  if (file === 'INSTALL.txt') return null;
  return ['LICENSE', 'PRIVACY.md'].includes(file) ? file : `extension/${file}`;
});
const packagedManifest = JSON.parse(unzip(runtime.archive, ['-p', 'manifest.json'], 'utf8'));
assert.deepEqual(packagedManifest, manifest, 'Root manifest differs from extension manifest');
const install = unzip(runtime.archive, ['-p', 'INSTALL.txt'], 'utf8');
assert(install.includes(`CiteLog ${manifest.version}`) && install.includes('chrome://extensions') && install.includes('manifest.json'), 'Missing installation guidance');
assert(runtime.files.includes('vendor/htmlparser2/LICENSE') && runtime.files.includes('vendor/entities/LICENSE'), 'Missing third-party licenses');
assert(unzip(runtime.archive, ['-p', 'LICENSE'], 'utf8').includes('MIT License'), 'Missing MIT license');

const sourceFiles = await releaseSourceFiles(root);
for (const required of ['README.md', 'LICENSE', 'PRIVACY.md', 'package-lock.json', 'scripts/package.js', '.github/workflows/ci.yml', '.github/workflows/draft-release.yml']) {
  assert(sourceFiles.includes(required), `Source release is missing ${required}`);
}
const source = await checkArchive('citelog-source.zip', sourceFiles.map(file => `citelog/${file}`), file => file.slice('citelog/'.length));

const checksumLines = (await readFile(path.join(dist, 'SHA256SUMS.txt'), 'utf8')).trim().split('\n');
assert.equal(checksumLines.length, 2, 'Expected exactly two release checksums');
for (const { archive } of [runtime, source]) {
  const hash = createHash('sha256').update(await readFile(archive)).digest('hex');
  assert(checksumLines.includes(`${hash}  ${path.basename(archive)}`), `Checksum differs: ${path.basename(archive)}`);
}
console.log(`Verified CiteLog ${manifest.version}: root manifest, ${runtime.files.length} runtime files, ${source.files.length} source files, exact file hashes, licenses, privacy checks, and ZIP checksums.`);
