import { PencilSimpleLine, Robot, SealCheck } from '@phosphor-icons/react';
import { Badge } from '@/components/ui/badge';
import { DOC_TYPE_META, docTypeLabel, type DocType } from './document-meta';

/** Tag de categoria do tipo de documento (SOAP roxo, SBAR marrom…). */
export function DocTypeBadge({ type }: { type: DocType }) {
  return <Badge variant={DOC_TYPE_META[type].tone}>{docTypeLabel(type)}</Badge>;
}

/**
 * Status do documento: cinza = rascunho, verde = confirmado/assinado.
 * Sempre ícone + texto (estado nunca só por cor). `size="long"` é a versão
 * de propriedade da página do editor.
 */
export function DocStatusBadge({
  confirmed,
  size = 'short',
}: {
  confirmed: boolean;
  size?: 'short' | 'long';
}) {
  if (confirmed) {
    return (
      <Badge variant="success">
        <SealCheck weight="fill" aria-hidden="true" />
        {size === 'long' ? 'Confirmado e assinado' : 'Assinado'}
      </Badge>
    );
  }
  return (
    <Badge variant="secondary">
      {size === 'long' ? <Robot aria-hidden="true" /> : <PencilSimpleLine aria-hidden="true" />}
      {size === 'long' ? 'Rascunho da IA' : 'Rascunho'}
    </Badge>
  );
}
