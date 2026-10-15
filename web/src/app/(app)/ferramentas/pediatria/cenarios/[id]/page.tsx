import { notFound } from 'next/navigation';
import { getPediatricScenario, PEDIATRIC_SCENARIOS } from '@clinical-tools/pediatrics/scenarios';
import { ScenarioScreen } from '../../_components/scenario-screen';

// Os sete cenários são pré-renderizados no build (base do offline do CC-322).
// Id desconhecido vira 404 aqui, como nas calculadoras.
export function generateStaticParams() {
  return PEDIATRIC_SCENARIOS.map(({ id }) => ({ id }));
}

/** /ferramentas/pediatria/cenarios/[id] — um cenário pediátrico (CC-320). */
export default async function PediatricScenarioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const scenario = getPediatricScenario(id);
  if (!scenario) notFound();
  return <ScenarioScreen scenario={scenario} />;
}
