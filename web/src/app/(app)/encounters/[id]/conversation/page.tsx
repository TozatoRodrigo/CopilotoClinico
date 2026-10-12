'use client';

import { use } from 'react';
import { useSearchParams } from 'next/navigation';
import { CaseConversation } from '@/components/domain/case-conversation/case-conversation';
import { getDemoCasePreset } from '@/lib/demo-case-presets';

/**
 * ADR-014 — Copiloto guiado: o caso inteiro numa conversa só — o relato, as
 * perguntas que mudam a conduta, o plano e as rodadas seguintes.
 */
export default function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: encounterId } = use(params);
  const searchParams = useSearchParams();
  const demoPreset = getDemoCasePreset(searchParams.get('demoCase'));
  // "Reanalisar" do caso: um relato novo, mesmo com conversa anterior.
  const startNew = searchParams.get('novo') === '1';
  return <CaseConversation encounterId={encounterId} demoPreset={demoPreset} startNew={startNew} />;
}
