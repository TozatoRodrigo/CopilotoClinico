import { describe, expect, it } from "vitest";
import {
  fromClarifyingQuestion,
  fromIntakeQuestion,
  parseAnswerNumber,
  parseVitals,
} from "../case-conversation";
import type { ClarifyingQuestion, IntakeQuestion } from "@/lib/types";

const clarifying: ClarifyingQuestion = {
  id: "q-glicemia",
  question: "Qual a glicemia capilar?",
  why: "Hipoglicemia mimetiza AVC.",
  criticality: "blocker",
  expectedAnswerType: "number",
  separates: ["Hipoglicemia", "AVC"],
};

const intake: IntakeQuestion = {
  id: "intake-1",
  question: "A dor chegou ao máximo em menos de 1 minuto?",
  answerType: "boolean",
  choices: ["Sim", "Não", "Não sei"],
  unit: null,
  vitalSigns: [],
  separates: ["Hemorragia subaracnóidea", "Enxaqueca"],
  why: "Início súbito pede TC já.",
};

describe("fromIntakeQuestion", () => {
  it("shows a yes/no question as tap options", () => {
    expect(fromIntakeQuestion(intake)).toMatchObject({
      answerType: "choice",
      choices: ["Sim", "Não", "Não sei"],
    });
  });

  it("keeps the vital signs the case did not give", () => {
    const question = fromIntakeQuestion({
      ...intake,
      answerType: "vitals",
      choices: [],
      vitalSigns: ["temperature", "glucose"],
    });

    expect(question).toMatchObject({ answerType: "vitals", vitalSigns: ["temperature", "glucose"] });
  });
});

describe("fromClarifyingQuestion", () => {
  it("adds Não sei to a yes/no question from the plan", () => {
    expect(fromClarifyingQuestion({ ...clarifying, expectedAnswerType: "boolean" })).toMatchObject({
      answerType: "choice",
      choices: ["Sim", "Não", "Não sei"],
    });
  });

  it("asks a choice question without options in the text field", () => {
    expect(
      fromClarifyingQuestion({ ...clarifying, expectedAnswerType: "choice", choices: [] }),
    ).toMatchObject({ answerType: "text", choices: [] });
  });

  it("keeps a number question and what it separates", () => {
    expect(fromClarifyingQuestion(clarifying)).toMatchObject({
      answerType: "number",
      separates: ["Hipoglicemia", "AVC"],
    });
  });
});

describe("parseVitals", () => {
  it("reads blood pressure written as 150/90 or 150x90", () => {
    expect(parseVitals({ bloodPressure: "150/90" })).toMatchObject({
      kind: "valid",
      vitals: { systolicBp: 150, diastolicBp: 90 },
    });
    expect(parseVitals({ bloodPressure: "150x90" })).toMatchObject({ kind: "valid" });
  });

  it("reads a decimal comma", () => {
    expect(parseVitals({ temperature: "37,8" })).toMatchObject({
      kind: "valid",
      vitals: { temperature: 37.8, heartRate: null },
    });
  });

  it("ignores the fields left empty", () => {
    expect(parseVitals({ heartRate: "96", spo2: " " })).toMatchObject({
      kind: "valid",
      vitals: { heartRate: 96, spo2: null },
    });
  });

  it("refuses a typo outside the plausible range", () => {
    expect(parseVitals({ heartRate: "960" })).toEqual({ kind: "invalid" });
    expect(parseVitals({ bloodPressure: "150" })).toEqual({ kind: "invalid" });
  });

  it("tells an empty form apart from an invalid one", () => {
    expect(parseVitals({})).toEqual({ kind: "empty" });
  });
});

describe("parseAnswerNumber", () => {
  it("accepts comma or dot decimals and refuses text", () => {
    expect(parseAnswerNumber("54")).toBe(54);
    expect(parseAnswerNumber("3,5")).toBe(3.5);
    expect(parseAnswerNumber("baixa")).toBeNull();
  });
});
