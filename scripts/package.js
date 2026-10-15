import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { releaseSourceFiles, walkFiles } from './release-files.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = path.join(root, 'dist');
const { version } = JSON.parse(await readFile(path.join(root, 'extension/manifest.json'), 'utf8'));
const stage = await mkdtemp(path.join(tmpdir(), 'citelog-package-'));
const archiveNames = ['citelog-chrome.zip', 'citelog-source.zip'];

// These notes travel with the extension so installation does not depend on a web page.
const install = `CiteLog ${version} — Chrome installation / Chrome 安装

Requires Chrome 116 or later. No Node.js or command line needed.
需要 Chrome 116 或更新版本，无需安装 Node.js 或运行命令。

1. Extract citelog-chrome.zip into a permanent folder named CiteLog.
   解压 citelog-chrome.zip 到固定位置的 CiteLog 文件夹。
2. Open chrome://extensions and turn on Developer mode (top right).
   打开 chrome://extensions，开启右上角的「开发者模式」。
3. Choose Load unpacked and select the folder containing manifest.json.
   点击「加载已解压的扩展程序」，选择直接包含 manifest.json 的文件夹。
4. Pin CiteLog from Chrome's puzzle-piece menu. Open it and paste your
   Google Scholar profile link to connect your profile.
   在 Chrome 的拼图菜单中固定 CiteLog，打开后粘贴 Scholar 个人主页链接。

Keep this folder in place. To update, close the popup, replace the files in
the SAME folder, click Reload at chrome://extensions, and refresh open
Scholar tabs. Do not uninstall: uninstalling removes local history.
保留此文件夹。更新时关闭弹窗，将文件覆盖到原目录，在扩展管理页点击
「重新加载」，并刷新已打开的 Scholar 页面。不要卸载，否则会删除本机记录。

The first successful check establishes a baseline; daily changes appear
after later checks. Citation-source lists are recorded only when you visit
them yourself. They are never fetched automatically in the background.
首次检查建立基线，后续检查才会产生变化记录。引用来源仅在你主动浏览
对应页面时记录，不会在后台自动抓取。

See PRIVACY.md for data handling and permissions. Source and full guides:
隐私和权限见 PRIVACY.md。源码与完整说明：
https://github.com/LilanOvO/citelog
`;

async function copyFile(relative, target) {
  const destination = path.join(target, relative);
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(path.join(root, relative), destination);
}

async function zipDirectory(directory, name) {
  const files = await walkFiles(directory);
  const archive = path.join(dist, name);
  await rm(archive, { force: true });
  // Explicit sorted paths exclude metadata, symlinks, and scratch data.
  // -X removes machine-specific ZIP extras; no containing directory is added.
  const result = spawnSync('zip', ['-X', '-q', archive, '-@'], {
    cwd: directory, input: files.join('\n') + '\n', encoding: 'utf8'
  });
  if (result.error || result.status !== 0) {
    throw new Error(result.error?.message || result.stderr || 'Install the zip utility to create release archives.');
  }
}

try {
  await mkdir(dist, { recursive: true });
  const runtime = path.join(stage, 'runtime');
  await mkdir(runtime);
  for (const relative of await walkFiles(path.join(root, 'extension'))) {
    const destination = path.join(runtime, relative);
    await mkdir(path.dirname(destination), { recursive: true });
    await cp(path.join(root, 'extension', relative), destination);
  }
  await copyFile('LICENSE', runtime);
  await copyFile('PRIVACY.md', runtime);
  await writeFile(path.join(runtime, 'INSTALL.txt'), install);
  await zipDirectory(runtime, archiveNames[0]);

  const source = path.join(stage, 'source');
  for (const relative of await releaseSourceFiles(root)) {
    await copyFile(relative, path.join(source, 'citelog'));
  }
  await zipDirectory(source, archiveNames[1]);

  const checksums = [];
  for (const name of archiveNames) {
    const bytes = await readFile(path.join(dist, name));
    checksums.push(`${createHash('sha256').update(bytes).digest('hex')}  ${name}`);
  }
  await writeFile(path.join(dist, 'SHA256SUMS.txt'), checksums.join('\n') + '\n');
  console.log(`Built CiteLog ${version}: ${archiveNames.join(', ')} and SHA256SUMS.txt`);
} finally {
  await rm(stage, { recursive: true, force: true });
}
