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

const LAST_UPDATED = '14 de outubro de 2026';

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

// CC-010 — cada frase descreve o que o código faz hoje. Base legal, retenção
// da trilha de auditoria e a forma de citar os fornecedores dependem de
// revisão jurídica.
const SECTIONS: PolicySection[] = [
  {
    id: 'dados-coletados',
    title: '1. Dados que coletamos',
    items: [
      {
        term: 'Dados de cadastro',
        text: 'nome, e-mail, CRM (UF e número), idioma e senha, guardada só como hash. Com o segundo fator ativo, o segredo dele fica cifrado. Os dados servem à verificação profissional e ao cumprimento da Resolução CFM nº 2.314/2022 sobre responsabilidade médica em sistemas digitais.',
      },
      {
        term: 'Dados clínicos operacionais',
        text: 'descrição do caso e respostas às perguntas (gravadas já mascaradas, ver seção 3), red flags marcadas, análises, documentos gerados e editados, decisões e comentários sobre as recomendações e o texto mascarado dos anexos de referência (o arquivo em si não é gravado). Ficam vinculados à sua conta e, quando houver, à instituição do atendimento. Sem conexão, o caso fica no seu navegador, sem máscara, até ser enviado.',
      },
      {
        term: 'Dados técnicos',
        text: 'data e hora das sessões, a trilha de auditoria das suas ações e o endereço IP, gravado nessa trilha no cadastro, no login e no pedido de verificação de CRM, sem prazo de exclusão (ver seção 5). O servidor também mantém registros técnicos de erros e tempos de resposta.',
      },
      {
        term: 'Identificador do paciente (patientRef)',
        text: 'o atendimento identifica o paciente só por um código opaco e opcional, como o número de prontuário. O sistema recusa CPF e nome completo nesse campo e troca o código por um marcador no texto do caso antes de gravar a análise ou enviar a um modelo. O código fica gravado no atendimento e nos documentos que o exigem (prescrição, alta e atestado).',
      },
    ],
  },
  {
    id: 'base-legal',
    title: '2. Base legal e finalidade',
    items: [
      {
        text: 'Tratamos seus dados de cadastro e de uso da conta para executar o contrato de uso do serviço (Art. 7º, V da LGPD).',
      },
      {
        text: 'O caso clínico é dado relativo à saúde (Art. 11). O processamento por IA faz parte do serviço que você aceita no cadastro, junto com esta política, e você pode revogá-lo a qualquer momento (seção 3).',
      },
      {
        term: 'Finalidades',
        text: '(a) prestar o serviço de copiloto clínico; (b) cumprir obrigações regulatórias (CFM, LGPD); (c) garantir rastreabilidade e auditoria das decisões clínicas; (d) acompanhar uso, custo e qualidade do serviço: visitas por página contadas sem cookie, custo das chamadas de IA por conta e o feedback que você envia sobre as análises.',
      },
    ],
  },
  {
    id: 'processamento-ia',
    title: '3. Processamento por IA',
    items: [
      {
        text: 'O processamento por IA cobre a leitura do caso e as perguntas de esclarecimento, a análise, as reanálises e a transcrição do ditado. A busca por significado na consulta de diretrizes também usa IA. Os documentos (SOAP, SBAR, prescrição, alta e atestado) são montados a partir de uma análise já feita, sem nova chamada de IA.',
      },
      {
        term: 'O que vai a cada provedor',
        text: 'o caso e as respostas vão já mascarados aos provedores de modelos de linguagem contratados; a consulta de diretrizes, mascarada, vai ao provedor de busca por significado. O áudio do ditado vai ao serviço de transcrição como foi gravado (a máscara vale para o texto que volta) e não é guardado pelo sistema.',
      },
      {
        term: 'Defesa em profundidade (LGPD Art. 46)',
        text: 'antes de gravar ou enviar a um modelo, mascaramos CPF, CNPJ, CNS, RG, telefone, e-mail, CEP e datas de nascimento e trocamos o identificador do paciente por um marcador, mesmo se digitado no texto livre. Nomes de pessoas não são detectados: não escreva o nome do paciente. Cada análise fica gravada com o caso mascarado, a resposta do modelo e as fontes citadas, e a trilha de auditoria é encadeada por hash e só aceita inserção.',
      },
      {
        text: 'Você pode revogar o processamento por IA a qualquer momento em Configurações → Privacidade. Com ele revogado, o sistema recusa leitura do caso, perguntas, análise, reanálise e ditado antes de qualquer envio a um provedor de IA, inclusive as análises que ainda esperam na fila, e a consulta de diretrizes passa a buscar só por palavra-chave. O histórico já gravado e a geração de documentos a partir dele continuam disponíveis.',
      },
    ],
  },
  {
    id: 'seus-direitos',
    title: '4. Seus direitos (Art. 18, LGPD)',
    items: [
      {
        term: 'Confirmação e acesso',
        text: 'veja quais dados temos sobre você na exportação abaixo.',
      },
      {
        term: 'Correção',
        text: 'atualize nome e idioma no perfil. Para corrigir e-mail ou CRM, escreva ao Encarregado (seção 6).',
      },
      {
        term: 'Portabilidade (Art. 18, V)',
        text: 'em Configurações → Privacidade, exporte em JSON seu cadastro, atendimentos, conversas com o copiloto, análises, documentos, decisões e feedback sobre as recomendações, consentimentos e as entradas da trilha de auditoria feitas por você.',
      },
      {
        term: 'Revogação de consentimento',
        text: 'revogue ou conceda de novo o processamento por IA em Configurações → Privacidade. Os escopos "Compartilhamento de dados" e "Analytics" ficam registrados, mas hoje nenhum recurso depende deles.',
      },
      {
        term: 'Eliminação (Art. 18, VI — direito ao esquecimento)',
        text: 'em Configurações → Privacidade, apague seus atendimentos (com conversas, análises, documentos, anexos, decisões e feedback), consentimentos e sessões e anonimize nome, e-mail e senha. Ação irreversível. O que continua guardado está na seção 5.',
      },
    ],
  },
  {
    id: 'retencao',
    title: '5. Retenção e exclusão',
    items: [
      {
        term: 'Atendimentos, conversas, análises e documentos',
        text: 'ficam enquanto a conta existir; não há prazo automático de exclusão.',
      },
      {
        term: 'Na exclusão da conta',
        text: 'o apagamento descrito na seção 4 acontece na hora.',
      },
      {
        term: 'O que continua depois da exclusão',
        text: 'a trilha de auditoria (quem fez cada ação e quando, com o IP nos eventos da seção 1), que só aceita inserção e serve à rastreabilidade exigida pelo CFM; o registro técnico de cada chamada de IA, sem texto clínico; o CRM e os dados de segurança da conta (segundo fator, códigos de recuperação, bloqueio de login); os pedidos de verificação de CRM, os vínculos com instituições e os registros técnicos do servidor já escritos. Nada disso é anonimizado hoje.',
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
