import { readdir } from 'node:fs/promises';
import path from 'node:path';

const excluded = /^(?:node_modules|dist|coverage|work|\.git|\.DS_Store|__MACOSX|\.env(?:\..*)?)$/;
const unwantedFile = /(?:\.(?:log|zip|pem|key|p12|pfx|sqlite|db)|~)$/i;

export async function walkFiles(directory, prefix = '') {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (excluded.test(entry.name) || unwantedFile.test(entry.name)) continue;
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw new Error(`Release files must not be symlinks: ${relative}`);
    if (/[\r\n\\]/.test(relative)) throw new Error(`Unsupported release filename: ${relative}`);
    if (entry.isDirectory()) {
      result.push(...await walkFiles(path.join(directory, entry.name), relative));
    } else if (entry.isFile()) {
      result.push(relative);
    } else {
      throw new Error(`Unsupported release file type: ${relative}`);
    }
  }
  return result.sort();
}

export async function releaseSourceFiles(root) {
  const sourceDirectories = new Set(['extension', 'scripts', 'tests', 'docs', 'assets', '.github']);
  const sourceFiles = new Set(['package.json', 'package-lock.json', 'LICENSE', '.gitignore', '.gitattributes', '.editorconfig', '.npmrc']);
  const files = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.isDirectory() && sourceDirectories.has(entry.name)) {
      files.push(...(await walkFiles(path.join(root, entry.name))).map(file => `${entry.name}/${file}`));
    } else if (entry.isFile() && (sourceFiles.has(entry.name) || /^[A-Z][A-Za-z0-9_.-]*\.md$/.test(entry.name))) {
      files.push(entry.name);
    } else if (entry.isSymbolicLink() && (sourceDirectories.has(entry.name) || sourceFiles.has(entry.name))) {
      throw new Error(`Release source must not contain symlinks: ${entry.name}`);
    }
  }
  return files.sort();
}
