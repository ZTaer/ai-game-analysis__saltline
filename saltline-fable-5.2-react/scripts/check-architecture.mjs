/**
 * 校验源码的本地模块边界：导入目标存在、命名导出存在、依赖图无环。
 * 使用当前 Vite 构建工具链已有的 Rolldown AST 解析器，不新增运行时依赖。
 * 只解析源码，不执行可能创建 DOM、WebGL 或 AudioContext 的模块。
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const requireFromVite = createRequire(import.meta.resolve('vite'));
const { parseAst } = await import(pathToFileURL(requireFromVite.resolve('rolldown/parseAst')));
const sourceRoot = fileURLToPath(new URL('../src/', import.meta.url));
const display = (filename) => path.relative(sourceRoot, filename).replaceAll('\\', '/');
const failures = [];

async function sourceFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await sourceFiles(filename)));
    else if (/\.(?:js|jsx|mjs)$/.test(entry.name)) files.push(filename);
  }
  return files.sort();
}

function declaredNames(pattern) {
  if (!pattern) return [];
  if (pattern.type === 'Identifier') return [pattern.name];
  if (pattern.type === 'RestElement') return declaredNames(pattern.argument);
  if (pattern.type === 'AssignmentPattern') return declaredNames(pattern.left);
  if (pattern.type === 'ArrayPattern') return pattern.elements.flatMap(declaredNames);
  if (pattern.type === 'ObjectPattern')
    return pattern.properties.flatMap((property) =>
      declaredNames(property.type === 'RestElement' ? property.argument : property.value),
    );
  return [];
}

const modules = new Map();
for (const filename of await sourceFiles(sourceRoot)) {
  const code = await readFile(filename, 'utf8');
  const ast = parseAst(code, { lang: filename.endsWith('.jsx') ? 'jsx' : 'js' }, filename);
  const info = { filename, exports: new Set(), references: [], edges: new Set() };
  for (const node of ast.body) {
    if (node.type === 'ImportDeclaration') {
      info.references.push({
        source: node.source.value,
        imports: node.specifiers.flatMap((specifier) => {
          if (specifier.type === 'ImportNamespaceSpecifier') return [];
          return [
            specifier.type === 'ImportDefaultSpecifier'
              ? 'default'
              : (specifier.imported.name ?? specifier.imported.value),
          ];
        }),
      });
    } else if (node.type === 'ExportDefaultDeclaration') {
      info.exports.add('default');
    } else if (node.type === 'ExportNamedDeclaration') {
      const declaration = node.declaration;
      if (declaration?.type === 'VariableDeclaration') {
        for (const variable of declaration.declarations) {
          declaredNames(variable.id).forEach((name) => info.exports.add(name));
        }
      } else if (declaration?.id) info.exports.add(declaration.id.name);
      for (const specifier of node.specifiers) {
        info.exports.add(specifier.exported.name ?? specifier.exported.value);
      }
      if (node.source)
        info.references.push({
          source: node.source.value,
          imports: node.specifiers.map(
            (specifier) => specifier.local.name ?? specifier.local.value,
          ),
        });
    } else if (node.type === 'ExportAllDeclaration') {
      if (node.exported) info.exports.add(node.exported.name ?? node.exported.value);
      info.references.push({ source: node.source.value, imports: [], exportAll: !node.exported });
    }
  }
  modules.set(filename, info);
}

for (const info of modules.values()) {
  for (const reference of info.references) {
    if (!reference.source.startsWith('.')) continue;
    const filename = path.resolve(path.dirname(info.filename), reference.source.split(/[?#]/)[0]);
    try {
      if (!(await stat(filename)).isFile()) throw new Error('not a file');
    } catch {
      failures.push(`${display(info.filename)} imports missing file: ${reference.source}`);
      continue;
    }
    reference.target = modules.get(filename);
    if (reference.target) info.edges.add(filename);
  }
}

// Resolve export-star chains before validating consumers. The fixed point also
// terminates safely if a cycle is present; cycle reporting below remains explicit.
let changed = true;
while (changed) {
  changed = false;
  for (const info of modules.values()) {
    for (const reference of info.references) {
      if (!reference.exportAll || !reference.target) continue;
      for (const name of reference.target.exports) {
        if (name === 'default' || info.exports.has(name)) continue;
        info.exports.add(name);
        changed = true;
      }
    }
  }
}

for (const info of modules.values()) {
  for (const reference of info.references) {
    if (!reference.target) continue;
    for (const name of reference.imports) {
      if (!reference.target.exports.has(name))
        failures.push(
          `${display(info.filename)} imports missing export "${name}" from ${reference.source}`,
        );
    }
  }
}

const visited = new Set();
const visiting = [];
function visit(filename) {
  const cycleStart = visiting.indexOf(filename);
  if (cycleStart >= 0) {
    failures.push(
      `Circular dependency: ${[...visiting.slice(cycleStart), filename].map(display).join(' -> ')}`,
    );
    return;
  }
  if (visited.has(filename)) return;
  visiting.push(filename);
  for (const dependency of modules.get(filename).edges) visit(dependency);
  visiting.pop();
  visited.add(filename);
}
for (const filename of modules.keys()) visit(filename);

if (failures.length) {
  failures.forEach((failure) => console.error(failure));
  process.exitCode = 1;
} else {
  const edgeCount = [...modules.values()].reduce((total, info) => total + info.edges.size, 0);
  console.log(
    `Architecture OK: ${modules.size} source modules, ${edgeCount} local dependencies, no missing imports/exports or cycles.`,
  );
}
