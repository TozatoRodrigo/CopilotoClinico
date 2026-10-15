import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { CaseLinkProvider } from '@/components/domain/clinical-tools/case-link';
import { ToolReturnLink } from '@/components/domain/clinical-tools/tool-return-link';
import { ToolsOfflineFooter } from '@/components/domain/clinical-tools/tools-offline-footer';
import { isFerramentasEnabled } from '@/lib/feature-flags';

/**
 * ADR-017 — com `NEXT_PUBLIC_FERRAMENTAS` desligada a área não existe: toda
 * rota de /ferramentas responde 404, e o menu também não mostra o item.
 * Ligada, toda ferramenta aberta por outra mostra o caminho de volta (CC-331)
 * e o rodapé diz se o conteúdo já está no aparelho para uso sem sinal e em
 * que versão (CC-322). A ferramenta aberta pelo plano do Copiloto sabe de
 * qual caso veio: "Voltar ao caso", campos "vindo do caso" e "Anexar ao
 * caso" (CC-332).
 */
export default function FerramentasLayout({ children }: { children: ReactNode }) {
  if (!isFerramentasEnabled()) notFound();
  return (
    <CaseLinkProvider>
      <ToolReturnLink />
      {children}
      <ToolsOfflineFooter />
    </CaseLinkProvider>
  );
}
