import { notFound } from 'next/navigation';
import { isRegionalBlockId, REGIONAL_BLOCK_IDS } from '@clinical-tools/blocks/content';
import { BlockDetailScreen } from '../_components/block-detail';

// As 14 fichas são pré-renderizadas no build, como as calculadoras (base do
// offline do CC-322). As seções (topografia, lista…) são pastas próprias e
// têm precedência sobre este segmento; id que não é bloqueio vira 404 aqui.
export function generateStaticParams() {
  return REGIONAL_BLOCK_IDS.map((id) => ({ id }));
}

export default async function BloqueioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isRegionalBlockId(id)) notFound();
  return <BlockDetailScreen id={id} />;
}
