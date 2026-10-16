import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

/**
 * F0-A — Variante = um conjunto de overrides de ambiente aplicado ao pipeline
 * REAL (ex.: AI_PROVIDER/AI_MODEL para o bake-off de modelos, ou uma flag
 * futura de pipeline). O AiGatewayService lê a configuração no construtor, por
 * isso cada variante roda num contexto Nest novo.
 *
 * Valores aceitam `${VAR}`, resolvido contra o ambiente do processo — é assim
 * que uma variante usa uma chave sem que ela apareça no arquivo.
 */

const ENV_KEY = /^[A-Z][A-Z0-9_]*$/;

/**
 * O banco é escolhido pelo processo (e checado por db-safety.ts) antes de
 * qualquer variante; deixar uma variante trocá-lo contornaria a checagem.
 */
const FORBIDDEN_OVERRIDES: ReadonlySet<string> = new Set([
  'DATABASE_URL',
  'MIGRATION_DATABASE_URL',
]);

const VariantSchema = z
  .object({
    name: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'nome da variante em kebab-case'),
    description: z.string().trim().min(5),
    env: z.record(z.string().regex(ENV_KEY, 'variável de ambiente em MAIÚSCULAS'), z.string()),
  })
  .strict()
  .refine((variant) => Object.keys(variant.env).every((key) => !FORBIDDEN_OVERRIDES.has(key)), {
    message: 'variante não pode sobrescrever DATABASE_URL/MIGRATION_DATABASE_URL',
  });

const VariantsFileSchema = z
  .object({
    variants: z.array(VariantSchema).min(1),
  })
  .strict()
  .refine(
    (file) => new Set(file.variants.map((variant) => variant.name)).size === file.variants.length,
    { message: 'nomes de variante repetidos' },
  );

export type Variant = z.infer<typeof VariantSchema>;

const LOCAL_VARIANTS_FILE = join(__dirname, 'variants.json');
const EXAMPLE_VARIANTS_FILE = join(__dirname, 'variants.example.json');

/** `variants.json` (local, fora do git) tem precedência sobre o exemplo versionado. */
export function defaultVariantsFile(): string {
  return existsSync(LOCAL_VARIANTS_FILE) ? LOCAL_VARIANTS_FILE : EXAMPLE_VARIANTS_FILE;
}

export class VariantError extends Error {}

export function loadVariants(filePath: string): Variant[] {
  const parsed = VariantsFileSchema.safeParse(JSON.parse(readFileSync(filePath, 'utf-8')));
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(raiz)'}: ${issue.message}`)
      .join('\n');
    throw new VariantError(`${filePath} inválido:\n${issues}`);
  }
  return parsed.data.variants;
}

export function pickVariants(variants: Variant[], names: string[]): Variant[] {
  if (names.length === 0) {
    throw new VariantError(
      `Informe --variant (disponíveis: ${variants.map((variant) => variant.name).join(', ')}).`,
    );
  }
  return names.map((name) => {
    const variant = variants.find((candidate) => candidate.name === name);
    if (!variant) {
      throw new VariantError(
        `Variante "${name}" não existe (disponíveis: ${variants.map((v) => v.name).join(', ')}).`,
      );
    }
    return variant;
  });
}

const INTERPOLATION = /\$\{([A-Z][A-Z0-9_]*)\}/g;

export function resolveVariantEnv(
  variant: Variant,
  baseEnv: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  const missing = new Set<string>();
  const resolved = Object.fromEntries(
    Object.entries(variant.env).map(([key, template]) => [
      key,
      template.replace(INTERPOLATION, (_placeholder, name: string) => {
        const value = baseEnv[name];
        if (value === undefined || value === '') missing.add(name);
        return value ?? '';
      }),
    ]),
  );

  if (missing.size > 0) {
    throw new VariantError(
      `Variante "${variant.name}" precisa de ${[...missing].join(', ')} no ambiente.`,
    );
  }
  return resolved;
}

/**
 * CC-106 — o afunilamento mede a conversa do Copiloto guiado como em
 * produção: liga a leitura do caso (COPILOT_INTAKE=on), a menos que a
 * variante fixe outro valor — com `off`, o caso vai da abertura direto ao
 * plano, sem perguntas antes dele.
 */
export function withGuidedIntake(env: Record<string, string>): Record<string, string> {
  return { COPILOT_INTAKE: 'on', ...env };
}

// Pelo SUFIXO: AI_MAX_OUTPUT_TOKENS é configuração, ANTHROPIC_AUTH_TOKEN é segredo.
export const SECRET_KEY = /(?:KEY|TOKEN|SECRET|PASSWORD)$/;

/**
 * Para o run.json: guarda o MODELO do valor (`${ANTHROPIC_API_KEY}`), nunca o
 * valor resolvido. Valor literal em chave de segredo vira "[omitido]".
 */
export function redactVariantEnv(variant: Variant): Record<string, string> {
  return Object.fromEntries(
    Object.entries(variant.env).map(([key, template]) => {
      const isTemplate = template.search(INTERPOLATION) >= 0;
      if (!SECRET_KEY.test(key) || isTemplate) return [key, template];
      return [key, '[omitido]'];
    }),
  );
}

/**
 * Mesma ordem do ConfigModule da aplicação (`.env.local` antes de `.env`):
 * a checagem do banco precisa ver o mesmo DATABASE_URL que o Prisma vai usar.
 * `process.loadEnvFile` não sobrescreve o que já está no ambiente.
 */
export const ENV_FILE_PATHS = ['.env.local', '.env'];

export function loadDotEnvFiles(cwd: string = process.cwd()): string[] {
  const loaded: string[] = [];
  for (const file of ENV_FILE_PATHS) {
    const path = join(cwd, file);
    if (!existsSync(path)) continue;
    process.loadEnvFile(path);
    loaded.push(file);
  }
  return loaded;
}
