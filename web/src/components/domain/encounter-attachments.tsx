'use client';

import { useRef } from 'react';
import { toast } from 'sonner';
import { Paperclip, Trash, FileText } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api-client';
import {
  useAddEncounterAttachment,
  useEncounterAttachments,
  useRemoveEncounterAttachment,
} from '@/lib/clinical-queries';
import type { ExtractableDocumentMime } from '@/lib/types';

const ACCEPTED_MIMES: Record<string, ExtractableDocumentMime> = {
  pdf: 'application/pdf',
  md: 'text/markdown',
  txt: 'text/plain',
};
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_ATTACHMENTS = 3;

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Falha ao ler o arquivo.'));
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.readAsDataURL(file);
  });
}

function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * F4 — Referências anexadas a UM atendimento.
 *
 * Origem: o médico do piloto viu um caso de dengue ser conduzido como sepse e
 * quis anexar a diretriz da ABRAMEDE àquele caso. É deliberadamente diferente
 * de "sugerir para a base" (SuggestGuidelineDialog): vale só para este
 * atendimento, não passa por curadoria e não afeta nenhum outro médico.
 *
 * A copy diz explicitamente que a fonte não é curada — a garantia do produto
 * passou a ser "toda recomendação cita uma fonte, e a interface sempre diz se
 * ela é curada", e o médico precisa saber disso antes de anexar.
 */
export function EncounterAttachments({ encounterId }: { encounterId: string }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachmentsQuery = useEncounterAttachments(encounterId);
  const addAttachment = useAddEncounterAttachment(encounterId);
  const removeAttachment = useRemoveEncounterAttachment(encounterId);

  const attachments = attachmentsQuery.data ?? [];
  const atLimit = attachments.length >= MAX_ATTACHMENTS;

  async function handleFile(file: File) {
    const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
    const mimeType = ACCEPTED_MIMES[extension];
    if (!mimeType) {
      toast.error('Formatos aceitos: PDF, .md ou .txt.');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      toast.error('Arquivo acima de 8 MB. Anexe apenas a seção relevante.');
      return;
    }

    try {
      const data = await readAsBase64(file);
      const result = await addAttachment.mutateAsync({
        filename: file.name,
        mimeType,
        sizeBytes: file.size,
        data,
      });
      toast.success(
        result.truncated
          ? 'Referência anexada, mas o texto foi cortado no limite. Prefira anexar só a seção que muda a conduta.'
          : 'Referência anexada a este atendimento.',
      );
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'Não foi possível anexar. Tente novamente.',
      );
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-clinical-ink">Referências deste caso</p>
          <p className="text-xs text-muted-foreground">
            Vale só para este atendimento. A fonte entra marcada como não curada e a conduta
            baseada nela sai como preliminar.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="gap-2"
          disabled={atLimit || addAttachment.isPending}
          onClick={() => fileInputRef.current?.click()}
        >
          <Paperclip className="size-4" />
          {addAttachment.isPending ? 'Anexando…' : 'Anexar referência'}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.md,.txt"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
            e.target.value = '';
          }}
        />
      </div>

      {atLimit && (
        <p className="text-xs text-clinical-amber-foreground">
          Limite de {MAX_ATTACHMENTS} referências por atendimento — remova uma para anexar outra.
        </p>
      )}

      {attachmentsQuery.isPending ? (
        <Skeleton className="h-9 w-full rounded-[10px]" />
      ) : (
        attachments.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {attachments.map((attachment) => (
              <li
                key={attachment.id}
                className="flex items-center gap-2 rounded-[10px] border border-clinical-line bg-card px-3 py-2"
              >
                <FileText className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-sm">{attachment.filename}</span>
                <span className="shrink-0 font-mono text-[0.6875rem] text-muted-foreground">
                  {formatSize(attachment.sizeBytes)}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 shrink-0 px-2"
                  aria-label={`Remover ${attachment.filename}`}
                  disabled={removeAttachment.isPending}
                  onClick={() => void removeAttachment.mutateAsync(attachment.id)}
                >
                  <Trash className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  );
}
