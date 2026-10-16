import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { EncounterContext } from '../../../shared/contracts/clinical';
import type { EncounterSite } from '../../../shared/contracts/practice-site';
import { buildDecisionV2Prompt, type DecisionV2PromptInput } from './decision-prompt-v2';
import { buildDecisionV3Prompt } from './decision-prompt-v3';
import { buildDecisionV4Prompt, DECISION_V4_SYSTEM_PROMPT } from './decision-prompt-v4';
import { buildPrompt, type BuiltPrompt, type PromptInput } from './prompt-builder';
import {
  buildFacilityContextBlock,
  declaredSiteContext,
  FACILITY_TRANSFER_RULE_STAGED,
  FACILITY_TRANSFER_RULE_V1,
  missingResources,
} from './site-context-prompt';

const upaSite: EncounterSite = {
  siteId: '22222222-2222-4222-8222-222222222222',
  name: 'UPA Centro do Interior',
  facilityType: 'upa_porte_1',
  specialists: [],
  referenceTravelMinutes: 90,
  referenceDistanceKm: 60,
};

const upaResources = { hasCT: false, isSus: true, hasLab: true, hasICU: false };
const upaContext: EncounterContext = { ...upaResources, site: upaSite };

const strokeCase = 'Homem, 70 anos, hemiparesia direita e afasia súbitas há 1 hora. PA 178x96.';

function stagedInput(overrides: Partial<DecisionV2PromptInput> = {}): DecisionV2PromptInput {
  return {
    caseText: strokeCase,
    redFlags: { anticoagulant: true },
    context: upaResources,
    retrievedChunks: [],
    officialChunks: [],
    physicianAttachments: [],
    webEvidence: [],
    ...overrides,
  };
}

function v1Input(overrides: Partial<PromptInput> = {}): PromptInput {
  return {
    caseText: strokeCase,
    retrievedChunks: [],
    context: upaResources,
    redFlags: { anticoagulant: true },
    ...overrides,
  };
}

function fingerprint(prompt: BuiltPrompt): string {
  return createHash('sha256')
    .update(JSON.stringify([prompt.system, prompt.user, prompt.retrievedChunkIds]))
    .digest('hex');
}

/**
 * Impressões digitais gravadas ANTES do CC-602/CC-603, com o mesmo caso e os
 * mesmos recursos (sem local). Com `COPILOT_SITE_CONTEXT` desligado — ou sem
 * local declarado no caso — o prompt precisa sair byte a byte igual: é o que
 * mantém comparável o gabarito clínico das variantes de hoje.
 */
const BASELINE = {
  v1: '4107b1f604451830e2f83dd69f922812854b4bb85ef18d2b089e69e7fd841b92',
  v2: 'd0543d6ac8baa872624bd577cdd1254a7d836c5ba11578f2da7f3b02ac374943',
  v3: '0a6a13686bee0e21d0e4ffe4c16b764f99571c864bb779fdb07c4a933a18e922',
  v4: '5ec6662a0c195647fe9913af08d609d7e1fae2dd8ffc19a678b16ebef22aafa5',
  v4es: '0a1597ae30d74258c6f94395bd6736b5f52c27bfd8d2c7dbb158c496bdc5d3c6',
};

