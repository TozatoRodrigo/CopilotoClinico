/**
 * F0-A — O runner cria médico, atendimentos, interações e trilha de auditoria
 * no banco apontado por DATABASE_URL. Rodar contra produção poluiria dados
 * reais (e a cadeia de auditoria é append-only: não dá para limpar depois).
 *
 * Por isso só aceita banco local: localhost ou o nome do serviço/contêiner do
 * docker-compose de DESENVOLVIMENTO. `copiloto-db` é o nome em
 * docker-compose.prod.yml — fica de fora de propósito.
 */
export const LOCAL_DATABASE_HOSTS: ReadonlySet<string> = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  '[::1]',
  // docker/docker-compose.yml (serviço e container_name)
  'postgres',
  'copiloto-postgres',
  // docker/demo.docker-compose.yml
  'copiloto-demo-postgres',
]);

export interface DatabaseTarget {
  host: string;
  port: string;
  database: string;
  user: string;
}

export class UnsafeDatabaseError extends Error {}

export function describeDatabaseUrl(databaseUrl: string): DatabaseTarget {
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new UnsafeDatabaseError('DATABASE_URL não é uma URL válida.');
  }
  return {
    host: url.hostname,
    port: url.port || '5432',
    database: url.pathname.replace(/^\//, ''),
    user: decodeURIComponent(url.username),
  };
}

/** Texto para o terminal e o relatório — nunca inclui a senha. */
export function formatDatabaseTarget(target: DatabaseTarget): string {
  return `${target.user}@${target.host}:${target.port}/${target.database}`;
}

export function assertSafeDatabase(
  databaseUrl: string | undefined,
  options: { allowRemote: boolean },
): DatabaseTarget {
  if (!databaseUrl) {
    throw new UnsafeDatabaseError(
      'DATABASE_URL não definida. Aponte para o Postgres local (ver docs/evals/gabarito-clinico.md).',
    );
  }

  const target = describeDatabaseUrl(databaseUrl);
  if (LOCAL_DATABASE_HOSTS.has(target.host) || options.allowRemote) return target;

  throw new UnsafeDatabaseError(
    `DATABASE_URL aponta para "${target.host}", que não é um banco local. O gabarito cria ` +
      'atendimentos e registros de auditoria no banco. Use o Postgres do docker-compose de ' +
      'desenvolvimento, ou passe --allow-remote-db se tiver certeza de que não é produção.',
  );
}
