import type { ContentProvenance } from '../provenance';
import type { ResultTone } from '../tone';

/**
 * Bloqueios regionais (CC-330), portados do BlockPath do ANY App v4: os 14
 * bloqueios, a escolha pela topografia da lesão (14 caminhos), a lista por
 * região, o protocolo de LAST e os avisos. Tudo é dado; a tela só desenha.
 *
 * O texto é o do ANY, sem mudança clínica. Só mudou o que está em
 * `tests/clinical-tools/blocks-differential.spec.ts` (`LANGUAGE_CHANGES`):
 * recomendação no infinitivo virou sugestão e "<=" virou "≤". O que pareceu
 * errado no conteúdo está em docs/ferramentas/revisao-clinica/bloqueios.md
 * para a revisão clínica (CC-310), e não foi corrigido aqui.
 */

export const BLOCKS_PROVENANCE: ContentProvenance = {
  source: 'ANY App v4 · BlockPath.tsx (95c8fba)',
  version: '1.0.0',
  updatedAt: '2026-10-15',
  review: { status: 'pendente' },
};

export const REGIONAL_BLOCK_IDS = [
  'plexo-cervical',
  'interescalenico',
  'supraclavicular',
  'axilar',
  'punho',
  'peng',
  'fascia-iliaca',
  'femoral',
  'safeno',
  'ciatico-popliteo',
  'tornozelo',
  'esp',
  'serratil',
  'intercostal',
] as const;

export type RegionalBlockId = (typeof REGIONAL_BLOCK_IDS)[number];

/** Linha da tabela "Anestésico local" do bloqueio: faixas como texto, do jeito do ANY. */
export interface BlockAnestheticSuggestion {
  drug: string;
  /** "0,25-0,5%" */
  concentration: string;
  /** "15-20 mL" */
  volume: string;
}

export interface RegionalBlock {
  id: RegionalBlockId;
  /** Nome na ficha do bloqueio ("Bloqueio PENG"). */
  name: string;
  /** Nome na lista e na nota de evolução ("PENG"). */
  listName: string;
  region: string;
  /** Volume total usual ("15-20 mL", "3-5 mL/nível"). */
  volume: string;
  type: 'Sensitivo' | 'Misto';
  indications: readonly string[];
  contraindications: readonly string[];
  material: readonly string[];
  /** Passos em ordem. */
  technique: readonly string[];
  tip?: { title: string; text: string };
  anesthetics: readonly BlockAnestheticSuggestion[];
}

/** Um caminho da escolha por topografia: onde está a lesão → qual bloqueio. */
export interface TopographyMapping {
  lesion: string;
  blockId: RegionalBlockId;
  /** Nome curto do bloqueio na árvore ("Serrátil anterior"). */
  blockName: string;
}

export interface TopographyCategory {
  title: string;
  mappings: readonly TopographyMapping[];
}

export interface BlockListRegion {
  region: string;
  blockIds: readonly RegionalBlockId[];
}

