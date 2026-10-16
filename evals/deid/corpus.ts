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

/**
 * Relatos escritos à mão, fora dos templates: as formas de prontuário,
 * tratamento e apelido do plantão (CC-201, CC-206) e as armadilhas que não
 * podem sumir — gasometria ("BE -5,2"), leito, "dona de casa", "seu filho",
 * epônimo depois de "Seu" e epônimo que também é nome de gente (CC-202).
 * "Pituca" fica de fora da lista de apelidos de propósito: o relatório mostra
 * o limite da regex.
 */
const HANDWRITTEN_NOTES: Array<Omit<DeidNote, 'id'>> = [
  {
    text: 'Pront. nº 4.567. Seu Zé, 81 anos, dispneia há 2 dias. Gasometria com pH 7,31 e BE -5,2. Leito 12.',
    identifiers: [
      { type: 'record_number', value: '4.567' },
      { type: 'nickname', value: 'Seu Zé' },
    ],
    keep: ['pH 7,31', 'BE -5,2', 'Leito 12'],
  },
  {
    text: 'Registro HC 1234567. Dona Cida, 67 anos, dona de casa, trazida pelo filho. PA 120x80, plaquetas 150000.',
    identifiers: [
      { type: 'record_number', value: '1234567' },
      { type: 'nickname', value: 'Dona Cida' },
    ],
    keep: ['dona de casa', 'PA 120x80', 'plaquetas 150000'],
  },
  {
    text: 'BE 2024/123. Tião, 54 anos, queda de moto. Glasgow 14, Romberg presente. Registro de diurese 1500 ml.',
    identifiers: [
      { type: 'record_number', value: '2024/123' },
      { type: 'nickname', value: 'Tião' },
    ],
    keep: ['Glasgow 14', 'Romberg presente', 'diurese 1500 ml'],
  },
  {
    text: 'RH: 0012345. Sr. João Batista, 72 anos, febre e rigidez de nuca; Kernig e Brudzinski positivos, Hoffmann negativo.',
    identifiers: [
      { type: 'record_number', value: '0012345' },
      { type: 'name', value: 'João Batista' },
    ],
    keep: ['Kernig e Brudzinski positivos', 'Hoffmann negativo'],
  },
  {
    text: 'Matrícula 98765. Sra. Maria das Dores, 59 anos, dor em hipocôndrio direito e sinal de Murphy positivo. Seu médico assistente pediu USG.',
    identifiers: [
      { type: 'record_number', value: '98765' },
      { type: 'name', value: 'Maria das Dores' },
    ],
    keep: ['sinal de Murphy positivo', 'Seu médico'],
  },
  {
    text: 'Registro hospitalar 998877. Refere que seu filho notou fala arrastada às 14h30. Babinski à direita, NIHSS 6.',
    identifiers: [{ type: 'record_number', value: '998877' }],
    keep: ['seu filho', '14h30', 'Babinski à direita', 'NIHSS 6'],
  },
  {
    text: 'Nº de atendimento 20241234. Chico, 45 anos, etilista, confusão e ataxia: pensar em Wernicke. Avaliado pela Dra. Ana Lúcia Prado.',
    identifiers: [
      { type: 'record_number', value: '20241234' },
      { type: 'nickname', value: 'Chico' },
      { type: 'physician', value: 'Ana Lúcia Prado' },
    ],
    keep: ['Wernicke'],
  },
  {
    text: 'Atendimento nº 556677. Dona Nena, 88 anos, queda em casa, dor no quadril; Garden IV na radiografia.',
    identifiers: [
      { type: 'record_number', value: '556677' },
      { type: 'nickname', value: 'Dona Nena' },
    ],
    keep: ['Garden IV'],
  },
  {
    text: 'Prontuário: 0045872-3. Seu Holter mostrou FA paroxística e o Doppler de carótidas veio normal. Seu Didi, 76 anos, nega dor.',
    identifiers: [
      { type: 'record_number', value: '0045872-3' },
      { type: 'nickname', value: 'Seu Didi' },
    ],
    keep: ['Seu Holter', 'Doppler de carótidas'],
  },
  {
    text: 'Bia, 19 anos, 32 semanas, PA 160x110 e proteinúria. Prontuário 7788991. Manobras de Leopold com feto cefálico.',
    identifiers: [
      { type: 'nickname', value: 'Bia' },
      { type: 'record_number', value: '7788991' },
    ],
    keep: ['PA 160x110', 'Manobras de Leopold'],
  },
  {
    text: 'Seu Toninho Ferreira, 63 anos, portador de doença de Chagas, com edema e dispneia. Registro 4471029.',
    identifiers: [
      { type: 'nickname', value: 'Seu Toninho Ferreira' },
      { type: 'record_number', value: '4471029' },
    ],
    keep: ['doença de Chagas'],
  },
  {
    text: 'Sr. Francisco das Chagas, 70 anos, tosse há 3 semanas; BAAR com Ziehl-Neelsen negativo. FAA 302211.',
    identifiers: [
      { type: 'name', value: 'Francisco das Chagas' },
      { type: 'record_number', value: '302211' },
    ],
    keep: ['Ziehl-Neelsen negativo'],
  },
  {
    text: 'Sr. Wilson Hoffmann, 58 anos, vertigem rotatória; teste de Rinne positivo bilateral e Dix-Hallpike positivo à direita.',
    identifiers: [{ type: 'name', value: 'Wilson Hoffmann' }],
    keep: ['teste de Rinne positivo bilateral', 'Dix-Hallpike positivo'],
  },
  {
    text: 'Dona Lurdinha, 79 anos, com Parkinson há 10 anos e queda; Ringer lactato 500 ml. Matrícula: 55120.',
    identifiers: [
      { type: 'nickname', value: 'Dona Lurdinha' },
      { type: 'record_number', value: '55120' },
    ],
    keep: ['Parkinson há 10 anos', 'Ringer lactato 500 ml'],
  },
  {
    text: 'Seu Juca, 84 anos, Glasgow 9, pupilas isocóricas, escala de Braden 12. Reg. 6612345.',
    identifiers: [
      { type: 'nickname', value: 'Seu Juca' },
      { type: 'record_number', value: '6612345' },
    ],
    keep: ['Glasgow 9', 'Braden 12'],
  },
  {
    text: 'Sra. Raimunda Nonato, 33 anos, dor pélvica e dor no fundo de saco de Douglas ao toque. Examinada pelo Dr. Paulo Henrique Lima. Prontuário nº 3.204.881.',
    identifiers: [
      { type: 'name', value: 'Raimunda Nonato' },
      { type: 'physician', value: 'Paulo Henrique Lima' },
      { type: 'record_number', value: '3.204.881' },
    ],
    keep: ['fundo de saco de Douglas'],
  },
  {
    text: 'Sr. Douglas, 30 anos, trauma de punho; Finkelstein negativo, Tinel e Phalen negativos. AIH 3524100012345.',
    identifiers: [
      { type: 'name', value: 'Douglas' },
      { type: 'record_number', value: '3524100012345' },
    ],
    keep: ['Finkelstein negativo', 'Tinel e Phalen negativos'],
  },
  {
    text: 'Zezinho, 6 anos, febre há 5 dias, conjuntivite e língua em framboesa: Kawasaki? Peso 20 kg, hidratação por Holliday-Segar. Boletim nº 88123.',
    identifiers: [
      { type: 'nickname', value: 'Zezinho' },
      { type: 'record_number', value: '88123' },
    ],
    keep: ['Kawasaki', 'Peso 20 kg', 'Holliday-Segar'],
  },
  {
    text: 'A senhora Antônia Ribeiro, 66 anos, cirrose Child-Pugh B, varizes de esôfago. Contato da filha (11) 98765-4321.',
    identifiers: [
      { type: 'name', value: 'Antônia Ribeiro' },
      { type: 'phone', value: '(11) 98765-4321' },
    ],
    keep: ['Child-Pugh B'],
  },
  {
    text: 'Seu Mané, 90 anos, acamado, lesão por pressão sacral; Ramsay 3 e Rankin 5. ID do paciente 4400123.',
    identifiers: [
      { type: 'nickname', value: 'Seu Mané' },
      { type: 'record_number', value: '4400123' },
    ],
    keep: ['Ramsay 3', 'Rankin 5'],
  },
  {
    text: 'Dona Bené contou que seu marido, Seu Tonho, teve Guillain-Barré em 2019. Leucócitos 12.400, Hb 11,2.',
    identifiers: [
      { type: 'nickname', value: 'Dona Bené' },
      { type: 'relative', value: 'Seu Tonho' },
    ],
    keep: ['seu marido', 'Guillain-Barré', 'Leucócitos 12.400', 'Hb 11,2'],
  },
  {
    text: 'Pituca, 7 anos, trazida pela avó, febre e petéquias; prova do laço (Rumpel-Leede) positiva.',
    identifiers: [{ type: 'nickname', value: 'Pituca' }],
    keep: ['Rumpel-Leede'],
  },
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

/** `size` relatos gerados pelos templates, seguidos dos escritos à mão (ids `deid-m01`...). */
export function buildDeidCorpus(size = 200, seed = 20261013): DeidNote[] {
  const handwritten = HANDWRITTEN_NOTES.map((note, index) => ({
    id: `deid-m${String(index + 1).padStart(2, '0')}`,
    ...note,
  }));
  return [...buildTemplateNotes(size, seed), ...handwritten];
}

function buildTemplateNotes(size: number, seed: number): DeidNote[] {
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
