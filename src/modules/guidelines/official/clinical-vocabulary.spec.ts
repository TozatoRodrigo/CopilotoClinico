import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PILOT_CENARIOS } from './clinical-vocabulary';

const DRAFTS_DIR = join(process.cwd(), 'docs/guidelines/drafts');

function draftFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? draftFiles(path) : path.endsWith('.md') ? [path] : [];
  });
}

describe('PILOT_CENARIOS', () => {
  it('cobre todo cenário usado nos pacotes curados', () => {
    const used = new Set(
      draftFiles(DRAFTS_DIR).flatMap((file) =>
        [...readFileSync(file, 'utf-8').matchAll(/^cenario:\s*["']?([a-z_]+)["']?\s*$/gm)].map(
          (match) => match[1]!,
        ),
      ),
    );

    expect(used.size).toBeGreaterThan(0);
    expect(
      [...used].filter((cenario) => !(PILOT_CENARIOS as readonly string[]).includes(cenario)),
    ).toEqual([]);
  });
});