describe('buildFacilityContextBlock', () => {
  it('says what the facility does NOT have, not only what it has', () => {
    const block = buildFacilityContextBlock({ ...upaContext, site: upaSite });

    expect(block).toBe(`<facility_context type="PHYSICIAN_DECLARED">
Local do atendimento: UPA 24h porte I.
Tem no local: laboratório.
NÃO tem no local: tomografia, UTI.
Especialistas no plantão: nenhum além do médico do plantão.
Tempo até o hospital de referência: cerca de 90 min (60 km).
Atendimento pelo SUS.
</facility_context>`);
  });

  it('never carries the free-text site name', () => {
    expect(buildFacilityContextBlock({ ...upaContext, site: upaSite })).not.toContain(
      'UPA Centro do Interior',
    );
  });

  it('lists the specialists on call and drops the empty resource lines', () => {
    const block = buildFacilityContextBlock({
      hasCT: true,
      hasLab: true,
      hasICU: true,
      isSus: false,
      site: {
        ...upaSite,
        facilityType: 'hospital_com_uti',
        specialists: ['neurologia', 'cardiologia'],
      },
    });

    expect(block).toContain('Local do atendimento: Hospital com UTI.');
    expect(block).toContain('Tem no local: tomografia, laboratório, UTI.');
    expect(block).not.toContain('NÃO tem no local');
    expect(block).toContain('Especialistas no plantão: Neurologia, Cardiologia.');
    expect(block).not.toContain('SUS');
  });

  it.each([
    [
      { referenceTravelMinutes: null, referenceDistanceKm: null },
      'Tempo até o hospital de referência: não informado.',
    ],
    [
      { referenceTravelMinutes: 45, referenceDistanceKm: null },
      'Tempo até o hospital de referência: cerca de 45 min.',
    ],
    [
      { referenceTravelMinutes: null, referenceDistanceKm: 120 },
      'Distância até o hospital de referência: cerca de 120 km.',
    ],
  ])('describes the reference %j', (reference, line) => {
    expect(
      buildFacilityContextBlock({ ...upaContext, site: { ...upaSite, ...reference } }),
    ).toContain(line);
  });

  it('omits "Tem no local" when the facility has none of the resources', () => {
    const block = buildFacilityContextBlock({
      hasCT: false,
      hasLab: false,
      hasICU: false,
      isSus: true,
      site: upaSite,
    });
    expect(block).not.toContain('Tem no local:');
    expect(block).toContain('NÃO tem no local: tomografia, laboratório, UTI.');
  });
});

describe('declaredSiteContext / missingResources', () => {
  it('applies only with the flag on and a declared site', () => {
    expect(declaredSiteContext(upaContext, false)).toBeNull();
    expect(declaredSiteContext(upaContext, undefined)).toBeNull();
    // Sem local, `false` é "não marcado": nunca vira "o serviço não tem".
    expect(declaredSiteContext(upaResources, true)).toBeNull();
    expect(declaredSiteContext(upaContext, true)?.site).toEqual(upaSite);
  });

  it('names the missing resources for the log, without the case', () => {
    expect(missingResources(upaContext)).toEqual(['hasCT', 'hasICU']);
    expect(missingResources({ ...upaContext, hasCT: true, hasICU: true })).toEqual([]);
  });
});

describe('COPILOT_SITE_CONTEXT desligado — prompt byte a byte igual', () => {
  it.each([
    ['v1', () => buildPrompt(v1Input({ context: upaContext })), BASELINE.v1],
    ['v2', () => buildDecisionV2Prompt(stagedInput({ context: upaContext })), BASELINE.v2],
    ['v3', () => buildDecisionV3Prompt(stagedInput({ context: upaContext })), BASELINE.v3],
    ['v4', () => buildDecisionV4Prompt(stagedInput({ context: upaContext })), BASELINE.v4],
    [
      'v4 es',
      () => buildDecisionV4Prompt(stagedInput({ context: upaContext, locale: 'es' })),
      BASELINE.v4es,
    ],
  ])('%s ignores the declared site', (_version, build, sha256) => {
    expect(fingerprint(build())).toBe(sha256);
  });

  it.each([
    ['v1', () => buildPrompt(v1Input({ siteContext: true })), BASELINE.v1],
    ['v4', () => buildDecisionV4Prompt(stagedInput({ siteContext: true })), BASELINE.v4],
  ])('%s with the flag on but no declared site stays the same', (_version, build, sha256) => {
    expect(fingerprint(build())).toBe(sha256);
  });
});

