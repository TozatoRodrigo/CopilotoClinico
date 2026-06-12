import { describe, expect, it } from "vitest";
import {
  DEMO_CASE_PRESETS,
  getDemoCasePreset,
} from "../demo-case-presets";

describe("demo-case-presets", () => {
  it("exposes the three pilot cases needed for RD-001", () => {
    expect(DEMO_CASE_PRESETS.map((preset) => preset.slug)).toEqual([
      "sindrome-gripal",
      "dor-toracica",
      "sepse",
    ]);
  });

  it("returns the expected preset payload for the influenza case", () => {
    const preset = getDemoCasePreset("sindrome-gripal");

    expect(preset).not.toBeNull();
    expect(preset?.patientRef).toContain("Demo");
    expect(preset?.vertical).toBe("general");
    expect(preset?.caseText).toContain("síndrome gripal");
    expect(preset?.caseText).toContain("há 3 dias");
    expect(preset?.context.isSus).toBe(true);
  });

  it("returns null for unknown demo cases", () => {
    expect(getDemoCasePreset("inexistente")).toBeNull();
    expect(getDemoCasePreset(null)).toBeNull();
  });
});
