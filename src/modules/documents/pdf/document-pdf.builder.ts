import PDFDocument from 'pdfkit';

export interface PdfDocumentInput {
  type: string;
  content: Record<string, unknown>;
  confirmedAt: Date;
  physicianId: string;
}

export function buildDocumentPdf(input: PdfDocumentInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(18).text('Copiloto Clínico de Plantão', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(14).text(`Documento: ${input.type.toUpperCase()}`, { align: 'center' });
    doc.moveDown();
    doc.fontSize(10).text(`Confirmado em: ${input.confirmedAt.toISOString()}`);
    doc.text(`Médico ID: ${input.physicianId}`);
    doc.moveDown();
    doc.fontSize(12).text('Conteúdo:', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(10).text(JSON.stringify(input.content, null, 2), { lineGap: 2 });

    doc.end();
  });
}
