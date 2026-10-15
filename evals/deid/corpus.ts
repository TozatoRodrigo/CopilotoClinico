/**
 * Corpus sintético para medir a de-identificação: relatos de plantão em
 * português com identificadores (nome, apelido, parente, endereço, prontuário,
 * telefone, CPF, CNS, nascimento) e termos clínicos que parecem nome e NÃO
 * podem sumir (epônimos e escores: Glasgow, Murphy, Wells, Chagas...).
 *
 * Determinístico pela semente: o mesmo corpus em toda execução, para comparar
 * a máscara de hoje (regex) com o OpenMed e o que vier depois. Nenhum dado
 * real: nomes e números são combinações aleatórias de listas comuns.
 */

export const IDENTIFIER_TYPES = [
  'name',
  'nickname',
  'relative',
  'physician',
  'address',
  'record_number',
  'phone',
  'cpf',
  'cns',
  'birth_date',
] as const;
export type IdentifierType = (typeof IDENTIFIER_TYPES)[number];

export interface DeidNote {
  id: string;
  text: string;
  /** Trechos que não podem sobrar no texto mascarado. */
  identifiers: Array<{ type: IdentifierType; value: string }>;
  /** Termos clínicos que precisam sobreviver à máscara. */
  keep: string[];
}

const FIRST_NAMES = [
  'Maria',
  'Ana Paula',
  'Francisca',
  'Antônia',
  'Adriana',
  'Juliana',
  'Márcia',
  'Fernanda',
  'Patrícia',
  'Aline',
  'Sandra',
  'Camila',
  'Raimunda',
  'Lucineide',
  'Josefa',
  'Kauane',
  'José',
  'João Pedro',
  'Antônio',
  'Francisco',
  'Carlos',
  'Paulo',
  'Pedro',
  'Lucas',
  'Luiz Fernando',
  'Marcos',
  'Raimundo',
  'Sebastião',
  'Edivaldo',
  'Cícero',
  'Wellington',
  'Kauã',
];
const SURNAMES = [
  'da Silva',
  'dos Santos',
  'Oliveira',
  'Souza',
  'Rodrigues',
  'Ferreira',
  'Alves',
  'Pereira',
  'Lima',
  'Gomes',
  'Ribeiro',
  'Carvalho',
  'Almeida',
  'Lopes',
  'Soares',
  'Fernandes',
  'Vieira',
  'Barbosa',
  'Rocha',
  'Dias',
  'Nascimento',
  'Moreira',
  'Cavalcanti',
  'Nogueira',
];
const NICKNAMES = ['Zé', 'Tião', 'Chico', 'Nena', 'Dona Cida', 'Seu Didi', 'Bia', 'Toninho'];
const RELATIONS = ['a filha', 'o filho', 'a esposa', 'o marido', 'a mãe', 'a vizinha', 'o irmão'];
const STREETS = [
  'Rua das Flores',
  'Av. Brasil',
  'Rua Sete de Setembro',
  'Travessa São José',
  'Rua Boa Vista',
  'Estrada do Campo Limpo',
  'Rua Tiradentes',
];
const DISTRICTS = ['Jardim Ângela', 'Centro', 'Vila Nova', 'Cidade Tiradentes', 'Bairro Alto'];

/** Epônimos, escores e nomes de remédio que um modelo de nomes pode confundir com pessoa. */
const CLINICAL_TERMS = [
  'Glasgow 13',
  'sinal de Murphy positivo',
  'Blumberg positivo',
  'Giordano negativo',
  'Kernig e Brudzinski negativos',
  'escore de Wells de 6',
  'regra de Ottawa negativa',
  'doença de Chagas',
  'sinal de Babinski à direita',
  'Lasègue positivo à esquerda',
  'síndrome de Guillain-Barré',
  'Child-Pugh B',
  'Killip II',
  'Apgar 8/9',
  'doença de Graves',
  'tireoidite de Hashimoto',
  'doença de Crohn',
  'Parkinson há 10 anos',
  'losartana 50 mg',
  'dipirona 1 g',
  'Trendelenburg',
  'manobra de Valsalva',
];

const COMPLAINTS = [
  'dor torácica em aperto há 2 horas, irradiada para o braço esquerdo',
  'febre e cefaleia intensa desde ontem, com vômitos',
  'dispneia progressiva há 3 dias, piora ao deitar',
  'dor abdominal em hipocôndrio direito após refeição gordurosa',
  'fraqueza em dimídio direito e fala arrastada há 1 hora',
  'queda da própria altura com dor no tornozelo',
  'confusão mental e sonolência desde a manhã',
];

