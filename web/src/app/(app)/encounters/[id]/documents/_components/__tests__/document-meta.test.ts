import { describe, it, expect } from "vitest";
import { aiUseRecordOf, contentPreview } from "../document-meta";

const RECORD =
  "Registro de uso de IA (Res. CFM 2.454/2026): documento elaborado com apoio do Copiloto Clínico (ferramenta de inteligência artificial), revisado e confirmado pelo médico responsável.";

describe("F0-D — registro de uso de IA no documento", () => {
  it("reads the record stored in the document content", () => {
    expect(aiUseRecordOf({ plan: "ECG", aiUseRecord: RECORD })).toBe(RECORD);
  });

  it("returns null for documents generated before the record existed", () => {
    expect(aiUseRecordOf({ plan: "ECG" })).toBeNull();
  });

  it("keeps the record out of the list preview (it says nothing about the case)", () => {
    const preview = contentPreview({ subjective: "Dor torácica", plan: "ECG", aiUseRecord: RECORD });

    expect(preview).toBe("Dor torácica ECG");
  });
});
