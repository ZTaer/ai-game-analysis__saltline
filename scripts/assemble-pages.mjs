import { cp, lstat, mkdir, readdir, readFile, realpath, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 只收集这三个独立项目；原始 saltline-fable-5.2 不进入发布产物。
const repoRoot = await realpath(fileURLToPath(new URL('../', import.meta.url)));
const output = path.join(repoRoot, 'dist');
const projects = [
  { route: 'birds', directory: 'saltline_愤怒的小鸟' },
  { route: 'wildspell', directory: 'saltline_咒语乐团' },
  { route: 'saltline', directory: 'saltline-fable-5.2-react' },
];
const inputs = [
  { route: '', source: path.join(repoRoot, 'site') },
  ...projects.map(({ route, directory }) => ({
    route,
    source: path.join(repoRoot, directory, 'dist'),
  })),
];

async function requireFile(filename) {
  if (!(await stat(filename)).isFile()) throw new Error(`缺少文件：${filename}`);
}

async function listFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`发布目录不接受符号链接：${filename}`);
    if (entry.isDirectory()) files.push(...(await listFiles(filename)));
    else if (entry.isFile()) files.push(filename);
  }
  return files;
}

function isWithin(directory, filename) {
  const relative = path.relative(directory, filename);
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
}

// 验证本地引用仍是相对路径，避免 Pages 的仓库名前缀被 /assets/... 绕过。
async function checkReference(filename, reference) {
  if (!reference || reference.startsWith('#') || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(reference)) return;
  if (reference.startsWith('/') || reference.includes('\\')) {
    throw new Error(`资源必须使用相对路径：${filename} → ${reference}`);
  }
  const pathname = decodeURIComponent(reference.split(/[?#]/)[0]);
  if (!pathname) return;
  let target = path.resolve(path.dirname(filename), pathname);
  if (!isWithin(output, target)) throw new Error(`引用越出发布目录：${filename} → ${reference}`);
  if ((await stat(target)).isDirectory()) target = path.join(target, 'index.html');
  await requireFile(target);
}

async function validateReferences(files) {
  let count = 0;
  for (const filename of files) {
    const extension = path.extname(filename);
    if (!['.html', '.css', '.js'].includes(extension)) continue;
    const content = await readFile(filename, 'utf8');
    // 检查 HTML 入口、CSS 图片/字体、Vite 拆分后的 JS 模块引用。
    const pattern = extension === '.html'
      ? /\b(?:src|href)\s*=\s*(["'])(.*?)\1/gi
      : extension === '.css'
        ? /\burl\(\s*(["']?)([^"')]*?)\1\s*\)/gi
        : /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)(["'])(\.{1,2}\/[^"']+)\1/g;
    for (const match of content.matchAll(pattern)) {
      await checkReference(filename, match[2]);
      count++;
    }
  }
  return count;
}

// 先确认所有输入完整，再清空根目录 dist，避免构建缺失时损坏上次产物。
for (const { source } of inputs) {
  await requireFile(path.join(source, 'index.html'));
  await listFiles(source);
}
for (const { route } of projects) {
  const reserved = path.join(repoRoot, 'site', route);
  const existing = await lstat(reserved).catch((error) => {
    if (error.code !== 'ENOENT') throw error;
    return null;
  });
  if (existing) throw new Error(`site 不应占用游戏发布目录：${reserved}`);
}

// 删除前显式检查绝对路径及链接，清理范围固定为本仓库根 dist。
if (path.dirname(output) !== repoRoot || path.basename(output) !== 'dist') {
  throw new Error(`拒绝清理不安全的输出目录：${output}`);
}
const previous = await lstat(output).catch((error) => {
  if (error.code !== 'ENOENT') throw error;
  return null;
});
if (previous && (previous.isSymbolicLink() || !previous.isDirectory() || await realpath(output) !== output)) {
  throw new Error(`输出位置必须是仓库内的普通 dist 目录：${output}`);
}
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

for (const { route, source } of inputs) {
  await cp(source, path.join(output, route), { recursive: true });
}
const files = await listFiles(output);
const references = await validateReferences(files);
let totalBytes = 0;
for (const { route } of inputs) {
  await requireFile(path.join(output, route, 'index.html'));
  const selected = route
    ? files.filter((filename) => isWithin(path.join(output, route), filename))
    : files.filter((filename) => !projects.some((project) => isWithin(path.join(output, project.route), filename)));
  let bytes = 0;
  for (const filename of selected) bytes += (await stat(filename)).size;
  totalBytes += bytes;
  console.log(`/${route ? `${route}/` : ''}: ${selected.length} 个文件，${bytes.toLocaleString('en-US')} B`);
}
console.log(`组装完成：${output}`);
console.log(`共 ${files.length} 个文件，${(totalBytes / 1024 / 1024).toFixed(2)} MiB；已检查 ${references} 处资源或链接引用。`);
