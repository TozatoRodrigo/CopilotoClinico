import path from 'path';
import PDFDocument from 'pdfkit';

export interface PdfDocumentInput {
  type: string;
  content: Record<string, unknown>;
  confirmedAt: Date;
  /** Código curto e legível do documento, ex.: "SOAP-847B234F". */
  documentCode: string;
  physicianName: string;
  /** Ex.: "SP-123456", ou null se o médico não tiver CRM cadastrado. */
  crmLabel: string | null;
  /** Prefixo curto do encounterId, para referência cruzada com a trilha de auditoria. */
  encounterCode: string;
  contentHash: string | null;
}

// ── Identidade visual — espelha as CSS custom properties de web/src/app/globals.css ──
const COLOR = {
  ink: '#10243a',
  inkSoft: '#46586c',
  line: '#e1e8ec',
  teal: '#0e7c7b',
  green: '#1e7f4f',
} as const;

const FONTS_DIR = path.join(__dirname, 'fonts');
const FONT = {
  sans: 'sans',
  display: 'display',
  mono: 'mono',
  monoSemibold: 'mono-semibold',
} as const;

const TYPE_LABELS: Record<string, string> = {
  soap: 'SOAP',
  sbar: 'SBAR',
  prescricao: 'Prescrição',
  alta: 'Alta',
  atestado: 'Atestado',
};

interface FieldDef {
  key: string;
  label: string;
  mono?: boolean;
}

// Espelha SECTION_FIELDS em web/src/app/(app)/encounters/[id]/documents/[docId]/edit/page.tsx
// — o PDF deve mostrar as mesmas seções, na mesma ordem, que o médico revisou na tela.
const SECTION_FIELDS: Record<string, FieldDef[]> = {
  soap: [
    { key: 'subjective', label: 'Subjetivo' },
    { key: 'objective', label: 'Objetivo' },
    { key: 'assessment', label: 'Avaliação' },
    { key: 'plan', label: 'Plano' },
  ],
  sbar: [
    { key: 'situation', label: 'Situação' },
    { key: 'background', label: 'Background' },
    { key: 'assessment', label: 'Avaliação' },
    { key: 'recommendation', label: 'Recomendação' },
  ],
  prescricao: [
    { key: 'paciente', label: 'Paciente' },
    { key: 'data', label: 'Data', mono: true },
    { key: 'orientacoes', label: 'Orientações' },
  ],
  alta: [
    { key: 'paciente', label: 'Paciente' },
    { key: 'data', label: 'Data', mono: true },
    { key: 'resumo', label: 'Resumo' },
    { key: 'condicaoNaAlta', label: 'Condição na Alta' },
    { key: 'retorno', label: 'Retorno' },
  ],
  atestado: [
    { key: 'paciente', label: 'Paciente' },
    { key: 'data', label: 'Data', mono: true },
    { key: 'descricao', label: 'Descrição' },
    { key: 'assinaturaPlaceholder', label: 'Assinatura' },
  ],
};

const SOAP_LETTERS: Record<string, string> = {
  subjective: 'S',
  objective: 'O',
  assessment: 'A',
  plan: 'P',
};

function extractString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.join('\n');
  if (value && typeof value === 'object') return JSON.stringify(value, null, 2);
  return '';
}

/** Uma linha por item, aceitando tanto `${key}_raw` (edição manual em texto livre,
 * ver MedicamentosSection/ListSection no frontend) quanto o array estruturado original. */
function extractListLines(
  content: Record<string, unknown>,
  rawKey: string,
  arrKey: string,
  formatItem: (item: unknown) => string = extractString,
): string[] {
  const raw = content[rawKey];
  if (typeof raw === 'string' && raw.trim()) {
    return raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  }
  const arr = content[arrKey];
  if (Array.isArray(arr)) {
    return arr.map(formatItem).filter(Boolean);
  }
  return [];
}

