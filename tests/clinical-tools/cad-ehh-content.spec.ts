import { describe, expect, it } from 'vitest';
import * as K from '../any-reference/ketoData';
import * as C from '../../src/shared/clinical-tools/cad-ehh/content';

/**
 * CC-326 — todo o conteúdo do `ketoData.ts` do KetoPath está no motor, igual.
 * Cada export do ANY tem o seu correspondente (com os campos renomeados), e a
 * única diferença permitida é a troca de linguagem listada em `REWRITES`
 * (ordem de conduta → sugestão, ADR-017). Mudar um texto clínico sem passar
 * por aqui quebra o teste — e a revisão clínica (CC-310) vê a lista.
 */

/** Texto do ANY → texto no Copiloto. Doses e limiares iguais. */
const REWRITES: ReadonlyMap<string, string> = new Map([
  [
    'Adiar a insulina. Repor 10 a 20 mEq de KCl por hora até o potássio ultrapassar 3,5 mEq/L',
    'Considere adiar a insulina e repor 10 a 20 mEq de KCl por hora até o potássio ultrapassar 3,5 mEq/L',
  ],
  [
    'Adicionar 10 a 20 mEq de KCl a cada litro de fluido, mantendo o potássio entre 4 e 5 mEq/L',
    'Considere adicionar 10 a 20 mEq de KCl a cada litro de fluido, mantendo o potássio entre 4 e 5 mEq/L',
  ],
  [
    'Não repor. Dosar o potássio a cada 2 horas',
    'Considere não repor e dosar o potássio a cada 2 horas',
  ],
  ['Reduzir para 0,05 U/kg/h', 'Considere reduzir para 0,05 U/kg/h'],
]);

const used = new Set<string>();

function rewrite<T>(value: T): T {
  if (typeof value === 'string') {
    const replacement = REWRITES.get(value);
    if (replacement === undefined) return value;
    used.add(value);
    return replacement as T;
  }
  if (Array.isArray(value)) return value.map(rewrite) as T;
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, rewrite(item)]),
    ) as T;
  }
  return value;
}

