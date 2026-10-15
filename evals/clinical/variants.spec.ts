import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Test } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it } from 'vitest';
import { readReasoningMode } from '../../src/modules/copilot/understanding/understanding.settings';
import {
  loadVariants,
  pickVariants,
  redactVariantEnv,
  resolveVariantEnv,
  SECRET_KEY,
  VariantError,
  type Variant,
} from './variants';

const claude: Variant = {
  name: 'claude-opus-5-5',
  description: 'Opus 5.5',
  env: {
    AI_PROVIDER: 'anthropic',
    AI_MODEL: 'claude-opus-5-5',
    AI_API_KEY: '${ANTHROPIC_API_KEY}',
  },
};

// O arquivo versionado — `defaultVariantsFile()` prefere o variants.json local
// (fora do git) quando existe, o que tornaria o teste dependente da máquina.
const VERSIONED_VARIANTS_FILE = join(__dirname, 'variants.example.json');

describe('variantes versionadas', () => {
  it('trazem baseline, os dois Claude e a variante offline', () => {
    const names = loadVariants(VERSIONED_VARIANTS_FILE).map((variant) => variant.name);
    expect(names).toEqual(
      expect.arrayContaining(['baseline', 'claude-sonnet-5-5', 'claude-opus-5-5', 'test']),
    );
  });

  // F1 — cada Claude tem o par legacy × stages, iguais exceto pela flag, para
  // a comparação caso a caso da ADR-013.
  it('trazem o par legacy × stages de cada Claude, diferentes só na Etapa 1', () => {
    const variants = loadVariants(VERSIONED_VARIANTS_FILE);
    for (const name of ['claude-sonnet-5-5', 'claude-opus-5-5']) {
      const legacy = variants.find((variant) => variant.name === name);
      const stages = variants.find((variant) => variant.name === `${name}-stages`);

      expect(legacy?.env.COPILOT_REASONING).toBe('legacy');
      expect(stages?.env).toEqual({
        ...legacy?.env,
        COPILOT_REASONING: 'stages',
        AI_UNDERSTANDING_EFFORT: 'low',
      });
    }
  });

  // F1 — PR 2 da ADR-013: as variantes da decisão v2 medem o produto 100%
  // Anthropic — nenhuma delas pode depender da OpenAI.
  it('trazem as variantes da decisão v2, sem embedding nem chave da OpenAI', () => {
    const variants = loadVariants(VERSIONED_VARIANTS_FILE);
    const byName = (name: string) => variants.find((variant) => variant.name === name)?.env;
    const modelOnly = byName('claude-opus-5-5-v2-modelo');
    const web = byName('claude-opus-5-5-v2-web');

    expect(modelOnly).toMatchObject({
      AI_MODEL: 'claude-opus-5-5',
      COPILOT_REASONING: 'stages',
      COPILOT_DECISION_PROMPT: 'v2',
      COPILOT_KNOWLEDGE_SOURCE: 'model_only',
    });
    expect(web).toMatchObject({
      AI_MODEL: 'claude-opus-5-5',
      COPILOT_REASONING: 'stages',
      COPILOT_DECISION_PROMPT: 'v2',
      COPILOT_KNOWLEDGE_SOURCE: 'web',
      AI_RESEARCH_MODEL: 'claude-sonnet-5-5',
    });
    expect(byName('claude-haiku-5-5-v2-modelo')).toMatchObject({
      AI_MODEL: 'claude-haiku-5-5',
      AI_UNDERSTANDING_MODEL: 'claude-haiku-5-5',
      COPILOT_KNOWLEDGE_SOURCE: 'model_only',
    });
    expect(byName('claude-opus-5-5-v2-web-entendimento-haiku')).toEqual({
      ...web,
      AI_UNDERSTANDING_MODEL: 'claude-haiku-5-5',
    });

    for (const variant of variants.filter((candidate) => candidate.name.includes('-v2-'))) {
      expect(Object.keys(variant.env).filter((key) => /EMBEDDING|OPENAI/.test(key))).toEqual([]);
      expect(() => resolveVariantEnv(variant, { ANTHROPIC_API_KEY: 'sk-ant-x' })).not.toThrow();
    }
  });

  // CC-408 — a variante com cartões é a v3-modelo mais a flag e o embedding
  // da busca nos cartões: a comparação caso a caso mede só o efeito dos cartões.
  it('trazem a v3-modelo com cartões revisados, diferente só nos cartões', () => {
    const variants = loadVariants(VERSIONED_VARIANTS_FILE);
    const byName = (name: string) => variants.find((variant) => variant.name === name);
    const base = byName('claude-opus-5-5-v3-modelo');
    const cards = byName('claude-opus-5-5-v3-modelo-cartoes');

    expect(cards?.env).toEqual({
      ...base?.env,
      COPILOT_REVIEWED_CARDS: 'on',
      EMBEDDING_PROVIDER: 'openai',
      EMBEDDING_BASE_URL: '${EMBEDDING_BASE_URL}',
      EMBEDDING_API_KEY: '${EMBEDDING_API_KEY}',
      AI_EMBEDDING_MODEL: '${AI_EMBEDDING_MODEL}',
    });
    expect(() => resolveVariantEnv(cards!, { ANTHROPIC_API_KEY: 'sk-ant-x' })).toThrow(
      /EMBEDDING_BASE_URL/,
    );
  });

  it('não guardam nenhuma chave literal', () => {
    for (const variant of loadVariants(VERSIONED_VARIANTS_FILE)) {
      for (const [key, value] of Object.entries(variant.env)) {
        if (SECRET_KEY.test(key) && variant.name !== 'test')
          expect(value).toMatch(/^\$\{[A-Z_]+\}$/);
      }
    }
  });
});