function formatMedicamentoItem(item: unknown): string {
  if (typeof item === 'string') return item;
  if (!item || typeof item !== 'object') return String(item);
  const m = item as Record<string, unknown>;
  const nome = typeof m.medicamento === 'string' ? m.medicamento.trim() : '';
  const details = [m.dosagem, m.via, m.frequencia, m.duracao]
    .filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
    .join(', ');
  return details ? `${nome} — ${details}` : nome;
}

function formatDateTime(date: Date): string {
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Gera o PDF de um documento clínico confirmado, com o mesmo layout, tipografia
 * e paleta de cores da tela de revisão (ChartPaper) — para que o documento
 * assinado seja reconhecível como o mesmo que o médico revisou antes de confirmar.
 */
export function buildDocumentPdf(input: PdfDocumentInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const PAGE_MARGIN = 56;
      const FOOTER_RESERVED = 60;

      const doc = new PDFDocument({
        size: 'A4',
        margins: {
          top: PAGE_MARGIN,
          bottom: PAGE_MARGIN + FOOTER_RESERVED,
          left: PAGE_MARGIN,
          right: PAGE_MARGIN,
        },
        bufferPages: true,
        info: {
          Title: `${TYPE_LABELS[input.type] ?? input.type.toUpperCase()} · ${input.documentCode}`,
          Author: input.physicianName,
          Subject: 'Documento clínico confirmado — Copiloto Clínico de Plantão',
        },
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.registerFont(FONT.sans, path.join(FONTS_DIR, 'DMSans-Variable.ttf'));
      doc.registerFont(FONT.display, path.join(FONTS_DIR, 'DMSerifDisplay-Regular.ttf'));
      doc.registerFont(FONT.mono, path.join(FONTS_DIR, 'IBMPlexMono-Regular.ttf'));
      doc.registerFont(FONT.monoSemibold, path.join(FONTS_DIR, 'IBMPlexMono-SemiBold.ttf'));

      const contentWidth = doc.page.width - PAGE_MARGIN * 2;
      const bottomLimit = () => doc.page.height - doc.page.margins.bottom;

      drawHeader(doc, input, contentWidth, PAGE_MARGIN);
      drawBody(doc, input, contentWidth, PAGE_MARGIN, bottomLimit);

      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        drawFooter(doc, input, contentWidth, PAGE_MARGIN, i - range.start + 1, range.count);
      }

      doc.end();
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

function drawHeader(
  doc: PDFKit.PDFDocument,
  input: PdfDocumentInput,
  contentWidth: number,
  marginX: number,
): void {
  const title = TYPE_LABELS[input.type] ?? input.type.toUpperCase();
  const stampWidth = 122;
  const stampX = marginX + contentWidth - stampWidth;
  const stampTop = doc.y;

  doc
    .font(FONT.monoSemibold)
    .fontSize(8)
    .fillColor(COLOR.teal)
    .text('COPILOTO CLÍNICO DE PLANTÃO', marginX, stampTop, {
      width: contentWidth - stampWidth - 16,
      characterSpacing: 1.2,
    });

  doc
    .font(FONT.display)
    .fontSize(29)
    .fillColor(COLOR.ink)
    .text(title, marginX, doc.y + 5, { width: contentWidth - stampWidth - 16 });

  // Selo "confirmado" — canto superior direito, alinhado ao topo do cabeçalho.
  doc
    .roundedRect(stampX, stampTop, stampWidth, 42, 5)
    .lineWidth(1.3)
    .strokeColor(COLOR.green)
    .stroke();
  doc
    .font(FONT.monoSemibold)
    .fontSize(9)
    .fillColor(COLOR.green)
    .text('CONFIRMADO', stampX, stampTop + 9, {
      width: stampWidth,
      align: 'center',
      characterSpacing: 0.8,
    });
  doc
    .font(FONT.mono)
    .fontSize(7.5)
    .fillColor(COLOR.green)
    .text(formatDateTime(input.confirmedAt), stampX, stampTop + 23, {
      width: stampWidth,
      align: 'center',
    });

  const metaY = Math.max(doc.y, stampTop + 42) + 12;
  doc
    .font(FONT.mono)
    .fontSize(8.5)
    .fillColor(COLOR.inkSoft)
    .text(`Código ${input.documentCode}  ·  Atendimento ${input.encounterCode}`, marginX, metaY, {
      width: contentWidth,
    });
  doc
    .font(FONT.mono)
    .fontSize(8.5)
    .fillColor(COLOR.inkSoft)
    .text(
      `Dr(a). ${input.physicianName}${input.crmLabel ? `  ·  CRM ${input.crmLabel}` : ''}`,
      marginX,
      doc.y + 2,
      { width: contentWidth },
    );

  const ruleY = doc.y + 16;
  doc.moveTo(marginX, ruleY).lineTo(marginX + contentWidth, ruleY).lineWidth(2).strokeColor(COLOR.ink).stroke();
  doc.y = ruleY + 26;
}

function drawBody(
  doc: PDFKit.PDFDocument,
  input: PdfDocumentInput,
  contentWidth: number,
  marginX: number,
  bottomLimit: () => number,
): void {
  const fields = SECTION_FIELDS[input.type] ?? [];

  if (fields.length === 0) {
    // Tipo desconhecido — fallback para o conteúdo bruto, ainda na tipografia da marca.
    doc
      .font(FONT.mono)
      .fontSize(9)
      .fillColor(COLOR.ink)
      .text(JSON.stringify(input.content, null, 2), marginX, doc.y, {
        width: contentWidth,
        lineGap: 3,
      });
    return;
  }

  if (input.type === 'soap') {
    const letterColWidth = 44;
    fields.forEach((field, index) => {
      const letter = SOAP_LETTERS[field.key] ?? field.label.charAt(0).toUpperCase();
      const text = extractString(input.content[field.key]) || '—';
      drawSoapSection(
        doc,
        marginX,
        contentWidth,
        letterColWidth,
        letter,
        field.label,
        text,
        index === fields.length - 1,
        bottomLimit,
      );
    });
    return;
  }

  fields.forEach((field) => {
    const text = extractString(input.content[field.key]) || '—';
    drawPlainField(doc, marginX, contentWidth, field.label, text, field.mono);
  });

  if (input.type === 'prescricao') {
    const lines = extractListLines(input.content, 'medicamentos_raw', 'medicamentos', formatMedicamentoItem);
    drawBulletList(doc, marginX, contentWidth, 'Medicamentos', lines);
  }
  if (input.type === 'alta') {
    const lines = extractListLines(input.content, 'diagnosticos_raw', 'diagnosticos');
    drawBulletList(doc, marginX, contentWidth, 'Diagnósticos', lines);
  }
}

function drawSoapSection(
  doc: PDFKit.PDFDocument,
  marginX: number,
  contentWidth: number,
  letterColWidth: number,
  letter: string,
  label: string,
  text: string,
  isLast: boolean,
  bottomLimit: () => number,
): void {
  const labelX = marginX + letterColWidth;
  const labelWidth = contentWidth - letterColWidth;

  doc.font(FONT.monoSemibold).fontSize(8.5);
  const labelHeight = doc.heightOfString(label.toUpperCase(), { width: labelWidth, characterSpacing: 1 });
  doc.font(FONT.sans).fontSize(10.5);
  const textHeight = doc.heightOfString(text, { width: labelWidth, lineGap: 3 });
  const estimatedHeight = Math.max(48, labelHeight + 6 + textHeight) + 40;

  // Mantém a seção inteira em uma página quando cabe — evita um S/O/A/P
  // partido ao meio entre páginas.
  if (doc.y + estimatedHeight > bottomLimit() && doc.y > doc.page.margins.top + 40) {
    doc.addPage();
  }

  const startY = doc.y + 18;
  doc
    .font(FONT.display)
    .fontSize(32)
    .fillColor(COLOR.line)
    .text(letter, marginX, startY, { width: letterColWidth - 10 });
  doc
    .font(FONT.monoSemibold)
    .fontSize(8.5)
    .fillColor(COLOR.inkSoft)
    .text(label.toUpperCase(), labelX, startY + 5, { width: labelWidth, characterSpacing: 1 });
  doc
    .font(FONT.sans)
    .fontSize(10.5)
    .fillColor(COLOR.ink)
    .text(text, labelX, doc.y + 6, { width: labelWidth, lineGap: 3 });

  const sectionBottom = Math.max(doc.y, startY + 38) + 18;
  if (!isLast) {
    doc
      .moveTo(marginX, sectionBottom)
      .lineTo(marginX + contentWidth, sectionBottom)
      .lineWidth(1)
      .strokeColor(COLOR.line)
      .stroke();
  }
  doc.y = sectionBottom + (isLast ? 4 : 16);
}

function drawPlainField(
  doc: PDFKit.PDFDocument,
  marginX: number,
  contentWidth: number,
  label: string,
  text: string,
  mono?: boolean,
): void {
  doc
    .font(FONT.sans)
    .fontSize(9.5)
    .fillColor(COLOR.inkSoft)
    .text(label, marginX, doc.y, { width: contentWidth });
  doc
    .font(mono ? FONT.mono : FONT.sans)
    .fontSize(10.5)
    .fillColor(COLOR.ink)
    .text(text, marginX, doc.y + 3, { width: contentWidth, lineGap: 3 });
  doc.y += 16;
}

function drawBulletList(
  doc: PDFKit.PDFDocument,
  marginX: number,
  contentWidth: number,
  title: string,
  items: string[],
): void {
  if (items.length === 0) return;

  doc
    .font(FONT.sans)
    .fontSize(9.5)
    .fillColor(COLOR.inkSoft)
    .text(title, marginX, doc.y, { width: contentWidth });
  doc.y += 3;
  for (const item of items) {
    doc
      .font(FONT.sans)
      .fontSize(10.5)
      .fillColor(COLOR.ink)
      .text(`•  ${item}`, marginX, doc.y, { width: contentWidth, lineGap: 2 });
  }
  doc.y += 12;
}

function drawFooter(
  doc: PDFKit.PDFDocument,
  input: PdfDocumentInput,
  contentWidth: number,
  marginX: number,
  pageIndex: number,
  pageCount: number,
): void {
  // O rodapé é desenhado dentro da margem inferior reservada (FOOTER_RESERVED),
  // que fica fora da área "imprimível" que o pdfkit usa para decidir se deve
  // paginar automaticamente. Escrever texto ali com a margem original ativa
  // faz o pdfkit interpretar como overflow e inserir páginas em branco —
  // por isso zeramos a margem só durante o desenho do rodapé.
  const originalBottomMargin = doc.page.margins.bottom;
  const footerTop = doc.page.height - originalBottomMargin + 12;
  doc.page.margins.bottom = 0;

  doc
    .dash(2, { space: 2 })
    .moveTo(marginX, footerTop)
    .lineTo(marginX + contentWidth, footerTop)
    .lineWidth(1)
    .strokeColor(COLOR.line)
    .stroke();
  doc.undash();

  const hashLabel = input.contentHash ? `sha-256 ${input.contentHash.slice(0, 16)}…` : 'sem hash registrado';
  doc
    .font(FONT.mono)
    .fontSize(7.5)
    .fillColor(COLOR.inkSoft)
    .fillOpacity(0.7)
    .text(hashLabel, marginX, footerTop + 8, { width: contentWidth / 2 });
  doc
    .font(FONT.mono)
    .fontSize(7.5)
    .fillColor(COLOR.inkSoft)
    .fillOpacity(0.7)
    .text('Copiloto Clínico · trilha de auditoria CFM', marginX, footerTop + 8, {
      width: contentWidth,
      align: 'right',
    });

  if (pageCount > 1) {
    doc
      .font(FONT.mono)
      .fontSize(7.5)
      .fillColor(COLOR.inkSoft)
      .fillOpacity(0.6)
      .text(`Página ${pageIndex} de ${pageCount}`, marginX, footerTop + 21, {
        width: contentWidth,
        align: 'center',
      });
  }
  doc.fillOpacity(1);
  doc.page.margins.bottom = originalBottomMargin;
}
