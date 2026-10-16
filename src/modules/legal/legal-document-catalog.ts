import type { LegalDocumentSection, LegalDocumentType } from '../../shared/contracts/legal';

/**
 * CC-905 — textos dos documentos legais, versionados no código. Uma versão só
 * vale depois que um ADMIN a publica no console (POST /admin/legal/documents):
 * a publicação copia o texto e o hash para `legal_documents`, e quem não
 * aceitou a vigente vê a tela de aceite no próximo acesso.
 *
 * PROVISÓRIO: escritos pela engenharia a partir do que o código faz hoje e do
 * que as frentes em andamento (ferramentas, cartões, mentoria, beta) vão
 * fazer, até o parecer jurídico (CC-006). Quando o texto do advogado chegar,
 * acrescente uma VERSÃO NOVA (nunca edite uma já publicada: o publish recusa
 * texto diferente com a mesma versão, e o teste de hash do catálogo falha),
 * com `provisional: false`, e publique pelo console.
 */
export interface LegalDocumentDraft {
  type: LegalDocumentType;
  version: string;
  title: string;
  provisional: boolean;
  /** O que mudou desde a versão anterior; no primeiro aceite, o resumo. */
  changeSummary: readonly string[];
  sections: readonly LegalDocumentSection[];
}

const TERMS_OF_USE_V2: LegalDocumentDraft = {
  type: 'terms_of_use',
  version: '2026-10-15-v2-provisorio',
  title: 'Termos de Uso do Copiloto Clínico',
  provisional: true,
  changeSummary: [
    'Passam a cobrir as ferramentas de beira-leito (calculadoras, escores, infusões e roteiros), inclusive sem conexão.',
    'Passam a cobrir os cartões clínicos revisados por médicos que aparecem junto da análise.',
    'Passam a cobrir a mentoria com médicos da equipe, que tem termo próprio a cada pedido.',
    'Passam a cobrir o beta por convite: o que pode mudar e como a equipe entra em contato.',
  ],
  sections: [
    {
      heading: '1. O que é o Copiloto Clínico',
      paragraphs: [
        'O Copiloto Clínico é uma ferramenta de apoio à decisão para médicos com CRM ativo, usada durante o atendimento. Reúne a análise de casos por inteligência artificial, as ferramentas de beira-leito, os cartões clínicos revisados e a mentoria com médicos da equipe.',
        'Nenhuma dessas funções substitui o seu julgamento, o exame do paciente nem o protocolo do seu serviço. Você é o responsável pelo paciente e por cada decisão do atendimento.',
      ],
    },
    {
      heading: '2. Sua conta',
      paragraphs: [
        'A conta é pessoal e exige CRM. Até a verificação do CRM, os documentos gerados levam o selo de CRM pendente.',
        'Não compartilhe a senha nem o segundo fator de autenticação. Se suspeitar de acesso indevido, troque a senha e avise pelo contato da seção 10.',
      ],
    },
    {
      heading: '3. Análise de casos por IA',
      paragraphs: [
        'As análises, perguntas e documentos sugeridos por IA são apoio à decisão e podem errar, omitir conduta ou citar fonte de forma incompleta. Confira doses, contraindicações e o protocolo do seu serviço antes de aplicar qualquer sugestão.',
        'Os documentos gerados trazem o registro de uso de IA. Revise e confirme cada documento antes de usá-lo; o documento confirmado é seu.',
      ],
    },
    {
      heading: '4. Ferramentas de beira-leito',
      paragraphs: [
        'Calculadoras, escores, classificações, infusões e roteiros de atendimento trazem a fonte e a versão do conteúdo. O resultado depende dos valores que você digita: confira unidade, peso e cada entrada antes de usar.',
        'Parte das ferramentas funciona sem conexão. Sem conexão, vale o conteúdo da última atualização guardada no aparelho.',
      ],
    },
    {
      heading: '5. Cartões clínicos revisados',
      paragraphs: [
        'Cartões são resumos clínicos escritos a partir de fontes citadas e revisados por médicos, com a data da revisão. Podem aparecer junto da análise do caso.',
        'Um cartão é referência, não protocolo do seu serviço. Se um cartão estiver errado ou desatualizado, avise a equipe pelo feedback do aplicativo.',
      ],
    },
    {
      heading: '6. Mentoria com médicos da equipe',
      paragraphs: [
        'A mentoria é uma teleinterconsulta entre médicos (Res. CFM nº 2.314/2022): você envia o caso, já mascarado, com o plano da IA e recebe a opinião de um médico da equipe. É assíncrona e não serve para urgência.',
        'Cada pedido tem termo próprio, aceito no momento do pedido. Você continua responsável pelo paciente e pelas decisões.',
      ],
    },
    {
      heading: '7. Beta',
      paragraphs: [
        'Algumas funções são liberadas primeiro para um grupo fechado de médicos convidados. No beta, funções podem mudar, falhar ou sair do ar sem aviso, e quem entra por convite aceita também o termo do beta.',
        'Durante o beta, a equipe pode escrever para o e-mail da sua conta para entender como você usa o produto e pedir sua opinião.',
      ],
    },
    {
      heading: '8. Dados do paciente',
      paragraphs: [
        'Não escreva nome, CPF, telefone, endereço ou outro dado que identifique o paciente. O sistema mascara parte desses dados antes de gravar ou enviar o caso a um modelo, mas não detecta nomes de pessoas.',
        'O tratamento de dados está na Política de Privacidade, que faz parte destes termos.',
      ],
    },
    {
      heading: '9. O que não é permitido',
      paragraphs: [
        'Usar a conta de outra pessoa ou ceder a sua; tentar acessar dados de outros médicos; copiar o conteúdo das ferramentas e dos cartões para redistribuir; contornar limites de uso ou a segurança do sistema.',
      ],
    },
    {
      heading: '10. Mudanças nestes termos e contato',
      paragraphs: [
        'Quando estes termos ou a Política de Privacidade mudarem, publicamos uma versão nova e pedimos um novo aceite no seu próximo acesso, com o resumo do que mudou. A versão aceita e a data ficam registradas na sua conta e entram na exportação dos seus dados.',
        'Dúvidas sobre estes termos: dpo@strivium.com.br.',
      ],
    },
  ],
};

