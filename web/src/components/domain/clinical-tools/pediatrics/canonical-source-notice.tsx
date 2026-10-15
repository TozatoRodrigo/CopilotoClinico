'use client';

import { SealWarning } from '@phosphor-icons/react';
import type { ContentProvenance } from '@clinical-tools/provenance';
import {
  awaitsCanonicalSource,
  CANONICAL_SOURCE_NOTICE,
} from '@clinical-tools/pediatrics/provenance';
import { Callout } from '@/components/ui/callout';

/**
 * Aviso da fonte única das doses pediátricas (CC-321). Aparece enquanto a
 * revisão do dado está pendente e some sozinho quando o Dr. Gustavo assinar
 * (o dado passa a `revisado`); a tela não precisa mudar.
 */
export function CanonicalSourceNotice({ provenance }: { provenance: ContentProvenance }) {
  if (!awaitsCanonicalSource(provenance)) return null;
  return (
    <Callout tone="orange" icon={<SealWarning weight="fill" />} title={CANONICAL_SOURCE_NOTICE}>
      As doses seguem o PedGuide do ANY v4. O ANY tem outras versões com números diferentes; a
      reconciliação está em revisão médica. Considere conferir a dose antes de administrar.
    </Callout>
  );
}
