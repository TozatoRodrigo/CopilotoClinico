'use client';

import { useId, useState } from 'react';
import { ChatText, Copy, WhatsappLogo } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { PATIENT_MESSAGE_UI } from '@clinical-tools/dengue/content';
import { whatsappShareUrl } from '@clinical-tools/dengue/patient-message';
import { Button } from '@/components/ui/button';

/**
 * Mensagem de alta para o paciente (CC-325). O texto vem pronto do motor e
 * não tem dado do paciente (só a hora de emissão); o médico copia ou abre o
 * WhatsApp e escolhe o contato lá. Se o navegador negar a área de
 * transferência, o texto fica selecionável.
 */
export function PatientMessagePanel({
  message,
  onGenerate,
}: {
  message: string | null;
  onGenerate: () => void;
}) {
  const textId = useId();
  const [copyFailed, setCopyFailed] = useState(false);

  async function copy() {
    if (!message) return;
    try {
      await navigator.clipboard.writeText(message);
      setCopyFailed(false);
      toast.success(PATIENT_MESSAGE_UI.copied);
    } catch {
      setCopyFailed(true);
    }
  }

  return (
    <section aria-label="Orientações para o paciente" className="flex flex-col gap-3">
      <Button type="button" className="min-h-11" onClick={onGenerate}>
        <ChatText aria-hidden="true" />
        {PATIENT_MESSAGE_UI.generate}
      </Button>
      {message ? (
        <div className="flex flex-col gap-2 rounded-md border border-border p-3">
          <label htmlFor={textId} className="text-xs text-muted-foreground">
            {copyFailed
              ? 'Não deu para copiar automaticamente. Selecione o texto e copie.'
              : PATIENT_MESSAGE_UI.generated}
          </label>
          <textarea
            id={textId}
            readOnly
            value={message}
            rows={12}
            onFocus={(event) => event.currentTarget.select()}
            className="w-full resize-y rounded-md border border-input bg-surface-input px-3 py-2 text-sm text-foreground"
          />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button type="button" variant="outline" className="min-h-11" onClick={copy}>
              <Copy aria-hidden="true" />
              {PATIENT_MESSAGE_UI.copy}
            </Button>
            <Button asChild variant="outline" className="min-h-11">
              <a href={whatsappShareUrl(message)} target="_blank" rel="noopener noreferrer">
                <WhatsappLogo aria-hidden="true" />
                {PATIENT_MESSAGE_UI.share}
              </a>
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