/**
 * Parte da política reescrita na PR #181 (o que o código faz hoje) e soma as
 * frentes novas. Afirmações sobre ferramentas, cartões, mentoria e beta seguem
 * o desenho dessas frentes (ADR-017, CC-402, CC-707, CC-702): confira de novo
 * antes de publicar.
 */
const PRIVACY_POLICY_V2: LegalDocumentDraft = {
  type: 'privacy_policy',
  version: '2026-10-15-v2-provisorio',
  title: 'Política de Privacidade do Copiloto Clínico',
  provisional: true,
  changeSummary: [
    'Diz que os valores digitados nas ferramentas de beira-leito ficam no seu aparelho.',
    'Explica o que vai aos médicos da equipe na mentoria e o que fica registrado de quem revisa cartões.',
    'Inclui os dados do beta: lote do convite, perfil mínimo, lista de espera e contato por e-mail.',
    'O aceite destes documentos (versão e data) entra na exportação dos seus dados.',
  ],
  sections: [
    {
      heading: '1. Dados que coletamos',
      paragraphs: [
        'Cadastro: nome, e-mail, CRM (UF e número), idioma e senha, guardada só como hash. Com o segundo fator ativo, o segredo dele fica cifrado. Servem à verificação profissional e às normas do CFM sobre responsabilidade médica em sistemas digitais.',
        'Dados clínicos operacionais: descrição do caso e respostas às perguntas (gravadas já mascaradas, ver seção 3), red flags, análises, documentos gerados e editados, decisões e comentários sobre as recomendações. Ficam vinculados à sua conta e, quando houver, à instituição do atendimento.',
        'Dados técnicos: data e hora das sessões, a trilha de auditoria das suas ações e o endereço IP gravado nessa trilha no cadastro, no login e no pedido de verificação de CRM. O servidor também mantém registros técnicos de erros e tempos de resposta, sem texto clínico.',
        'Identificador do paciente: o atendimento identifica o paciente só por um código opaco e opcional, como o número de prontuário, trocado por um marcador antes de a análise ser gravada ou enviada a um modelo.',
      ],
    },
    {
      heading: '2. Base legal e finalidade',
      paragraphs: [
        'Tratamos os dados de cadastro e de uso da conta para executar o contrato de uso do serviço (Art. 7º, V, da LGPD). O caso clínico é dado relativo à saúde (Art. 11) e é tratado para prestar o serviço que você usa.',
        'Finalidades: prestar o serviço; cumprir obrigações regulatórias (CFM, LGPD); manter a rastreabilidade das decisões clínicas; acompanhar uso, custo e qualidade com dados agregados.',
      ],
    },
    {
      heading: '3. Processamento por IA',
      paragraphs: [
        'A leitura do caso, as perguntas de esclarecimento, a análise e a transcrição do ditado usam provedores de IA contratados. Antes de gravar ou enviar, mascaramos CPF, CNPJ, CNS, RG, telefone, e-mail, CEP, datas de nascimento e o identificador do paciente. Nomes de pessoas não são detectados: não escreva o nome do paciente.',
        'Você pode revogar o processamento por IA em Configurações → Privacidade. O histórico já gravado continua disponível.',
        'Os provedores de IA, de hospedagem e de monitoramento de erros podem estar fora do Brasil. A lista de suboperadores, a região e a base legal da transferência internacional constarão da versão final desta política.',
      ],
    },
    {
      heading: '4. Ferramentas de beira-leito',
      paragraphs: [
        'Os cálculos das ferramentas rodam no seu aparelho. Os valores que você digita não são enviados ao servidor nem a provedor de IA, e os favoritos ficam só no aparelho.',
      ],
    },
    {
      heading: '5. Cartões clínicos revisados',
      paragraphs: [
        'Se você revisa cartões, guardamos a sua decisão sobre cada versão, a data, o comentário (já mascarado) e o tempo da revisão. O cartão publicado mostra que foi revisado e quando.',
      ],
    },
    {
      heading: '6. Mentoria',
      paragraphs: [
        'Ao pedir mentoria, o caso mascarado, o plano da IA e a sua pergunta (também mascarada) vão aos médicos da equipe. A resposta fica no próprio caso. O pedido, a versão do termo aceito e a resposta ficam registrados e entram na exportação dos seus dados.',
      ],
    },
    {
      heading: '7. Beta',
      paragraphs: [
        'Se você entrou por convite, guardamos de qual lote veio o convite, o aceite do termo do beta e o perfil mínimo que você informou (formação, tipo de serviço, UF e capital ou interior).',
        'Quem pede para entrar sem convite fica na lista de espera com o e-mail, o perfil opcional e o consentimento para contato; a entrada é apagada a pedido.',
      ],
    },
    {
      heading: '8. Seus direitos (Art. 18 da LGPD)',
      paragraphs: [
        'Em Configurações → Privacidade, exporte seus dados em JSON (cadastro, atendimentos, conversas com o copiloto, análises, documentos, decisões, feedback, consentimentos, aceites destes documentos e as entradas da trilha de auditoria feitas por você), revogue o processamento por IA ou elimine a conta.',
        'Esses direitos continuam disponíveis mesmo antes de você aceitar uma versão nova destes documentos.',
        'Para corrigir e-mail ou CRM, escreva ao Encarregado (seção 10).',
      ],
    },
    {
      heading: '9. Retenção e exclusão',
      paragraphs: [
        'Atendimentos, conversas, análises e documentos ficam enquanto a conta existir. Na eliminação da conta, apagamos atendimentos, consentimentos, aceites e sessões e anonimizamos nome, e-mail e senha na hora.',
        'Continuam depois da eliminação: a trilha de auditoria, que só aceita inserção e serve à rastreabilidade exigida pelo CFM; o registro técnico das chamadas de IA, sem texto clínico; o CRM e os dados de segurança da conta.',
      ],
    },
    {
      heading: '10. Contato',
      paragraphs: [
        'Para exercer qualquer direito, reportar incidente ou tirar dúvidas, escreva ao Encarregado de Dados: dpo@strivium.com.br. Resposta em até 15 dias, conforme o Art. 19 da LGPD.',
      ],
    },
  ],
};

export const LEGAL_DOCUMENT_CATALOG: readonly LegalDocumentDraft[] = [
  TERMS_OF_USE_V2,
  PRIVACY_POLICY_V2,
];

export function findLegalDocumentDraft(
  type: LegalDocumentType,
  version: string,
): LegalDocumentDraft | undefined {
  return LEGAL_DOCUMENT_CATALOG.find((draft) => draft.type === type && draft.version === version);
}
