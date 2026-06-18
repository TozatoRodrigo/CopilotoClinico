import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, ShieldCheck, Lock, Download, Trash, Eye } from '@phosphor-icons/react';

export const metadata: Metadata = {
  title: 'Política de Privacidade — Copiloto Clínico',
  description:
    'Como o Copiloto Clínico coleta, usa e protege seus dados conforme a LGPD (Lei nº 13.709/2018).',
  robots: { index: true, follow: true },
};

const LAST_UPDATED = '18 de junho de 2026';

const SECTIONS = [
  {
    icon: Eye,
    title: '1. Dados que coletamos',
    body: [
      'Dados de cadastro: nome, e-mail, CRM e especialidade (necessários para verificação profissional e cumprimento da Resolução CFM nº 2.314/2022 sobre responsabilidade médica em sistemas digitais).',
      'Dados clínicos operacionais: descrição do caso, red flags marcadas, perguntas respondidas, recomendações e documentos gerados. Estes dados ficam vinculados à sua conta e à instituição de saúde quando aplicável.',
      'Dados técnicos: endereço IP (com retenção mínima), user-agent, timestamps de sessão e logs de auditoria (necessários para rastreabilidade CFM e segurança da conta).',
      'Identificadores de paciente (patientRef): nunca solicitamos dados pessoais do paciente. Usamos apenas um identificador opaco (ex: número de prontuário) pseudonimizado automaticamente conforme LGPD Art. 13.',
    ],
  },
  {
    icon: ShieldCheck,
    title: '2. Base legal e finalidade',
    body: [
      'Processamos seus dados com base no Art. 7º, V da LGPD (necessidade para execução de contrato) e Art. 11 (dados relativos à saúde, com consentimento explícito).',
      'Finalidades: (a) prestar o serviço de copiloto clínico; (b) cumprir obrigações regulatórias (CFM, LGPD); (c) garantir rastreabilidade e auditoria das decisões clínicas; (d) melhorar a qualidade do produto com métricas agregadas e anonimizadas.',
    ],
  },
  {
    icon: Lock,
    title: '3. Processamento por IA',
    body: [
      'Ao consentir com o escopo "Processamento por IA", você autoriza que modelos de linguagem analisem os casos clínicos para gerar recomendações, documentos e perguntas de esclarecimento.',
      'Defesa em profundidade (LGPD Art. 46): aplicamos filtro automático de PII (CPF, telefone, e-mail, datas), redação explícita do identificador do paciente (mesmo se digitado no texto livre) e auditoria completa do raciocínio (cada decisão fica rastreável com hash imutável).',
      'Você pode revogar este consentimento a qualquer momento em Configurações → Privacidade. A revogação interrompe novas análises por IA, mas preserva o histórico já auditado.',
    ],
  },
  {
    icon: Download,
    title: '4. Seus direitos (Art. 18, LGPD)',
    body: [
      'Confirmação e acesso: saiba quais dados temos sobre você.',
      'Correção: atualize dados de cadastro no perfil.',
      'Portabilidade (Art. 18, V): exporte todos os seus dados em JSON pelas Configurações → Privacidade.',
      'Revogação de consentimento: gerencie escopos individuais (processamento IA, compartilhamento, analytics).',
      'Eliminação (Art. 18, VI — direito ao esquecimento): exclua permanentemente conta e dados pelas Configurações → Privacidade. Ação irreversível.',
    ],
  },
  {
    icon: Trash,
    title: '5. Retenção e exclusão',
    body: [
      'Atendimentos e interações com IA: retidos enquanto a conta estiver ativa (rastreabilidade CFM).',
      'Em caso de exclusão da conta: todos os atendimentos, documentos, interações IA, consentimentos e tokens de sessão são permanentemente removidos em até 30 dias.',
      'Logs de auditoria essenciais à segurança podem ser mantidos por prazo adicional conforme obrigação legal, já anonimizados.',
    ],
  },
];

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-background px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/register"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-clinical-teal"
        >
          <ArrowLeft className="size-4" weight="bold" />
          Voltar ao cadastro
        </Link>

        <header className="mt-6 space-y-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-6 text-clinical-teal" weight="duotone" />
            <h1 className="font-serif text-3xl font-normal tracking-tight text-foreground sm:text-4xl">
              Política de Privacidade
            </h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Última atualização: {LAST_UPDATED} · Aplicável a todos os usuários do Copiloto Clínico.
          </p>
        </header>

        <div className="mt-8 rounded-lg border border-clinical-teal/30 bg-clinical-teal/5 px-5 py-4">
          <p className="text-sm leading-relaxed text-foreground">
            O Copiloto Clínico está comprometido com a proteção dos seus dados pessoais e dos dados
            de saúde tratados na plataforma. Esta política descreve, em linguagem clara, como
            cumprimos a <strong>Lei Geral de Proteção de Dados (Lei nº 13.709/2018)</strong> e a{' '}
            <strong>Resolução CFM nº 2.314/2022</strong>.
          </p>
        </div>

        <div className="mt-8 space-y-8">
          {SECTIONS.map((section) => (
            <section key={section.title} className="space-y-3">
              <div className="flex items-center gap-2.5">
                <section.icon
                  className="size-5 shrink-0 text-clinical-teal"
                  weight="duotone"
                  aria-hidden="true"
                />
                <h2 className="text-lg font-semibold text-foreground">{section.title}</h2>
              </div>
              <ul className="space-y-2 pl-1">
                {section.body.map((item, idx) => (
                  <li
                    key={idx}
                    className="text-sm leading-relaxed text-muted-foreground marker:text-clinical-teal"
                    style={{ paddingLeft: '1rem', textIndent: '-0.75rem' }}
                  >
                    <span aria-hidden="true" className="text-clinical-teal">
                      •
                    </span>{' '}
                    <span className="ml-0.5">{item}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <section className="mt-12 space-y-3 border-t border-clinical-line pt-8">
          <h2 className="text-lg font-semibold text-foreground">6. Contato</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Para exercer qualquer direito previsto nesta política, reportar incidente de segurança
            ou tirar dúvidas sobre tratamento de dados, escreva para o Encarregado de Dados (DPO):
          </p>
          <p className="text-sm font-medium text-foreground">
            E-mail:{' '}
            <a
              href="mailto:dpo@strivium.com.br"
              className="text-clinical-teal underline underline-offset-4"
            >
              dpo@strivium.com.br
            </a>
          </p>
          <p className="text-xs text-muted-foreground">
            Resposta em até 15 dias corridos, conforme Art. 19 da LGPD.
          </p>
        </section>

        <footer className="mt-12 flex flex-col gap-3 border-t border-clinical-line pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} Strivium HealthTech · CNPJ 00.000.000/0001-00</span>
          <div className="flex gap-4">
            <Link
              href="/register"
              className="transition-colors hover:text-clinical-teal"
            >
              Cadastro
            </Link>
            <Link href="/login" className="transition-colors hover:text-clinical-teal">
              Login
            </Link>
          </div>
        </footer>
      </div>
    </main>
  );
}
