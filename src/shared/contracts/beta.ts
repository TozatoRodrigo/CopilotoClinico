/**
 * CC-702 — beta por convite, compartilhado entre a API (src/modules/beta) e o
 * web (cadastro, onboarding do beta e console admin).
 *
 * - Com `BETA_INVITE_REQUIRED` ligada, o cadastro (senha ou login social)
 *   exige um código de convite válido; sem ele, a pessoa entra na lista de
 *   espera. Desligada (padrão), o cadastro segue aberto como antes.
 * - Quem entra por convite passa pelo onboarding do beta: termo do beta,
 *   perfil mínimo (o que a CC-701 registra) e o primeiro caso guiado.
 *
 * Nada aqui carrega dado de paciente. O código de convite é aleatório: não
 * deriva de nome, e-mail nem CRM.
 */

// ── Código de convite ───────────────────────────────────────────────────────

/** Parâmetro do link de convite que o admin copia: `/register?convite=K3MQ-9XPT`. */
export const BETA_INVITE_QUERY_PARAM = 'convite';

/**
 * Sem 0/O, 1/I/L e U/V: o código é lido em voz alta e digitado no celular.
 * 29 símbolos em 8 posições: ~5 × 10¹¹ códigos.
 */
export const INVITE_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTWXYZ' as const;
export const INVITE_CODE_LENGTH = 8;

/** Maiúsculas, sem hífen nem espaço: a forma gravada no banco. */
export function normalizeInviteCode(input: string): string {
  return input.toUpperCase().replace(/[^0-9A-Z]/g, '');
}

/** `K3MQ9XPT` → `K3MQ-9XPT` (como o admin envia e o médico lê). */
export function formatInviteCode(code: string): string {
  const normalized = normalizeInviteCode(code);
  if (normalized.length !== INVITE_CODE_LENGTH) return normalized;
  const half = INVITE_CODE_LENGTH / 2;
  return `${normalized.slice(0, half)}-${normalized.slice(half)}`;
}

/** Por que um código não serve. A ordem é a da checagem no servidor. */
export const BETA_INVITE_PROBLEMS = ['not_found', 'revoked', 'expired', 'exhausted'] as const;
export type BetaInviteProblem = (typeof BETA_INVITE_PROBLEMS)[number];

export const BETA_INVITE_PROBLEM_MESSAGES: Readonly<Record<BetaInviteProblem, string>> = {
  not_found: 'Código de convite não encontrado. Confira as letras e os números.',
  revoked: 'Este convite foi cancelado. Peça um novo a quem o enviou.',
  expired: 'Este convite venceu. Peça um novo a quem o enviou.',
  exhausted: 'Este convite já foi usado. Peça um novo a quem o enviou.',
};

// ── Erros do cadastro (403 com `code` próprio) ──────────────────────────────

export const BETA_INVITE_REQUIRED = 'BETA_INVITE_REQUIRED' as const;
export const BETA_INVITE_INVALID = 'BETA_INVITE_INVALID' as const;

/** Cadastro sem código com `BETA_INVITE_REQUIRED` ligada: o web abre a lista de espera. */
export interface BetaInviteRequiredError {
  statusCode: 403;
  error: 'Forbidden';
  code: typeof BETA_INVITE_REQUIRED;
  message: string;
}

/** Código digitado que não serve (com a flag ligada ou não). */
export interface BetaInviteInvalidError {
  statusCode: 403;
  error: 'Forbidden';
  code: typeof BETA_INVITE_INVALID;
  reason: BetaInviteProblem;
  message: string;
}

/** `GET /beta/registration?code=` — o que a tela de cadastro precisa saber antes do envio. */
export interface BetaRegistrationStatus {
  inviteRequired: boolean;
  /** Situação do código pedido; `null` sem código. Nunca revela o lote. */
  invite: { valid: true } | { valid: false; reason: BetaInviteProblem } | null;
}

// ── Perfil mínimo (CC-701: formação, local, região, porte) ─────────────────