/** Os 14 bloqueios, na ordem do ANY. */
export const REGIONAL_BLOCKS: readonly RegionalBlock[] = [
  {
    id: 'plexo-cervical',
    name: 'Plexo cervical superficial',
    listName: 'Plexo cervical superficial',
    region: 'Pescoço',
    volume: '5-10 mL',
    type: 'Sensitivo',
    indications: [
      'Fratura de clavícula',
      'Procedimentos cervicais superficiais',
      'Endarterectomia de carótida (complemento)',
      'Linfonodectomia cervical',
      'Acesso venoso central (jugular)',
    ],
    contraindications: [
      'Recusa do paciente',
      'Infecção no local de punção',
      'Alergia a anestésicos locais',
      'Coagulopatia grave (relativa)',
    ],
    material: [
      'Luvas estéreis',
      'Clorexidina alcoólica 0,5%',
      'Campo estéril',
      'Seringa 10 mL',
      'Agulha 22-25G x 40mm',
      'Anestésico local (5-10 mL)',
      'USG linear (opcional)',
      'Gel estéril',
    ],
    technique: [
      'Paciente supino, cabeça virada para lado contralateral',
      'Identificar ponto médio da borda posterior do ECM',
      'Transdutor transversal neste nível (opcional)',
      'Inserir agulha superficialmente, posterior ao ECM',
      'Depositar 5-10 mL em leque subcutâneo',
    ],
    tip: {
      title: 'Vantagem',
      text: 'Técnica simples e segura — ideal para emergencista iniciante.',
    },
    anesthetics: [
      { drug: 'Lidocaína', concentration: '1-2%', volume: '5-10 mL' },
      { drug: 'Bupivacaína', concentration: '0,25-0,5%', volume: '5-10 mL' },
      { drug: 'Ropivacaína', concentration: '0,2-0,5%', volume: '5-10 mL' },
    ],
  },
  {
    id: 'interescalenico',
    name: 'Bloqueio interescalênico',
    listName: 'Interescalênico',
    region: 'Ombro',
    volume: '7-15 mL',
    type: 'Misto',
    indications: [
      'Cirurgias e procedimentos do ombro',
      'Fratura de clavícula (porção lateral)',
      'Fratura de úmero proximal',
      'Luxação glenoumeral (redução)',
      'Artroscopia de ombro',
    ],
    contraindications: [
      'Doença pulmonar grave (DPOC severa, pulmão único)',
      'Paralisia de nervo frênico contralateral',
      'Paralisia de nervo laríngeo recorrente contralateral',
      'Recusa do paciente',
      'Infecção no local de punção',
      'Coagulopatia grave',
    ],
    material: [
      'Luvas estéreis',
      'Clorexidina alcoólica 0,5%',
      'Campo estéril',
      'Seringa 20 mL',
      'Agulha ecogênica 50-80mm',
      'Anestésico local (7-15 mL)',
      'USG linear 6-13 MHz',
      'Gel estéril + capa transdutor',
    ],
    technique: [
      'Paciente semi-sentado, cabeça virada para lado contralateral',
      'Transdutor linear transversal no nível de C6',
      'Identificar artéria carótida e veia jugular (medial)',
      'Localizar escalenos anterior e médio',
      'Visualizar raízes C5-C7 no sulco interescalênico',
      'Agulha em plano, de lateral para medial',
      'Depositar 7-15 mL ao redor das raízes',
    ],
    tip: {
      title: 'Sinal do semáforo',
      text: 'Raízes C5, C6 e C7 empilhadas como estruturas hipoecoicas redondas.',
    },
    anesthetics: [
      { drug: 'Bupivacaína', concentration: '0,5%', volume: '7-15 mL' },
      { drug: 'Ropivacaína', concentration: '0,5%', volume: '7-15 mL' },
      { drug: 'Lidocaína', concentration: '1,5-2%', volume: '10-15 mL' },
    ],
  },
  {
    id: 'supraclavicular',
    name: 'Bloqueio supraclavicular',
    listName: 'Supraclavicular',
    region: 'Cotovelo/Antebraço',
    volume: '20-25 mL',
    type: 'Misto',
    indications: [
      'Cirurgias de cotovelo, antebraço e mão',
      'Fraturas de úmero distal',
      'Fraturas de rádio e ulna',
      'Procedimentos em mão e punho',
    ],
    contraindications: [
      'Doença pulmonar grave (risco de pneumotórax)',
      'Insuficiência respiratória',
      'Paralisia de nervo frênico contralateral',
      'Recusa do paciente',
      'Infecção no local de punção',
      'Coagulopatia grave',
    ],
    material: [
      'Luvas estéreis',
      'Clorexidina alcoólica 0,5%',
      'Campo estéril',
      'Seringa 20 mL',
      'Agulha ecogênica 50mm',
      'Anestésico local (20-25 mL)',
      'USG linear 6-13 MHz',
      'Gel estéril + capa transdutor',
    ],
    technique: [
      'Paciente supino, cabeça virada para lado contralateral',
      'Transdutor oblíquo-sagital na fossa supraclavicular',
      'Identificar artéria subclávia e 1ª costela',
      'Localizar plexo posterolateral à artéria ("cacho de uvas")',
      'Usar Doppler para mapear vasos',
      'Agulha em plano, de lateral para medial',
      'Avançar até o "corner pocket"',
      'Depositar 20-25 mL de AL',
    ],
    tip: { title: '"Raquianestesia do MS"', text: 'Bloqueio mais completo do plexo braquial.' },
    anesthetics: [
      { drug: 'Bupivacaína', concentration: '0,5%', volume: '20-25 mL' },
      { drug: 'Ropivacaína', concentration: '0,5%', volume: '20-25 mL' },
      { drug: 'Lidocaína', concentration: '1,5-2%', volume: '20-25 mL' },
    ],
  },
  {
    id: 'axilar',
    name: 'Bloqueio axilar',
    listName: 'Axilar',
    region: 'Antebraço/Mão',
    volume: '20 mL',
    type: 'Misto',
    indications: [
      'Cirurgias de antebraço distal e mão',
      'Fraturas de punho (Colles, Smith)',
      'Procedimentos em mão e dedos',
      'FAV para hemodiálise',
      'Síndrome do túnel do carpo',
    ],
    contraindications: [
      'Recusa do paciente',
      'Infecção na axila',
      'Linfadenopatia axilar extensa',
      'Coagulopatia grave',
      'Impossibilidade de posicionar o braço',
    ],
    material: [
      'Luvas estéreis',
      'Clorexidina alcoólica 0,5%',
      'Campo estéril',
      'Seringa 20 mL',
      'Agulha ecogênica 50mm',
      'Anestésico local (20 mL)',
      'USG linear 6-13 MHz',
      'Gel estéril + capa transdutor',
    ],
    technique: [
      'Paciente supino, braço abduzido 90°, cotovelo fletido',
      'Transdutor transversal na axila, sobre pulso axilar',
      'Identificar artéria axilar e veias adjacentes',
      'Localizar nervos mediano, ulnar e radial',
      'Identificar musculocutâneo no coracobraquial',
      'Depositar ~5 mL ao redor de cada nervo',
    ],
    tip: { title: 'Vantagem', text: 'Sem risco de pneumotórax ou paralisia frênica.' },
    anesthetics: [
      { drug: 'Bupivacaína', concentration: '0,25-0,5%', volume: '20 mL total' },
      { drug: 'Ropivacaína', concentration: '0,5%', volume: '20 mL total' },
      { drug: 'Lidocaína', concentration: '1,5-2%', volume: '20-25 mL' },
    ],
  },
  {
    id: 'punho',
    name: 'Bloqueio do punho',
    listName: 'Punho',
    region: 'Mão/Dedos',
    volume: '9-15 mL',
    type: 'Misto',
    indications: [
      'Lacerações de mão',
      'Procedimentos em dedos',
      'Drenagem de abscessos',
      'Remoção de corpo estranho',
      'Redução de fraturas de metacarpos/falanges',
    ],
    contraindications: [
      'Recusa do paciente',
      'Infecção no local de punção',
      'Alergia a anestésicos locais',
    ],
    material: [
      'Luvas estéreis',
      'Clorexidina alcoólica 0,5%',
      'Seringa 10 mL',
      'Agulha 25G x 25mm',
      'Anestésico local SEM epinefrina (9-15 mL)',
      'USG linear (opcional)',
    ],
    technique: [
      'Entre palmar longo e flexor radial do carpo',
      '2-3 cm proximal à prega do punho',
      'Volume: 3-5 mL',
      'Lateral ao tendão do flexor ulnar do carpo',
      'Volume: 3-5 mL',
      'Subcutâneo, face lateral do punho',
      'Volume: 3-5 mL em leque',
    ],
    anesthetics: [
      { drug: 'Lidocaína', concentration: '1-2%', volume: '3-5 mL' },
      { drug: 'Bupivacaína', concentration: '0,25-0,5%', volume: '3-5 mL' },
    ],
  },
  {
    id: 'peng',
    name: 'Bloqueio PENG',
    listName: 'PENG',
    region: 'Quadril',
    volume: '15-20 mL',
    type: 'Sensitivo',
    indications: [
      'Fratura de quadril (colo femoral, transtrocantérica)',
      'Artroplastia total de quadril',
      'Dor na articulação coxofemoral',
      'Complemento ao bloqueio de fáscia ilíaca',
    ],
    contraindications: [
      'Recusa do paciente',
      'Infecção no local de punção',
      'Alergia a anestésicos locais',
      'Coagulopatia grave (relativa)',
    ],
    material: [
      'Luvas estéreis',
      'Clorexidina alcoólica 0,5%',
      'Campo estéril',
      'Seringa 20 mL',
      'Agulha ecogênica 80-100mm',
      'Anestésico local (15-20 mL)',
      'USG curvo 2-5 MHz',
      'Gel estéril + capa transdutor',
    ],
    technique: [
      'Paciente supino, membro inferior estendido',
      'Transdutor curvo transversal na prega inguinal',
      'Identificar EIAI deslizando lateralmente',
      'Deslizar medialmente até visualizar eminência iliopúbica',
      'Identificar tendão do iliopsoas',
      'Usar Doppler para mapear vasos femorais',
      'Agulha em plano, de lateral para medial',
      'Depositar 15-20 mL entre iliopsoas e osso',
    ],
    tip: { title: 'Vantagem', text: 'Preserva função motora do quadríceps.' },
    anesthetics: [
      { drug: 'Bupivacaína', concentration: '0,25-0,5%', volume: '15-20 mL' },
      { drug: 'Ropivacaína', concentration: '0,2-0,5%', volume: '15-20 mL' },
      { drug: 'Lidocaína', concentration: '1-2%', volume: '15-20 mL' },
    ],
  },
  {
    id: 'fascia-iliaca',
    name: 'Bloqueio de fáscia ilíaca',
    listName: 'Fáscia ilíaca',
    region: 'Quadril/Fêmur',
    volume: '30-40 mL',
    type: 'Sensitivo',
    indications: [
      'Fratura de quadril',
      'Fratura de diáfise femoral',
      'Artroplastia de quadril',
      'Queimaduras de coxa anterior',
    ],
    contraindications: [
      'Recusa do paciente',
      'Infecção no local de punção',
      'Alergia a anestésicos locais',
      'Coagulopatia grave',
    ],
    material: [
      'Luvas estéreis',
      'Clorexidina alcoólica 0,5%',
      'Campo estéril',
      'Seringa 20 mL (x2)',
      'Agulha ecogênica 80mm',
      'Anestésico local (30-40 mL)',
      'USG linear 6-13 MHz',
      'Gel estéril + capa transdutor',
    ],
    technique: [
      'Paciente supino',
      'Transdutor linear na prega inguinal',
      'Identificar artéria femoral e músculo iliopsoas',
      'Localizar fáscia ilíaca sobre o iliopsoas',
      'Agulha em plano, de lateral para medial',
      'Avançar até "pop" ao atravessar a fáscia',
      'Depositar 30-40 mL observando dissecção subfascial',
    ],
    tip: { title: 'vs PENG', text: 'Maior cobertura, porém maior bloqueio motor.' },
    anesthetics: [
      { drug: 'Bupivacaína', concentration: '0,25%', volume: '30-40 mL' },
      { drug: 'Ropivacaína', concentration: '0,2-0,375%', volume: '30-40 mL' },
      { drug: 'Lidocaína', concentration: '1%', volume: '30-40 mL' },
    ],
  },
  {
    id: 'femoral',
    name: 'Bloqueio femoral',
    listName: 'Femoral',
    region: 'Coxa/Joelho',
    volume: '15-20 mL',
    type: 'Misto',
    indications: [
      'Fratura de fêmur (diáfise)',
      'Fratura de patela',
      'Cirurgia de joelho (LCA, ATJ)',
      'Biópsia de coxa anterior',
    ],
    contraindications: [
      'Recusa do paciente',
      'Infecção no local de punção',
      'Alergia a anestésicos locais',
      'Coagulopatia grave',
      'Cirurgia vascular femoral prévia (relativa)',
    ],
    material: [
      'Luvas estéreis',
      'Clorexidina alcoólica 0,5%',
      'Campo estéril',
      'Seringa 20 mL',
      'Agulha ecogênica 50mm',
      'Anestésico local (15-20 mL)',
      'USG linear 6-13 MHz',
      'Gel estéril + capa transdutor',
    ],
    technique: [
      'Paciente supino',
      'Transdutor linear transversal na prega inguinal',
      'Identificar artéria e veia femorais',
      'Localizar nervo femoral lateral à artéria',
      'Agulha em plano, de lateral para medial',
      'Depositar 15-20 mL ao redor do nervo',
    ],
    tip: { title: 'Mnemônico NAVEL', text: 'Nervo, Artéria, Veia, Espaço, Linfáticos.' },
    anesthetics: [
      { drug: 'Bupivacaína', concentration: '0,25-0,5%', volume: '15-20 mL' },
      { drug: 'Ropivacaína', concentration: '0,2-0,5%', volume: '15-20 mL' },
      { drug: 'Lidocaína', concentration: '1-2%', volume: '15-20 mL' },
    ],
  },
  {
    id: 'safeno',
    name: 'Bloqueio do safeno',
    listName: 'Safeno',
    region: 'Perna medial',
    volume: '8-10 mL',
    type: 'Sensitivo',
    indications: [
      'Complemento ao bloqueio ciático',
      'Safenectomia',
      'Cirurgia de varizes',
      'Procedimentos em face medial da perna',
      'Cirurgia de joelho (complemento)',
    ],
    contraindications: [
      'Recusa do paciente',
      'Infecção no local de punção',
      'Alergia a anestésicos locais',
      'Coagulopatia grave (relativa)',
    ],
    material: [
      'Luvas estéreis',
      'Clorexidina alcoólica 0,5%',
      'Campo estéril',
      'Seringa 10 mL',
      'Agulha ecogênica 50mm',
      'Anestésico local (8-10 mL)',
      'USG linear 6-13 MHz',
      'Gel estéril + capa transdutor',
    ],
    technique: [
      'Paciente supino, coxa em leve abdução e rotação externa',
      'Transdutor transversal no terço médio da coxa',
      'Identificar artéria femoral no canal adutor',
      'Localizar nervo safeno anterolateral à artéria',
      'Agulha em plano',
      'Depositar 8-10 mL ao redor do nervo',
    ],
    tip: { title: 'Canal adutor', text: 'Canal de Hunter — vasto medial, adutor longo e magno.' },
    anesthetics: [
      { drug: 'Bupivacaína', concentration: '0,25-0,5%', volume: '8-10 mL' },
      { drug: 'Ropivacaína', concentration: '0,2-0,5%', volume: '8-10 mL' },
      { drug: 'Lidocaína', concentration: '1%', volume: '10 mL' },
    ],
  },
  {
    id: 'ciatico-popliteo',
    name: 'Bloqueio ciático poplíteo',
    listName: 'Ciático poplíteo',
    region: 'Perna/Pé',
    volume: '15-20 mL',
    type: 'Misto',
    indications: [
      'Cirurgias de pé e tornozelo',
      'Fraturas de tornozelo (maléolo lateral/posterior)',
      'Reparo de tendão de Aquiles',
      'Amputação abaixo do joelho',
      'Dor crônica de pé',
    ],
    contraindications: [
      'Recusa do paciente',
      'Infecção no local de punção',
      'Alergia a anestésicos locais',
      'Coagulopatia grave',
      'Neuropatia prévia do ciático (relativa)',
    ],
    material: [
      'Luvas estéreis',
      'Clorexidina alcoólica 0,5%',
      'Campo estéril',
      'Seringa 20 mL',
      'Agulha ecogênica 80mm',
      'Anestésico local (15-20 mL)',
      'USG linear 6-13 MHz',
      'Gel estéril + capa transdutor',
    ],
    technique: [
      'Paciente em decúbito ventral ou lateral',
      'Transdutor linear transversal na fossa poplítea',
      'Identificar artéria poplítea (profunda)',
      'Localizar nervos tibial e fibular comum',
      'Escanear proximalmente até a junção',
      'Posicionar 5-10 cm acima da prega poplítea',
      'Agulha em plano, de lateral para medial',
      'Depositar 15-20 mL na bainha paraneurial',
    ],
    tip: { title: 'Complemento', text: 'Associar bloqueio do safeno para cobertura completa.' },
    anesthetics: [
      { drug: 'Bupivacaína', concentration: '0,5%', volume: '15-20 mL' },
      { drug: 'Ropivacaína', concentration: '0,5%', volume: '15-20 mL' },
      { drug: 'Lidocaína', concentration: '1,5-2%', volume: '15-20 mL' },
    ],
  },
  {
    id: 'tornozelo',
    name: 'Bloqueio do tornozelo',
    listName: 'Tornozelo',
    region: 'Pé/Dedos',
    volume: '15-25 mL',
    type: 'Misto',
    indications: [
      'Procedimentos no pé',
      'Remoção de corpo estranho',
      'Drenagem de abscessos',
      'Redução de fraturas de metatarsos/dedos',
      'Cirurgia de unha encravada',
    ],
    contraindications: [
      'Recusa do paciente',
      'Infecção no local de punção',
      'Alergia a anestésicos locais',
      'Doença vascular periférica grave',
    ],
    material: [
      'Luvas estéreis',
      'Clorexidina alcoólica 0,5%',
      'Seringa 20 mL',
      'Agulha 25G x 25mm',
      'Anestésico local SEM epinefrina (15-25 mL)',
      'USG linear (opcional)',
    ],
    technique: [
      'Posterior ao maléolo medial • 5 mL',
      'Entre extensor do hálux e tibial anterior • 3-5 mL',
      'Subcutâneo anterolateral • 3-5 mL em leque',
      'Anterior ao maléolo medial • 3-5 mL',
      'Entre maléolo lateral e Aquiles • 3-5 mL',
    ],
    anesthetics: [
      { drug: 'Lidocaína', concentration: '1%', volume: '15-25 mL' },
      { drug: 'Bupivacaína', concentration: '0,25%', volume: '15-25 mL' },
    ],
  },
  {
    id: 'esp',
    name: 'Bloqueio ESP',
    listName: 'ESP (Eretor da espinha)',
    region: 'Tórax',
    volume: '20-30 mL',
    type: 'Sensitivo',
    indications: [
      'Fraturas de costelas (múltiplas)',
      'Dor torácica pós-trauma',
      'Analgesia pós-toracotomia',
      'Herpes zoster torácico',
      'Cirurgias de mama (complemento)',
    ],
    contraindications: [
      'Recusa do paciente',
      'Infecção no local de punção',
      'Alergia a anestésicos locais',
      'Coagulopatia grave',
      'Deformidade vertebral grave (relativa)',
    ],
    material: [
      'Luvas estéreis',
      'Clorexidina alcoólica 0,5%',
      'Campo estéril',
      'Seringa 20 mL (x2)',
      'Agulha ecogênica 80mm',
      'Anestésico local (20-30 mL)',
      'USG linear 6-13 MHz',
      'Gel estéril + capa transdutor',
    ],
    technique: [
      'Paciente sentado ou decúbito lateral',
      'Transdutor sagital, ~3 cm lateral à linha média',
      'Identificar processos transversos',
      'Localizar músculos trapézio, romboide, eretor da espinha',
      'Agulha em plano, direção crânio-caudal',
      'Avançar até contactar o processo transverso',
      'Aspirar e injetar 2-3 mL teste',
      'Observar elevação do eretor (hidrodissecção)',
      'Completar com 20-30 mL de AL',
    ],
    tip: { title: 'Vantagem', text: 'Bloqueio interfascial com excelente perfil de segurança.' },
    anesthetics: [
      { drug: 'Bupivacaína', concentration: '0,25%', volume: '20-30 mL' },
      { drug: 'Ropivacaína', concentration: '0,375%', volume: '20-30 mL' },
      { drug: 'Lidocaína', concentration: '1%', volume: '20-30 mL' },
    ],
  },
  {
    id: 'serratil',
    name: 'Bloqueio do serrátil anterior',
    listName: 'Serrátil anterior',
    region: 'Tórax lateral',
    volume: '20-30 mL',
    type: 'Sensitivo',
    indications: [
      'Fraturas de costelas anterolaterais',
      'Drenagem torácica',
      'Cirurgia de mama (complemento)',
      'Herpes zoster torácico lateral',
      'Toracostomia',
    ],
    contraindications: [
      'Recusa do paciente',
      'Infecção no local de punção',
      'Alergia a anestésicos locais',
      'Coagulopatia grave',
    ],
    material: [
      'Luvas estéreis',
      'Clorexidina alcoólica 0,5%',
      'Campo estéril',
      'Seringa 20 mL (x2)',
      'Agulha ecogênica 50-80mm',
      'Anestésico local (20-30 mL)',
      'USG linear 6-13 MHz',
      'Gel estéril + capa transdutor',
    ],
    technique: [
      'Paciente supino ou decúbito lateral, braço abduzido',
      'Transdutor na linha axilar média, 4ª-5ª costela',
      'Identificar músculo grande dorsal (superficial)',
      'Localizar músculo serrátil anterior (sobre costelas)',
      'Agulha em plano',
      'Depositar AL no plano profundo ao serrátil (20-30 mL)',
    ],
    tip: {
      title: 'Superficial vs Profundo',
      text: 'Plano profundo oferece maior dispersão e cobertura.',
    },
    anesthetics: [
      { drug: 'Bupivacaína', concentration: '0,25%', volume: '20-30 mL' },
      { drug: 'Ropivacaína', concentration: '0,2-0,375%', volume: '20-30 mL' },
    ],
  },
  {
    id: 'intercostal',
    name: 'Bloqueio intercostal',
    listName: 'Intercostal',
    region: 'Costela',
    volume: '3-5 mL/nível',
    type: 'Sensitivo',
    indications: [
      'Fratura de costela isolada',
      'Drenagem torácica (anestesia local)',
      'Toracostomia',
      'Biópsia pleural',
    ],
    contraindications: [
      'Recusa do paciente',
      'Infecção no local de punção',
      'Alergia a anestésicos locais',
      'Coagulopatia grave',
    ],
    material: [
      'Luvas estéreis',
      'Clorexidina alcoólica 0,5%',
      'Campo estéril',
      'Seringa 10 mL',
      'Agulha 22-25G x 40mm',
      'Anestésico local (3-5 mL por nível)',
      'USG linear 6-13 MHz',
      'Gel estéril + capa transdutor',
    ],
    technique: [
      'Identificar o nível da costela a ser bloqueada',
      'Transdutor linear sobre a costela',
      'Visualizar costela e músculo intercostal',
      'Agulha até o sulco costal (borda inferior)',
      'Aspirar (descartar punção vascular/pleural)',
      'Depositar 3-5 mL de AL',
      'Repetir nos níveis adjacentes se necessário',
    ],
    anesthetics: [
      { drug: 'Bupivacaína', concentration: '0,25-0,5%', volume: '3-5 mL' },
      { drug: 'Ropivacaína', concentration: '0,5%', volume: '3-5 mL' },
      { drug: 'Lidocaína', concentration: '1-2%', volume: '3-5 mL' },
    ],
  },
];

