import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_DURATION_S,
  PRODUCT_EVENTS,
  sanitizeUrl,
  secondsSince,
  trackEvent,
  validateEventProps,
  type PropSpec,
} from "../analytics";

type Payload = Record<string, unknown>;

/** Um valor válido para cada tipo de propriedade. */
function validValue(spec: PropSpec): string | number | boolean {
  switch (spec.kind) {
    case "enum":
      return spec.values[0]!;
    case "count":
      return 1;
    case "flag":
      return true;
    case "id":
      return "escore-heart";
  }
}

function validProps(specs: Record<string, PropSpec>): Record<string, string | number | boolean> {
  return Object.fromEntries(Object.entries(specs).map(([key, spec]) => [key, validValue(spec)]));
}

const EVENTS = Object.entries(PRODUCT_EVENTS as Record<string, Record<string, PropSpec>>);

/** O que NUNCA pode sair num evento: texto do caso, identificador de paciente ou de caso. */
const FREE_TEXT_SAMPLES = [
  "Paciente João da Silva, 45 anos, dor torácica há 2 h",
  "febre e plaquetas 90 mil",
  "Maria",
  "CPF 529.982.247-25",
  "52998224725",
  "prontuario-1234567",
  "1a2b3c4d-5555-4555-8555-555555555555",
  "",
];

/**
 * CC-704 — a garantia que importa: nenhuma propriedade de evento aceita texto
 * livre. Cada propriedade é de uma lista, um número inteiro, sim/não ou um id
 * de ferramenta curto; texto do caso, nome e UUID de caso são recusados.
 */
describe("eventos de produto — lista fechada", () => {
  it("só declara propriedades de lista, contagem, sim/não ou id de registro", () => {
    for (const [event, specs] of EVENTS) {
      for (const [key, spec] of Object.entries(specs)) {
        expect(["enum", "count", "flag", "id"], `${event}.${key}`).toContain(spec.kind);
      }
    }
  });

  it("aceita cada evento com valores do tipo permitido", () => {
    for (const [event, specs] of EVENTS) {
      expect(validateEventProps(event, validProps(specs)), event).not.toBeNull();
    }
  });

  it("nenhuma propriedade aceita texto livre, nome, documento ou UUID de caso", () => {
    for (const [event, specs] of EVENTS) {
      for (const key of Object.keys(specs)) {
        for (const sample of FREE_TEXT_SAMPLES) {
          const props = { ...validProps(specs), [key]: sample };
          expect(validateEventProps(event, props), `${event}.${key} = "${sample}"`).toBeNull();
        }
      }
    }
  });

  it("recusa propriedade fora da lista, como o id do atendimento", () => {
    expect(
      validateEventProps("analise_iniciada", { rodada: "inicial", encounterId: "enc-1" }),
    ).toBeNull();
  });

  it("recusa evento que não está na lista", () => {
    expect(validateEventProps("caso_aberto", {})).toBeNull();
  });

  it("recusa propriedade obrigatória ausente e aceita a opcional ausente", () => {
    expect(validateEventProps("analise_concluida", { rodada: "inicial" })).toBeNull();
    expect(validateEventProps("pergunta_respondida", { fase: "depois_do_plano" })).toEqual({
      fase: "depois_do_plano",
    });
  });

  it.each([
    ["negativa", -1],
    ["fracionada", 1.5],
    ["acima do teto", MAX_DURATION_S + 1],
    ["em texto", "12"],
  ])("recusa duração %s", (_label, duracao_s) => {
    expect(validateEventProps("analise_concluida", { rodada: "inicial", duracao_s })).toBeNull();
  });
});

describe("trackEvent", () => {
  let track: ReturnType<typeof vi.fn>;
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    track = vi.fn();
    warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    delete window.umami;
    warn.mockRestore();
  });

  it("não faz nada sem o Umami carregado (dev, CI, bloqueador)", () => {
    expect(() => trackEvent("analise_iniciada", { rodada: "inicial" })).not.toThrow();
  });

  it("manda o nome, as propriedades e a rota sem o id do caso nem a query", () => {
    window.umami = { track };

    trackEvent("analise_concluida", { rodada: "reanalise", duracao_s: 42 });

    expect(track).toHaveBeenCalledTimes(1);
    const build = track.mock.calls[0]![0] as (defaults: Payload) => Payload;
    const payload = build({
      website: "site-id",
      url: "/encounters/1a2b3c4d-5555-4555-8555-555555555555/conversation?demo=dengue",
      referrer: "https://copiloto.example/encounters/1a2b3c4d-5555-4555-8555-555555555555",
    });
    expect(payload).toEqual({
      website: "site-id",
      url: "/encounters/:id/conversation",
      referrer: "https://copiloto.example/encounters/:id",
      name: "analise_concluida",
      data: { rodada: "reanalise", duracao_s: 42 },
    });
  });

  it("não aceita texto livre nem no tipo (o tsc do CI falha)", () => {
    window.umami = { track };

    // @ts-expect-error — "rodada" é de uma lista fechada
    trackEvent("analise_iniciada", { rodada: "caso do leito 3" });
    // @ts-expect-error — propriedade fora da lista
    trackEvent("nao_encontrei", { com_nota: true, nota: "dose de ceftriaxona" });

    expect(track).not.toHaveBeenCalled();
  });

  it("não manda evento recusado e avisa em desenvolvimento", () => {
    window.umami = { track };

    trackEvent("ferramenta_aberta", { ferramenta: "Paciente Maria" });

    expect(track).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("ferramenta_aberta"));
  });

  it("engole falha do script do Umami: medir uso não derruba a tela", () => {
    window.umami = {
      track: () => {
        throw new Error("umami quebrou");
      },
    };

    expect(() => trackEvent("nao_encontrei", { com_nota: false })).not.toThrow();
  });
});

describe("sanitizeUrl", () => {
  it.each([
    ["/encounters/1a2b3c4d-5555-4555-8555-555555555555/result", "/encounters/:id/result"],
    ["/admin/users/123", "/admin/users/:id"],
    ["/guidelines?q=dengue", "/guidelines"],
    ["https://copiloto.example/ferramentas/heart#x", "https://copiloto.example/ferramentas/heart"],
  ])("%s → %s", (url, expected) => {
    expect(sanitizeUrl(url)).toBe(expected);
  });

  it("mantém vazio quando não há URL", () => {
    expect(sanitizeUrl(undefined)).toBeUndefined();
    expect(sanitizeUrl("")).toBe("");
  });
});

describe("secondsSince", () => {
  it("arredonda para segundos inteiros dentro do teto", () => {
    const now = Date.now();
    expect(secondsSince(now - 2_400)).toBe(2);
    expect(secondsSince(now + 10_000)).toBe(0);
    expect(secondsSince(now - (MAX_DURATION_S + 60) * 1000)).toBe(MAX_DURATION_S);
  });
});