/** Formação, em faixas que não se sobrepõem. */
export const BETA_TRAINING_VALUES = [
  'recem_formado',
  'sem_residencia',
  'em_residencia',
  'especialista',
] as const;
export type BetaTraining = (typeof BETA_TRAINING_VALUES)[number];

export const BETA_TRAINING_LABELS: Readonly<Record<BetaTraining, string>> = {
  recem_formado: 'Formado há menos de 2 anos, sem residência',
  sem_residencia: 'Formado há 2 anos ou mais, sem residência',
  em_residencia: 'Em residência',
  especialista: 'Com residência ou título de especialista',
};

/**
 * Local de plantão e porte. Mesmos valores de `FACILITY_TYPES` do CC-602
 * (perfil do local de plantão, PR #184): quando ele entrar na base, este
 * campo vira o `facilityType` do local padrão criado no onboarding.
 */
export const BETA_FACILITY_TYPES = [
  'upa_porte_1',
  'upa_porte_2',
  'upa_porte_3',
  'ps_hospital',
  'hospital_com_uti',
  'hospital_referencia',
  'outro',
] as const;
export type BetaFacilityType = (typeof BETA_FACILITY_TYPES)[number];

export const BETA_FACILITY_TYPE_LABELS: Readonly<Record<BetaFacilityType, string>> = {
  upa_porte_1: 'UPA 24h porte I',
  upa_porte_2: 'UPA 24h porte II',
  upa_porte_3: 'UPA 24h porte III',
  ps_hospital: 'PS de hospital de pequeno porte',
  hospital_com_uti: 'Hospital com UTI',
  hospital_referencia: 'Hospital de referência (alta complexidade)',
  outro: 'Outro serviço de urgência',
};

/** Região: o público-alvo do beta está fora dos grandes centros. */
export const BETA_CITY_TYPES = ['capital', 'regiao_metropolitana', 'interior'] as const;
export type BetaCityType = (typeof BETA_CITY_TYPES)[number];

export const BETA_CITY_TYPE_LABELS: Readonly<Record<BetaCityType, string>> = {
  capital: 'Capital',
  regiao_metropolitana: 'Região metropolitana de capital',
  interior: 'Interior',
};

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
export type BrazilUf = (typeof BRAZIL_UFS)[number];

/** Perfil do participante: obrigatório no onboarding, opcional na lista de espera. */
export interface BetaProfile {
  training: BetaTraining;
  facilityType: BetaFacilityType;
  uf: BrazilUf;
  cityType: BetaCityType;
}

// ── Lista de espera ─────────────────────────────────────────────────────────

/** `POST /beta/waitlist` — público. */
export interface BetaWaitlistRequest {
  email: string;
  /** Consentimento explícito para a equipe entrar em contato: sem ele, nada é gravado. */
  contactConsent: true;
  profile?: Partial<BetaProfile>;
}

/**
 * Sempre a mesma resposta (202), já cadastrado ou não: a lista de espera não
 * confirma se um e-mail existe.
 */
export interface BetaWaitlistResponse {
  status: 'received';
}

// ── Termo do beta ───────────────────────────────────────────────────────────

export interface BetaTermsSection {
  heading: string;
  paragraphs: readonly string[];
}

/**
 * Termo de participação no beta. PROVISÓRIO: aguarda parecer jurídico. Mudar
 * o texto exige trocar `version` — quem aceitou a versão anterior volta ao
 * onboarding para aceitar a nova.
 */
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
} as const satisfies {
  version: string;
  provisional: boolean;
  title: string;
  sections: readonly BetaTermsSection[];
};

/** `POST /beta/me/terms` — a versão que o médico leu. */
export interface AcceptBetaTermsRequest {
  version: string;
}

// ── Participante (onboarding) ───────────────────────────────────────────────

/** `GET /beta/me` (também a resposta de `POST /beta/me/terms` e `PUT /beta/me/profile`). */
export type BetaMe =
  | { participant: false }
  | {
      participant: true;
      joinedAt: string;
      terms: {
        currentVersion: string;
        acceptedVersion: string | null;
        acceptedAt: string | null;
        /** Aceitou a versão em vigor. */
        upToDate: boolean;
      };
      profile: BetaProfile | null;
      /** Falta aceitar o termo em vigor ou informar o perfil. */
      needsOnboarding: boolean;
    };

