import type { ConfigService } from '@nestjs/config';
import { readBooleanFlag } from '../../config/feature-flag';
import { parseMailbox, type Mailbox } from './mail-address';

/**
 * CC-015 — configuração do e-mail, lida do ambiente no boot (o compose só
 * troca variável recriando o container, então não há o que reler a cada envio).
 *
 * Sem `SMTP_HOST`, nada é enviado: cada e-mail vira uma linha no log. Com
 * `SMTP_HOST` e alguma variável errada, também cai no log, com um WARN no boot
 * que diz QUAL variável (nunca o valor): melhor do que subir com um provedor
 * que recusaria todo envio.
 */

export interface SmtpSettings {
  host: string;
  port: number;
  /** TLS desde a conexão (porta 465). Falso = STARTTLS (porta 587). */
  secure: boolean;
  /** Null = servidor sem autenticação (ex.: Mailpit local). */
  auth: { user: string; pass: string } | null;
  from: Mailbox;
}

/** Nome da variável com problema; o valor nunca vai para o log. */
export type MailSettingsProblem =
  | 'SMTP_PORT'
  | 'SMTP_FROM'
  | 'SMTP_USER/SMTP_PASSWORD'
  | 'WEB_PUBLIC_URL';

export type MailSettings =
  | { channel: 'smtp'; smtp: SmtpSettings; webPublicUrl: string }
  | {
      channel: 'log';
      /** Vazio = SMTP não configurado, o caso normal em dev. */
      problems: MailSettingsProblem[];
      webPublicUrl: string;
    };

/** Base dos links quando só há log: os links não saem para ninguém. */
const DEV_WEB_PUBLIC_URL = 'http://localhost:3001';
const DEFAULT_SMTP_PORT = 587;
const SMTPS_PORT = 465;

export function readMailSettings(config: ConfigService): MailSettings {
  const host = readTrimmed(config, 'SMTP_HOST');
  const webPublicUrl = parseWebPublicUrl(readTrimmed(config, 'WEB_PUBLIC_URL'));

  if (!host) {
    return { channel: 'log', problems: [], webPublicUrl: webPublicUrl ?? DEV_WEB_PUBLIC_URL };
  }

  const problems: MailSettingsProblem[] = [];

  const port = parsePort(readTrimmed(config, 'SMTP_PORT'));
  if (port === null) problems.push('SMTP_PORT');

  const from = parseMailbox(readTrimmed(config, 'SMTP_FROM'));
  if (!from) problems.push('SMTP_FROM');

  // Senha não é aparada: espaço pode ser parte dela.
  const user = readTrimmed(config, 'SMTP_USER');
  const pass = config.get<string>('SMTP_PASSWORD') ?? '';
  if (Boolean(user) !== Boolean(pass)) problems.push('SMTP_USER/SMTP_PASSWORD');

  // Os links do e-mail apontam para o web; sem a base certa, sairiam quebrados.
  if (!webPublicUrl) problems.push('WEB_PUBLIC_URL');

  // Os três últimos testes repetem `problems`; estão aqui para estreitar o tipo.
  if (problems.length > 0 || port === null || !from || !webPublicUrl) {
    return { channel: 'log', problems, webPublicUrl: webPublicUrl ?? DEV_WEB_PUBLIC_URL };
  }

  return {
    channel: 'smtp',
    smtp: {
      host,
      port,
      secure: readBooleanFlag(config, 'SMTP_SECURE', port === SMTPS_PORT),
      auth: user ? { user, pass } : null,
      from,
    },
    webPublicUrl,
  };
}

function readTrimmed(config: ConfigService, key: string): string {
  const raw = config.get<string | number | undefined>(key);
  return raw === undefined || raw === null ? '' : String(raw).trim();
}

/** Vazio = 587 (submissão com STARTTLS), a porta que todo provedor aceita. */
function parsePort(raw: string): number | null {
  if (!raw) return DEFAULT_SMTP_PORT;
  if (!/^\d{1,5}$/.test(raw)) return null;
  const port = Number(raw);
  return port >= 1 && port <= 65535 ? port : null;
}

/** http(s), sem query nem fragmento; a barra final sai para o link não ficar `//`. */
function parseWebPublicUrl(raw: string): string | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (url.search || url.hash || url.username || url.password) return null;
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}
