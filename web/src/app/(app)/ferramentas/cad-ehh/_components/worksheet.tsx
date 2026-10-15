'use client';

import { useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Printer } from '@phosphor-icons/react';
import { WORKSHEET_COLUMNS, WORKSHEET_ROWS } from '@clinical-tools/cad-ehh/content';
import { CAD_EHH_PROVENANCE } from '@clinical-tools/cad-ehh/sources';
import {
  WORKSHEET_HEADER_FIELDS,
  WORKSHEET_INTRO,
  WORKSHEET_PRINT_TIP,
} from '@clinical-tools/cad-ehh/screen-text';
import { DECISION_SUPPORT_TEXT } from '@/components/domain/clinical-tools/decision-support-notice';
import { Button } from '@/components/ui/button';

/** Marca do bloco impresso; o CSS de impressão esconde todo o resto do `body`. */
export const WORKSHEET_PRINT_ROOT = 'cad-ehh-planilha';

/**
 * CSS de impressão, montado só enquanto a tela da planilha está aberta: fora
 * dela a impressão de qualquer página do Copiloto continua como sempre.
 *
 * - A4 paisagem com margem de 10 mm (19 colunas).
 * - Na impressão, só a planilha: os irmãos dela no `body` (o app inteiro)
 *   somem com `display: none`, para não sair página em branco depois.
 * - Papel é tinta preta sobre branco, qualquer que seja o tema da tela: no
 *   tema escuro os tokens dariam texto cinza-claro no papel. Por isso as cores
 *   aqui são `black`/`white` e não tokens do design system.
 * - O cabeçalho das colunas corre na vertical, de baixo para cima (padrão de
 *   folha de balanço de UTI): no ANY, o Safari imprimiu em retrato ignorando o
 *   `size` e os cabeçalhos horizontais truncaram. Na vertical, a planilha
 *   sobrevive mesmo impressa em retrato.
 */
export const WORKSHEET_PRINT_CSS = `
@page { size: A4 landscape; margin: 10mm; }
@media print {
  body > :not([data-print-root="${WORKSHEET_PRINT_ROOT}"]) { display: none !important; }
  [data-print-root="${WORKSHEET_PRINT_ROOT}"] {
    display: block !important;
    color: black;
    background: white;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  [data-print-root="${WORKSHEET_PRINT_ROOT}"] th,
  [data-print-root="${WORKSHEET_PRINT_ROOT}"] td { border: 0.4pt solid black; }
}
`;

const noopSubscribe = () => () => {};

/** `true` só no navegador: o portal da planilha precisa do `document.body`. */
function useIsClient(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

/** A folha impressa: cabeçalho para preencher à mão, 19 colunas e 12 linhas em branco. */
function PrintedSheet() {
  return (
    <div data-print-root={WORKSHEET_PRINT_ROOT} data-testid="planilha-impressa" className="hidden">
      <h1 className="mb-[2mm] text-[12pt] font-semibold">CAD e EHH — Planilha de acompanhamento</h1>
      <div className="mb-[2.5mm] flex flex-wrap gap-x-[5mm] gap-y-[1.5mm] text-[8pt] whitespace-nowrap">
        {WORKSHEET_HEADER_FIELDS.map((field) => (
          <span key={field}>{field}</span>
        ))}
      </div>
      <table className="w-full table-fixed border-collapse">
        <thead>
          <tr>
            {WORKSHEET_COLUMNS.map(({ label, group }, index) => (
              <th
                key={label}
                scope="col"
                className={
                  index === 0
                    ? 'h-[30mm] w-[13mm] p-[1mm] text-left align-bottom font-semibold'
                    : 'h-[30mm] p-[1mm] text-left align-bottom font-semibold'
                }
              >
                <span className="inline-block rotate-180 text-[7pt] leading-[1.1] whitespace-nowrap [writing-mode:vertical-rl]">
                  {label}
                  {group ? (
                    <>
                      <br />
                      <span className="text-[5.5pt] font-normal tracking-[0.3pt] uppercase">
                        {group}
                      </span>
                    </>
                  ) : null}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: WORKSHEET_ROWS }, (_, row) => (
            <tr key={row}>
              {WORKSHEET_COLUMNS.map(({ label }) => (
                <td key={label} className="h-[9mm]" />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-[2.5mm] flex justify-between text-[6pt]">
        <span>{DECISION_SUPPORT_TEXT}</span>
        <span>Conteúdo de Gustavo Moreira (ANY App) · versão {CAD_EHH_PROVENANCE.version}</span>
      </div>
    </div>
  );
}

/**
 * Planilha de acompanhamento (seção 6 do KetoPath): artefato só impresso. Não
 * preenche, não calcula e não guarda nada; sai em branco para fixar no leito.
 * Impressão nativa do navegador, sem biblioteca de PDF (decisão do Gustavo no
 * ANY); no iPhone a caixa de impressão oferece "Salvar em Arquivos".
 */
export function WorksheetScreen() {
  const isClient = useIsClient();
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[0.9375rem] text-pretty text-foreground">{WORKSHEET_INTRO}</p>
      <Button type="button" size="lg" className="h-12 text-base" onClick={() => window.print()}>
        <Printer aria-hidden="true" />
        Imprimir planilha
      </Button>
      <p className="text-[0.8125rem] text-pretty text-muted-foreground">{WORKSHEET_PRINT_TIP}</p>
      <style>{WORKSHEET_PRINT_CSS}</style>
      {isClient ? createPortal(<PrintedSheet />, document.body) : null}
    </div>
  );
}
