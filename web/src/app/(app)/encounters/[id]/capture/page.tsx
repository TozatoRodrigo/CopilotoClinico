import { redirect } from 'next/navigation';

/**
 * ADR-014 — a captura virou o começo da conversa do caso. Links antigos
 * (favoritos, fila offline, outras telas) continuam funcionando; o caso-demo
 * segue junto.
 */
export default async function CapturePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ demoCase?: string | string[] }>;
}) {
  const { id } = await params;
  const { demoCase } = await searchParams;
  const query = typeof demoCase === 'string' ? `?demoCase=${encodeURIComponent(demoCase)}` : '';
  redirect(`/encounters/${id}/conversation${query}`);
}
