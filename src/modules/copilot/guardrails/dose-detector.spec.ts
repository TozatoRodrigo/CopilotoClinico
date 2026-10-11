import { describe, expect, it } from 'vitest';
import { findDoseMentions } from './dose-detector';

describe('findDoseMentions', () => {
  describe('encontra dose, taxa e concentração de droga', () => {
    it.each([
      ['Adrenalina 0,5 mg IM na face lateral da coxa', '0,5 mg'],
      ['Alteplase 0,9 mg/kg, máximo 90 mg', '0,9 mg/kg'],
      ['Noradrenalina 0,1 mcg/kg/min', '0,1 mcg/kg/min'],
      ['Heparina 5.000 UI subcutânea', '5.000 ui'],
      ['Insulina regular 0,1 U/kg/h', '0,1 u/kg/h'],
      ['Reposição de KCl 40 mEq', '40 meq'],
      ['Cristaloide 30 mL/kg em 3 horas', '30 ml/kg'],
      ['Bolus de 500 mL de Ringer lactato', '500 ml'],
      ['Infundir 1 L de cristaloide', '1 l'],
      ['Sulfato de magnésio 2 g IV', '2 g'],
      ['Ceftriaxona 2g IV', '2g'],
      ['Diazepam 10mg IV', '10mg'],
      ['Morfina 2 a 4 mg IV', '4 mg'],
      ['Dipirona 1 ampola IV', '1 ampola'],
      ['Salbutamol 4 puffs com espaçador', '4 puffs'],
      ['Ringer lactato 20 mL/kg/h', '20 ml/kg/h'],
      ['Fentanil 100 µg', '100 µg'],
    ])('"%s"', (text, mention) => {
      expect(findDoseMentions(text)).toContain(mention);
    });

    it.each([
      ['Glicose 50% 40 mL IV', 'glicose 50%'],
      ['Glicose a 50% em bolus', 'glicose a 50%'],
      ['SG 10% em manutenção', 'sg 10%'],
      ['Salina hipertônica 3%', 'salina hipertonica 3%'],
      ['Lidocaína 2% sem vasoconstritor', 'lidocaina 2%'],
    ])('concentração de solução — "%s"', (text, mention) => {
      expect(findDoseMentions(text)).toContain(mention);
    });
  });

  describe('não confunde critério, meta ou exame com dose', () => {
    it.each([
      'NIHSS 14 na admissão',
      'Manter PA < 185/110 mmHg antes da trombólise',
      'PA < 185/110',
      'Corrigir se glicemia < 70',
      'Glicemia capilar < 70 mg/dL indica hipoglicemia',
      'Manter SpO2 ≥ 94%',
      'Alvo de saturação entre 92-96%',
      'Reduzir a PAM em no máximo 25% na primeira hora',
      'Transfundir se Hb < 7 g/dL',
      'Potássio < 3,5 mEq/L',
      'Lactato > 2 mmol/L sugere hipoperfusão',
      'O2 sob máscara com reservatório a 15 L/min',
      'Acesso venoso e SF 0,9%',
      'Soro fisiológico 0,9% para manter veia',
      'NaCl 0,9% para diluição',
      'ECG de 12 derivações em até 10 minutos',
      'TC de crânio em até 25 minutos',
      'Paciente de 70 kg',
      'Glasgow ≤ 8: via aérea definitiva',
      'FC > 100 bpm e temperatura 38,5 °C',
      'Janela de 4,5 h desde o último momento visto bem',
      'HbA1c 7% no último controle',
      'Dose conforme protocolo institucional',
    ])('"%s"', (text) => {
      expect(findDoseMentions(text)).toEqual([]);
    });
  });
});
