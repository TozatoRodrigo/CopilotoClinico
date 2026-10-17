import { describe, it, expect } from "vitest";
import {
  buildPhysicianEdits,
  changedKeys,
  editableValues,
  editedSections,
  formatListItems,
} from "../document-content";

// Mesmo formato que prescricao.generator.ts e alta.generator.ts gravam em `content`.
const dipirona = {
  medicamento: "Dipirona",
  dosagem: "1 g",
  via: "IV",
  frequencia: "6/6h",
  duracao: "3 dias",
};
const ondansetrona = {
  medicamento: "Ondansetrona",
  dosagem: "4 mg",
  via: "IV",
  frequencia: "8/8h",
  duracao: "se náusea",
};

const prescricao = {
  paciente: "PAC-001",
  data: "10/10/2026",
  medicamentos: [dipirona, ondansetrona],
  orientacoes: "- Retornar se febre persistir",
  incerteza: true,
  avisoRevisao: "REVISÃO OBRIGATÓRIA: dose a confirmar",
};

const alta = {
  paciente: "PAC-002",
  data: "10/10/2026",
  resumo: "Pneumonia comunitária tratada",
  diagnosticos: ["Pneumonia comunitária", "Hipertensão arterial"],
  procedimentos: ["Radiografia de tórax"],
  condicaoNaAlta: "Estável, com critérios de alta",
  orientacoes: ["Repouso"],
  medicamentosAlta: ["Amoxicilina 500 mg 8/8h"],
  retorno: "Retorno em 7 dias",
  incerteza: false,
  avisoRevisao: null,
  aiUseRecord: "Registro de uso de IA (Res. CFM 2.454/2026): …",
};

/** O que o editor grava ao salvar o documento como está na tela. */
function saveUntouched(type: "prescricao" | "alta", content: Record<string, unknown>) {
  return buildPhysicianEdits(content, editableValues(type, content));
}

describe("edição de documento com listas estruturadas", () => {
  it("salvar a prescrição sem tocar na lista mantém cada medicamento com todos os campos", () => {
    const saved = saveUntouched("prescricao", prescricao);

    expect(saved.medicamentos).toEqual([dipirona, ondansetrona]);
    expect(saved).not.toHaveProperty("medicamentos_raw");
    expect(JSON.stringify(saved)).not.toContain("[object Object]");
  });

  it("salvar a alta sem tocar na lista mantém os diagnósticos como lista", () => {
    const saved = saveUntouched("alta", alta);

    expect(saved.diagnosticos).toEqual(["Pneumonia comunitária", "Hipertensão arterial"]);
    expect(saved.procedimentos).toEqual(["Radiografia de tórax"]);
    expect(saved.medicamentosAlta).toEqual(["Amoxicilina 500 mg 8/8h"]);
  });

  it("não troca o tipo dos campos que o editor não mostra (incerteza, aviso, registro de IA)", () => {
    expect(saveUntouched("prescricao", prescricao)).toMatchObject({
      incerteza: true,
      avisoRevisao: "REVISÃO OBRIGATÓRIA: dose a confirmar",
    });
    expect(saveUntouched("alta", alta)).toMatchObject({
      incerteza: false,
      avisoRevisao: null,
      aiUseRecord: alta.aiUseRecord,
    });
  });

  it("grava as seções de texto editadas por cima do original", () => {
    const values = { ...editableValues("prescricao", prescricao), orientacoes: "- Hidratação oral" };

    const saved = buildPhysicianEdits(prescricao, values);

    expect(saved.orientacoes).toBe("- Hidratação oral");
    expect(saved.medicamentos).toEqual([dipirona, ondansetrona]);
  });

  it("lista editada vai para medicamentos_raw e a lista estruturada continua no documento", () => {
    const values = {
      ...editableValues("prescricao", prescricao),
      medicamentos_raw: "Dipirona — 500 mg, VO, 6/6h, 3 dias",
    };

    const saved = buildPhysicianEdits(prescricao, values);

    expect(saved.medicamentos_raw).toBe("Dipirona — 500 mg, VO, 6/6h, 3 dias");
    expect(saved.medicamentos).toEqual([dipirona, ondansetrona]);
  });

  it("reabrir um rascunho salvo traz a lista editada de volta", () => {
    const draft = { ...prescricao, medicamentos_raw: "Dipirona — 500 mg, VO" };

    expect(editableValues("prescricao", draft).medicamentos_raw).toBe("Dipirona — 500 mg, VO");
    expect(editableValues("prescricao", prescricao)).not.toHaveProperty("medicamentos_raw");
  });

  it("rascunho salvo antes da correção (lista achatada em texto) volta a ter a lista ao salvar", () => {
    // O que o editor antigo gravava: cada campo passado por extractString.
    const corrupted = {
      ...prescricao,
      orientacoes: "- Orientação revisada",
      medicamentos: "[object Object]\n[object Object]",
      incerteza: "",
    };

    const saved = buildPhysicianEdits(prescricao, editableValues("prescricao", corrupted));

    expect(saved.orientacoes).toBe("- Orientação revisada");
    expect(saved.medicamentos).toEqual([dipirona, ondansetrona]);
    expect(saved.incerteza).toBe(true);
  });
});

describe("formatListItems", () => {
  it("mostra um medicamento por linha com dose, via, frequência e duração", () => {
    expect(formatListItems([dipirona, ondansetrona])).toBe(
      "Dipirona — 1 g, IV, 6/6h, 3 dias\nOndansetrona — 4 mg, IV, 8/8h, se náusea",
    );
  });

  it("omite os campos vazios (o gerador hoje só preenche o nome)", () => {
    expect(
      formatListItems([{ medicamento: "Dipirona 1 g IV 6/6h", dosagem: "", via: "", frequencia: "", duracao: "" }]),
    ).toBe("Dipirona 1 g IV 6/6h");
  });

  it("aceita listas de texto (diagnósticos da alta)", () => {
    expect(formatListItems(alta.diagnosticos)).toBe("Pneumonia comunitária\nHipertensão arterial");
  });

  it("devolve texto vazio quando não há lista", () => {
    expect(formatListItems("[object Object]")).toBe("");
    expect(formatListItems(undefined)).toBe("");
  });
});

describe("indicadores de edição", () => {
  it("só os campos de texto da tela contam como alterados", () => {
    const saved = editableValues("prescricao", prescricao);

    expect(changedKeys(saved, saved)).toEqual([]);
    expect(changedKeys({ ...saved, data: "11/10/2026" }, saved)).toEqual(["data"]);
    expect(changedKeys({ ...saved, medicamentos_raw: "Dipirona" }, saved)).toEqual(["medicamentos_raw"]);
  });

  it("lista igual à da IA não conta como seção editada", () => {
    const values = editableValues("prescricao", prescricao);

    expect(editedSections("prescricao", values, prescricao)).toEqual([]);
    expect(
      editedSections("prescricao", { ...values, medicamentos_raw: formatListItems(prescricao.medicamentos) }, prescricao),
    ).toEqual([]);
    expect(editedSections("prescricao", { ...values, medicamentos_raw: "Dipirona" }, prescricao)).toEqual([
      "medicamentos_raw",
    ]);
  });
});
