import { redirect } from 'next/navigation';

/**
 * ADR-014 — o plano agora aparece dentro da conversa do caso, com as
 * perguntas e as rodadas no mesmo fio. Links antigos levam para lá.
 */
export default async function ResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/encounters/${id}/conversation`);
}
