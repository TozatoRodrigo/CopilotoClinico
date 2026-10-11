import { describe, expect, it } from 'vitest';
import type { ForbiddenAction } from '../case.schema';
import { findForbiddenTerm, normalizeForMatching } from './forbidden-actions';

const thrombolysis: ForbiddenAction = {
  id: 'trombolise-antes-da-tc',
  description: 'Trombólise antes de a TC excluir hemorragia',
  patterns: ['trombol\\w*', 'alteplase', 'tenecteplase', 'rt-?pa'],
  exceptWhen: ['(somente|so|apenas)\\s+apos', '(apos|depois d[aeo])\\s+(a\\s+)?(tc|tomografia)'],
};

const antithrombotic: ForbiddenAction = {
  id: 'antitrombotico-antes-da-tc',
  description: 'AAS ou anticoagulante antes de a TC excluir hemorragia',
  patterns: ['aas', 'aspirina', 'clopidogrel', 'heparina', 'enoxaparina'],
};

/** Exceção antiga, escrita como se valesse para o texto inteiro. */
const legacyException: ForbiddenAction = {
  id: 'trombolise-sem-diagnostico',
  description: 'Trombólise sem diagnóstico definido',
  patterns: ['trombol\\w*', 'alteplase'],
  exceptWhen: ['(se|caso|apos|quando)\\s+\\w+\\s+(confirm\\w*|ecg|supra\\w*|tep)'],
};

