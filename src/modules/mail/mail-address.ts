/**
 * CC-015 — endereços de e-mail: validação antes de entregar ao provedor e
 * máscara para o log.
 */

/** Limite do RFC 5321 para um caminho de endereço. */
const MAX_ADDRESS_LENGTH = 254;

/**
 * Um endereço só, sem nome nem lista. Recusa vírgula, ponto e vírgula, `<>`,
 * aspas, parênteses e espaço: o parser de endereços do nodemailer teve várias
 * falhas com comentários e listas (avisos de 2025–2026), e um endereço vindo
 * do banco com um desses caracteres nunca é um destinatário legítimo aqui.
 */
const SINGLE_ADDRESS = /^[^\s@<>()[\]",;:\\]+@[^\s@<>()[\]",;:\\]+\.[^\s@<>()[\]",;:\\.]+$/;

export function isValidMailAddress(address: string): boolean {
  return address.length <= MAX_ADDRESS_LENGTH && SINGLE_ADDRESS.test(address);
}

/**
 * Máscara para log: primeira letra do usuário e do domínio, o resto do
 * domínio (`.com.br`) fica. Basta para saber que provedor recusou, sem
 * deixar o endereço legível (dado pessoal do médico).
 *
 * `rodrigo@strivium.com.br` → `r***@s***.com.br`; inválido → `***`.
 */
export function maskMailAddress(address: string): string {
  const trimmed = address.trim();
  const at = trimmed.lastIndexOf('@');
  if (at <= 0 || at === trimmed.length - 1) return '***';

  const local = trimmed.slice(0, at);
  const [firstLabel, ...rest] = trimmed.slice(at + 1).split('.');
  if (!firstLabel) return '***';

  const suffix = rest.length > 0 ? `.${rest.join('.')}` : '';
  return `${firstChar(local)}***@${firstChar(firstLabel)}***${suffix}`;
}

function firstChar(value: string): string {
  // Array.from não parte um caractere fora do BMP ao meio.
  return Array.from(value)[0] ?? '';
}

export interface Mailbox {
  name: string;
  address: string;
}

/** `Nome <endereco@dominio>` ou `endereco@dominio`. */
const MAILBOX = /^(?:"?([^"<>\r\n]*?)"?\s*<([^<>\s]+)>|([^<>\s]+))$/;

/**
 * Lê o remetente de `SMTP_FROM`. `null` quando não é um remetente válido: o
 * provedor recusaria todo envio, e é melhor saber disso no boot.
 */
export function parseMailbox(raw: string): Mailbox | null {
  const match = MAILBOX.exec(raw.trim());
  if (!match) return null;

  const name = (match[1] ?? '').trim();
  const address = match[2] ?? match[3] ?? '';
  return isValidMailAddress(address) ? { name, address } : null;
}
