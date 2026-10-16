// Garante que o web só importa TIPOS de @contracts/*.
// Run with: node scripts/check-contracts-type-only.mjs [diretório…] (padrão: src)
//
// A imagem de produção (docker/Dockerfile.web) copia só `web/`, então
// `@contracts/*` (→ ../src/shared/contracts) não existe lá dentro. Import só de
// tipo some na compilação e passa; import de valor (constante, função, enum,
// schema zod) vira "Module not found" no `docker build`, e o build do CI não
// pega porque roda com o repositório inteiro. Constante ou lógica compartilhada
// é espelhada em web/src/lib/<contrato>-contract.ts, com comentário apontando a
// origem, e tests/web-mirrors/<contrato>.spec.ts (raiz) confere a paridade.
//
// Arquivos de teste ficam de fora: não entram no bundle do Next, e o vitest
// resolve o alias.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const SOURCE_EXTENSIONS = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;
// src/test/ é o setup do vitest; uma rota chamada "test" em src/app continua conferida.
const TEST_DIR = /(^|\/)(__tests__|__mocks__)\/|(^|\/)src\/test\//;

/** `@contracts/x` ou um caminho relativo que chega em src/shared/contracts. */
export function isContractsSpecifier(specifier) {
  if (specifier === '@contracts' || specifier.startsWith('@contracts/')) return true;
  return specifier.startsWith('.') && /(^|\/)src\/shared\/contracts(\/|$)/.test(specifier);
}

function scriptKindFor(fileName) {
  if (fileName.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (fileName.endsWith('.jsx')) return ts.ScriptKind.JSX;
  if (/\.[cm]?js$/.test(fileName)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function isTypeOnlyImport(node) {
  const clause = node.importClause;
  // `import "@contracts/x"` só existe pelo efeito colateral: é valor.
  if (!clause) return false;
  if (clause.isTypeOnly) return true;
  if (clause.name) return false;
  const bindings = clause.namedBindings;
  if (!bindings || ts.isNamespaceImport(bindings)) return false;
  return bindings.elements.length > 0 && bindings.elements.every((el) => el.isTypeOnly);
}

function isTypeOnlyExport(node) {
  if (node.isTypeOnly) return true;
  const clause = node.exportClause;
  if (!clause || !ts.isNamedExports(clause)) return false;
  return clause.elements.length > 0 && clause.elements.every((el) => el.isTypeOnly);
}

/** Specifier do `import()` dinâmico ou do `require()`, se for literal. */
function callSpecifier(node) {
  const [arg] = node.arguments;
  if (!arg || !ts.isStringLiteralLike(arg)) return undefined;
  if (node.expression.kind === ts.SyntaxKind.ImportKeyword) return arg.text;
  if (ts.isIdentifier(node.expression) && node.expression.text === 'require') return arg.text;
  return undefined;
}

/**
 * Imports de valor de @contracts num arquivo. Só `import type { X }`,
 * `import { type X }` e `export type { X } from` passam.
 */
export function findContractValueImports(sourceText, fileName) {
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    scriptKindFor(fileName),
  );
  const violations = [];
  const report = (node, specifier) => {
    const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    const text = node.getText(sourceFile).replace(/\s+/g, ' ').trim();
    violations.push({ fileName, line: line + 1, specifier, text });
  };

  const visit = (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const specifier = node.moduleSpecifier.text;
      if (isContractsSpecifier(specifier) && !isTypeOnlyImport(node)) report(node, specifier);
      return;
    }
    if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const specifier = node.moduleSpecifier.text;
      if (isContractsSpecifier(specifier) && !isTypeOnlyExport(node)) report(node, specifier);
      return;
    }
    if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      ts.isStringLiteralLike(node.moduleReference.expression)
    ) {
      const specifier = node.moduleReference.expression.text;
      if (isContractsSpecifier(specifier) && !node.isTypeOnly) report(node, specifier);
      return;
    }
    if (ts.isCallExpression(node)) {
      const specifier = callSpecifier(node);
      if (specifier !== undefined && isContractsSpecifier(specifier)) report(node, specifier);
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return violations;
}

export function isCheckedFile(relativePath) {
  const normalized = relativePath.split(path.sep).join('/');
  return (
    SOURCE_EXTENSIONS.test(normalized) &&
    !normalized.endsWith('.d.ts') &&
    !TEST_FILE.test(normalized) &&
    !TEST_DIR.test(normalized)
  );
}

function listFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) return [];
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? listFiles(full) : [full];
  });
}

export function checkDirectories(dirs, cwd = process.cwd()) {
  return dirs.flatMap((dir) => {
    const root = path.resolve(cwd, dir);
    const files = statSync(root).isDirectory() ? listFiles(root) : [root];
    return files
      .filter((file) => isCheckedFile(path.relative(cwd, file)))
      .flatMap((file) =>
        findContractValueImports(readFileSync(file, 'utf8'), path.relative(cwd, file)),
      );
  });
}

function main() {
  const dirs = process.argv.slice(2);
  const violations = checkDirectories(dirs.length > 0 ? dirs : ['src']);
  if (violations.length === 0) {
    console.log('✓ web importa só tipos de @contracts');
    return;
  }
  console.error(
    `✗ ${violations.length} import(s) de valor de @contracts — a imagem do web não tem ../src:`,
  );
  for (const v of violations) console.error(`  ${v.fileName}:${v.line}  ${v.text}`);
  console.error(
    '\nUse `import type`, ou espelhe o valor em src/lib/<contrato>-contract.ts (comentário de origem)' +
      ' com um teste de paridade em tests/web-mirrors/<contrato>.spec.ts na raiz.',
  );
  process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