describe('findForbiddenTerm', () => {
  describe('falhas verificadas na auditoria de 11/10/2026', () => {
    it('acusa "Trombólise com alteplase 100 mg IV agora" (o "se" de trombólise e o "tep" de alteplase não são palavras)', () => {
      expect(findForbiddenTerm('Trombólise com alteplase 100 mg IV agora', legacyException)).toBe(
        'trombolise',
      );
    });

    it('acusa "Alteplase 0,9 mg/kg agora; não aguardar exames" (o "não" está em outra oração)', () => {
      expect(
        findForbiddenTerm('Alteplase 0,9 mg/kg agora; não aguardar exames', thrombolysis),
      ).toBe('alteplase');
    });

    it('acusa "AAS 300 mg agora; suspender se TC mostrar sangramento"', () => {
      expect(
        findForbiddenTerm('AAS 300 mg agora; suspender se TC mostrar sangramento', antithrombotic),
      ).toBe('aas');
    });
  });

  describe('falso positivo do experimento de 11/10/2026', () => {
    const antiperistaltic: ForbiddenAction = {
      id: 'antiperistaltico-em-diarreia-invasiva',
      description: 'Antiperistáltico em diarreia com sangue',
      patterns: ['loperamida', 'imosec', 'difenoxilato', 'antiperistalt\\w*'],
    };

    it('a negação vale para o exemplo entre parênteses, com "ex.:", "p. ex." ou "por exemplo"', () => {
      for (const text of [
        'Não administrar antidiarreicos nem antiperistálticos (ex.: loperamida)',
        'Evitar antiperistálticos (p. ex. loperamida)',
        'Não usar antiperistálticos (por exemplo, loperamida ou difenoxilato)',
      ]) {
        expect(findForbiddenTerm(text, antiperistaltic), text).toBeNull();
      }
    });

    it('a negação atravessa uma lista colada ao termo, mesmo de itens fora do caso', () => {
      const triptan: ForbiddenAction = {
        id: 'triptano-em-cefaleia-em-trovoada',
        description: 'Triptano na cefaleia em trovoada',
        patterns: ['triptan\\w*', 'sumatriptan\\w*'],
      };
      for (const text of [
        'Analgesia e antiemético IV, evitando AINE, AAS, triptanos e ergotamínicos',
        'Evitar AINE e triptanos',
        'Não usar opioide, AINE ou sumatriptano',
      ]) {
        expect(findForbiddenTerm(text, triptan), text).toBeNull();
      }
      for (const text of [
        'Sem melhora, triptano SC',
        'Não usar AINE, fazer triptano agora',
        'Dipirona, triptano e antiemético agora',
      ]) {
        expect(findForbiddenTerm(text, triptan), text).not.toBeNull();
      }
    });

    it('"se não houver X" é ausência do recurso, não ordem de usá-lo', () => {
      const insulin: ForbiddenAction = {
        id: 'insulina-sem-potassio',
        description: 'Insulina IV antes de conhecer o potássio',
        patterns: ['insulin\\w*(\\s+\\S+){0,6}?\\s+(iv|ev|infus\\w*|continu[ao])'],
      };
      expect(
        findForbiddenTerm(
          'Transferir via regulação se não houver insulina IV contínua com monitorização',
          insulin,
        ),
      ).toBeNull();
      expect(
        findForbiddenTerm('Se não houver melhora, insulina IV contínua', insulin),
      ).not.toBeNull();
    });

    it('continua acusando o exemplo recomendado', () => {
      expect(
        findForbiddenTerm('Sintomáticos (ex.: loperamida) se necessário', antiperistaltic),
      ).toBe('loperamida');
      expect(findForbiddenTerm('Loperamida 4 mg VO agora', antiperistaltic)).toBe('loperamida');
    });
  });

  describe('casa palavras inteiras, sem acento e sem caixa', () => {
    it('casa o radical declarado com \\w*', () => {
      expect(findForbiddenTerm('TROMBÓLISE IV', thrombolysis)).toBe('trombolise');
    });

    it('não casa termo dentro de outra palavra', () => {
      expect(findForbiddenTerm('Paciente com Glasgow 15', antithrombotic)).toBeNull();
      expect(
        findForbiddenTerm('Analgesia com dipirona', { ...antithrombotic, patterns: ['dipi'] }),
      ).toBeNull();
    });
  });

  describe('negação que governa o termo', () => {
    it.each([
      'Não fazer trombólise',
      'Não há indicação de trombólise',
      'Trombólise não está indicada',
      'Trombólise contraindicada',
      'Trombólise: contraindicada pela hemorragia',
      'Trombólise desnecessária neste momento',
      'Não precisa de trombólise',
      'Alteplase IV: não usar',
      'Trombólise: evitar até a TC',
      'Manter PA < 185/110 antes da trombólise',
      'Evitar o uso de alteplase',
      'Sem indicação de trombólise neste momento',
    ])('ignora "%s"', (text) => {
      expect(findForbiddenTerm(text, thrombolysis)).toBeNull();
    });

    it('estende a negação aos itens de uma lista', () => {
      expect(findForbiddenTerm('Evitar AAS, clopidogrel e heparina', antithrombotic)).toBeNull();
      expect(findForbiddenTerm('Não usar AAS nem heparina até a TC', antithrombotic)).toBeNull();
      expect(findForbiddenTerm('AAS e heparina contraindicados', antithrombotic)).toBeNull();
    });

    it('estende a negação a uma lista colada ao termo, com ou sem termos de outras condutas do caso', () => {
      const sentence = 'Não administrar AAS, heparina ou trombolítico até excluir dissecção';
      expect(findForbiddenTerm(sentence, thrombolysis)).toBeNull();
      expect(findForbiddenTerm(sentence, thrombolysis, [thrombolysis, antithrombotic])).toBeNull();
    });

    it.each([
      ['Não atrasar a trombólise', 'adiamento desfaz a negação'],
      ['Iniciar sem demora a trombólise', 'adiamento desfaz a negação'],
      ['Sem contraindicação para alteplase: iniciar já', '"sem contraindicação" é afirmativo'],
      ['Elegível: alteplase 0,9 mg/kg agora', 'rótulo antes de dois-pontos não alcança o termo'],
      ['Sem melhora, alteplase 0,9 mg/kg', '"sem" governa "melhora", não o fármaco'],
      ['Não há tempo a perder, alteplase agora', 'negação longe demais do termo'],
      ['Alteplase 0,9 mg/kg agora: não aguardar a TC', 'ordem depois do rótulo não é negativa'],
    ])('acusa "%s" (%s)', (text) => {
      expect(findForbiddenTerm(text, thrombolysis)).not.toBeNull();
    });

    it('estende a negação ao que o parêntese explica', () => {
      expect(
        findForbiddenTerm('Não usar antitrombótico (AAS, heparina) antes da TC', antithrombotic),
      ).toBeNull();
      expect(findForbiddenTerm('Trombólise (alteplase) contraindicada', thrombolysis)).toBeNull();
      expect(findForbiddenTerm('AAS 300 mg (não usar se alergia)', antithrombotic)).toBe('aas');
    });

    it('não leva o qualificador de depois da vírgula para o termo anterior', () => {
      expect(findForbiddenTerm('AAS 300 mg agora, heparina contraindicada', antithrombotic)).toBe(
        'aas',
      );
    });
  });

  describe('exceptWhen local', () => {
    it('vale quando começa perto do termo', () => {
      expect(
        findForbiddenTerm('Alteplase 0,9 mg/kg somente após TC sem sangramento', thrombolysis),
      ).toBeNull();
      expect(
        findForbiddenTerm('Após a TC excluir sangramento, alteplase 0,9 mg/kg', thrombolysis),
      ).toBeNull();
    });

    it('vale a partir de rótulo condicional, nunca de rótulo afirmativo', () => {
      expect(findForbiddenTerm('Após a TC sem sangramento: alteplase', thrombolysis)).toBeNull();
      expect(findForbiddenTerm('Apenas após a TC: alteplase 0,9 mg/kg', thrombolysis)).toBeNull();
      expect(findForbiddenTerm('Elegível após a TC: alteplase', thrombolysis)).toBe('alteplase');
    });

    it('não vale em outra oração nem longe do termo', () => {
      expect(
        findForbiddenTerm('Alteplase 0,9 mg/kg agora. Repetir exame após a TC', thrombolysis),
      ).toBe('alteplase');
      expect(
        findForbiddenTerm(
          'Alteplase 0,9 mg/kg em bolus de 10% e o restante em uma hora, monitorar após a TC',
          thrombolysis,
        ),
      ).toBe('alteplase');
    });
  });
});

describe('normalizeForMatching', () => {
  it('tira acento e caixa', () => {
    expect(normalizeForMatching('TROMBÓLISE Já')).toBe('trombolise ja');
  });
});
