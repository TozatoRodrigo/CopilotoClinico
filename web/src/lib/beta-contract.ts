/**
 * CC-702 — espelho dos VALORES de src/shared/contracts/beta.ts que o web usa
 * em runtime (constantes, rótulos, termo do beta e o formato do código).
 *
 * A imagem do web (docker/Dockerfile.web) copia só `web/`: de `@contracts/*`
 * o web importa só tipos. Mudou lá, muda aqui — tests/web-mirrors/beta.spec.ts
 * (raiz) falha se as duas cópias divergirem. Os tipos continuam vindo de
 * `@contracts/beta` com `import type`.
 */

// ── Código de convite ───────────────────────────────────────────────────────

export const BETA_INVITE_QUERY_PARAM = 'convite';

export const INVITE_CODE_LENGTH = 8;

export function normalizeInviteCode(input: string): string {
  return input.toUpperCase().replace(/[^0-9A-Z]/g, '');
}

export function formatInviteCode(code: string): string {
  const normalized = normalizeInviteCode(code);
  if (normalized.length !== INVITE_CODE_LENGTH) return normalized;
  const half = INVITE_CODE_LENGTH / 2;
  return `${normalized.slice(0, half)}-${normalized.slice(half)}`;
}

export const BETA_INVITE_PROBLEM_MESSAGES = {
  not_found: 'Código de convite não encontrado. Confira as letras e os números.',
  revoked: 'Este convite foi cancelado. Peça um novo a quem o enviou.',
  expired: 'Este convite venceu. Peça um novo a quem o enviou.',
  exhausted: 'Este convite já foi usado. Peça um novo a quem o enviou.',
} as const;

// ── Erros do cadastro (403 com `code` próprio) ──────────────────────────────

export const BETA_INVITE_REQUIRED = 'BETA_INVITE_REQUIRED' as const;
export const BETA_INVITE_INVALID = 'BETA_INVITE_INVALID' as const;

// ── Perfil mínimo ───────────────────────────────────────────────────────────

export const BETA_TRAINING_VALUES = [
  'recem_formado',
  'sem_residencia',
  'em_residencia',
  'especialista',
] as const;

export const BETA_TRAINING_LABELS = {
  recem_formado: 'Formado há menos de 2 anos, sem residência',
  sem_residencia: 'Formado há 2 anos ou mais, sem residência',
  em_residencia: 'Em residência',
  especialista: 'Com residência ou título de especialista',
} as const;

export const BETA_FACILITY_TYPES = [
  'upa_porte_1',
  'upa_porte_2',
  'upa_porte_3',
  'ps_hospital',
  'hospital_com_uti',
  'hospital_referencia',
  'outro',
] as const;

export const BETA_FACILITY_TYPE_LABELS = {
  upa_porte_1: 'UPA 24h porte I',
  upa_porte_2: 'UPA 24h porte II',
  upa_porte_3: 'UPA 24h porte III',
  ps_hospital: 'PS de hospital de pequeno porte',
  hospital_com_uti: 'Hospital com UTI',
  hospital_referencia: 'Hospital de referência (alta complexidade)',
  outro: 'Outro serviço de urgência',
} as const;

export const BETA_CITY_TYPES = ['capital', 'regiao_metropolitana', 'interior'] as const;

export const BETA_CITY_TYPE_LABELS = {
  capital: 'Capital',
  regiao_metropolitana: 'Região metropolitana de capital',
  interior: 'Interior',
} as const;

export const BRAZIL_UFS = [
  'AC',
  'AL',
  'AM',
  'AP',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MG',
  'MS',
  'MT',
  'PA',
  'PB',
  'PE',
  'PI',
  'PR',
  'RJ',
  'RN',
  'RO',
  'RR',
  'RS',
  'SC',
  'SE',
  'SP',
  'TO',
] as const;

// ── Termo do beta ───────────────────────────────────────────────────────────

/** PROVISÓRIO: aguarda parecer jurídico. Mudar o texto exige trocar `version`. */
export const BETA_TERMS = {
  version: '2026-10-15-provisorio',
  provisional: true,
  title: 'Termo de participação no beta',
  sections: [
    {
      heading: 'O que é o beta',
      paragraphs: [
        'O Copiloto Clínico está em teste com um grupo fechado de médicos convidados. Funcionalidades podem mudar, falhar ou sair do ar sem aviso prévio.',
      ],
    },
    {
      heading: 'Apoio à decisão, não substituição',
      paragraphs: [
        'As análises são apoio à decisão clínica e podem errar. A conduta é sua: confira doses, contraindicações e o protocolo do seu serviço antes de aplicar qualquer sugestão.',
      ],
    },
    {
      heading: 'Sem identificar o paciente',
      paragraphs: [
        'Não escreva nome, CPF, telefone ou endereço do paciente. O sistema mascara parte desses dados antes de gravar ou enviar o caso a um modelo, mas não detecta nomes.',
      ],
    },
    {
      heading: 'Seu retorno e o contato da equipe',
      paragraphs: [
        'Reporte respostas erradas ou inúteis pelo botão de feedback da análise. Durante o beta, a equipe pode escrever para o e-mail da sua conta para entender como você usa o copiloto e pedir sua opinião.',
      ],
    },
    {
      heading: 'O que medimos',
      paragraphs: [
        'Medimos o uso da sua conta (por exemplo, quando foi a primeira análise), o custo e a qualidade das respostas, como descrito na Política de Privacidade. O perfil que você informar (formação, local de plantão e região) serve para avaliar o beta com o público certo.',
      ],
    },
    {
      heading: 'Saída',
      paragraphs: [
        'Você pode deixar o beta quando quiser: basta parar de usar ou pedir a eliminação da conta em Configurações → Privacidade.',
      ],
    },
  ],
} as const;

// ── Console admin ───────────────────────────────────────────────────────────

export const BETA_INVITE_LIMITS = {
  batchLabelMaxChars: 60,
  quantityMax: 50,
  maxUsesMax: 500,
  validDaysMax: 180,
  validDaysDefault: 30,
  waitlistValidDaysDefault: 14,
  waitlistBatchLabelDefault: 'lista de espera',
} as const;