describe('resolveVariantEnv', () => {
  it('resolve ${VAR} contra o ambiente', () => {
    expect(resolveVariantEnv(claude, { ANTHROPIC_API_KEY: 'sk-ant-x' }).AI_API_KEY).toBe(
      'sk-ant-x',
    );
  });

  it('falha nomeando a variável ausente', () => {
    expect(() => resolveVariantEnv(claude, {})).toThrow(/ANTHROPIC_API_KEY/);
  });
});

describe('redactVariantEnv', () => {
  it('guarda o modelo do valor e omite segredo literal', () => {
    const redacted = redactVariantEnv({
      ...claude,
      env: { ...claude.env, JUDGE_TOKEN: 'literal', AI_MAX_OUTPUT_TOKENS: '32000' },
    });
    expect(redacted.AI_API_KEY).toBe('${ANTHROPIC_API_KEY}');
    expect(redacted.JUDGE_TOKEN).toBe('[omitido]');
    expect(redacted.AI_MODEL).toBe('claude-opus-5-5');
    expect(redacted.AI_MAX_OUTPUT_TOKENS).toBe('32000');
  });
});

describe('loadVariants', () => {
  let dir: string | undefined;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  function fileWith(content: unknown): string {
    dir = mkdtempSync(join(tmpdir(), 'variantes-'));
    const path = join(dir, 'variants.json');
    writeFileSync(path, JSON.stringify(content));
    return path;
  }

  it('recusa variante que troca o banco (contornaria a checagem de banco local)', () => {
    const path = fileWith({
      variants: [
        {
          name: 'perigosa',
          description: 'troca o banco',
          env: { DATABASE_URL: 'postgres://prod' },
        },
      ],
    });
    expect(() => loadVariants(path)).toThrow(VariantError);
  });

  it('exige --variant e nome existente', () => {
    expect(() => pickVariants([claude], [])).toThrow(/--variant/);
    expect(() => pickVariants([claude], ['nao-existe'])).toThrow(/não existe/);
  });
});

/**
 * O EvalModule depende disto para aplicar a variante: no @nestjs/config 4, o
 * que vem de `load` vence o process.env. Se uma atualização inverter a
 * precedência, a variante rodaria silenciosamente com o modelo do .env.
 */
describe('precedência de configuração usada pelo EvalModule', () => {
  it('valor de `load` vence o process.env', async () => {
    process.env.AI_MODEL_PRECEDENCE_CHECK = 'do-ambiente';
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          ignoreEnvFile: true,
          load: [() => ({ AI_MODEL_PRECEDENCE_CHECK: 'da-variante' })],
        }),
      ],
    }).compile();

    expect(moduleRef.get(ConfigService).get('AI_MODEL_PRECEDENCE_CHECK')).toBe('da-variante');
    delete process.env.AI_MODEL_PRECEDENCE_CHECK;
  });

  it('a variante liga o raciocínio em etapas mesmo com o .env em legacy', async () => {
    process.env.COPILOT_REASONING = 'legacy';
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          ignoreEnvFile: true,
          load: [() => ({ COPILOT_REASONING: 'stages' })],
        }),
      ],
    }).compile();

    expect(readReasoningMode(moduleRef.get(ConfigService))).toBe('stages');
    delete process.env.COPILOT_REASONING;
  });
});
