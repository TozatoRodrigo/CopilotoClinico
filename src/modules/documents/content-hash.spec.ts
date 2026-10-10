import { describe, it, expect } from 'vitest';
import { canonicalJson, sealContent, verifyContentSeal } from './content-hash';

const prescription = {
  paciente: 'PAC-001',
  data: '2026-10-10',
  medicamentos: [
    {
      medicamento: 'AAS',
      dosagem: '100 mg',
      via: 'oral',
      frequencia: '1x/dia',
      duracao: 'contínuo',
    },
  ],
  orientacoes: 'Retornar se dor torácica.',
  incerteza: false,
  avisoRevisao: null,
};

// Calculados com o canonicalHash original (3be2d1dd) e com o v2 — fixados
// para que qualquer mudança de algoritmo quebre o teste, não a verificação
// dos documentos já selados.
const PRESCRIPTION_V1_HASH = '11dd71622560cdf1d8008ee8cae96136eb7ce6c3dd56439360dc74d62ac40754';
const PRESCRIPTION_V2_HASH = '63fb4272fe557ed6c8f62d92641dcbe0ab3e431a54611d5cbf029a22587c7a6a';

function withDosage(dosagem: string) {
  const [medication] = prescription.medicamentos;
  return { ...prescription, medicamentos: [{ ...medication!, dosagem }] };
}

describe('canonicalJson', () => {
  it('ordena as chaves em todos os níveis e preserva a ordem dos arrays', () => {
    expect(canonicalJson({ b: [{ z: 1, a: 2 }, 'x'], a: { d: null, c: true } })).toBe(
      '{"a":{"c":true,"d":null},"b":[{"a":2,"z":1},"x"]}',
    );
  });

  describe('vetores da RFC 8785 (JCS)', () => {
    it('serializa números e strings como o exemplo da seção 3.2.3', () => {
      const input = {
        numbers: [333333333.33333329, 1e30, 4.5, 2e-3, 0.000000000000000000000000001],
        string: '€$\u000F\nA\'B"\\\\"/',
        literals: [null, true, false],
      };

      expect(canonicalJson(input)).toBe(
        String.raw`{"literals":[null,true,false],"numbers":[333333333.3333333,1e+30,4.5,0.002,1e-27],"string":"€$\u000f\nA'B\"\\\\\"/"}`,
      );
    });

    it('ordena chaves por unidade UTF-16 como o exemplo da seção 3.2.3', () => {
      const input = {
        '€': 'Euro Sign',
        '\r': 'Carriage Return',
        דּ: 'Hebrew Letter Dalet With Dagesh',
        '1': 'One',
        '😀': 'Emoji: Grinning Face',
        '\u0080': 'Control',
        ö: 'Latin Small Letter O With Diaeresis',
      };

      const valuesInOutputOrder = [...canonicalJson(input).matchAll(/:"([^"]+)"/g)].map(
        (match) => match[1],
      );

      expect(valuesInOutputOrder).toEqual([
        'Carriage Return',
        'One',
        'Control',
        'Latin Small Letter O With Diaeresis',
        'Euro Sign',
        'Emoji: Grinning Face',
        'Hebrew Letter Dalet With Dagesh',
      ]);
    });
  });
});

describe('sealContent', () => {
  it('sela com SHA-256 hexadecimal na versão 2', () => {
    expect(sealContent(prescription)).toEqual({
      contentHash: PRESCRIPTION_V2_HASH,
      contentHashVersion: 2,
    });
  });

  // Regressão do ADR-012: o v1 serializava os medicamentos como `{}`.
  it('muda o hash quando um campo de medicamento da prescrição é editado', () => {
    const edited = sealContent(withDosage('500 mg'));

    expect(edited.contentHash).not.toBe(sealContent(prescription).contentHash);
  });

  it('não depende da ordem das chaves em nenhum nível', () => {
    const reordered = {
      avisoRevisao: null,
      incerteza: false,
      orientacoes: prescription.orientacoes,
      medicamentos: [
        {
          via: 'oral',
          duracao: 'contínuo',
          medicamento: 'AAS',
          frequencia: '1x/dia',
          dosagem: '100 mg',
        },
      ],
      data: prescription.data,
      paciente: prescription.paciente,
    };

    expect(sealContent(reordered).contentHash).toBe(PRESCRIPTION_V2_HASH);
  });

  it('sela o conteúdo da geração igual ao JSON que volta do banco', () => {
    const generated = { ...prescription, cidSugerido: undefined };

    expect(sealContent(generated).contentHash).toBe(PRESCRIPTION_V2_HASH);
  });
});

describe('verifyContentSeal', () => {
  describe('v2 (JSON canônico)', () => {
    it('verifica o conteúdo selado', () => {
      expect(verifyContentSeal(prescription, sealContent(prescription))).toBe(true);
    });

    it('rejeita medicamento alterado depois da confirmação', () => {
      expect(verifyContentSeal(withDosage('500 mg'), sealContent(prescription))).toBe(false);
    });
  });

  describe('v1 (legado)', () => {
    const legacySeal = { contentHash: PRESCRIPTION_V1_HASH, contentHashVersion: 1 };

    it('verifica documento selado com o algoritmo original', () => {
      expect(verifyContentSeal(prescription, legacySeal)).toBe(true);
    });

    it('rejeita campo de nível raiz alterado', () => {
      expect(verifyContentSeal({ ...prescription, orientacoes: 'Alterado' }, legacySeal)).toBe(
        false,
      );
    });

    // Limitação conhecida e documentada no ADR-012 — não é corrigível sem
    // re-selar, o que validaria alterações feitas depois da confirmação.
    it('não detecta alteração dentro dos itens de medicamento', () => {
      expect(verifyContentSeal(withDosage('500 mg'), legacySeal)).toBe(true);
    });
  });

  it('não verifica selo de versão desconhecida', () => {
    const futureSeal = { contentHash: PRESCRIPTION_V2_HASH, contentHashVersion: 3 };

    expect(verifyContentSeal(prescription, futureSeal)).toBe(false);
  });

  it('não verifica documento sem selo', () => {
    expect(verifyContentSeal(prescription, { contentHash: null, contentHashVersion: null })).toBe(
      false,
    );
  });
});