/** "Onde está a lesão?": 14 caminhos de lesão para bloqueio, por segmento. */
export const TOPOGRAPHY: readonly TopographyCategory[] = [
  {
    title: 'Pescoço / Clavícula',
    mappings: [
      { lesion: 'Fratura de clavícula', blockId: 'plexo-cervical', blockName: 'Plexo cervical' },
    ],
  },
  {
    title: 'Membro superior',
    mappings: [
      { lesion: 'Ombro, úmero proximal', blockId: 'interescalenico', blockName: 'Interescalênico' },
      { lesion: 'Cotovelo, antebraço', blockId: 'supraclavicular', blockName: 'Supraclavicular' },
      { lesion: 'Antebraço distal, mão', blockId: 'axilar', blockName: 'Axilar' },
      { lesion: 'Mão, dedos', blockId: 'punho', blockName: 'Punho' },
    ],
  },
  {
    title: 'Membro inferior',
    mappings: [
      { lesion: 'Quadril, fêmur proximal', blockId: 'peng', blockName: 'PENG' },
      { lesion: 'Quadril (alternativa)', blockId: 'fascia-iliaca', blockName: 'Fáscia ilíaca' },
      { lesion: 'Coxa anterior, joelho', blockId: 'femoral', blockName: 'Femoral' },
      {
        lesion: 'Perna distal, tornozelo, pé',
        blockId: 'ciatico-popliteo',
        blockName: 'Ciático poplíteo',
      },
      { lesion: 'Complemento (face medial)', blockId: 'safeno', blockName: 'Safeno' },
      { lesion: 'Pé, dedos', blockId: 'tornozelo', blockName: 'Tornozelo' },
    ],
  },
  {
    title: 'Tórax / Costelas',
    mappings: [
      { lesion: 'Fraturas costelas (posterior)', blockId: 'esp', blockName: 'ESP' },
      {
        lesion: 'Fraturas costelas (lateral)',
        blockId: 'serratil',
        blockName: 'Serrátil anterior',
      },
      { lesion: 'Fratura costela isolada', blockId: 'intercostal', blockName: 'Intercostal' },
    ],
  },
];

