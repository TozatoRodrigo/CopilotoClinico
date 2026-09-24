import { describe, expect, it } from 'vitest';
import { sectionDocument } from './official-document-sections';

/** Estrutura típica de um PCDT depois da extração (portaria + anexo + apêndices). */
const PCDT_TEXT = [
  'PORTARIA CONJUNTA Nº 15, DE 13 DE OUTUBRO DE 2020.',
  'Art. 1º Fica aprovado o Protocolo Clínico e Diretrizes Terapêuticas.',
  'ANEXO',
  'PROTOCOLO CLÍNICO E DIRETRIZES TERAPÊUTICAS',
  '1. INTRODUÇÃO',
  'A síndrome é a maior causa de paralisia flácida aguda.',
  '2. CLASSIFICAÇÃO ESTATÍSTICA INTERNACIONAL DE DOENÇAS E PROBLEMAS RELACIONADOS À',
  'SAÚDE (CID-10)',
  '- G61.0 Síndrome de Guillain-Barré',
  '3. DIAGNÓSTICO',
  'Fraqueza progressiva e arreflexia.',
  // Cabeçalho de página grudado no título, como sai do PDF.
  'Protocolos Clínicos e Diretrizes Terapêuticas4 TRATAMENTO',
  '4.1 TRATAMENTO MEDICAMENTOSO',
  'Imunoglobulina humana 0,4 g/kg/dia por 5 dias.',
  '5. MONITORAMENTO',
  'Avaliar capacidade vital a cada 6 horas.',
  '6. REGULAÇÃO, CONTROLE E AVALIAÇÃO PELO GESTOR',
  'Os gestores devem estruturar a rede.',
  '7. REFERÊNCIAS',
  '1. Autor A. Estudo. 2019.',
  'APÊNDICE 1',
  '1. METODOLOGIA DE BUSCA',
  'Tabela GRADE.',
].join('\n');

