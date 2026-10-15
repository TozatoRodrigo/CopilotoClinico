import { notFound } from 'next/navigation';
import { TOOLS } from '@clinical-tools/catalog';
import { ToolComingSoonScreen } from '../_components/tool-coming-soon-screen';

/**
 * Ferramenta do catálogo que ainda não tem tela (ex.: Infusões nesta versão):
 * o endereço existe e mostra "em breve", em vez de 404, para os atalhos de
 * outras ferramentas (o "Calcular noradrenalina" do Choque) não quebrarem.
 * Ferramenta portada tem pasta própria, que o Next serve antes desta rota.
 */
const COMING_SOON = TOOLS.filter((tool) => tool.status === 'em-breve');

export function generateStaticParams() {
  return COMING_SOON.map(({ id }) => ({ ferramenta: id }));
}

export default async function ToolComingSoonPage({
  params,
}: {
  params: Promise<{ ferramenta: string }>;
}) {
  const { ferramenta } = await params;
  const tool = COMING_SOON.find(({ id }) => id === ferramenta);
  if (!tool) notFound();
  return <ToolComingSoonScreen name={tool.name} description={tool.description} />;
}
