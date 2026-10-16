import { describe, expect, it } from 'vitest';
import { MailTemplateError, renderMailTemplate, type MailTemplate } from './mail-templates';

const context = { webPublicUrl: 'https://copiloto.servidortozato.cloud' };
const requestId = '7d3f2c1a-0b4e-4c8f-9a6d-2e5b7c9d1f30';
const encounterId = '0f8e6a4c-2b1d-4e3f-8a7b-9c6d5e4f3a21';

const TEST: MailTemplate = {
  name: 'test',
  params: { sentAt: new Date('2026-10-15T17:03:00.000Z') },
};
const NEW_REQUEST: MailTemplate = {
  name: 'mentoring_new_request',
  params: { path: `/mentoria/${requestId}` },
};
const ANSWER: MailTemplate = {
  name: 'mentoring_answer',
  params: { path: `/encounters/${encounterId}` },
};
const ALL_TEMPLATES = [TEST, NEW_REQUEST, ANSWER];

describe('renderMailTemplate', () => {
  it.each(ALL_TEMPLATES)('renders $name as text and minimal HTML in Portuguese', (template) => {
    const mail = renderMailTemplate(template, context);

    expect(mail.subject.length).toBeGreaterThan(0);
    expect(mail.text).toContain('Mensagem automática do Copiloto Clínico');
    expect(mail.html).toMatch(/^<!doctype html>\n<html lang="pt-BR">/);
    expect(mail.html).not.toMatch(/<script|<img|<style|https?:\/\/(?!copiloto\.servidortozato)/i);
    expect(`${mail.subject}${mail.text}${mail.html}`).not.toMatch(/undefined|null|\[object/);
  });

  it('dates the test e-mail in Brasília time', () => {
    const mail = renderMailTemplate(TEST, context);

    expect(mail.subject).toBe('Teste de envio do Copiloto Clínico');
    expect(mail.text).toContain('15/10/2026');
    expect(mail.text).toContain('14:03');
    expect(mail.text).toContain('(horário de Brasília)');
  });

  it('sends the mentor only a link to the request, never the case', () => {
    const mail = renderMailTemplate(NEW_REQUEST, context);
    const link = `https://copiloto.servidortozato.cloud/mentoria/${requestId}`;

    expect(mail.subject).toBe('Novo pedido de mentoria no Copiloto Clínico');
    expect(mail.text).toContain(`Abrir o pedido: ${link}`);
    expect(mail.html).toContain(`<a href="${link}">Abrir o pedido</a>`);
    expect(mail.text).toContain('o caso não vem neste e-mail');
  });

  it('sends the requester only a link to the case with the answer', () => {
    const mail = renderMailTemplate(ANSWER, context);

    expect(mail.subject).toBe('Seu pedido de mentoria foi respondido');
    expect(mail.text).toContain(
      `Ver a resposta: https://copiloto.servidortozato.cloud/encounters/${encounterId}`,
    );
  });

  it.each([
    'https://outro.site/phishing',
    '//outro.site/mentoria/1',
    'mentoria/1',
    '/mentoria/1?texto=dor+toracica',
    '/mentoria/1#x',
    '/mentoria/../admin',
    '/mentoria/<script>',
    '/',
    '',
  ])('refuses the link path %j', (path) => {
    expect(() =>
      renderMailTemplate({ name: 'mentoring_new_request', params: { path } }, context),
    ).toThrow(MailTemplateError);
  });
});