/** Cada export do ANY → o mesmo conteúdo do motor, no formato do ANY. */
const PORTED: Record<string, unknown> = {
  NOTA_UNIDADES: C.UNITS_NOTE,
  QUANDO_SUSPEITAR: C.WHEN_TO_SUSPECT,
  ALERTA_DOR_ABDOMINAL: C.ABDOMINAL_PAIN_ALERT,
  CAD_EUGLICEMICA: C.EUGLYCEMIC_DKA,
  CRITERIOS_CAD: C.DKA_CRITERIA.map(({ axis, criterion }) => ({ eixo: axis, criterio: criterion })),
  NOTA_CRITERIOS_CAD: C.DKA_CRITERIA_NOTE,
  NOTA_GASOMETRIA: C.BLOOD_GAS_NOTE,
  DISCORDANCIA_CETONURIA: C.KETONURIA_DISCORDANCE,
  SOBREPOSICAO_CAD_EHH: C.DKA_HHS_OVERLAP,
  CRITERIOS_EHH: C.HHS_CRITERIA,
  NOTA_EHH: C.HHS_NOTE,
  NOTA_GRAVIDADE: C.SEVERITY_NOTE,
  DIAGNOSTICO_DIFERENCIAL: C.DIFFERENTIAL_DIAGNOSIS,
  PAINEL_INICIAL: C.INITIAL_PANEL,
  NOTA_PAINEL_INICIAL: C.INITIAL_PANEL_NOTE,
  NOTA_ECG: C.ECG_NOTE,
  AVALIACAO_VOLEMIA: C.VOLEMIA_ASSESSMENT,
  EXAMES_CONFORME_SUSPEITA: C.SUSPICION_DRIVEN_TESTS.map(({ test, trigger }) => ({
    exame: test,
    gatilho: trigger,
  })),
  NOTA_ANION_GAP: C.ANION_GAP_NOTE,
  NOTA_SODIO_CORRIGIDO: C.CORRECTED_SODIUM_NOTE,
  NOTA_DEFICIT_AGUA: C.FREE_WATER_DEFICIT_NOTE,
  FLUIDO_INICIAL: C.INITIAL_FLUID,
  PREFERENCIA_FLUIDO: C.FLUID_PREFERENCE,
  ESTADOS_VOLEMICOS: C.VOLEMIC_STATES.map(({ id, label, conduct, extra }) => ({
    id,
    label,
    conduta: conduct,
    extra,
  })),
  ALERTA_SOBRECARGA: C.OVERLOAD_ALERT,
  REAVALIACAO_EXPANSAO: C.POST_EXPANSION_REASSESSMENT,
  FASE_B: { abaixo135: C.MAINTENANCE_FLUID.below135, acima135: C.MAINTENANCE_FLUID.atOrAbove135 },
  GATILHO_DEXTROSE: C.DEXTROSE_TRIGGER,
  NOTA_VEICULO_DEXTROSE: C.DEXTROSE_VEHICLE_NOTE,
  EHH_VELOCIDADES: C.HHS_SPEEDS,
  EHH_LIMITES: C.HHS_LIMITS,
  EHH_ALERTA_SODIO: C.HHS_SODIUM_ALERT,
  EHH_DEFICIT_VOLUME: C.HHS_VOLUME_DEFICIT,
  POTASSIO_INTRO: C.POTASSIUM_INTRO,
  GATE_FUNCAO_RENAL: C.RENAL_FUNCTION_GATE,
  POTASSIO_FAIXAS: C.POTASSIUM_BANDS.map(({ id, range, conduct }) => ({
    id,
    faixa: range,
    conduta: conduct,
  })),
  POTASSIO_ALERTA_BAIXO: C.LOW_POTASSIUM_ALERT,
  POTASSIO_MONITORIZACAO: C.POTASSIUM_MONITORING,
  KCL_APRESENTACOES: C.KCL_PRESENTATIONS.map(
    ({ id, label, description, mEqPerAmpoule, mlPerAmpoule }) => ({
      id,
      label,
      descricao: description,
      mEqPorAmpola: mEqPerAmpoule,
      mlPorAmpola: mlPerAmpoule,
    }),
  ),
  KCL_VIAS: C.KCL_ROUTES.map(({ id, label, maxMEqPerLiter }) => ({
    id,
    label,
    maxMEqPorLitro: maxMEqPerLiter,
  })),
  KCL_VELOCIDADE: C.KCL_SPEED,
  KCL_MONITORIZACAO: C.KCL_MONITORING,
  KCL_EFEITO_OSMOTICO: C.KCL_OSMOTIC_EFFECT,
  INSULINA_BLOQUEIO_ATIVO: C.INSULIN_BLOCKED,
  INSULINA_GATE_VAZIO: C.INSULIN_GATE_EMPTY,
  INSULINA_PREPARO: C.INSULIN_PREPARATION,
  INSULINA_PURGA: C.INSULIN_PRIMING,
  INSULINA_PURGA_NOTA: C.INSULIN_PRIMING_NOTE,
  INSULINA_DOSES: C.INSULIN_DOSES.map(({ situation, speed, rate }) => ({
    situacao: situation,
    velocidade: speed,
    taxa: rate,
  })),
  INSULINA_TEXTOS: C.INSULIN_TEXTS,
  INSULINA_TEXTO_EHH: C.INSULIN_TEXTS_HHS,
  INSULINA_APOS_REDUCAO: C.INSULIN_AFTER_REDUCTION,
  INSULINA_BOMBA_ATIVA: C.INSULIN_PUMP_RUNNING,
  INSULINA_BASAL: C.BASAL_INSULIN,
  BICARBONATO_PH_ALTO: C.BICARBONATE_PH_HIGH,
  BICARBONATO_PH_BAIXO: C.BICARBONATE_PH_LOW,
  BICARBONATO_LINHA_KCL: C.BICARBONATE_KCL_LINE,
  FOSFATO: C.PHOSPHATE,
  CADENCIA_EXAMES: C.LAB_CADENCE.map(({ parameter, frequency }) => ({
    parametro: parameter,
    frequencia: frequency,
  })),
  NOTA_BHB_INDISPONIVEL: C.BHB_UNAVAILABLE_NOTE,
  CADENCIA_TEXTOS: C.CADENCE_TEXTS,
  RESPOSTA_ESPERADA: C.EXPECTED_RESPONSE,
  QUEDA_INSUFICIENTE_INTRO: C.INSUFFICIENT_FALL_INTRO,
  QUEDA_INSUFICIENTE_PASSOS: C.INSUFFICIENT_FALL_STEPS,
  TETO_QUEDA: C.FALL_CEILING,
  NOTA_TETO_QUEDA: C.FALL_CEILING_NOTE,
  APOS_250: C.AFTER_250,
  ALVO_MANUTENCAO: C.MAINTENANCE_TARGETS.map(({ phase, target }) => ({
    fase: phase,
    alvo: target,
  })),
  VELOCIDADE_CORRECAO_CAD: C.DKA_CORRECTION_SPEED,
  RESOLUCAO_CAD_ADA: C.DKA_RESOLUTION_ADA,
  RESOLUCAO_CAD_ADAPTADA: C.DKA_RESOLUTION_ADAPTED.map(({ criterion, weight }) => ({
    criterio: criterion,
    valor: weight,
  })),
  NAO_USAR_RESOLUCAO: C.DO_NOT_USE_FOR_RESOLUTION,
  RESOLUCAO_EHH_TEXTO: C.HHS_RESOLUTION_TEXT,
  RESOLUCAO_EHH_CHECKLIST: C.HHS_RESOLUTION_CHECKLIST,
  TRANSICAO_TEXTOS: C.TRANSITION_TEXTS,
  TRANSICAO_SOBREPOSICAO: C.TRANSITION_OVERLAP.map(({ id, type, time }) => ({
    id,
    tipo: type,
    tempo: time,
  })),
  TRANSICAO_NOTA_SOBREPOSICAO: C.TRANSITION_OVERLAP_NOTE,
  TRANSICAO_DDT: C.TRANSITION_TOTAL_DAILY_DOSE.map(({ situation, dose }) => ({
    situacao: situation,
    dose,
  })),
  TRANSICAO_NOTA_REPARTICAO: C.TRANSITION_SPLIT_NOTE,
  TRANSICAO_TEXTOS_FINAIS: C.TRANSITION_FINAL_TEXTS,
  ARMADILHAS: C.PITFALLS.map(({ title, texts }) => ({ titulo: title, textos: texts })),
  FATOR_PRECIPITANTE_INTRO: C.PRECIPITANT_INTRO,
  FATORES_PRECIPITANTES: C.PRECIPITANTS.map(({ id, label, note }) => ({ id, label, nota: note })),
  NOTA_ISGLT2: C.SGLT2_NOTE,
  RASTREIO_SAUDE_MENTAL: C.MENTAL_HEALTH_SCREENING,
  DISPOSICAO: C.DISPOSITION,
  DISPOSICAO_TEXTOS: C.DISPOSITION_TEXTS,
  REFERENCIAS: C.REFERENCES.map(({ text, url }) => ({ texto: text, url })),
  KETO_CAMPOS: C.LAB_FIELDS.map(({ id, label, unit, min, max, required }) => ({
    id,
    label,
    unidade: unit,
    min,
    max,
    obrigatorio: required,
  })),
  CETONURIA_OPCOES: C.KETONURIA_OPTIONS,
  CONSCIENCIA_OPCOES: C.CONSCIOUSNESS_OPTIONS,
  KETO_SECOES: C.LEGACY_SECTIONS,
};

/** Exports do ANY que não são conteúdo: o formato do estado da tela. */
const NOT_CONTENT = new Set(['KETO_DADOS_VAZIO']);

describe('conteúdo do ketoData no motor', () => {
  const anyExports = Object.entries(K as Record<string, unknown>);

  it('todo export do ANY tem correspondente no motor', () => {
    const missing = anyExports
      .map(([name]) => name)
      .filter((name) => !(name in PORTED) && !NOT_CONTENT.has(name));
    expect(missing).toEqual([]);
    expect(Object.keys(PORTED).filter((name) => !(name in K))).toEqual([]);
  });

  it.each(Object.keys(PORTED))('%s igual ao ANY (salvo a troca de linguagem listada)', (name) => {
    const anyValue = (K as Record<string, unknown>)[name];
    expect(PORTED[name]).toEqual(rewrite(anyValue));
  });

  it('cada troca de linguagem listada foi usada (nenhuma sobrou)', () => {
    for (const name of Object.keys(PORTED)) rewrite((K as Record<string, unknown>)[name]);
    expect([...REWRITES.keys()].filter((text) => !used.has(text))).toEqual([]);
  });
});
