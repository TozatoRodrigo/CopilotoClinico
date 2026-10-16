import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DocumentsService } from './documents.service';
import { PrismaService } from '../../config/prisma.service';
import { AuditService } from '../audit/audit.service';
import { StorageService } from '../storage/storage.service';
import { InstitutionsService } from '../institutions/institutions.service';
import { NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { extractText, getDocumentProxy } from 'unpdf';
import { sealContent } from './content-hash';
import { AI_USE_RECORD_TEXT } from './ai-use-record';

const physicianId = '550e8400-e29b-41d4-a716-446655440000';
const otherPhysicianId = '660e8400-e29b-41d4-a716-446655440001';
const encounterId = '770e8400-e29b-41d4-a716-446655440002';
const aiInteractionId = '880e8400-e29b-41d4-a716-446655440003';
const documentId = '990e8400-e29b-41d4-a716-446655440004';
const institutionId = 'aa0e8400-e29b-41d4-a716-446655440005';

const copilotRawOutput = {
  reasoning: 'Patient shows signs of hypertension',
  recommendations: [
    {
      action: 'Initiate ACE inhibitor therapy',
      rationale: 'BP consistently above 140/90',
      citationChunkId: 'chunk-1',
      confidence: 0.85,
    },
  ],
  uncertainty: false,
  uncertaintyReason: null,
  differentials: [],
  // PI-04 — generateSBAR() itera redFlags/clarifyingQuestions para montar
  // as seções de vigilâncias/pendências; faltavam aqui (fixture antigo,
  // anterior a esses campos existirem no schema real do copilot output).
  redFlags: [],
  clarifyingQuestions: [],
};

const baseDocument = {
  id: documentId,
  encounterId,
  type: 'soap',
  content: {
    subjective: 'Patient shows signs of hypertension',
    objective: 'Raciocínio clínico: Patient shows signs of hypertension',
    assessment: 'Baseado em 1 recomendações fundamentadas em diretrizes',
    plan: '- Initiate ACE inhibitor therapy (BP consistently above 140/90)',
  },
  physicianEdits: null,
  confirmedBy: null,
  confirmedAt: null,
  contentHash: 'abc123hash',
  createdAt: new Date('2025-01-01'),
};

/** Hash do selo atual, o mesmo que documents.service.ts grava. */
function canonicalHashOf(content: Record<string, unknown>): string {
  return sealContent(content as Parameters<typeof sealContent>[0]).contentHash;
}

/** Texto do PDF sem espaços: o pdfkit quebra linhas longas (ver document-pdf.builder.spec.ts). */
const withoutSpaces = (text: string): string => text.replace(/\s+/g, '');

describe('DocumentsService', () => {
  let service: DocumentsService;
  let auditService: AuditService;
  let storageService: { isAvailable: ReturnType<typeof vi.fn>; upload: ReturnType<typeof vi.fn>; getPresignedUrl: ReturnType<typeof vi.fn> };
  let institutionsService: { listForPhysician: ReturnType<typeof vi.fn> };
  let prisma: {
    encounter: {
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    physician: {
      findUnique: ReturnType<typeof vi.fn>;
    };
    aiInteraction: {
      findUnique: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
    };
    document: {
      create: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();

    prisma = {
      encounter: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      physician: {
        findUnique: vi.fn().mockResolvedValue({ crmVerified: true }),
      },
      aiInteraction: {
        findUnique: vi.fn(),
        findFirst: vi.fn().mockResolvedValue(null),
      },
      document: {
        create: vi.fn(),
        findUnique: vi.fn(),
        // RD-E7 — generate() consulta isto primeiro para idempotência por
        // (encounterId, type); null por padrão = "nenhum documento desse
        // tipo ainda existe", o caminho feliz de criação que a maioria dos
        // testes já assume.
        findFirst: vi.fn().mockResolvedValue(null),
        update: vi.fn(),
        findMany: vi.fn(),
      },
    };

    auditService = { log: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService;
    storageService = {
      isAvailable: vi.fn().mockReturnValue(false),
      upload: vi.fn(),
      getPresignedUrl: vi.fn(),
    };
    // Padrão: o médico "atual" (physicianId) não pertence a nenhuma
    // instituição — testes de cobertura de plantão sobrescrevem isto.
    institutionsService = { listForPhysician: vi.fn().mockResolvedValue([]) };
    service = new DocumentsService(
      prisma as unknown as PrismaService,
      auditService,
      storageService as unknown as StorageService,
      institutionsService as unknown as InstitutionsService,
    );
  });

  describe('generate', () => {
    it('creates document with content hash', async () => {
      prisma.encounter.findUnique.mockResolvedValue({
        physicianId,
        patientRef: 'PAT-001',
      });
      prisma.aiInteraction.findUnique.mockResolvedValue({
        rawOutput: copilotRawOutput,
      });
      prisma.document.create.mockResolvedValue(baseDocument);

      const result = await service.generate(physicianId, encounterId, {
        type: 'soap',
        aiInteractionId,
      });

      expect(prisma.document.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            encounterId,
            physicianId,
            type: 'soap',
            contentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
            contentHashVersion: 2,
          }),
        }),
      );
      expect(result).toEqual(baseDocument);
    });

    it('registra o selo da geração no payload da auditoria', async () => {
      prisma.encounter.findUnique.mockResolvedValue({ physicianId, patientRef: 'PAT-001' });
      prisma.aiInteraction.findUnique.mockResolvedValue({ rawOutput: copilotRawOutput });
      prisma.document.create.mockResolvedValue(baseDocument);

      await service.generate(physicianId, encounterId, { type: 'soap', aiInteractionId });

      const [createCall] = prisma.document.create.mock.calls as [[{ data: { content: object } }]];
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'DOCUMENT_GENERATED',
          payload: expect.objectContaining(sealContent(createCall[0].data.content)),
        }),
      );
    });

    it('creates SBAR document', async () => {
      prisma.encounter.findUnique.mockResolvedValue({
        physicianId,
        patientRef: 'PAT-001',
      });
      prisma.aiInteraction.findUnique.mockResolvedValue({
        rawOutput: copilotRawOutput,
      });
      prisma.document.create.mockResolvedValue({
        ...baseDocument,
        type: 'sbar',
      });

      const result = await service.generate(physicianId, encounterId, {
        type: 'sbar',
        aiInteractionId,
      });

      expect(prisma.document.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: 'sbar' }),
        }),
      );
      expect(result.type).toBe('sbar');
    });

    /**
     * F0-D — Res. CFM 2.454/2026. Mudança DELIBERADA no hash de geração: o
     * registro de uso de IA é parte do conteúdo, então o mesmo caso gera um
     * hash diferente do que gerava antes — e quem conferir o documento
     * assinado consegue provar que o registro estava lá.
     */
    describe('F0-D: registro de uso de IA', () => {
      function mockGenerationFor() {
        prisma.encounter.findUnique.mockResolvedValue({ physicianId, patientRef: 'PAT-001' });
        prisma.aiInteraction.findUnique.mockResolvedValue({ rawOutput: copilotRawOutput });
        prisma.document.create.mockImplementation(({ data }) => Promise.resolve({ id: documentId, ...data }));
      }

      function createdData(): { content: Record<string, unknown>; contentHash: string } {
        return (prisma.document.create.mock.calls[0]![0] as {
          data: { content: Record<string, unknown>; contentHash: string };
        }).data;
      }

      it.each(['soap', 'sbar', 'alta'] as const)(
        'grava o registro no conteúdo do %s e o hash de geração o cobre',
        async (type) => {
          mockGenerationFor();

          await service.generate(physicianId, encounterId, { type, aiInteractionId });

          const { content, contentHash } = createdData();
          expect(content.aiUseRecord).toBe(AI_USE_RECORD_TEXT);
          expect(contentHash).toBe(canonicalHashOf(content));
          const { aiUseRecord: _record, ...withoutRecord } = content;
          expect(contentHash).not.toBe(canonicalHashOf(withoutRecord));
        },
      );

      it.each(['prescricao', 'atestado'] as const)(
        'não grava o registro na %s (decisão jurídica pendente)',
        async (type) => {
          mockGenerationFor();

          await service.generate(physicianId, encounterId, { type, aiInteractionId });

          expect(createdData().content).not.toHaveProperty('aiUseRecord');
        },
      );
    });

    it('throws NotFoundException for missing encounter', async () => {
      prisma.encounter.findUnique.mockResolvedValue(null);

      await expect(
        service.generate(physicianId, encounterId, {
          type: 'soap',
          aiInteractionId,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException for wrong physician', async () => {
      prisma.encounter.findUnique.mockResolvedValue({
        physicianId: otherPhysicianId,
        patientRef: 'PAT-001',
      });

      await expect(
        service.generate(physicianId, encounterId, {
          type: 'soap',
          aiInteractionId,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    // S25-QC-02 — consulta rápida (patientRef null) responde normalmente
    // no Copiloto, mas não pode gerar documento formal — mesma exigência do
    // processo de sempre. Checado no backend porque este é o único caminho
    // real de criação de documento.
    describe('S25-QC-02: exige paciente identificado para gerar documento', () => {
      it('throws ForbiddenException when the encounter has no patientRef (quick consult)', async () => {
        prisma.encounter.findUnique.mockResolvedValue({
          physicianId,
          patientRef: null,
        });

        await expect(
          service.generate(physicianId, encounterId, {
            type: 'soap',
            aiInteractionId,
          }),
        ).rejects.toThrow(ForbiddenException);

        expect(prisma.document.create).not.toHaveBeenCalled();
      });

      it('still returns an already-existing document even if patientRef is somehow null (does not break previously generated docs)', async () => {
        prisma.encounter.findUnique.mockResolvedValue({
          physicianId,
          patientRef: null,
        });
        prisma.document.findFirst.mockResolvedValue(baseDocument);

        const result = await service.generate(physicianId, encounterId, {
          type: 'soap',
          aiInteractionId,
        });

        expect(result).toEqual(baseDocument);
        expect(prisma.document.create).not.toHaveBeenCalled();
      });
    });

    it('throws NotFoundException for missing AI interaction', async () => {
      prisma.encounter.findUnique.mockResolvedValue({
        physicianId,
        patientRef: 'PAT-001',
      });
      prisma.aiInteraction.findUnique.mockResolvedValue(null);

      await expect(
        service.generate(physicianId, encounterId, {
          type: 'soap',
          aiInteractionId,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    // RD-E7 — idempotência por (encounterId, type): a tela Documento chama
    // generate() livremente ao trocar de aba (SOAP/SBAR/...); gerar de novo
    // um tipo já existente não pode duplicar o documento.
    describe('RD-E7: idempotency', () => {
      it('returns the existing document instead of creating a duplicate when one already exists for this type', async () => {
        prisma.encounter.findUnique.mockResolvedValue({
          physicianId,
          patientRef: 'PAT-001',
        });
        prisma.document.findFirst.mockResolvedValue(baseDocument);

        const result = await service.generate(physicianId, encounterId, {
          type: 'soap',
          aiInteractionId,
        });

        expect(prisma.document.findFirst).toHaveBeenCalledWith({
          where: { encounterId, type: 'soap' },
          orderBy: { createdAt: 'desc' },
          select: expect.any(Object),
        });
        expect(prisma.document.create).not.toHaveBeenCalled();
        expect(prisma.aiInteraction.findUnique).not.toHaveBeenCalled();
        expect(result).toEqual(baseDocument);
      });

      it('returns the existing CONFIRMED document too — idempotency is not limited to drafts', async () => {
        prisma.encounter.findUnique.mockResolvedValue({
          physicianId,
          patientRef: 'PAT-001',
        });
        const confirmedDoc = {
          ...baseDocument,
          confirmedBy: physicianId,
          confirmedAt: new Date('2025-01-02'),
        };
        prisma.document.findFirst.mockResolvedValue(confirmedDoc);

        const result = await service.generate(physicianId, encounterId, {
          type: 'soap',
          aiInteractionId,
        });

        expect(prisma.document.create).not.toHaveBeenCalled();
        expect(result).toEqual(confirmedDoc);
      });

      it('falls back to the most recent AI interaction when aiInteractionId is omitted', async () => {
        prisma.encounter.findUnique.mockResolvedValue({
          physicianId,
          patientRef: 'PAT-001',
        });
        prisma.aiInteraction.findFirst.mockResolvedValue({ id: aiInteractionId });
        prisma.aiInteraction.findUnique.mockResolvedValue({ rawOutput: copilotRawOutput });
        prisma.document.create.mockResolvedValue(baseDocument);

        const result = await service.generate(physicianId, encounterId, { type: 'soap' });

        expect(prisma.aiInteraction.findFirst).toHaveBeenCalledWith({
          where: { encounterId },
          orderBy: { createdAt: 'desc' },
          select: { id: true },
        });
        expect(prisma.aiInteraction.findUnique).toHaveBeenCalledWith({
          where: { id: aiInteractionId },
          select: { rawOutput: true },
        });
        expect(result).toEqual(baseDocument);
      });

      it('throws NotFoundException when aiInteractionId is omitted and the encounter has no analysis yet', async () => {
        prisma.encounter.findUnique.mockResolvedValue({
          physicianId,
          patientRef: 'PAT-001',
        });
        prisma.aiInteraction.findFirst.mockResolvedValue(null);

        await expect(
          service.generate(physicianId, encounterId, { type: 'soap' }),
        ).rejects.toThrow(NotFoundException);
        expect(prisma.aiInteraction.findUnique).not.toHaveBeenCalled();
      });
    });
  });

  describe('edit', () => {
    it('saves physician edits before confirmation', async () => {
      prisma.document.findUnique.mockResolvedValue({
        physicianId,
        confirmedBy: null,
      });
      prisma.document.update.mockResolvedValue({
        ...baseDocument,
        physicianEdits: { subjective: 'Edited text' },
      });

      const result = await service.edit(physicianId, documentId, {
        physicianEdits: { subjective: 'Edited text' },
      });

      expect(prisma.document.update).toHaveBeenCalledWith({
        where: { id: documentId },
        data: { physicianEdits: { subjective: 'Edited text' } },
        select: expect.any(Object),
      });
      expect(result.physicianEdits).toEqual({ subjective: 'Edited text' });
    });

    // F0-D — o registro de uso de IA não é editável pelo médico.
    describe('F0-D: registro de uso de IA', () => {
      const generatedContent = { ...baseDocument.content, aiUseRecord: 'texto da geração' };

      function savedEdits(): Record<string, unknown> {
        return (prisma.document.update.mock.calls[0]![0] as {
          data: { physicianEdits: Record<string, unknown> };
        }).data.physicianEdits;
      }

      beforeEach(() => {
        prisma.document.findUnique.mockResolvedValue({
          physicianId,
          confirmedBy: null,
          content: generatedContent,
        });
        prisma.document.update.mockResolvedValue(baseDocument);
      });

      it('mantém o registro quando a edição o omite', async () => {
        await service.edit(physicianId, documentId, {
          physicianEdits: { subjective: 'Edited text' },
        });

        expect(savedEdits()).toEqual({
          subjective: 'Edited text',
          aiUseRecord: 'texto da geração',
        });
      });

      it('restaura o texto da geração quando a edição tenta alterá-lo', async () => {
        await service.edit(physicianId, documentId, {
          physicianEdits: { subjective: 'Edited text', aiUseRecord: 'Sem uso de IA' },
        });

        expect(savedEdits().aiUseRecord).toBe('texto da geração');
      });

      it('não acrescenta registro a documento gerado antes dele existir', async () => {
        prisma.document.findUnique.mockResolvedValue({
          physicianId,
          confirmedBy: null,
          content: baseDocument.content,
        });

        await service.edit(physicianId, documentId, {
          physicianEdits: { subjective: 'Edited text' },
        });

        expect(savedEdits()).toEqual({ subjective: 'Edited text' });
      });
    });

    it('throws NotFoundException for missing document', async () => {
      prisma.document.findUnique.mockResolvedValue(null);

      await expect(
        service.edit(physicianId, documentId, {
          physicianEdits: { subjective: 'Edited' },
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException for wrong physician', async () => {
      prisma.document.findUnique.mockResolvedValue({
        physicianId: otherPhysicianId,
        confirmedBy: null,
      });

      await expect(
        service.edit(physicianId, documentId, {
          physicianEdits: { subjective: 'Edited' },
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException for confirmed document', async () => {
      prisma.document.findUnique.mockResolvedValue({
        physicianId,
        confirmedBy: physicianId,
      });

      await expect(
        service.edit(physicianId, documentId, {
          physicianEdits: { subjective: 'Edited' },
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  /**
   * O editor antigo passava cada campo do conteúdo por extractString antes de
   * salvar: a lista de medicamentos virava "[object Object]", os diagnósticos
   * da alta viravam um texto só e `incerteza: true` virava "". Como o confirm
   * sela `physicianEdits ?? content`, o documento assinado e o PDF saíam sem
   * a lista.
   */
  describe('listas estruturadas nas edições do médico', () => {
    const physicianStub = { name: 'Ana Teste', crmUf: 'SP', crmNumber: '123456' };
    const dipirona = {
      medicamento: 'Dipirona',
      dosagem: '1 g',
      via: 'IV',
      frequencia: '6/6h',
      duracao: '3 dias',
    };
    const ondansetrona = {
      medicamento: 'Ondansetrona',
      dosagem: '4 mg',
      via: 'IV',
      frequencia: '8/8h',
      duracao: 'se náusea',
    };
    const prescricaoContent = {
      paciente: 'PAC-001',
      data: '10/10/2026',
      medicamentos: [dipirona, ondansetrona],
      orientacoes: '- Retornar se febre persistir',
      incerteza: true,
      avisoRevisao: 'REVISÃO OBRIGATÓRIA: dose a confirmar',
    };
    /** O que o editor antigo gravava depois de o médico mudar só as orientações. */
    const flattenedPrescricao = {
      ...prescricaoContent,
      orientacoes: '- Hidratação oral',
      medicamentos: '[object Object]\n[object Object]',
      incerteza: '',
    };
    const altaContent = {
      paciente: 'PAC-002',
      data: '10/10/2026',
      resumo: 'Pneumonia comunitária tratada',
      diagnosticos: ['Pneumonia comunitária', 'Hipertensão arterial'],
      condicaoNaAlta: 'Estável, com critérios de alta',
      retorno: 'Retorno em 7 dias',
      incerteza: false,
      avisoRevisao: null,
    };

    function savedEdits(): Record<string, unknown> {
      return (prisma.document.update.mock.calls[0]![0] as {
        data: { physicianEdits: Record<string, unknown> };
      }).data.physicianEdits;
    }

    function mockDraft(content: Record<string, unknown>) {
      prisma.document.findUnique.mockResolvedValue({ physicianId, confirmedBy: null, content });
      prisma.document.update.mockResolvedValue(baseDocument);
    }

    async function pdfTextFor(
      type: string,
      content: Record<string, unknown>,
      physicianEdits: Record<string, unknown>,
    ): Promise<string> {
      prisma.document.findUnique.mockResolvedValue({
        ...baseDocument,
        type,
        content,
        physicianEdits,
        physicianId,
        physician: physicianStub,
        confirmedBy: physicianId,
        confirmedAt: new Date('2026-10-10'),
      });
      const result = await service.getDownloadPdf(physicianId, documentId);
      const pdf = await getDocumentProxy(new Uint8Array(result!.buffer));
      const { text } = await extractText(pdf, { mergePages: true });
      return withoutSpaces(text);
    }

    describe('edit', () => {
      it('restaura a lista de medicamentos achatada em texto e mantém as seções editadas', async () => {
        mockDraft(prescricaoContent);

        await service.edit(physicianId, documentId, { physicianEdits: flattenedPrescricao });

        expect(savedEdits()).toEqual({ ...prescricaoContent, orientacoes: '- Hidratação oral' });
      });

      it('restaura os diagnósticos da alta achatados em texto', async () => {
        mockDraft(altaContent);

        await service.edit(physicianId, documentId, {
          physicianEdits: {
            ...altaContent,
            diagnosticos: 'Pneumonia comunitária\nHipertensão arterial',
            incerteza: '',
            avisoRevisao: '',
          },
        });

        expect(savedEdits().diagnosticos).toEqual(altaContent.diagnosticos);
        expect(savedEdits().incerteza).toBe(false);
        // Campo de texto (null no original) é do médico: não é "restaurado".
        expect(savedEdits().avisoRevisao).toBe('');
      });

      it('mantém a lista editada pelo médico (medicamentos_raw) ao lado da lista estruturada', async () => {
        mockDraft(prescricaoContent);

        await service.edit(physicianId, documentId, {
          physicianEdits: { ...flattenedPrescricao, medicamentos_raw: 'Dipirona — 500 mg, VO' },
        });

        expect(savedEdits().medicamentos_raw).toBe('Dipirona — 500 mg, VO');
        expect(savedEdits().medicamentos).toEqual([dipirona, ondansetrona]);
      });

      it('aceita a lista alterada que continua sendo lista', async () => {
        mockDraft(prescricaoContent);

        await service.edit(physicianId, documentId, {
          physicianEdits: { ...prescricaoContent, medicamentos: [dipirona] },
        });

        expect(savedEdits().medicamentos).toEqual([dipirona]);
      });
    });

    describe('confirm', () => {
      const draft = {
        physicianId,
        confirmedBy: null,
        encounterId,
        type: 'prescricao',
        content: prescricaoContent,
        encounter: { institutionId: null },
      };

      beforeEach(() => {
        prisma.document.update.mockResolvedValue({
          ...baseDocument,
          confirmedBy: physicianId,
          confirmedAt: new Date(),
        });
        prisma.encounter.update.mockResolvedValue({});
      });

      it('sela o rascunho salvo pelo editor antigo com a lista restaurada e registra a correção', async () => {
        prisma.document.findUnique.mockResolvedValue({ ...draft, physicianEdits: flattenedPrescricao });

        await service.confirm(physicianId, documentId);

        const restored = { ...prescricaoContent, orientacoes: '- Hidratação oral' };
        expect(prisma.document.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              physicianEdits: restored,
              contentHash: canonicalHashOf(restored),
            }),
          }),
        );
        expect(auditService.log).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'DOCUMENT_CONFIRMED',
            payload: expect.objectContaining({ restoredFields: ['medicamentos', 'incerteza'] }),
          }),
        );
      });

      it('não reescreve edições que já preservam a estrutura', async () => {
        const edits = { ...prescricaoContent, orientacoes: '- Hidratação oral' };
        prisma.document.findUnique.mockResolvedValue({ ...draft, physicianEdits: edits });

        await service.confirm(physicianId, documentId);

        const updateCall = prisma.document.update.mock.calls[0] as [{ data: object }];
        expect(updateCall[0].data).not.toHaveProperty('physicianEdits');
        expect(auditService.log).toHaveBeenCalledWith(
          expect.objectContaining({ payload: expect.not.objectContaining({ restoredFields: expect.anything() }) }),
        );
      });
    });

    describe('PDF do documento editado', () => {
      it('traz cada medicamento com dose, via, frequência e duração', async () => {
        mockDraft(prescricaoContent);
        await service.edit(physicianId, documentId, { physicianEdits: flattenedPrescricao });

        const text = await pdfTextFor('prescricao', prescricaoContent, savedEdits());

        expect(text).toContain(withoutSpaces('Hidratação oral'));
        expect(text).toContain(withoutSpaces('Dipirona — 1 g, IV, 6/6h, 3 dias'));
        expect(text).toContain(withoutSpaces('Ondansetrona — 4 mg, IV, 8/8h, se náusea'));
      });

      it('traz os diagnósticos da alta', async () => {
        mockDraft(altaContent);
        await service.edit(physicianId, documentId, {
          physicianEdits: { ...altaContent, diagnosticos: 'Pneumonia comunitária\nHipertensão arterial' },
        });

        const text = await pdfTextFor('alta', altaContent, savedEdits());

        expect(text).toContain(withoutSpaces('Diagnósticos'));
        expect(text).toContain(withoutSpaces('Pneumonia comunitária'));
        expect(text).toContain(withoutSpaces('Hipertensão arterial'));
      });
    });
  });

  describe('confirm — CLIN-003 gate de confirmação humana auditável', () => {
    const docBase = {
      physicianId,
      confirmedBy: null,
      encounterId,
      content: baseDocument.content,
      physicianEdits: null,
      encounter: { institutionId: null as string | null },
    };

    // Cenário 1: confirmação normal → 200, confirmedAt preenchido, contentHash atualizado
    it('confirma documento draft: seta confirmedBy, confirmedAt e contentHash canônico', async () => {
      prisma.document.findUnique.mockResolvedValue(docBase);
      prisma.document.update.mockResolvedValue({
        ...baseDocument,
        confirmedBy: physicianId,
        confirmedAt: new Date(),
      });
      prisma.encounter.update.mockResolvedValue({});

      const result = await service.confirm(physicianId, documentId);

      expect(prisma.document.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: documentId },
          data: expect.objectContaining({
            confirmedBy: physicianId,
            confirmedAt: expect.any(Date),
            ...sealContent(baseDocument.content),
          }),
        }),
      );
      expect(prisma.encounter.update).toHaveBeenCalledWith({
        where: { id: encounterId },
        data: { status: 'finalized' },
      });
      expect(result.confirmedBy).toBe(physicianId);
    });

    // Cenário 2: confirmação dupla → 409 ConflictException
    it('retorna 409 ConflictException ao tentar confirmar documento já confirmado', async () => {
      prisma.document.findUnique.mockResolvedValue({
        ...docBase,
        confirmedBy: physicianId, // já confirmado
      });

      await expect(service.confirm(physicianId, documentId)).rejects.toThrow(ConflictException);
    });

    // Cenário 3 (SEC-02): médico diferente do autor pode confirmar (cobertura
    // de plantão) SE pertencer à mesma instituição do encontro.
    it('permite que médico diferente do autor confirme o documento quando pertence à mesma instituição', async () => {
      prisma.document.findUnique.mockResolvedValue({
        ...docBase,
        physicianId: otherPhysicianId, // autor é outro médico
        encounter: { institutionId },
      });
      institutionsService.listForPhysician.mockResolvedValue([{ id: institutionId }]);
      prisma.document.update.mockResolvedValue({
        ...baseDocument,
        confirmedBy: physicianId, // confirmado pelo médico atual
        confirmedAt: new Date(),
      });
      prisma.encounter.update.mockResolvedValue({});

      const result = await service.confirm(physicianId, documentId);

      expect(result.confirmedBy).toBe(physicianId);
    });

    // SEC-02 — regression: antes desta correção, QUALQUER médico com conta
    // na plataforma podia confirmar documento de qualquer instituição.
    it('rejeita com ForbiddenException médico de outra instituição que não é o autor', async () => {
      prisma.document.findUnique.mockResolvedValue({
        ...docBase,
        physicianId: otherPhysicianId,
        encounter: { institutionId },
      });
      institutionsService.listForPhysician.mockResolvedValue([{ id: 'outra-instituicao' }]);

      await expect(service.confirm(physicianId, documentId)).rejects.toThrow(ForbiddenException);
      expect(prisma.document.update).not.toHaveBeenCalled();
    });

    // SEC-02 — sem instituição vinculada ao encontro não há base para
    // "cobertura de plantão": só o autor original pode confirmar.
    it('rejeita médico diferente do autor quando o encontro não tem instituição', async () => {
      prisma.document.findUnique.mockResolvedValue({
        ...docBase,
        physicianId: otherPhysicianId,
        encounter: { institutionId: null },
      });

      await expect(service.confirm(physicianId, documentId)).rejects.toThrow(ForbiddenException);
      expect(institutionsService.listForPhysician).not.toHaveBeenCalled();
      expect(prisma.document.update).not.toHaveBeenCalled();
    });

    // Cenário 4: uncertain=true na auditoria quando interaction tinha incerteza
    it('inclui uncertain=true no payload da auditoria quando análise tinha incerteza', async () => {
      prisma.document.findUnique.mockResolvedValue(docBase);
      prisma.document.update.mockResolvedValue({
        ...baseDocument,
        confirmedBy: physicianId,
        confirmedAt: new Date(),
        contentHash: 'newhash',
      });
      prisma.encounter.update.mockResolvedValue({});
      // Sobrescrever o mock default (null) com uma interaction incerta
      prisma.aiInteraction.findFirst.mockResolvedValue({
        uncertainty: true,
        uncertaintyReason: 'Insufficient evidence for pediatric dosing',
      });

      await service.confirm(physicianId, documentId);

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'DOCUMENT_CONFIRMED',
          payload: expect.objectContaining({
            uncertain: true,
            uncertaintyReason: 'Insufficient evidence for pediatric dosing',
          }),
        }),
      );
    });

    // Cenário 5: hash calculado sobre physicianEdits quando existem edições
    it('usa physicianEdits para computar contentHash quando médico editou o documento', async () => {
      const edits = { subjective: 'Edited by physician', plan: 'Updated plan' };
      prisma.document.findUnique.mockResolvedValue({
        ...docBase,
        physicianEdits: edits,
      });
      prisma.document.update.mockResolvedValue({
        ...baseDocument,
        physicianEdits: edits,
        confirmedBy: physicianId,
        confirmedAt: new Date(),
      });
      prisma.encounter.update.mockResolvedValue({});

      await service.confirm(physicianId, documentId);

      // O contentHash no update deve ser o hash das edições, não do conteúdo original
      const updateCall = prisma.document.update.mock.calls[0] as [
        { data: { contentHash: string } },
      ];
      const confirmedHash = updateCall[0].data.contentHash;
      expect(confirmedHash).toMatch(/^[a-f0-9]{64}$/);
      // Deve diferir do hash do conteúdo original (baseDocument.contentHash = 'abc123hash')
      expect(confirmedHash).not.toBe('abc123hash');
    });

    // F0-D — o gate de confirmação sela o registro de uso de IA junto.
    it('sela o registro de uso de IA no hash de confirmação', async () => {
      const edits = { subjective: 'Edited by physician', aiUseRecord: AI_USE_RECORD_TEXT };
      prisma.document.findUnique.mockResolvedValue({ ...docBase, physicianEdits: edits });
      prisma.document.update.mockResolvedValue({
        ...baseDocument,
        physicianEdits: edits,
        confirmedBy: physicianId,
        confirmedAt: new Date(),
      });
      prisma.encounter.update.mockResolvedValue({});

      await service.confirm(physicianId, documentId);

      const updateCall = prisma.document.update.mock.calls[0] as [
        { data: { contentHash: string } },
      ];
      expect(updateCall[0].data.contentHash).toBe(canonicalHashOf(edits));
    });

    it('throws NotFoundException para documento inexistente', async () => {
      prisma.document.findUnique.mockResolvedValue(null);

      await expect(service.confirm(physicianId, documentId)).rejects.toThrow(NotFoundException);
    });

    // ADR-018 — AuditService.log() descarta `afterHash` e recalcula o seu;
    // só o payload entra no hash encadeado.
    it('ancora o selo confirmado no payload do DOCUMENT_CONFIRMED', async () => {
      prisma.document.findUnique.mockResolvedValue(docBase);
      prisma.document.update.mockResolvedValue({ ...baseDocument, confirmedBy: physicianId });
      prisma.encounter.update.mockResolvedValue({});

      await service.confirm(physicianId, documentId);

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'DOCUMENT_CONFIRMED',
          payload: expect.objectContaining(sealContent(baseDocument.content)),
        }),
      );
    });

    // ADR-018 — regressão: o hash v1 serializava cada medicamento como `{}`.
    it('sela os campos de cada medicamento da prescrição', async () => {
      const medication = { medicamento: 'AAS', dosagem: '100 mg', via: 'oral' };
      const prescription = { paciente: 'PAT-001', medicamentos: [medication] };
      const confirmedHashFor = async (content: object) => {
        prisma.document.findUnique.mockResolvedValueOnce({
          ...docBase,
          type: 'prescricao',
          content,
        });
        await service.confirm(physicianId, documentId);
        const updateCalls = prisma.document.update.mock.calls as [
          { data: { contentHash: string } },
        ][];
        return updateCalls.at(-1)![0].data.contentHash;
      };
      prisma.document.update.mockResolvedValue({ ...baseDocument, confirmedBy: physicianId });
      prisma.encounter.update.mockResolvedValue({});

      const originalHash = await confirmedHashFor(prescription);
      const editedHash = await confirmedHashFor({
        ...prescription,
        medicamentos: [{ ...medication, dosagem: '500 mg' }],
      });

      expect(editedHash).not.toBe(originalHash);
    });

    // Cenário 6: upload do PDF para o storage é best-effort (fire-and-forget) e
    // re-busca o documento (com o join de physician) para renderizar o PDF —
    // cobre o refactor que unificou a renderização usada por upload e download.
    it('faz upload do PDF ao storage quando disponível, buscando physician para o PDF', async () => {
      storageService.isAvailable.mockReturnValue(true);
      prisma.document.findUnique
        .mockResolvedValueOnce(docBase) // lookup inicial do confirm()
        .mockResolvedValueOnce({
          // re-busca dentro de uploadDocumentPdf (PDF_DOCUMENT_SELECT)
          id: documentId,
          physicianId,
          type: 'soap',
          content: baseDocument.content,
          physicianEdits: null,
          confirmedBy: physicianId,
          confirmedAt: new Date('2025-01-02'),
          encounterId,
          contentHash: 'newhash',
          physician: { name: 'Ana Teste', crmUf: 'SP', crmNumber: '123456' },
        });
      prisma.document.update.mockResolvedValue({
        ...baseDocument,
        confirmedBy: physicianId,
        confirmedAt: new Date(),
      });
      prisma.encounter.update.mockResolvedValue({});

      await service.confirm(physicianId, documentId);

      await vi.waitFor(() => expect(storageService.upload).toHaveBeenCalled());

      expect(storageService.upload).toHaveBeenCalledWith(
        `documents/${encounterId}/${documentId}.pdf`,
        expect.any(Buffer),
        'application/pdf',
      );
      expect(prisma.document.update).toHaveBeenCalledWith({
        where: { id: documentId },
        data: { pdfObjectKey: `documents/${encounterId}/${documentId}.pdf` },
      });
    });
  });

  describe('verifyIntegrity — ADR-018', () => {
    const prescription = {
      paciente: 'PAC-001',
      medicamentos: [{ medicamento: 'AAS', dosagem: '100 mg', via: 'oral' }],
    };
    const confirmedPrescription = {
      physicianId,
      confirmedBy: physicianId,
      content: prescription,
      physicianEdits: null,
      ...sealContent(prescription),
    };

    it('retorna intact quando o conteúdo confirmado bate com o selo v2', async () => {
      prisma.document.findUnique.mockResolvedValue(confirmedPrescription);

      await expect(service.verifyIntegrity(physicianId, documentId)).resolves.toEqual({
        documentId,
        status: 'intact',
        contentHashVersion: 2,
      });
    });

    it('verifica as edições do médico, que são o conteúdo efetivamente confirmado', async () => {
      const physicianEdits = { ...prescription, paciente: 'PAC-002' };
      prisma.document.findUnique.mockResolvedValue({
        ...confirmedPrescription,
        physicianEdits,
        ...sealContent(physicianEdits),
      });

      const integrity = await service.verifyIntegrity(physicianId, documentId);

      expect(integrity.status).toBe('intact');
    });

    it('retorna intact para documento legado selado com o v1', async () => {
      prisma.document.findUnique.mockResolvedValue({
        ...confirmedPrescription,
        // canonicalHash original (3be2d1dd) sobre `prescription`
        contentHash: '3592846b9ea35e29dad9449a98379da73a4c222f0d77c704ab0a7ecee7ec94e6',
        contentHashVersion: 1,
      });

      const integrity = await service.verifyIntegrity(physicianId, documentId);

      expect(integrity).toEqual({ documentId, status: 'intact', contentHashVersion: 1 });
    });

    it('retorna mismatch quando um medicamento foi alterado depois da confirmação', async () => {
      prisma.document.findUnique.mockResolvedValue({
        ...confirmedPrescription,
        content: {
          ...prescription,
          medicamentos: [{ ...prescription.medicamentos[0], dosagem: '500 mg' }],
        },
      });

      const integrity = await service.verifyIntegrity(physicianId, documentId);

      expect(integrity.status).toBe('mismatch');
    });

    it('retorna unconfirmed para rascunho', async () => {
      prisma.document.findUnique.mockResolvedValue({ ...confirmedPrescription, confirmedBy: null });

      const integrity = await service.verifyIntegrity(physicianId, documentId);

      expect(integrity.status).toBe('unconfirmed');
    });

    it('throws ForbiddenException quando o médico não é o autor', async () => {
      prisma.document.findUnique.mockResolvedValue({
        ...confirmedPrescription,
        physicianId: otherPhysicianId,
      });

      await expect(service.verifyIntegrity(physicianId, documentId)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws NotFoundException para documento inexistente', async () => {
      prisma.document.findUnique.mockResolvedValue(null);

      await expect(service.verifyIntegrity(physicianId, documentId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findByEncounter', () => {
    it('returns documents for own encounter', async () => {
      prisma.encounter.findUnique.mockResolvedValue({ physicianId });
      prisma.document.findMany.mockResolvedValue([baseDocument]);

      const result = await service.findByEncounter(physicianId, encounterId);

      expect(prisma.document.findMany).toHaveBeenCalledWith({
        where: { encounterId },
        orderBy: { createdAt: 'desc' },
        select: expect.any(Object),
      });
      expect(result).toEqual([baseDocument]);
    });

    it('throws NotFoundException for missing encounter', async () => {
      prisma.encounter.findUnique.mockResolvedValue(null);

      await expect(service.findByEncounter(physicianId, encounterId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException for another physician encounter', async () => {
      prisma.encounter.findUnique.mockResolvedValue({
        physicianId: otherPhysicianId,
      });

      await expect(service.findByEncounter(physicianId, encounterId)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('getDownloadUrl', () => {
    it('returns presigned URL when pdfObjectKey exists', async () => {
      prisma.document.findUnique.mockResolvedValue({
        physicianId,
        pdfObjectKey: 'documents/enc-1/doc-1.pdf',
      });
      storageService.getPresignedUrl.mockResolvedValue('https://minio/presigned-url');

      const result = await service.getDownloadUrl(physicianId, documentId);

      expect(result).toBe('https://minio/presigned-url');
    });

    it('returns null when pdfObjectKey is not set', async () => {
      prisma.document.findUnique.mockResolvedValue({
        physicianId,
        pdfObjectKey: null,
      });

      const result = await service.getDownloadUrl(physicianId, documentId);

      expect(result).toBeNull();
    });

    it('throws NotFoundException for non-existent document', async () => {
      prisma.document.findUnique.mockResolvedValue(null);

      await expect(service.getDownloadUrl(physicianId, documentId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException when physician does not own document', async () => {
      prisma.document.findUnique.mockResolvedValue({
        physicianId: otherPhysicianId,
        pdfObjectKey: 'documents/enc-1/doc-1.pdf',
      });

      await expect(service.getDownloadUrl(physicianId, documentId)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('getDownloadPdf', () => {
    const physicianStub = { name: 'Ana Teste', crmUf: 'SP', crmNumber: '123456' };

    it('generates the PDF on demand when storage is unavailable (no pdfObjectKey)', async () => {
      prisma.document.findUnique.mockResolvedValue({
        ...baseDocument,
        physicianId,
        physician: physicianStub,
        confirmedBy: physicianId,
        confirmedAt: new Date('2025-01-02'),
      });

      const result = await service.getDownloadPdf(physicianId, documentId);

      expect(result).not.toBeNull();
      expect(result?.buffer).toBeInstanceOf(Buffer);
      expect(result?.buffer.length).toBeGreaterThan(0);
      expect(result?.filename).toBe(`soap-${documentId.slice(0, 8)}_2025-01-02.pdf`);
    });

    it('uses physicianEdits over content when present', async () => {
      prisma.document.findUnique.mockResolvedValue({
        ...baseDocument,
        physicianId,
        physician: physicianStub,
        confirmedBy: physicianId,
        confirmedAt: new Date('2025-01-02'),
      });
      const withoutEdits = await service.getDownloadPdf(physicianId, documentId);

      prisma.document.findUnique.mockResolvedValue({
        ...baseDocument,
        physicianId,
        physician: physicianStub,
        physicianEdits: { plan: 'Plano completamente diferente' },
        confirmedBy: physicianId,
        confirmedAt: new Date('2025-01-02'),
      });
      const withEdits = await service.getDownloadPdf(physicianId, documentId);

      // Conteúdos diferentes devem produzir PDFs diferentes — prova que
      // physicianEdits (não content) foi usado quando presente.
      expect(withEdits?.buffer.equals(withoutEdits!.buffer)).toBe(false);
    });

    it('returns null when document is not confirmed yet', async () => {
      prisma.document.findUnique.mockResolvedValue({ ...baseDocument, physicianId });

      const result = await service.getDownloadPdf(physicianId, documentId);

      expect(result).toBeNull();
    });

    it('throws NotFoundException for non-existent document', async () => {
      prisma.document.findUnique.mockResolvedValue(null);

      await expect(service.getDownloadPdf(physicianId, documentId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException when physician does not own document', async () => {
      prisma.document.findUnique.mockResolvedValue({
        ...baseDocument,
        physicianId: otherPhysicianId,
        confirmedBy: otherPhysicianId,
        confirmedAt: new Date('2025-01-02'),
      });

      await expect(service.getDownloadPdf(physicianId, documentId)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
