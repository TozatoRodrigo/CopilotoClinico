'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { FilePlus, UploadSimple } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useExtractDocumentText, useSuggestGuideline } from '@/lib/clinical-queries';
import { parseGuidelineContent } from '@/lib/front-matter';
import { ApiError } from '@/lib/api-client';
import type { ExtractableDocumentMime } from '@/lib/types';

/**
 * Slugs reais de `specialty` usados na curadoria — os mesmos do front-matter
 * em docs/guidelines/drafts e do seed. A comparação no backend é exata, então
 * um rótulo com acento aqui produziria conteúdo que nenhum filtro encontra.
 */
const SPECIALTIES = [
  { value: 'medicina_de_emergencia', label: 'Medicina de emergência' },
  { value: 'clinica_medica', label: 'Clínica médica' },
  { value: 'cardiologia', label: 'Cardiologia' },
  { value: 'neurologia', label: 'Neurologia' },
  { value: 'infectologia', label: 'Infectologia' },
  { value: 'cirurgia_trauma', label: 'Cirurgia / trauma' },
  { value: 'pediatria', label: 'Pediatria' },
  { value: 'medicina_intensiva', label: 'Medicina intensiva' },
  { value: 'nao_classificada', label: 'Não sei classificar' },
] as const;

/**
 * PDF entrou aqui porque converter à mão foi exatamente o que não funcionou no
 * reporte original — o médico converteu para .md e .txt e ainda assim deu
 * erro. O servidor extrai o texto e devolve para conferência.
 */
const ACCEPTED_MIMES: Record<string, ExtractableDocumentMime> = {
  pdf: 'application/pdf',
  md: 'text/markdown',
  txt: 'text/plain',
};
const MAX_CHARS = 200_000;
const MAX_FILE_BYTES = 8 * 1024 * 1024;

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Falha ao ler o arquivo.'));
    reader.onload = () => {
      const result = String(reader.result);
      // data:<mime>;base64,<payload> — só o payload interessa ao backend.
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.readAsDataURL(file);
  });
}

interface SuggestGuidelineDialogProps {
  /** Pré-preenche a origem — ex.: a busca que não encontrou nada. */
  defaultSource?: string;
  triggerLabel?: string;
  triggerVariant?: 'default' | 'outline' | 'ghost';
}

/**
 * F4 — Caminho para qualquer médico contribuir com a base.
 *
 * Origem: um médico do piloto viu um caso de dengue ser conduzido como sepse,
 * tentou incluir a diretriz da ABRAMEDE e recebeu erro — mesmo convertendo o
 * PDF para `.md` e `.txt`. Três motivos somados: o endpoint exigia papel de
 * curador, o parser exigia um front-matter que um PDF convertido nunca tem, e
 * não havia caminho nenhum fora do console de curadoria.
 *
 * Aqui o front-matter é OPCIONAL: se o arquivo tiver, aproveitamos; se não,
 * o médico responde três campos curtos e pronto. Nada entra em retrieval sem
 * curadoria — o texto do diálogo diz isso explicitamente, para não criar a
 * expectativa de que o Copiloto já vai usar o material na próxima análise.
 */