describe('COPILOT_SITE_CONTEXT ligado, com local declarado (CC-603)', () => {
  it('staged: appends the transfer rule to the cacheable system prompt', () => {
    const prompt = buildDecisionV4Prompt(stagedInput({ context: upaContext, siteContext: true }));

    expect(prompt.system).toBe(`${DECISION_V4_SYSTEM_PROMPT}${FACILITY_TRANSFER_RULE_STAGED}`);
  });

  it('staged: the facility block replaces "Recursos disponíveis" in the user message', () => {
    const off = buildDecisionV4Prompt(stagedInput({ context: upaContext }));
    const on = buildDecisionV4Prompt(stagedInput({ context: upaContext, siteContext: true }));

    expect(off.user).toContain('Recursos disponíveis:\n- Paciente SUS\n- Laboratório disponível');
    expect(on.user).not.toContain('Recursos disponíveis:');
    expect(on.user).toContain('NÃO tem no local: tomografia, UTI.');
    expect(on.user.replace(buildFacilityContextBlock({ ...upaContext, site: upaSite }), '')).toBe(
      off.user.replace('Recursos disponíveis:\n- Paciente SUS\n- Laboratório disponível', ''),
    );
    expect(on.retrievedChunkIds).toEqual(off.retrievedChunkIds);
  });

  it('staged: keeps the language rule before the transfer rule', () => {
    const prompt = buildDecisionV4Prompt(
      stagedInput({ context: upaContext, siteContext: true, locale: 'es' }),
    );

    expect(prompt.system.endsWith(FACILITY_TRANSFER_RULE_STAGED)).toBe(true);
    expect(prompt.system).toContain('LANGUAGE RULE');
  });

  it('the rule asks for destination, priority and conduct until the transfer', () => {
    for (const rule of [FACILITY_TRANSFER_RULE_STAGED, FACILITY_TRANSFER_RULE_V1]) {
      expect(rule).toContain('no CT: no head CT or CT angiography here');
      expect(rule).toContain('no thrombolysis or other treatment that needs a CT first');
      expect(rule).toContain('central de regulação');
      expect(rule).toContain('"Prioridade: imediata"');
      expect(rule).toContain('the conduct until the transfer');
      expect(rule).toContain('Count the time to the reference');
    }
  });

  it('v1: appends the v1 rule after the official guidelines rule', () => {
    const official = [
      {
        chunkId: 'off-1',
        text: 'Trecho oficial.',
        source: 'PCDT AVC',
        sourceVersion: 'Portaria 29/2023',
        score: 0.8,
      },
    ];
    const prompt = buildPrompt(
      v1Input({ context: upaContext, siteContext: true, officialChunks: official }),
    );

    expect(prompt.system.endsWith(FACILITY_TRANSFER_RULE_V1)).toBe(true);
    expect(prompt.system.indexOf('OFFICIAL MS GUIDELINES RULE')).toBeLessThan(
      prompt.system.indexOf('FACILITY AND TRANSFER RULE'),
    );
    expect(prompt.user).toContain('<facility_context type="PHYSICIAN_DECLARED">');
  });

  it('v1 without evidence: the facility block also reaches the case-only path', () => {
    const off = buildPrompt(v1Input({ context: upaContext }));
    const on = buildPrompt(v1Input({ context: upaContext, siteContext: true }));

    expect(off.user).not.toContain('facility_context');
    expect(on.user).toContain('NÃO tem no local: tomografia, UTI.');
    expect(on.user.indexOf('</facility_context>')).toBeLessThan(on.user.indexOf('WARNING:'));
  });

  it('v1 with curated evidence: the facility block replaces the resources list', () => {
    const chunks = [
      {
        chunkId: 'c-1',
        text: 'Trombólise até 4,5 h após TC sem hemorragia.',
        source: 'Diretriz AVC',
        sourceVersion: '1',
        score: 0.9,
      },
    ];
    const prompt = buildPrompt(
      v1Input({ context: upaContext, siteContext: true, retrievedChunks: chunks }),
    );

    expect(prompt.user).not.toContain('Recursos disponíveis:');
    expect(prompt.user.indexOf('</guideline_evidence>')).toBeLessThan(
      prompt.user.indexOf('<facility_context'),
    );
  });
});
