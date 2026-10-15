import { describe, expect, it, vi } from 'vitest';
import type { KnowledgeGapsService } from '../knowledge-gaps/knowledge-gaps.service';
import { StoredKnowledgeGapRecorder } from './knowledge-gap-recorder';

describe('StoredKnowledgeGapRecorder (CC-501 → CC-409)', () => {
  const gap = {
    questionId: 'q-1',
    maskedQuestion: 'dose de ceftriaxona na meningite, CPF [REDACTED_CPF]',
    institutionId: 'inst-1',
    candidates: 2,
  };

  it('grava em knowledge_gaps a pergunta mascarada como consulta, sem síndrome, médico nem instituição', async () => {
    const record = vi
      .fn()
      .mockResolvedValue({ recorded: true, gapId: 'gap-1', groupId: 'group-1', newGroup: true });
    const recorder = new StoredKnowledgeGapRecorder({ record } as unknown as KnowledgeGapsService);

    await expect(recorder.record(gap)).resolves.toBe(true);

    expect(record).toHaveBeenCalledWith({
      source: 'quick_question',
      interactionId: null,
      syndrome: null,
      searchQueries: [gap.maskedQuestion],
    });
    expect(JSON.stringify(record.mock.calls)).not.toContain('inst-1');
  });

  it('erro do banco sobe: o serviço da pergunta rápida responde mesmo assim (gapRecorded=false)', async () => {
    const recorder = new StoredKnowledgeGapRecorder({
      record: vi.fn().mockRejectedValue(new Error('banco fora')),
    } as unknown as KnowledgeGapsService);

    await expect(recorder.record(gap)).rejects.toThrow('banco fora');
  });
});