export function SuggestGuidelineDialog({
  defaultSource = '',
  triggerLabel = 'Sugerir uma diretriz',
  triggerVariant = 'outline',
}: SuggestGuidelineDialogProps) {
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState(defaultSource);
  const [sourceVersion, setSourceVersion] = useState('');
  const [specialty, setSpecialty] = useState<string>('nao_classificada');
  const [text, setText] = useState('');
  const [filename, setFilename] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const suggest = useSuggestGuideline();
  const extract = useExtractDocumentText();

  function reset() {
    setSource(defaultSource);
    setSourceVersion('');
    setSpecialty('nao_classificada');
    setText('');
    setFilename(null);
  }

  function defaultSourceFromFilename(name: string): string {
    return name.replace(/\.(pdf|md|txt)$/i, '').replace(/[-_]+/g, ' ').trim();
  }

  async function handleFile(file: File) {
    const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
    const mimeType = ACCEPTED_MIMES[extension];
    if (!mimeType) {
      toast.error('Formatos aceitos: PDF, .md ou .txt. Ou cole o texto no campo abaixo.');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      toast.error('Arquivo acima de 8 MB. Envie apenas o capítulo ou a seção relevante.');
      return;
    }

    setFilename(file.name);

    // .md/.txt com front-matter: aproveita os metadados sem ida ao servidor.
    if (mimeType !== 'application/pdf') {
      const raw = await file.text();
      try {
        const parsed = parseGuidelineContent(file.name, raw);
        setText(parsed.body);
        setSource(parsed.meta.source);
        setSourceVersion(parsed.meta.sourceVersion);
        setSpecialty(parsed.meta.specialty);
        return;
      } catch {
        setText(raw);
        if (!source) setSource(defaultSourceFromFilename(file.name));
        return;
      }
    }

    try {
      const data = await readAsBase64(file);
      const extracted = await extract.mutateAsync({ mimeType, filename: file.name, data });
      setText(extracted.text);
      if (!source) setSource(defaultSourceFromFilename(file.name));
      toast.success(
        extracted.truncated
          ? `Texto extraído de ${extracted.pages ?? '?'} página(s), cortado no limite. Recorte a parte que muda a conduta antes de enviar.`
          : `Texto extraído de ${extracted.pages ?? '?'} página(s). Recorte a parte que muda a conduta antes de enviar.`,
      );
    } catch (err) {
      setFilename(null);
      toast.error(
        err instanceof ApiError ? err.message : 'Não foi possível ler o arquivo. Cole o texto.',
      );
    }
  }

  async function handleSubmit() {
    const trimmed = text.trim();
    if (trimmed.length < 50) {
      toast.error('Cole ao menos um parágrafo do conteúdo da diretriz.');
      return;
    }
    if (trimmed.length > MAX_CHARS) {
      toast.error('Conteúdo muito longo. Envie apenas a seção relevante da diretriz.');
      return;
    }
    if (source.trim().length === 0) {
      toast.error('Informe de onde veio o material (sociedade, manual, artigo).');
      return;
    }

    try {
      const result = await suggest.mutateAsync({
        text: trimmed,
        source: source.trim(),
        sourceVersion: sourceVersion.trim() || undefined,
        specialty,
      });
      toast.success(
        `Enviado para curadoria — ${result.chunksCreated} trecho(s). Um curador precisa aprovar antes de entrar na base.`,
      );
      reset();
      setOpen(false);
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'Não foi possível enviar. Tente novamente.',
      );
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant={triggerVariant} size="sm" className="gap-2">
          <FilePlus className="size-4" />
          {triggerLabel}
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Sugerir uma diretriz para a base</DialogTitle>
          <DialogDescription>
            Encontrou um cenário que a base não cobre? Envie a referência. Ela entra na fila de
            curadoria — um curador precisa aprovar antes de o Copiloto passar a citá-la.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Button
              type="button"
              variant="outline"
              className="w-full justify-start gap-2"
              disabled={extract.isPending}
              onClick={() => fileInputRef.current?.click()}
            >
              <UploadSimple className="size-4" />
              {extract.isPending ? 'Lendo o arquivo…' : (filename ?? 'Escolher arquivo PDF, .md ou .txt')}
            </Button>
            <p className="text-xs text-muted-foreground">
              O texto é extraído aqui mesmo — confira e recorte a parte que muda a conduta antes de
              enviar. Até 8 MB.
            </p>
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

          <div className="flex flex-col gap-2">
            <Label htmlFor="suggest-source">De onde veio</Label>
            <Input
              id="suggest-source"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="Ex.: Diretriz ABRAMEDE de dengue na emergência"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="suggest-version">Ano ou versão (opcional)</Label>
              <Input
                id="suggest-version"
                value={sourceVersion}
                onChange={(e) => setSourceVersion(e.target.value)}
                placeholder="Ex.: 2024"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="suggest-specialty">Especialidade</Label>
              <Select value={specialty} onValueChange={setSpecialty}>
                <SelectTrigger id="suggest-specialty">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SPECIALTIES.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="suggest-text">Conteúdo</Label>
            <Textarea
              id="suggest-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={10}
              placeholder="Cole aqui o trecho da diretriz que muda a conduta — critérios, doses, sinais de alarme."
            />
            <p className="text-xs text-muted-foreground">
              {text.trim().length.toLocaleString('pt-BR')} caracteres
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={suggest.isPending}>
            {suggest.isPending ? 'Enviando…' : 'Enviar para curadoria'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