describe('sectionDocument', () => {
  const doc = sectionDocument(PCDT_TEXT);

  it('reconhece as seções de primeiro nível', () => {
    expect(doc.sectioning).toBe('structured');
    expect(doc.sections.map((section) => [section.number, section.title])).toEqual([
      [1, 'INTRODUÇÃO'],
      [2, 'CLASSIFICAÇÃO ESTATÍSTICA INTERNACIONAL DE DOENÇAS E PROBLEMAS RELACIONADOS À'],
      [3, 'DIAGNÓSTICO'],
      [4, 'TRATAMENTO'],
      [5, 'MONITORAMENTO'],
      [6, 'REGULAÇÃO, CONTROLE E AVALIAÇÃO PELO GESTOR'],
    ]);
  });

  it('inclui só as seções que mudam conduta', () => {
    expect(doc.sections.filter((s) => s.included).map((s) => s.title)).toEqual([
      'DIAGNÓSTICO',
      'TRATAMENTO',
      'MONITORAMENTO',
    ]);
  });

  it('mantém subseção dentro da seção, sem virar título de primeiro nível', () => {
    const tratamento = doc.sections.find((section) => section.title === 'TRATAMENTO')!;

    expect(tratamento.text).toContain('4.1 TRATAMENTO MEDICAMENTOSO');
    expect(tratamento.text).toContain('Imunoglobulina humana 0,4 g/kg/dia');
  });

  it('para nas referências — bibliografia e apêndice nunca viram seção', () => {
    const allText = doc.sections.map((section) => section.text).join('\n');

    expect(allText).not.toContain('Autor A. Estudo');
    expect(allText).not.toContain('Tabela GRADE');
  });

  it('extrai os CIDs da seção de classificação', () => {
    expect(doc.cid10).toEqual(['G61.0']);
  });

  it('guarda o início da introdução para classificar', () => {
    expect(doc.introduction).toBe('A síndrome é a maior causa de paralisia flácida aguda.');
  });

  it('ignora número fora de sequência (lista numerada dentro do texto)', () => {
    const text = [
      '1 INTRODUÇÃO',
      'Texto.',
      '2 DIAGNÓSTICO',
      'Critérios:',
      '1 FEBRE ALTA E PERSISTENTE',
      '3 TRATAMENTO',
      'Conduta.',
    ].join('\n');

    const titles = sectionDocument(text).sections.map((section) => section.title);

    expect(titles).toEqual(['INTRODUÇÃO', 'DIAGNÓSTICO', 'TRATAMENTO']);
  });

  it('corta no termo de esclarecimento mesmo sem referências numeradas', () => {
    const text = [
      '1 DIAGNÓSTICO',
      'Texto.',
      '2 TRATAMENTO',
      'Conduta.',
      'TERMO DE ESCLARECIMENTO E RESPONSABILIDADE',
      'Eu, paciente.',
    ].join('\n');

    const doc = sectionDocument(text);

    expect(doc.sections.at(-1)!.text).toBe('Conduta.');
  });

  it('aceita numeração com travessão ("4 - TRATAMENTO")', () => {
    const text = [
      '1 – INTRODUÇÃO',
      'Texto.',
      '3 – DIAGNÓSTICO',
      'Glicemia.',
      '4 - TRATAMENTO',
      'Insulina.',
    ].join('\n');

    expect(sectionDocument(text).sections.map((section) => section.number)).toEqual([1, 3, 4]);
  });

  it('reconhece títulos numerados em caixa mista, mas não itens de lista', () => {
    const text = [
      '1 Introdução e contexto',
      'Texto.',
      '3 A quem estas diretrizes se destinam',
      'Profissionais.',
      '5 Metodologia para elaboração',
      'GRADE.',
      '6 Sumário de recomendações',
      '7. As mulheres devem receber as seguintes informações:',
      '7 Local de assistência',
      'Oferecer parto em centro de parto normal.',
      '8 Diagnóstico da fase ativa',
      'Dilatação de 4 cm.',
    ].join('\n');

    const doc = sectionDocument(text);

    expect(doc.sections.map((section) => section.title)).toEqual([
      'Introdução e contexto',
      'A quem estas diretrizes se destinam',
      'Metodologia para elaboração',
      'Sumário de recomendações',
      'Local de assistência',
      'Diagnóstico da fase ativa',
    ]);
    expect(doc.sections.filter((section) => section.included).map((s) => s.number)).toEqual([
      3, 6, 7, 8,
    ]);
  });

  it('reconhece títulos sem número em maiúsculas (PCDTs que numeram só subseções)', () => {
    const text = [
      'INTRODUÇÃO',
      'Zoonose.',
      'DIAGNÓSTICO',
      '8.1. Diagnóstico clínico',
      'Febre ondulante.',
      'ABORDAGEM TERAPÊUTICA',
      '9.1. Tratamento medicamentoso em adultos',
      'Doxiciclina.',
      'REFERÊNCIAS',
      'Autor.',
    ].join('\n');

    const doc = sectionDocument(text);

    expect(doc.sectioning).toBe('structured');
    expect(
      doc.sections.map((section) => [section.number, section.title, section.included]),
    ).toEqual([
      [null, 'INTRODUÇÃO', false],
      [null, 'DIAGNÓSTICO', true],
      [null, 'ABORDAGEM TERAPÊUTICA', true],
    ]);
    expect(doc.sections[2]!.text).toContain('Doxiciclina.');
  });

  it('não toma lista de créditos por estrutura', () => {
    const text = [
      '1 MINISTÉRIO DA SAÚDE',
      '2 FEBRASGO – FEDERAÇÃO BRASILEIRA',
      '3 GRUPO DE TRABALHO DO GUIA',
      'Recomendação única sobre o parto.',
    ].join('\n');

    expect(sectionDocument(text).sectioning).toBe('fallback');
  });

  it('ignora o sumário, que repete os títulos antes do corpo', () => {
    const text = [
      'SUMÁRIO',
      '1. INTRODUÇÃO ................................................ 5',
      'REFERÊNCIAS .................................................. 22',
      '1. INTRODUÇÃO',
      'Texto.',
      '2. DIAGNÓSTICO',
      'Mamografia.',
      '3. TRATAMENTO',
      'Cirurgia.',
    ].join('\n');

    const doc = sectionDocument(text);

    expect(doc.sectioning).toBe('structured');
    expect(doc.sections.map((section) => section.text)).toEqual([
      'Texto.',
      'Mamografia.',
      'Cirurgia.',
    ]);
  });

  it('no texto integral, corta na bibliografia em caixa mista', () => {
    const text = [
      'Anexo',
      'Recomendação 1: usar atropina na síndrome colinérgica.',
      'Referências bibliográficas',
      '1. Eddleston M. Management of acute organophosphorus poisoning.',
    ].join('\n');

    expect(sectionDocument(text).sections[0]!.text).toBe(
      'Recomendação 1: usar atropina na síndrome colinérgica.',
    );
  });

  it('cai para o texto integral quando não reconhece estrutura', () => {
    const text = [
      'ANEXO',
      'Recomendação única sobre o uso do medicamento.',
      'REFERÊNCIAS',
      'Autor B.',
    ].join('\n');

    const doc = sectionDocument(text);

    expect(doc.sectioning).toBe('fallback');
    expect(doc.sections).toEqual([
      {
        number: null,
        title: 'TEXTO INTEGRAL',
        text: 'Recomendação única sobre o uso do medicamento.',
        included: true,
      },
    ]);
  });
});
