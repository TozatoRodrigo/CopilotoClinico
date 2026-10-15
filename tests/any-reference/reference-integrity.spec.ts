import { createHash } from 'crypto';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { describe, expect, it } from 'vitest';

/**
 * ADR-017 — a referência congelada do ANY é só para teste. Este arquivo
 * garante as duas regras: ninguém fora de tests/ importa daqui (nunca vai
 * para o bundle do web nem para a API) e o código copiado não foi editado
 * (o hash do original está no cabeçalho de cada arquivo).
 */

const ROOT = process.cwd();
const REFERENCE_DIR = join(ROOT, 'tests/any-reference');
const MARKER = '// ---- início do arquivo original ----\n';
const SCANNED = ['src', 'web/src', 'evals', 'scripts'];
const CODE_FILE = /\.(ts|tsx|js|mjs)$/;
/** `from '…any-reference…'`, `import('…any-reference…')` ou `require('…any-reference…')`. */
const IMPORTS_REFERENCE = /(from\s+|import\s*\(\s*|require\s*\(\s*)['"][^'"]*any-reference/;

/** Arquivos copiados: `.ts` de dado e conta, e `.tsx` quando a conta mora no componente. */
function referenceFiles(): string[] {
  return readdirSync(REFERENCE_DIR).filter(
    (file) => /\.tsx?$/.test(file) && !file.endsWith('.spec.ts'),
  );
}

function codeFiles(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    if (entry === 'node_modules' || entry === '.next') return [];
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return codeFiles(path);
    return CODE_FILE.test(entry) ? [path] : [];
  });
}

describe('referência congelada do ANY', () => {
  it('tem os arquivos copiados de cada ferramenta portada', () => {
    expect(referenceFiles()).toEqual(
      expect.arrayContaining([
        'calculatorData.ts',
        'clinical.ts',
        'formatters.ts',
        // CC-311 — infusões contínuas
        'calculations.ts',
        'drugConfigs.ts',
        'DoseCalculator.tsx',
        // CC-312 — heparina e insulina
        'HeparinCalculator.tsx',
        'InsulinCalculator.tsx',
        // CC-313 e CC-314 — ACLS
        'AclsGuide.tsx',
        'MetronomeContext.tsx',
        // CC-315 — via aérea (a conta e o roteiro moram na própria página)
        'AirwayGuide.tsx',
      ]),
    );
  });

  it.each(referenceFiles())('%s não foi editado depois de copiado', (file) => {
    const content = readFileSync(join(REFERENCE_DIR, file), 'utf-8');
    const [header, original] = content.split(MARKER);
    const declared = header?.match(/sha256 do original: ([0-9a-f]{64})/)?.[1];
    expect(declared, 'cabeçalho sem hash').toBeDefined();
    expect(original, 'arquivo sem marcador').toBeDefined();
    const actual = createHash('sha256')
      .update(original ?? '', 'utf-8')
      .digest('hex');
    expect(actual).toBe(declared);
  });

  it('não é importada fora de tests/', () => {
    const offenders = SCANNED.flatMap((dir) => codeFiles(join(ROOT, dir)))
      .filter((file) => IMPORTS_REFERENCE.test(readFileSync(file, 'utf-8')))
      .map((file) => relative(ROOT, file));
    expect(offenders).toEqual([]);
  });
});