// ── Console admin ───────────────────────────────────────────────────────────

export const BETA_INVITE_LIMITS = {
  batchLabelMaxChars: 60,
  quantityMax: 50,
  maxUsesMax: 500,
  validDaysMax: 180,
  validDaysDefault: 30,
  /** Convite gerado ao aprovar alguém da lista de espera: uso único. */
  waitlistValidDaysDefault: 14,
  waitlistBatchLabelDefault: 'lista de espera',
} as const;

export type BetaInviteStatus = 'active' | 'exhausted' | 'expired' | 'revoked';

export interface BetaInviteUse {
  physicianId: string;
  name: string | null;
  email: string;
  joinedAt: string;
}

export interface BetaInviteView {
  id: string;
  /** Formatado (`K3MQ-9XPT`). */
  code: string;
  batchLabel: string;
  maxUses: number;
  usesCount: number;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
  status: BetaInviteStatus;
  /** Gerado ao aprovar alguém da lista de espera. */
  fromWaitlist: boolean;
  uses: BetaInviteUse[];
}

export interface BetaBatchSummary {
  batchLabel: string;
  invites: number;
  uses: number;
}

/** `GET /admin/beta/invites` */
export interface BetaInviteListResponse {
  invites: BetaInviteView[];
  batches: BetaBatchSummary[];
}

/** `POST /admin/beta/invites` — um lote de códigos iguais. */
export interface CreateBetaInvitesRequest {
  batchLabel: string;
  quantity: number;
  maxUses: number;
  validDays: number;
}

export interface CreateBetaInvitesResponse {
  invites: BetaInviteView[];
}

export type BetaWaitlistStatus = 'waiting' | 'invited' | 'registered';

export interface BetaWaitlistEntryView {
  id: string;
  email: string;
  profile: Partial<BetaProfile>;
  contactConsentAt: string;
  status: BetaWaitlistStatus;
  createdAt: string;
  /** Convite mais recente gerado para esta pessoa. */
  invite: BetaInviteView | null;
}

/** `GET /admin/beta/waitlist` */
export interface BetaWaitlistListResponse {
  entries: BetaWaitlistEntryView[];
  counts: Record<BetaWaitlistStatus, number>;
}

/** `POST /admin/beta/waitlist/:id/approve` — gera um convite de uso único. */
export interface ApproveBetaWaitlistRequest {
  batchLabel?: string;
  validDays?: number;
}

export interface ApproveBetaWaitlistResponse {
  entry: BetaWaitlistEntryView;
  invite: BetaInviteView;
}

// ── Métrica de ativação (para o painel da CC-705) ──────────────────────────

/** Meta da CC-702: ≥ 70% fazem a 1ª análise em até 24 h do cadastro. */
export const BETA_ACTIVATION_TARGET = 0.7;
export const BETA_ACTIVATION_WINDOW_HOURS = 24;

export interface BetaActivationCounts {
  /** Contas criadas na janela. */
  registered: number;
  /** Com 24 h completas desde o cadastro: só elas entram na taxa. */
  eligible: number;
  /** 1ª análise (qualquer caso, inclusive o de exemplo) em até 24 h. */
  activated24h: number;
  /** 1ª análise de um caso real (fora os casos de exemplo) em até 24 h. */
  activatedRealCase24h: number;
  /** activated24h / eligible; `null` sem elegíveis. */
  rate: number | null;
  realCaseRate: number | null;
}

/** `GET /admin/beta/activation?days=` */
export interface BetaActivationReport {
  days: number;
  target: number;
  overall: BetaActivationCounts;
  /** Por lote do convite; `batchLabel: null` = cadastro sem convite. */
  byBatch: (BetaActivationCounts & { batchLabel: string | null })[];
  generatedAt: string;
}
