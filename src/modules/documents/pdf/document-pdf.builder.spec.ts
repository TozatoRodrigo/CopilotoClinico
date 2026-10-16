import { describe, it, expect } from 'vitest';
import { extractText, getDocumentProxy } from 'unpdf';
import { buildDocumentPdf, type PdfDocumentInput } from './document-pdf.builder';
import { AI_USE_RECORD_TEXT } from '../ai-use-record';

const soapContent = {
  subjective: 'Dor torácica há 2 horas',
  objective: 'PA 150x90',
  assessment: 'Síndrome coronariana aguda provável',
  plan: '- ECG de 12 derivações',
};

function soapInput(content: Record<string, unknown>): PdfDocumentInput {
  return {
    type: 'soap',
    content,
    confirmedAt: new Date('2026-10-10T12:00:00.000Z'),
    documentCode: 'SOAP-1A2B3C4D',
    physicianName: 'Ana Teste',
    crmLabel: 'SP-123456',
    encounterCode: '22222222-222',
    contentHash: 'a'.repeat(64),
  };
}

/**
 * Texto do PDF sem espaços: o pdfkit quebra linhas longas e o rótulo usa
 * espaçamento entre letras (sai "R E G I S T R O"), então a comparação
 * ignora todo espaço em branco.
 */
const withoutSpaces = (text: string): string => text.replace(/\s+/g, '');

async function pdfText(input: PdfDocumentInput): Promise<string> {
  const buffer = await buildDocumentPdf(input);
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });
  return withoutSpaces(text);
}

describe('buildDocumentPdf — F0-D: registro de uso de IA', () => {
  it('imprime o registro gravado no conteúdo selado, separado das seções clínicas', async () => {
    const text = await pdfText(soapInput({ ...soapContent, aiUseRecord: AI_USE_RECORD_TEXT }));

    expect(text).toContain(withoutSpaces('REGISTRO DE USO DE IA'));
    expect(text).toContain(withoutSpaces(AI_USE_RECORD_TEXT));
  });

  it('não inventa o registro em documento gerado antes dele existir', async () => {
    const text = await pdfText(soapInput(soapContent));

    expect(text).toContain(withoutSpaces('Dor torácica há 2 horas'));
    expect(text).not.toContain(withoutSpaces('REGISTRO DE USO DE IA'));
  });
});

describe('buildDocumentPdf — lista de medicamentos da prescrição', () => {
  const prescricaoContent = {
    paciente: 'PAC-001',
    data: '10/10/2026',
    medicamentos: [
      { medicamento: 'Dipirona', dosagem: '1 g', via: 'IV', frequencia: '6/6h', duracao: '3 dias' },
    ],
    orientacoes: '- Retornar se febre persistir',
  };

  function prescricaoInput(content: Record<string, unknown>): PdfDocumentInput {
    return { ...soapInput(content), type: 'prescricao', documentCode: 'PRESCRICAO-1A2B3C4D' };
  }

  it('imprime cada medicamento com dose, via, frequência e duração', async () => {
    const text = await pdfText(prescricaoInput(prescricaoContent));

    expect(text).toContain(withoutSpaces('Dipirona — 1 g, IV, 6/6h, 3 dias'));
  });

  it('usa a lista editada pelo médico (medicamentos_raw) no lugar da estruturada', async () => {
    const text = await pdfText(
      prescricaoInput({ ...prescricaoContent, medicamentos_raw: 'Paracetamol — 750 mg, VO, 6/6h' }),
    );

    expect(text).toContain(withoutSpaces('Paracetamol — 750 mg, VO, 6/6h'));
    expect(text).not.toContain(withoutSpaces('Dipirona'));
  });

  it('lista apagada pelo médico não volta a imprimir a da IA', async () => {
    const text = await pdfText(prescricaoInput({ ...prescricaoContent, medicamentos_raw: '' }));

    expect(text).not.toContain(withoutSpaces('Dipirona'));
  });
});
