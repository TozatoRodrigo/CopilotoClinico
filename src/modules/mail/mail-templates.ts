/**
 * CC-015 — todo e-mail sai de um template desta lista. Não existe envio de
 * assunto ou corpo livre: é o que garante, por construção, que nenhum e-mail
 * leva texto clínico nem identificador de paciente. E-mail sai do nosso
 * controle (fica na caixa do destinatário, fora da trilha de auditoria e do
 * pedido de eliminação da LGPD), então o template leva no máximo um LINK para
 * a tela, que exige login, e nunca o conteúdo do caso.
 *
 * Template novo: um membro na união `MailTemplate`, um `case` em
 * `renderBlocks` e um teste em mail-templates.spec.ts. Parâmetro só do que for
 * seguro sair por e-mail (link, código de convite, números); nada que venha do
 * texto do caso.
 */

export type MailTemplate =
  /** Teste de envio pedido pelo admin (POST /admin/mail/test). */
  | { name: 'test'; params: { sentAt: Date } }
  /** CC-707 — aviso ao mentor de um pedido novo. `path` = `/mentoria/<id>`. */
  | { name: 'mentoring_new_request'; params: { path: string } }
  /** CC-707 — aviso ao médico de que o mentor respondeu. `path` = `/encounters/<id>`. */
  | { name: 'mentoring_answer'; params: { path: string } };

export type MailTemplateName = MailTemplate['name'];

export interface MailContent {
  subject: string;
  text: string;
  html: string;
}

export interface MailRenderContext {
  /** Endereço público do web, sem barra no fim (WEB_PUBLIC_URL). */
  webPublicUrl: string;
}

/** Parâmetro que o template recusa; o MailService registra como falha do envio. */
export class MailTemplateError extends Error {
  readonly code = 'invalid_template_params';

  constructor(template: MailTemplateName) {
    super(`Parâmetro inválido no template ${template}`);
    this.name = 'MailTemplateError';
  }
}

interface MailBlocks {
  subject: string;
  paragraphs: string[];
  action?: { label: string; path: string };
}

const FOOTER = 'Mensagem automática do Copiloto Clínico. Não responda: esta caixa não é lida.';

export function renderMailTemplate(
  template: MailTemplate,
  context: MailRenderContext,
): MailContent {
  const blocks = renderBlocks(template);
  const action = blocks.action
    ? { label: blocks.action.label, url: `${context.webPublicUrl}${blocks.action.path}` }
    : null;

  // Texto e HTML saem dos mesmos blocos, para nunca dizerem coisas diferentes.
  const text = [
    ...blocks.paragraphs,
    ...(action ? [`${action.label}: ${action.url}`] : []),
    `-- \n${FOOTER}`,
  ].join('\n\n');

  const html = [
    '<!doctype html>',
    '<html lang="pt-BR">',
    `<head><meta charset="utf-8"><title>${escapeHtml(blocks.subject)}</title></head>`,
    '<body style="font-family: Arial, Helvetica, sans-serif; font-size: 15px; line-height: 1.5;">',
    ...blocks.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`),
    ...(action
      ? [`<p><a href="${escapeHtml(action.url)}">${escapeHtml(action.label)}</a></p>`]
      : []),
    `<p style="font-size: 13px;">${escapeHtml(FOOTER)}</p>`,
    '</body>',
    '</html>',
  ].join('\n');

  return { subject: blocks.subject, text, html };
}

function renderBlocks(template: MailTemplate): MailBlocks {
  switch (template.name) {
    case 'test':
      return {
        subject: 'Teste de envio do Copiloto Clínico',
        paragraphs: [
          'Este é um e-mail de teste, pedido por um administrador do Copiloto Clínico.',
          'Se ele chegou à caixa de entrada, e não ao spam, o envio de e-mail está configurado. ' +
            `Enviado em ${formatBrasiliaTime(template.params.sentAt)} (horário de Brasília).`,
        ],
      };
    case 'mentoring_new_request':
      return {
        subject: 'Novo pedido de mentoria no Copiloto Clínico',
        paragraphs: [
          'Um médico da equipe pediu para discutir um caso com um mentor.',
          'Por segurança, o caso não vem neste e-mail. Entre no Copiloto Clínico para ver o pedido e assumi-lo.',
        ],
        action: { label: 'Abrir o pedido', path: safePath(template.name, template.params.path) },
      };
    case 'mentoring_answer':
      return {
        subject: 'Seu pedido de mentoria foi respondido',
        paragraphs: [
          'Um mentor da equipe respondeu ao caso que você enviou para discussão.',
          'Por segurança, a resposta não vem neste e-mail: ela está no próprio caso, no Copiloto Clínico.',
        ],
        action: { label: 'Ver a resposta', path: safePath(template.name, template.params.path) },
      };
  }
}

/**
 * Caminho relativo ao web, em segmentos simples (`/mentoria/<uuid>`). Recusa
 * `//host`, esquema, query e qualquer caractere fora de [A-Za-z0-9_-]: o link
 * sempre aponta para o nosso domínio e nada de texto livre entra nele.
 */
const SAFE_PATH = /^(?:\/[A-Za-z0-9_-]+)+$/;

function safePath(template: MailTemplateName, path: string): string {
  if (!SAFE_PATH.test(path)) throw new MailTemplateError(template);
  return path;
}

const BRASILIA_TIME = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function formatBrasiliaTime(date: Date): string {
  return BRASILIA_TIME.format(date);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