/** Lista de bloqueios por região (também as opções do tipo na nota de evolução). */
export const BLOCK_LIST: readonly BlockListRegion[] = [
  { region: 'Pescoço', blockIds: ['plexo-cervical'] },
  {
    region: 'Membro superior',
    blockIds: ['interescalenico', 'supraclavicular', 'axilar', 'punho'],
  },
  {
    region: 'Membro inferior',
    blockIds: ['peng', 'fascia-iliaca', 'femoral', 'safeno', 'ciatico-popliteo', 'tornozelo'],
  },
  { region: 'Tórax', blockIds: ['esp', 'serratil', 'intercostal'] },
];

const BY_ID = new Map(REGIONAL_BLOCKS.map((block) => [block.id, block]));

export function isRegionalBlockId(id: string): id is RegionalBlockId {
  return (REGIONAL_BLOCK_IDS as readonly string[]).includes(id);
}

export function getRegionalBlock(id: RegionalBlockId): RegionalBlock {
  const block = BY_ID.get(id);
  if (!block) throw new Error(`Bloqueio "${id}" sem ficha; confira REGIONAL_BLOCKS.`);
  return block;
}

/** Aviso abaixo da calculadora de dose máxima. */
export const MAX_DOSE_NOTICE = {
  title: 'Atenção',
  text: 'Considere reduzir 20-30% em idosos, hepatopatas, cardiopatas. Em bloqueios múltiplos, considere dose total.',
} as const;

