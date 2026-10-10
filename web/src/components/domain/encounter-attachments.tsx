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
    <section aria-labelledby="encounter-attachments-title" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 basis-64 space-y-0.5">
          <h3 id="encounter-attachments-title" className="text-sm font-semibold text-foreground">
            Referências deste caso
          </h3>
          <p className="text-[0.8125rem] text-pretty text-muted-foreground">
            Vale só para este atendimento. A fonte entra marcada como não curada e a conduta
            baseada nela sai como preliminar.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="max-sm:h-10"
          disabled={atLimit || addAttachment.isPending}
          onClick={() => fileInputRef.current?.click()}
        >
          <Paperclip />
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
        <p className="text-[0.8125rem] text-muted-foreground">
          Limite de {MAX_ATTACHMENTS} referências por atendimento — remova uma para anexar outra.
        </p>
      )}

      {attachmentsQuery.isPending ? (
        <Skeleton className="h-9 w-full" />
      ) : (
        attachments.length > 0 && (
          // Blocos de arquivo do Notion: linha fina, ícone cinza, ação discreta.
          <ul className="flex flex-col">
            {attachments.map((attachment) => (
              <li
                key={attachment.id}
                className="-mx-2 flex min-h-9 items-center gap-2.5 rounded-md px-2 py-1 transition-colors hover:bg-hover"
              >
                <FileText className="size-[18px] shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                  {attachment.filename}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {formatSize(attachment.sizeBytes)}
                </span>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  className="shrink-0 text-muted-foreground max-sm:size-10"
                  aria-label={`Remover ${attachment.filename}`}
                  disabled={removeAttachment.isPending}
                  onClick={() => void removeAttachment.mutateAsync(attachment.id)}
                >
                  <Trash />
                </Button>
              </li>
            ))}
          </ul>
        )
      )}
    </section>
  );
}
