import type { Metadata } from 'next';
import Link from 'next/link';
// Server Component: ícones da variante SSR do Phosphor (sem createContext).
import {
  ArrowLeft,
  CalendarBlank,
  Info,
  Scales,
  ShieldCheck,
  Users,
} from '@phosphor-icons/react/ssr';
import { Callout } from '@/components/ui/callout';
import { PropertyList, PropertyRow } from '@/components/ui/property-list';
import { PublicFooter, PublicHeader } from '../_components/public-chrome';

export const metadata: Metadata = {
  title: 'Política de Privacidade — Copiloto Clínico',
  description:
    'Como o Copiloto Clínico coleta, usa e protege seus dados conforme a LGPD (Lei nº 13.709/2018).',
  robots: { index: true, follow: true },
};

const LAST_UPDATED = '18 de junho de 2026';

/** Item de lista: `term` vira o início em negrito ("Dados de cadastro:"). */
interface PolicyItem {
  term?: string;
  text: string;
}

interface PolicySection {
  id: string;
  title: string;
  items: PolicyItem[];
}

const SECTIONS: PolicySection[] = [
  {
    id: 'dados-coletados',
    title: '1. Dados que coletamos',
    items: [
      {
        term: 'Dados de cadastro',
        text: 'nome, e-mail, CRM e especialidade (necessários para verificação profissional e cumprimento da Resolução CFM nº 2.314/2022 sobre responsabilidade médica em sistemas digitais).',
      },
      {
        term: 'Dados clínicos operacionais',
        text: 'descrição do caso, red flags marcadas, perguntas respondidas, recomendações e documentos gerados. Estes dados ficam vinculados à sua conta e à instituição de saúde quando aplicável.',
      },
      {
        term: 'Dados técnicos',
        text: 'endereço IP (com retenção mínima), user-agent, timestamps de sessão e logs de auditoria (necessários para rastreabilidade CFM e segurança da conta).',
      },
      {
        term: 'Identificadores de paciente (patientRef)',
        text: 'nunca solicitamos dados pessoais do paciente. Usamos apenas um identificador opaco (ex: número de prontuário) pseudonimizado automaticamente conforme LGPD Art. 13.',
      },
    ],
  },
  {
    id: 'base-legal',
    title: '2. Base legal e finalidade',
    items: [
      {
        text: 'Processamos seus dados com base no Art. 7º, V da LGPD (necessidade para execução de contrato) e Art. 11 (dados relativos à saúde, com consentimento explícito).',
      },
      {
        term: 'Finalidades',
        text: '(a) prestar o serviço de copiloto clínico; (b) cumprir obrigações regulatórias (CFM, LGPD); (c) garantir rastreabilidade e auditoria das decisões clínicas; (d) melhorar a qualidade do produto com métricas agregadas e anonimizadas.',
      },
    ],
  },
  {
    id: 'processamento-ia',
    title: '3. Processamento por IA',
    items: [
      {
        text: 'Ao consentir com o escopo "Processamento por IA", você autoriza que modelos de linguagem analisem os casos clínicos para gerar recomendações, documentos e perguntas de esclarecimento.',
      },
      {
        term: 'Defesa em profundidade (LGPD Art. 46)',
        text: 'aplicamos filtro automático de PII (CPF, telefone, e-mail, datas), redação explícita do identificador do paciente (mesmo se digitado no texto livre) e auditoria completa do raciocínio (cada decisão fica rastreável com hash imutável).',
      },
      {
        text: 'Você pode revogar este consentimento a qualquer momento em Configurações → Privacidade. A revogação interrompe novas análises por IA, mas preserva o histórico já auditado.',
      },
    ],
  },
  {
    id: 'seus-direitos',
    title: '4. Seus direitos (Art. 18, LGPD)',
    items: [
      { term: 'Confirmação e acesso', text: 'saiba quais dados temos sobre você.' },
      { term: 'Correção', text: 'atualize dados de cadastro no perfil.' },
      {
        term: 'Portabilidade (Art. 18, V)',
        text: 'exporte todos os seus dados em JSON pelas Configurações → Privacidade.',
      },
      {
        term: 'Revogação de consentimento',
        text: 'gerencie escopos individuais (processamento IA, compartilhamento, analytics).',
      },
      {
        term: 'Eliminação (Art. 18, VI — direito ao esquecimento)',
        text: 'exclua permanentemente conta e dados pelas Configurações → Privacidade. Ação irreversível.',
      },
    ],
  },
  {
    id: 'retencao',
    title: '5. Retenção e exclusão',
    items: [
      {
        term: 'Atendimentos e interações com IA',
        text: 'retidos enquanto a conta estiver ativa (rastreabilidade CFM).',
      },
      {
        term: 'Em caso de exclusão da conta',
        text: 'todos os atendimentos, documentos, interações IA, consentimentos e tokens de sessão são permanentemente removidos em até 30 dias.',
      },
      {
        text: 'Logs de auditoria essenciais à segurança podem ser mantidos por prazo adicional conforme obrigação legal, já anonimizados.',
      },
    ],
  },
];

