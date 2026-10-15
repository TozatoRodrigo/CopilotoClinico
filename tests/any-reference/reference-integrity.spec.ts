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

/**
 * Arquivos copiados: `.ts` de dado e conta, `.tsx` quando a conta mora no
 * componente e `.html` quando a ferramenta do ANY é um HTML único (Tox Path
 * legado, HETRIN), lido só como texto.
 */
function referenceFiles(): string[] {
  return readdirSync(REFERENCE_DIR).filter(
    (file) => /\.(tsx?|html)$/.test(file) && !file.endsWith('.spec.ts'),
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
        // CC-316 e CC-317 — choque
        'ShockPath.tsx',
        // CC-318 — TEP (usa também o `fmt` e o `classifyWells` de calculations.ts)
        'TepGuide.tsx',
        // CC-323 — roteiro de Toxicologia
        'toxData.ts',
        'ToxPath.tsx',
        // CC-324 — doses tóxicas do Tox Path legado
        'tox-path-legacy.html',
        // CC-326 — CAD e EHH
        'ketoCalc.ts',
        'ketoData.ts',
        'KetoManejo.tsx',
        'KetoCiclo.tsx',
        'KetoConsulta.tsx',
        'KetoPlanilha.tsx',
        'KetoPath.tsx',
        // CC-319 — pediatria
        'PedGuide.tsx',
        // CC-320 — peso por idade e comprimento, acessos e drenos
        'hetrinped-v1.1.7.html',
        // CC-325 — dengue (a hidratação mora em calculations.ts; o resto, na página)
        'DenguePath.tsx',
        // CC-327 — ventilação mecânica (as contas no vmData, os avisos e a
        // formatação na própria página, o `calcHACOR` no calculations)
        'vmData.ts',
        'VmGuide.tsx',
        // CC-328 — sedação (o `fmt` que a página importa; a conta e o roteiro moram na página)
        'SedaPath.tsx',
        // CC-329 — cuidados paliativos: o dado no paliaData e a conta do
        // conversor, a soma do PPI e boa parte do texto na própria tela.
        'paliaData.ts',
        'PaliaPath.tsx',
        // CC-330 — bloqueios regionais (dado, dose e nota moram na própria página)
        'BlockPath.tsx',
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
