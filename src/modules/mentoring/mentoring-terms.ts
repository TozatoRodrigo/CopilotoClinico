import type { MentoringTerms } from '../../shared/contracts/clinical';

/**
 * CC-708 — termo da mentoria (teleinterconsulta, Res. CFM 2.314/2022).
 *
 * PROVISÓRIO: escrito pela engenharia para o piloto, até o parecer jurídico.
 * Quando o texto do advogado chegar, troque os parágrafos, gere uma VERSÃO
 * NOVA (nunca reaproveite a antiga: cada pedido grava a versão que foi
 * aceita) e mude `provisional` para `false`. O servidor recusa aceite de
 * versão diferente desta, então o médico com a tela aberta relê o termo novo.
 */
export const MENTORING_TERMS: MentoringTerms = {
  version: '2026-10-14-provisorio',
  provisional: true,
  requester: {
    title: 'Termo de teleinterconsulta — médico solicitante',
    paragraphs: [
      'Esta discussão é uma teleinterconsulta entre médicos (Res. CFM 2.314/2022): troca de opiniões para apoio diagnóstico ou terapêutico, sem contato do médico da equipe com o paciente.',
      'Não é para urgência. A resposta é assíncrona e pode levar horas. Em situação de urgência, siga o protocolo do seu serviço.',
      'Você continua sendo o médico responsável pelo paciente e pelas decisões do atendimento. A opinião do médico da equipe é um apoio, não uma conduta.',
      'O caso é enviado com dados identificáveis mascarados, junto com o plano da IA. Não escreva nome, documento, endereço ou outro dado que identifique o paciente na sua dúvida.',
      'O pedido, a versão deste termo e a resposta ficam registrados na trilha de auditoria do atendimento.',
    ],
  },
  mentor: {
    title: 'Termo de teleinterconsulta — médico da equipe',
    paragraphs: [
      'Sua resposta é uma opinião em teleinterconsulta (Res. CFM 2.314/2022), dada a partir do caso mascarado e do plano da IA, sem contato com o paciente.',
      'O médico solicitante segue responsável pelo paciente e pelas decisões. Escreva como apoio ao raciocínio dele, deixando claro o que depende de dado que você não tem.',
      'Não peça nem registre dado que identifique o paciente.',
      'Sua resposta, a versão deste termo e o momento do aceite ficam registrados na trilha de auditoria do atendimento.',
    ],
  },
};