const CONTACT_ID = 'contato';

const linkClass =
  'rounded-sm text-link underline decoration-current/40 underline-offset-4 transition-colors hover:decoration-current focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none';

export default function PrivacyPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <PublicHeader />

      <main className="flex-1 px-4 sm:px-6">
        <article className="mx-auto flex max-w-[720px] flex-col gap-8 pt-8 pb-20 md:pt-14">
          <header className="flex flex-col gap-4">
            <Link
              href="/register"
              className="-ml-1.5 inline-flex w-fit items-center gap-1.5 rounded-md px-1.5 py-1 text-sm text-muted-foreground transition-colors hover:bg-hover hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none max-sm:py-2.5"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              Voltar ao cadastro
            </Link>
            <ShieldCheck weight="duotone" className="-ml-0.5 size-14 text-tone-gray" aria-hidden="true" />
            <h1 className="font-display text-3xl text-balance text-foreground md:text-[2.5rem]">
              Política de Privacidade
            </h1>
            <PropertyList>
              <PropertyRow icon={CalendarBlank} label="Última atualização">
                {LAST_UPDATED}
              </PropertyRow>
              <PropertyRow icon={Users} label="Aplica-se a">
                Todos os usuários do Copiloto Clínico
              </PropertyRow>
              <PropertyRow icon={Scales} label="Normas">
                LGPD (Lei nº 13.709/2018) · Resolução CFM nº 2.314/2022
              </PropertyRow>
            </PropertyList>
          </header>

          <Callout tone="gray" icon={<Info weight="fill" />} className="text-[0.9375rem] leading-relaxed">
            O Copiloto Clínico está comprometido com a proteção dos seus dados pessoais e dos dados de
            saúde tratados na plataforma. Esta política descreve, em linguagem clara, como cumprimos a{' '}
            <strong className="font-semibold">Lei Geral de Proteção de Dados (Lei nº 13.709/2018)</strong> e
            a <strong className="font-semibold">Resolução CFM nº 2.314/2022</strong>.
          </Callout>

          {/* Bloco "Índice" do Notion */}
          <nav aria-labelledby="toc-title" className="flex flex-col">
            <p id="toc-title" className="pb-1.5 text-[0.8125rem] font-medium text-muted-foreground">
              Nesta página
            </p>
            <ol className="flex flex-col">
              {[...SECTIONS, { id: CONTACT_ID, title: '6. Contato' }].map((section) => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    className="-mx-1.5 block rounded-sm px-1.5 py-1 text-[0.9375rem] text-muted-foreground transition-colors hover:bg-hover hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none max-sm:py-2"
                  >
                    <span className="underline decoration-border underline-offset-4">{section.title}</span>
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <div className="flex flex-col gap-10 border-t border-border pt-10">
            {SECTIONS.map((section) => (
              <section key={section.id} aria-labelledby={section.id} className="flex flex-col gap-3">
                <h2
                  id={section.id}
                  className="scroll-mt-20 text-2xl font-semibold tracking-[-0.01em] text-foreground"
                >
                  {section.title}
                </h2>
                <ul className="flex list-disc flex-col gap-2 pl-6 text-base leading-relaxed text-foreground marker:text-muted-foreground">
                  {section.items.map((item) => (
                    <li key={item.text} className="pl-1 text-pretty">
                      {item.term ? <strong className="font-semibold">{item.term}:</strong> : null}{' '}
                      {item.text}
                    </li>
                  ))}
                </ul>
              </section>
            ))}

            <section aria-labelledby={CONTACT_ID} className="flex flex-col gap-3">
              <h2
                id={CONTACT_ID}
                className="scroll-mt-20 text-2xl font-semibold tracking-[-0.01em] text-foreground"
              >
                6. Contato
              </h2>
              <p className="text-base leading-relaxed text-pretty text-foreground">
                Para exercer qualquer direito previsto nesta política, reportar incidente de segurança
                ou tirar dúvidas sobre tratamento de dados, escreva para o Encarregado de Dados (DPO):
              </p>
              <p className="text-base text-foreground">
                E-mail:{' '}
                <a href="mailto:dpo@strivium.com.br" className={linkClass}>
                  dpo@strivium.com.br
                </a>
              </p>
              <p className="text-sm text-muted-foreground">
                Resposta em até 15 dias corridos, conforme Art. 19 da LGPD.
              </p>
            </section>

            <p className="border-t border-border pt-6 text-xs text-muted-foreground">
              © {new Date().getFullYear()} Strivium HealthTech · CNPJ 00.000.000/0001-00
            </p>
          </div>
        </article>
      </main>

      <PublicFooter />
    </div>
  );
}