/** LAST — toxicidade sistêmica por anestésico local: títulos da tela. */
export const LAST_PROTOCOL = {
  title: 'LAST — Intoxicação por AL',
  subtitle: 'Toxicidade sistêmica por anestésico local',
  warningSignsTitle: 'Sinais de alerta',
  lipidTitle: 'Emulsão lipídica 20%',
} as const;

export interface LastWarningSign {
  title: string;
  text: string;
  /** Neurológico (precoce) pede reavaliação; cardiovascular (tardio) é risco crítico. */
  tone: ResultTone;
}

export const LAST_WARNING_SIGNS: readonly LastWarningSign[] = [
  {
    title: 'Neurológicos (precoces)',
    text: 'Zumbido, gosto metálico, parestesias periorais, agitação, confusão, convulsões',
    tone: 'attention',
  },
  {
    title: 'Cardiovasculares (tardios)',
    text: 'Hipotensão, bradicardia, arritmias ventriculares, alargamento QRS, PCR',
    tone: 'critical',
  },
];

export interface LastStep {
  title: string;
  detail: string;
}

/** Os cinco passos do LAST, em ordem. */
export const LAST_STEPS: readonly LastStep[] = [
  {
    title: 'Parar a infusão de AL',
    detail: 'Interromper qualquer administração de anestésico local',
  },
  { title: 'Pedir ajuda', detail: 'Acionar equipe de suporte' },
  { title: 'Via aérea e O2 100%', detail: 'Considere IOT precoce. Evitar hipóxia e acidose' },
  { title: 'Tratar convulsões', detail: 'Benzodiazepínicos (midazolam 1-2 mg IV)' },
  {
    title: 'ACLS modificado se PCR',
    detail: 'Evitar vasopressina, reduzir epinefrina (≤1 mcg/kg)',
  },
];
