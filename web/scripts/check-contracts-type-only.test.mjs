// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  checkDirectories,
  findContractValueImports,
  isCheckedFile,
} from './check-contracts-type-only.mjs';

const lines = (source, fileName = 'src/a.tsx') =>
  findContractValueImports(source, fileName).map((v) => v.line);

describe('check-contracts-type-only', () => {
  it.each([
    ['import type', "import type { A } from '@contracts/beta';"],
    ['import { type X }', "import { type A, type B } from '@contracts/beta';"],
    ['namespace só de tipo', "import type * as Contract from '@contracts/beta';"],
    ['alias de const como tipo', "import type { X as Y } from '@contracts/clinical';"],
    ['export type', "export type { A } from '@contracts/beta';"],
    ['export { type X }', "export { type A } from '@contracts/beta';"],
    ['typeof import()', "type T = typeof import('@contracts/beta');"],
    ['relativo, só tipo', "import type { A } from '../../../src/shared/contracts/beta';"],
    [
      'valor de outro módulo',
      "import { useState } from 'react';\nimport { cn } from '@/lib/utils';",
    ],
  ])('aceita %s', (_, source) => {
    expect(lines(source)).toEqual([]);
  });

  it.each([
    ['import de valor', "import { BETA_TERMS } from '@contracts/beta';"],
    ['valor junto com tipo', "import { BETA_TERMS, type BetaMe } from '@contracts/beta';"],
    ['default', "import beta from '@contracts/beta';"],
    ['namespace', "import * as beta from '@contracts/beta';"],
    ['efeito colateral', "import '@contracts/beta';"],
    ['chaves vazias', "import {} from '@contracts/beta';"],
    ['re-export de valor', "export { BETA_TERMS } from '@contracts/beta';"],
    ['export *', "export * from '@contracts/beta';"],
    ['import() dinâmico', "const load = () => import('@contracts/beta');"],
    ['require', "const beta = require('@contracts/beta');"],
    ['caminho relativo', "import { BETA_TERMS } from '../../../src/shared/contracts/beta';"],
  ])('recusa %s', (_, source) => {
    expect(lines(source)).toEqual([1]);
  });

  it('aponta a linha de cada import de valor, inclusive em várias linhas', () => {
    const source = [
      "'use client';",
      "import type { BetaMe } from '@contracts/beta';",
      'import {',
      '  BETA_INVITE_LIMITS,',
      '  type BetaInviteView,',
      "} from '@contracts/beta';",
      "import { SHIFT_REVIEW_CONFIDENCES } from '@contracts/shift-review';",
    ].join('\n');
    const violations = findContractValueImports(source, 'src/panel.tsx');
    expect(violations.map((v) => [v.line, v.specifier])).toEqual([
      [3, '@contracts/beta'],
      [7, '@contracts/shift-review'],
    ]);
    expect(violations[0].text).toBe(
      "import { BETA_INVITE_LIMITS, type BetaInviteView, } from '@contracts/beta';",
    );
  });

  it('confere código, não teste nem declaração', () => {
    expect(isCheckedFile('src/lib/beta-queries.ts')).toBe(true);
    expect(isCheckedFile('src/app/(auth)/onboarding/beta/page.tsx')).toBe(true);
    expect(isCheckedFile('src/lib/__tests__/beta.test.ts')).toBe(false);
    expect(isCheckedFile('src/app/(admin)/admin/beta/__tests__/page.test.tsx')).toBe(false);
    expect(isCheckedFile('src/components/foo.spec.tsx')).toBe(false);
    expect(isCheckedFile('src/test/setup.ts')).toBe(false);
    expect(isCheckedFile('src/app/test/page.tsx')).toBe(true);
    expect(isCheckedFile('src/types/env.d.ts')).toBe(false);
    expect(isCheckedFile('src/app/globals.css')).toBe(false);
  });

  describe('checkDirectories', () => {
    let root;
    afterEach(() => rmSync(root, { recursive: true, force: true }));

    it('varre o diretório e ignora os testes', () => {
      root = mkdtempSync(path.join(tmpdir(), 'contracts-guard-'));
      mkdirSync(path.join(root, 'src/lib/__tests__'), { recursive: true });
      writeFileSync(
        path.join(root, 'src/lib/beta.ts'),
        "import { BETA_TERMS } from '@contracts/beta';\n",
      );
      writeFileSync(
        path.join(root, 'src/lib/ok.ts'),
        "import type { BetaMe } from '@contracts/beta';\n",
      );
      writeFileSync(
        path.join(root, 'src/lib/__tests__/beta.test.ts'),
        "import { BETA_TERMS } from '@contracts/beta';\n",
      );

      const violations = checkDirectories(['src'], root);
      expect(violations.map((v) => [v.fileName, v.line])).toEqual([
        [path.join('src', 'lib', 'beta.ts'), 1],
      ]);
    });
  });
});
