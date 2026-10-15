import { notFound } from 'next/navigation';
import { TOOLS } from '@clinical-tools/catalog';
import { ToolComingSoon } from '../_components/tool-coming-soon';

/**
 * /ferramentas/<id> das ferramentas ainda "em breve" (CC-318): um roteiro já
 * portado pode ligar para elas (o TEP liga para `/ferramentas/infusoes?droga=
 * heparina`) e o link não quebra. Ferramenta com tela tem rota própria
 * (`tep/`, `calculadoras/`), que vence esta; id desconhecido vira 404 aqui,
 * pelo mesmo motivo de calculadoras/[id] (sem `dynamicParams = false`).
 */
export function generateStaticParams() {
  return TOOLS.filter((tool) => tool.status === 'em-breve').map(({ id }) => ({ ferramenta: id }));
}

export default async function ToolComingSoonPage({
  params,
}: {
  params: Promise<{ ferramenta: string }>;
}) {
  const { ferramenta } = await params;
  const tool = TOOLS.find((entry) => entry.id === ferramenta && entry.status === 'em-breve');
  if (!tool) notFound();
  return <ToolComingSoon tool={tool} />;
}