/** mulberry32: aleatório com semente, para o corpus ser o mesmo em toda execução. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function digits(random: () => number, count: number): string {
  return Array.from({ length: count }, () => Math.floor(random() * 10)).join('');
}

/** CPF com dígitos verificadores válidos: a regex de hoje só mascara CPF válido. */
function validCpf(random: () => number): string {
  const base = digits(random, 9).split('').map(Number);
  const check = (values: number[]) => {
    const sum = values.reduce(
      (total, value, index) => total + value * (values.length + 1 - index),
      0,
    );
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  const first = check(base);
  const second = check([...base, first]);
  const all = [...base, first, second].join('');
  return `${all.slice(0, 3)}.${all.slice(3, 6)}.${all.slice(6, 9)}-${all.slice(9)}`;
}

function pick<T>(random: () => number, values: readonly T[]): T {
  return values[Math.floor(random() * values.length)]!;
}

type Template = (parts: {
  name: string;
  firstName: string;
  nickname: string;
  relation: string;
  relative: string;
  physician: string;
  address: string;
  record: string;
  phone: string;
  cpf: string;
  cns: string;
  birth: string;
  age: number;
  complaint: string;
  clinical: string;
}) => { text: string; uses: IdentifierType[] };

const TEMPLATES: Template[] = [
  (p) => ({
    text: `Paciente ${p.name}, ${p.age} anos, com ${p.complaint}. Ao exame: ${p.clinical}. Prontuário ${p.record}.`,
    uses: ['name', 'record_number'],
  }),
  (p) => ({
    text: `${p.nickname}, ${p.age} anos, trazido por ${p.relation} ${p.relative} (tel ${p.phone}). Refere ${p.complaint}. ${p.clinical}.`,
    uses: ['nickname', 'relative', 'phone'],
  }),
  (p) => ({
    text: `Sra. ${p.firstName}, nascida em ${p.birth}, mora na ${p.address}. Chega com ${p.complaint}. Exame: ${p.clinical}.`,
    uses: ['name', 'birth_date', 'address'],
  }),
  (p) => ({
    text: `Seu ${p.firstName}, CPF ${p.cpf}, CNS ${p.cns}, ${p.age} anos. ${p.complaint}. ${p.clinical}. Avaliado pelo Dr. ${p.physician}.`,
    uses: ['name', 'cpf', 'cns', 'physician'],
  }),
  (p) => ({
    text: `${p.relation} ${p.relative} conta que ${p.name} começou com ${p.complaint}. Já em uso de ${p.clinical}. RH ${p.record}.`,
    uses: ['relative', 'name', 'record_number'],
  }),
  (p) => ({
    text: `Masculino, ${p.age} anos (${p.name}), ${p.complaint}. Ao exame ${p.clinical}. Contato: ${p.phone}, ${p.address}.`,
    uses: ['name', 'phone', 'address'],
  }),
];

function buildAddress(random: () => number): string {
  return `${pick(random, STREETS)}, ${1 + Math.floor(random() * 2900)}, ${pick(random, DISTRICTS)}`;
}

function buildPhone(random: () => number): string {
  return `(${11 + Math.floor(random() * 80)}) 9${digits(random, 4)}-${digits(random, 4)}`;
}

function buildBirth(random: () => number): string {
  const day = String(1 + Math.floor(random() * 28)).padStart(2, '0');
  const month = String(1 + Math.floor(random() * 12)).padStart(2, '0');
  return `${day}/${month}/${1935 + Math.floor(random() * 70)}`;
}

export function buildDeidCorpus(size = 200, seed = 20261013): DeidNote[] {
  const random = seededRandom(seed);
  return Array.from({ length: size }, (_, index) => {
    const firstName = pick(random, FIRST_NAMES);
    const parts = {
      firstName,
      name: `${firstName} ${pick(random, SURNAMES)}`,
      nickname: pick(random, NICKNAMES),
      relation: pick(random, RELATIONS),
      relative: `${pick(random, FIRST_NAMES)} ${pick(random, SURNAMES)}`,
      physician: `${pick(random, FIRST_NAMES)} ${pick(random, SURNAMES)}`,
      address: buildAddress(random),
      record: digits(random, 7),
      phone: buildPhone(random),
      cpf: validCpf(random),
      cns: `7${digits(random, 14)}`,
      birth: buildBirth(random),
      age: 18 + Math.floor(random() * 75),
      complaint: pick(random, COMPLAINTS),
      clinical: pick(random, CLINICAL_TERMS),
    };
    const template = TEMPLATES[index % TEMPLATES.length]!;
    const { text, uses } = template(parts);
    const valueOf: Record<IdentifierType, string> = {
      name: text.includes(parts.name) ? parts.name : parts.firstName,
      nickname: parts.nickname,
      relative: parts.relative,
      physician: parts.physician,
      address: parts.address,
      record_number: parts.record,
      phone: parts.phone,
      cpf: parts.cpf,
      cns: parts.cns,
      birth_date: parts.birth,
    };
    return {
      id: `deid-${String(index + 1).padStart(3, '0')}`,
      text,
      identifiers: uses.map((type) => ({ type, value: valueOf[type] })),
      keep: [parts.clinical],
    };
  });
}
