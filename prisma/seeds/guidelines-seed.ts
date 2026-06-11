/**
 * Seed de diretrizes clínicas iniciais para o copiloto.
 * Fontes: resumos de diretrizes públicas — não copia texto integral protegido.
 * Ver docs/guidelines-catalog.md para catálogo completo com versões e referências.
 */
import { PrismaClient, GuidelineChunkStatus } from '@prisma/client';

const prisma = new PrismaClient();

interface ChunkInput {
  source: string;
  sourceVersion: string;
  specialty: string;
  evidenceLevel?: string;
  text: string;
  metadata?: Record<string, unknown>;
}

const chunks: ChunkInput[] = [
  // === SCA — Síndrome Coronariana Aguda ===
  {
    source: 'Diretriz AHA/ACC STEMI',
    sourceVersion: '2013/2022-update',
    specialty: 'cardiologia',
    evidenceLevel: 'I-A',
    text: 'STEMI: reperfusão primária com ICP em até 90 min do primeiro contato médico. Na impossibilidade, trombólise em até 30 min se sem contraindicação e delta-T < 12h. AAS 300mg + P2Y12 (ticagrelor 180mg ou clopidogrel 300mg) na admissão.',
    metadata: { cenario: 'SCA', subtipo: 'STEMI', fonte_url: 'https://www.ahajournals.org/doi/10.1161/CIR.0b013e3182742cf6' },
  },
  {
    source: 'Diretriz SBC — SCA sem Supra',
    sourceVersion: '2021',
    specialty: 'cardiologia',
    evidenceLevel: 'I-A',
    text: 'NSTEMI/AI: estratificação de risco com GRACE/TIMI. AAS + anticoagulação (heparina ou fondaparinux). Estratégia invasiva precoce (< 24h) em alto risco (GRACE > 140, troponina elevada, instabilidade hemodinâmica).',
    metadata: { cenario: 'SCA', subtipo: 'NSTEMI' },
  },
  {
    source: 'Diretriz AHA/ACC SCA',
    sourceVersion: '2022',
    specialty: 'cardiologia',
    evidenceLevel: 'I-B',
    text: 'Betabloqueador oral nas primeiras 24h em STEMI hemodinamicamente estável (redução de mortalidade). Contraindicado em bloqueio AV, bradicardia < 60bpm, IC descompensada.',
    metadata: { cenario: 'SCA', medicamento: 'betabloqueador' },
  },

  // === AVC — Acidente Vascular Cerebral ===
  {
    source: 'Diretriz AHA/ASA AVC Isquêmico',
    sourceVersion: '2019',
    specialty: 'neurologia',
    evidenceLevel: 'I-A',
    text: 'AVC isquêmico agudo: trombolítico IV (alteplase 0,9 mg/kg, máx 90mg) em até 4,5h do início dos sintomas em pacientes elegíveis. Excluir hemorragia com TC antes do trombolítico. Glicemia-alvo 140-180 mg/dL.',
    metadata: { cenario: 'AVC', subtipo: 'isquemico', janela_terapeutica: '4.5h' },
  },
  {
    source: 'Diretriz AHA/ASA Trombectomia',
    sourceVersion: '2019',
    specialty: 'neurologia',
    evidenceLevel: 'I-A',
    text: 'Trombectomia mecânica: indicada em oclusão de grande vaso (ICA, M1) com NIHSS ≥ 6, ASPECTS ≥ 6, em até 24h do início dos sintomas com neuroimagem favorável (DAWN/DEFUSE-3 critérios).',
    metadata: { cenario: 'AVC', subtipo: 'isquemico', procedimento: 'trombectomia' },
  },
  {
    source: 'Diretriz AHA/ASA AVC Hemorrágico',
    sourceVersion: '2022',
    specialty: 'neurologia',
    evidenceLevel: 'I-B',
    text: 'Hemorragia intracerebral: reversão de anticoagulação imediata. PAS-alvo < 140 mmHg em hematomas pequenos/moderados. Monitorização em UTI. Evitar hiperglicemia e febre.',
    metadata: { cenario: 'AVC', subtipo: 'hemorragico' },
  },

  // === Sepse ===
  {
    source: 'Surviving Sepsis Campaign',
    sourceVersion: '2021',
    specialty: 'medicina_intensiva',
    evidenceLevel: 'I-B',
    text: 'Sepse — bundle 1h: colher hemoculturas (2 pares) ANTES dos antibióticos. Antibiótico empírico de amplo espectro em até 1h do reconhecimento. Lactato sérico: se ≥ 2 mmol/L, re-avaliar em 2h. Cristaloide 30 mL/kg em hipoperfusão.',
    metadata: { cenario: 'sepse', bundle: '1h' },
  },
  {
    source: 'Surviving Sepsis Campaign',
    sourceVersion: '2021',
    specialty: 'medicina_intensiva',
    evidenceLevel: 'I-A',
    text: 'Choque séptico: norepinefrina como vasopressor de primeira linha (PAM-alvo ≥ 65 mmHg). Adicionar vasopressina se dose de norepinefrina > 0,25 mcg/kg/min. Corticoterapia (hidrocortisona 200mg/dia) se refratário a vasopressores.',
    metadata: { cenario: 'sepse', subtipo: 'choque_septico', vasopressor: 'norepinefrina' },
  },
  {
    source: 'Surviving Sepsis Campaign',
    sourceVersion: '2021',
    specialty: 'medicina_intensiva',
    evidenceLevel: 'I-B',
    text: 'Ventilação mecânica na SDRA associada à sepse: volume corrente ≤ 6 mL/kg de peso predito, pressão de platô ≤ 30 cmH2O, PEEP otimizado. Posição prona ≥ 16h/dia em SDRA grave (P/F < 150).',
    metadata: { cenario: 'sepse', complicacao: 'SDRA' },
  },

  // === Trauma ===
  {
    source: 'ATLS — Advanced Trauma Life Support',
    sourceVersion: '10ª edição, 2018',
    specialty: 'cirurgia_trauma',
    evidenceLevel: 'consenso',
    text: 'Trauma grave — ABCDE: Via aérea com controle cervical, Respiração, Circulação com controle de hemorragia, Déficit neurológico (GCS, pupilas), Exposição/Ambiente. Controle de hemorragia é prioridade após via aérea.',
    metadata: { cenario: 'trauma', protocolo: 'ATLS_primario' },
  },
  {
    source: 'ATLS — Advanced Trauma Life Support',
    sourceVersion: '10ª edição, 2018',
    specialty: 'cirurgia_trauma',
    evidenceLevel: 'I-B',
    text: 'Choque hemorrágico: ressuscitação de controle de dano — plasma:plaquetas:CH em proporção 1:1:1. Evitar cristaloide excessivo. Ácido tranexâmico 1g IV em até 3h do trauma (CRASH-2). Transfusão maciça se perda > 10 unidades/24h.',
    metadata: { cenario: 'trauma', subtipo: 'choque_hemorragico', medicamento: 'acido_tranexamico' },
  },
  {
    source: 'ATLS — Advanced Trauma Life Support',
    sourceVersion: '10ª edição, 2018',
    specialty: 'cirurgia_trauma',
    evidenceLevel: 'consenso',
    text: 'TCE grave (GCS ≤ 8): intubação orotraqueal de sequência rápida. PIC-alvo < 20 mmHg, PPC 60-70 mmHg. Evitar hipotensão (PAS < 90 mmHg) e hipóxia (SpO2 < 95%). TC de crânio urgente.',
    metadata: { cenario: 'trauma', subtipo: 'TCE_grave' },
  },

  // === Crise Asmática ===
  {
    source: 'GINA — Global Initiative for Asthma',
    sourceVersion: '2023',
    specialty: 'pneumologia',
    evidenceLevel: 'I-A',
    text: 'Crise asmática aguda: SABA (salbutamol 2,5-5mg nebulização ou 4-8 puffs com espaçador) a cada 20 min na 1ª hora. Ipratrópio 0,5 mg nebulização nas crises moderadas/graves. Oxigênio para SpO2 93-95%.',
    metadata: { cenario: 'crise_asmatica', fase: 'aguda', medicamento: 'salbutamol' },
  },
  {
    source: 'GINA — Global Initiative for Asthma',
    sourceVersion: '2023',
    specialty: 'pneumologia',
    evidenceLevel: 'I-A',
    text: 'Corticoide sistêmico na crise asmática: iniciar em 1h — prednisolona 40-50mg/dia VO ou equivalente IV. Manter por 5-7 dias. Indicadores de gravidade: PEF < 50%, SpO2 < 92%, fala fragmentada, uso de musculatura acessória.',
    metadata: { cenario: 'crise_asmatica', medicamento: 'corticoide', duracao: '5-7 dias' },
  },
  {
    source: 'GINA — Global Initiative for Asthma',
    sourceVersion: '2023',
    specialty: 'pneumologia',
    evidenceLevel: 'I-B',
    text: 'Status asmaticus (crise refratária): considerar sulfato de magnésio 2g IV em 20 min (adultos). Suporte ventilatório não-invasivo ou IOT se necessário. Heliox pode ser considerado.',
    metadata: { cenario: 'crise_asmatica', subtipo: 'status_asmaticus' },
  },

  // === Insuficiência Cardíaca ===
  {
    source: 'Diretriz AHA/ACC IC',
    sourceVersion: '2022',
    specialty: 'cardiologia',
    evidenceLevel: 'I-A',
    text: 'IC aguda descompensada: furosemida IV (dose equivalente a 2,5x a dose oral habitual) para alívio da congestão. SpO2-alvo ≥ 90%. VNI (CPAP/BiPAP) em EAP cardiogênico com boa resposta. Monitorar eletrólitos e função renal.',
    metadata: { cenario: 'IC_aguda', medicamento: 'furosemida' },
  },
  {
    source: 'Diretriz AHA/ACC IC',
    sourceVersion: '2022',
    specialty: 'cardiologia',
    evidenceLevel: 'I-A',
    text: 'IC crônica com FEj reduzida (ICFEr): pilar terapêutico — IECA/BRA (ou ARNI), betabloqueador, ARM (espironolactona/eplerenona), iSGLT2 (dapagliflozina/empagliflozina). Todos têm evidência de redução de mortalidade.',
    metadata: { cenario: 'IC_cronica', subtipo: 'ICFEr' },
  },

  // === Fibrilação Atrial ===
  {
    source: 'Diretriz ESC FA',
    sourceVersion: '2020',
    specialty: 'cardiologia',
    evidenceLevel: 'I-A',
    text: 'Fibrilação atrial: controle de frequência com betabloqueador ou diltiazem em FA não-paroxística estável. FC-alvo em repouso < 110 bpm (controle leniente) ou < 80 bpm (controle estrito em sintomáticos). Anticoagulação (NOAC) conforme CHA2DS2-VASc ≥ 2 (homens) / ≥ 3 (mulheres).',
    metadata: { cenario: 'FA', aspecto: 'controle_frequencia_e_anticoagulacao' },
  },

  // === Choque ===
  {
    source: 'UpToDate — Approach to Shock',
    sourceVersion: '2023',
    specialty: 'medicina_intensiva',
    evidenceLevel: 'consenso',
    text: 'Avaliação do choque: identificar tipo (distributivo, hipovolêmico, cardiogênico, obstrutivo). Parâmetros: PAM < 65, lactato > 2, sinais de hipoperfusão. Ressuscitação volêmica com cautela; guiar por resposta ao fluido (PLR, variação de pressão de pulso).',
    metadata: { cenario: 'choque', aspecto: 'diagnostico_diferencial' },
  },

  // === Parada Cardiorrespiratória ===
  {
    source: 'AHA BLS/ACLS Guidelines',
    sourceVersion: '2020',
    specialty: 'emergencia',
    evidenceLevel: 'I-A',
    text: 'PCR em adultos: RCP de alta qualidade — compressões 5-6 cm, frequência 100-120/min, retorno completo do tórax, mínima interrupção (< 10s). Desfibrilação precoce em FV/TV sem pulso. Adrenalina 1mg IV a cada 3-5 min em ritmos não-chocáveis.',
    metadata: { cenario: 'PCR', algoritmo: 'ACLS' },
  },
  {
    source: 'AHA BLS/ACLS Guidelines',
    sourceVersion: '2020',
    specialty: 'emergencia',
    evidenceLevel: 'I-B',
    text: 'Cuidados pós-PCR: hipotermia terapêutica (controle alvo de temperatura 32-36°C por 24h). Coronariografia urgente se suspeita de SCA. Evitar hiperoxia (SpO2 94-98%). Tratar causas reversíveis (Hs e Ts).',
    metadata: { cenario: 'PCR', fase: 'pos_reanimacao' },
  },

  // === DM / Cetoacidose ===
  {
    source: 'ADA Standards of Care',
    sourceVersion: '2024',
    specialty: 'endocrinologia',
    evidenceLevel: 'I-A',
    text: 'Cetoacidose diabética (CAD): hidratação IV com SF 0,9% (1L/h na 1ª hora), insulinoterapia regular IV (0,1 U/kg/h após hidratação inicial), reposição de potássio se K < 3,5. Monitorar glicemia horária e eletrólitos.',
    metadata: { cenario: 'CAD', medicamento: 'insulina_regular' },
  },
];

async function main() {
  console.log('Iniciando seed de diretrizes clínicas...');

  let inserted = 0;
  let skipped = 0;

  for (const chunk of chunks) {
    const existing = await prisma.guidelineChunk.findFirst({
      where: { source: chunk.source, text: chunk.text },
      select: { id: true },
    });

    if (existing) {
      skipped++;
      continue;
    }

    await prisma.guidelineChunk.create({
      data: {
        source: chunk.source,
        sourceVersion: chunk.sourceVersion,
        specialty: chunk.specialty,
        evidenceLevel: chunk.evidenceLevel ?? null,
        text: chunk.text,
        metadata: chunk.metadata ?? {},
        status: GuidelineChunkStatus.approved,
        validFrom: new Date(),
      },
    });
    inserted++;
  }

  console.log(`Seed concluído: ${inserted} chunks inseridos, ${skipped} já existiam.`);
  console.log(`Total no catálogo: ${chunks.length} chunks`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
