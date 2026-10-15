import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RecommendationItem, conditionText, planGroups, planHeadline } from "../analysis-view";
import { getMessages } from "@/lib/messages";
import type { CopilotRecommendation } from "@/lib/types";
import type { RecommendationDecisionState } from "@/hooks/use-recommendation-decisions";

// UX-09 — bug relatado ao vivo por um médico do piloto: na tela de
// resultado (a que de fato roda em produção), só "Adotar" funcionava.
// "Rejeitar" chamava o handler mas a UI não dava feedback nenhum; "Anotar"
// não tinha onClick — não fazia nada. Estes testes cobrem exatamente os
// dois botões quebrados.

const baseRec: CopilotRecommendation = {
  action: "Solicitar ECG de 12 derivações",
  rationale: "Dor torácica aguda com fatores de risco cardiovascular",
  citationChunkId: "chunk-1",
  confidence: 0.82,
  preliminary: false,
  category: "diagnostic",
  source: "Diretriz Dor Torácica",
  sourceVersion: "2024",
  sourceText: "trecho da diretriz",
  sourceUrl: "https://example.com/diretriz",
};

function renderItem(overrides: {
  decision?: RecommendationDecisionState;
  onAdopt?: () => void;
  onReject?: () => void;
  onNote?: (note: string) => void;
} = {}) {
  const onAdopt = overrides.onAdopt ?? vi.fn();
  const onReject = overrides.onReject ?? vi.fn();
  const onNote = overrides.onNote ?? vi.fn();
  render(
    <RecommendationItem
      rec={baseRec}
      index={0}
      decision={overrides.decision}
      onAdopt={onAdopt}
      onReject={onReject}
      onNote={onNote}
    />,
  );
  return { onAdopt, onReject, onNote };
}

describe("RecommendationItem — UX-09: Rejeitar e Anotar", () => {
  it("calls onReject when the Rejeitar button is clicked", async () => {
    const user = userEvent.setup();
    const { onReject } = renderItem();

    await user.click(screen.getByRole("button", { name: "Rejeitar" }));

    expect(onReject).toHaveBeenCalledTimes(1);
  });

  it('shows a "Rejeitada" badge and strikes through the action once rejected', () => {
    renderItem({ decision: { decision: "rejected", decidedAt: new Date().toISOString() } });

    expect(screen.getByText("Rejeitada")).toBeInTheDocument();
    expect(screen.getByText(baseRec.action)).toHaveClass("line-through");
  });

  it('shows an "Adotada" badge (no strikethrough) once adopted', () => {
    renderItem({ decision: { decision: "adopted", decidedAt: new Date().toISOString() } });

    expect(screen.getByText("Adotada")).toBeInTheDocument();
    expect(screen.getByText(baseRec.action)).not.toHaveClass("line-through");
  });

  it("reveals a textarea when Anotar is clicked, and calls onNote as the physician types", async () => {
    const user = userEvent.setup();
    const { onNote } = renderItem();

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Anotar/ }));

    const textarea = screen.getByRole("textbox", { name: /Anotação para/ });
    expect(textarea).toBeInTheDocument();

    await user.type(textarea, "x");
    expect(onNote).toHaveBeenCalledWith("x");
  });

  // F0-D — Adotar + nota é gravado como `modified` (adotada com ajuste).
  it('shows an "Adotada com ajuste" badge and keeps Adotar pressed for a modified recommendation', () => {
    renderItem({
      decision: { decision: "modified", note: "Dose menor", decidedAt: new Date().toISOString() },
    });

    expect(screen.getByText("Adotada com ajuste")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Adotar" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(baseRec.action)).not.toHaveClass("line-through");
  });

  it('shows "Editar nota" instead of "Anotar" once a note already exists, and displays the saved note when collapsed', () => {
    renderItem({
      decision: {
        decision: "adopted",
        note: "Confirmar com o paciente antes de prosseguir",
        decidedAt: new Date().toISOString(),
      },
    });

    expect(screen.getByRole("button", { name: /Editar nota/ })).toBeInTheDocument();
    expect(
      screen.getByText(/Confirmar com o paciente antes de prosseguir/),
    ).toBeInTheDocument();
  });

  it("does not throw and renders both action buttons when there is no decision yet (pending state)", () => {
    renderItem();

    expect(screen.getByRole("button", { name: "Adotar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rejeitar" })).toBeInTheDocument();
    expect(screen.queryByText("Adotada")).not.toBeInTheDocument();
    expect(screen.queryByText("Rejeitada")).not.toBeInTheDocument();
  });
});

describe("RecommendationItem — origem da fonte (F4 / ADR-010)", () => {
  function renderRec(rec: CopilotRecommendation) {
    render(
      <RecommendationItem
        rec={rec}
        index={0}
        decision={undefined}
        onAdopt={vi.fn()}
        onReject={vi.fn()}
        onNote={vi.fn()}
      />,
    );
  }

  it("marca PCDT como Ministério da Saúde não revisado, com a portaria e o link do PDF", () => {
    renderRec({
      ...baseRec,
      source: "PCDT — Acidentes Ofídicos",
      sourceVersion: "Portaria SECTICS/MS nº 83 - 07/10/2025",
      sourceUrl: "https://www.gov.br/conitec/pcdt_acidentes_ofidicos_final.pdf",
      origin: "official_unreviewed",
    });

    expect(screen.getByText("Ministério da Saúde · não revisado pela equipe")).toBeInTheDocument();
    expect(screen.getByText("Portaria SECTICS/MS nº 83 - 07/10/2025")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver documento oficial" })).toHaveAttribute(
      "href",
      "https://www.gov.br/conitec/pcdt_acidentes_ofidicos_final.pdf",
    );
  });

  it("marca anexo do médico como não curado", () => {
    renderRec({ ...baseRec, origin: "physician_attachment" });

    expect(screen.getByText("Anexo do médico · não curada")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Ver documento oficial" })).not.toBeInTheDocument();
  });

  it("não afirma origem para diretriz curada nem para análise antiga sem o campo", () => {
    renderRec({ ...baseRec, origin: "public" });
    renderRec(baseRec);

    expect(screen.queryByText(/não revisado|não curada/)).not.toBeInTheDocument();
  });
});

// F0-C — a UI não mostra probabilidade (decisão clínica: "médico trabalha
// muito mal com probabilidades") e diz POR QUE a conduta é preliminar.
describe("RecommendationItem — F0-C: confiança e motivo do preliminar", () => {
  function renderRec(rec: CopilotRecommendation) {
    render(
      <RecommendationItem
        rec={rec}
        index={0}
        decision={undefined}
        onAdopt={vi.fn()}
        onReject={vi.fn()}
        onNote={vi.fn()}
      />,
    );
  }

  function tagOf(text: string): HTMLElement {
    const tag = screen.getByText(text).closest<HTMLElement>('[data-slot="badge"]');
    if (!tag) throw new Error(`"${text}" não está numa tag`);
    return tag;
  }

  it("não mostra a confiança autodeclarada pelo modelo", () => {
    renderRec({ ...baseRec, confidence: 0.87 });

    expect(screen.queryByText(/confiança/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/87\s?%/)).not.toBeInTheDocument();
    expect(document.querySelector("[title*='onfiança']")).toBeNull();
  });

  it("não mostra tag de preliminar em conduta definitiva", () => {
    renderRec(baseRec);

    expect(screen.queryByText(/Preliminar/)).not.toBeInTheDocument();
  });

  it("mantém o rótulo de sempre, em laranja, para perguntas pendentes", () => {
    renderRec({ ...baseRec, preliminary: true, preliminaryReason: "pending_questions" });

    expect(tagOf("Preliminar")).toHaveAttribute("data-variant", "warning");
  });

  it("trata análise antiga, sem preliminaryReason, como perguntas pendentes", () => {
    renderRec({ ...baseRec, preliminary: true });

    expect(tagOf("Preliminar")).toHaveAttribute("data-variant", "warning");
  });

  it("diz que a fonte não foi revisada por médico, em cinza: informa, não muda a conduta", () => {
    renderRec({
      ...baseRec,
      preliminary: true,
      preliminaryReason: "unreviewed_source",
      origin: "curated_unsigned",
    });

    expect(tagOf("Preliminar · Fonte não revisada por médico")).toHaveAttribute(
      "data-variant",
      "secondary",
    );
  });

  it("diz que o subtipo está indefinido, em laranja: o dado que discrimina muda a conduta", () => {
    renderRec({ ...baseRec, preliminary: true, preliminaryReason: "subtype_ambiguity" });

    expect(
      tagOf("Preliminar · Subtipo indefinido — depende do dado que discrimina"),
    ).toHaveAttribute("data-variant", "warning");
  });

  it("marca o chunk curado sem assinatura com a mesma tag cinza da base oficial", () => {
    renderRec({
      ...baseRec,
      preliminary: true,
      preliminaryReason: "unreviewed_source",
      origin: "curated_unsigned",
    });

    expect(tagOf("Base curada · sem assinatura médica")).toHaveAttribute("data-variant", "gray");
    expect(screen.queryByRole("link", { name: "Ver documento oficial" })).not.toBeInTheDocument();
  });
});

// F1 — decisão v2 (ADR-013): conduta em duas camadas e origem da fonte.
describe("RecommendationItem — F1: decisão v2", () => {
  function renderRec(rec: CopilotRecommendation, footnote?: number | null) {
    render(
      <RecommendationItem
        rec={rec}
        index={0}
        footnote={footnote}
        decision={undefined}
        onAdopt={vi.fn()}
        onReject={vi.fn()}
        onNote={vi.fn()}
      />,
    );
  }

  function tagOf(text: string): HTMLElement {
    const tag = screen.getByText(text).closest<HTMLElement>('[data-slot="badge"]');
    if (!tag) throw new Error(`"${text}" não está numa tag`);
    return tag;
  }

  const modelKnowledge: CopilotRecommendation = {
    ...baseRec,
    citationChunkId: null,
    layer: "now",
    dependsOn: null,
    basis: "model_knowledge",
    source: "Conhecimento geral do modelo",
    sourceVersion: "",
    sourceText: "",
    sourceUrl: "",
    origin: "model_knowledge",
  };

  it("põe a condição antes da conduta, em vez da tag genérica de preliminar", () => {
    renderRec({
      ...baseRec,
      action: "Trombólise com alteplase",
      layer: "depends",
      dependsOn: "TC de crânio sem contraste sem sangramento",
      basis: "source",
      preliminary: true,
      preliminaryReason: "depends_on_data",
    });

    const condition = screen.getByText("Se TC de crânio sem contraste sem sangramento");
    const action = screen.getByRole("heading", { name: /Trombólise com alteplase/ });
    expect(condition.compareDocumentPosition(action) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByText(/Preliminar/)).not.toBeInTheDocument();
  });

  it("avisa quando a conduta depende de um dado que o modelo não nomeou", () => {
    renderRec({
      ...baseRec,
      layer: "depends",
      dependsOn: null,
      basis: "source",
      preliminary: true,
      preliminaryReason: "depends_on_data",
    });

    expect(screen.getByText("Depende de dado ainda não informado")).toBeInTheDocument();
  });

  it("deixa o aviso de conhecimento geral do modelo para o rodapé do plano, sem fonte inventada", () => {
    renderRec(modelKnowledge, null);

    expect(
      screen.queryByText("Conhecimento geral do modelo — confirme no protocolo local"),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Fonte/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Conhecimento geral do modelo")).not.toBeInTheDocument();
    expect(screen.queryByText(/Preliminar/)).not.toBeInTheDocument();
  });

  it("marca, em laranja, conhecimento geral do modelo que ainda traz dose", () => {
    renderRec({
      ...modelKnowledge,
      action: "Glicose 50% 40 mL IV",
      preliminary: true,
      preliminaryReason: "unverified_dose",
    });

    expect(
      tagOf("Preliminar · Dose sem fonte citada — confirme no protocolo local"),
    ).toHaveAttribute("data-variant", "warning");
  });

  it("marca a fonte oficial externa com o domínio e leva à página em nova aba", () => {
    renderRec({
      ...baseRec,
      citationChunkId: "web:1",
      layer: "now",
      dependsOn: null,
      basis: "source",
      source: "Guidelines for the Early Management of Acute Ischemic Stroke",
      sourceVersion: "ahajournals.org",
      sourceUrl: "https://www.ahajournals.org/doi/10.1161/STR.0000000000000211",
      origin: "web_official",
    });

    expect(tagOf("Fonte oficial externa · ahajournals.org")).toHaveAttribute(
      "data-variant",
      "gray",
    );
    const link = screen.getByRole("link", { name: "Abrir página da fonte" });
    expect(link).toHaveAttribute(
      "href",
      "https://www.ahajournals.org/doi/10.1161/STR.0000000000000211",
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });
});

describe("RecommendationItem — CC-408: cartão revisado", () => {
  const fromCard: CopilotRecommendation = {
    ...baseRec,
    action: "Ceftriaxona 2 g IV a cada 12 horas",
    citationChunkId: "card:1",
    layer: "now",
    dependsOn: null,
    basis: "source",
    source: "Cartão revisado — Meningite bacteriana",
    sourceVersion: "v2",
    sourceText: "Ceftriaxona 2 g IV a cada 12 horas, iniciada logo após a coleta do líquor.",
    sourceUrl: "/cartoes/77777777-7777-4777-8777-777777777777",
    origin: "reviewed_card",
    reviewedCard: {
      cardId: "77777777-7777-4777-8777-777777777777",
      version: 2,
      question: "Qual o antibiótico empírico na suspeita de meningite bacteriana no adulto?",
      reviewer: { name: "Ana Souza", crmNumber: "123456", crmUf: "SP" },
      reviewedAt: "2026-10-12T15:00:00.000Z",
      validUntil: "2027-10-12T15:00:00.000Z",
    },
  };

  function renderRec(rec: CopilotRecommendation) {
    render(
      <RecommendationItem
        rec={rec}
        index={0}
        decision={undefined}
        onAdopt={vi.fn()}
        onReject={vi.fn()}
        onNote={vi.fn()}
      />,
    );
  }

  it("mostra a dose do cartão, quem revisou com o CRM e o link para o cartão", () => {
    renderRec(fromCard);

    expect(
      screen.getByRole("heading", { name: /Ceftriaxona 2 g IV a cada 12 horas/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Revisado por Dr(a). Ana Souza · CRM 123456/SP · em 12/10/2026"),
    ).toBeInTheDocument();
    const tag = screen
      .getByText("Cartão revisado por médico")
      .closest<HTMLElement>('[data-slot="badge"]');
    expect(tag).toHaveAttribute("data-variant", "success");
    expect(screen.getByRole("link", { name: "Ver cartão" })).toHaveAttribute(
      "href",
      "/cartoes/77777777-7777-4777-8777-777777777777",
    );
    expect(screen.queryByText(/Preliminar/)).not.toBeInTheDocument();
  });

  it("sem nome cadastrado, mostra só o CRM", () => {
    renderRec({
      ...fromCard,
      reviewedCard: {
        ...fromCard.reviewedCard!,
        reviewer: { name: null, crmNumber: "123456", crmUf: "SP" },
      },
    });

    expect(screen.getByText("Revisado por CRM 123456/SP · em 12/10/2026")).toBeInTheDocument();
  });

  it("conduta sem cartão não mostra 'Revisado por'", () => {
    renderRec(baseRec);

    expect(screen.queryByText(/Revisado por/)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Ver cartão" })).not.toBeInTheDocument();
  });
});

describe("planGroups — F1: plano em duas camadas", () => {
  const messages = getMessages("pt-BR");
  const now: CopilotRecommendation = { ...baseRec, action: "Glicemia capilar", layer: "now" };
  const depends: CopilotRecommendation = {
    ...baseRec,
    action: "Trombólise",
    category: "therapeutic",
    layer: "depends",
    dependsOn: "TC sem sangramento",
  };

  it("separa a v2 em Fazer agora e Depende do resultado", () => {
    const groups = planGroups([depends, now], messages);

    expect(groups.map((group) => [group.label, group.items.map(({ rec }) => rec.action)])).toEqual([
      ["Fazer agora", ["Glicemia capilar"]],
      ["Depende do resultado", ["Trombólise"]],
    ]);
    expect(groups[1]?.items[0]?.index).toBe(0);
  });

  it("mantém os três tempos de sempre para análises v1 e antigas, sem camada", () => {
    const groups = planGroups(
      [
        { ...baseRec, category: "stabilization", action: "Via aérea" },
        { ...baseRec, category: "therapeutic", action: "Antibiótico" },
        { ...baseRec, category: "diagnostic", action: "ECG" },
      ],
      messages,
    );

    expect(groups.map((group) => [group.label, group.items.map(({ rec }) => rec.action)])).toEqual([
      ["Agora", ["Via aérea"]],
      ["Em seguida", ["Antibiótico"]],
      ["Se piorar", ["ECG"]],
    ]);
  });

  it("usa o espanhol quando o médico usa a UI em espanhol", () => {
    const groups = planGroups([now, depends], getMessages("es"));

    expect(groups.map((group) => group.label)).toEqual(["Hacer ahora", "Depende del resultado"]);
  });
});

describe("RecommendationItem — plano em uma tela", () => {
  it("abre a justificativa só em Por quê", async () => {
    const user = userEvent.setup();
    renderItem();

    expect(screen.queryByText(baseRec.rationale)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Por quê/ }));

    expect(screen.getByText(baseRec.rationale)).toBeInTheDocument();
  });
});

describe("conditionText — o depende de como condição", () => {
  it("mantém a sigla do começo", () => {
    expect(conditionText("TC sem sangramento")).toBe("TC sem sangramento");
  });

  it("começa em minúscula e não repete o Se", () => {
    expect(conditionText("Hemorragia na TC em uso de anticoagulante")).toBe(
      "hemorragia na TC em uso de anticoagulante",
    );
    expect(conditionText("Se angio-TC com oclusão")).toBe("angio-TC com oclusão");
  });
});

describe("planHeadline — hipótese mais provável e as que não pode perder", () => {
  const stroke = (hypothesis: string, cannotMiss = true) => ({
    hypothesis,
    cannotMiss,
    whatDistinguishes: "TC de crânio",
  });

  it("na decisão em etapas, a mais provável vem do entendimento, não do primeiro diferencial", () => {
    // Caso real do primeiro teste no celular: os diferenciais da v3 são as
    // graves que o plano cobre, e a tela anunciava "hemorragia" num AVC isquêmico.
    const headline = planHeadline({
      understanding: {
        likely: [
          { hypothesis: "AVC isquêmico de território da ACM esquerda", why: "déficit súbito" },
        ],
      } as Parameters<typeof planHeadline>[0]["understanding"],
      differentials: [
        stroke("Hemorragia intraparenquimatosa hipertensiva"),
        stroke("Hipoglicemia (mimetizador)"),
        stroke("Hematoma subdural"),
        stroke("Dissecção arterial cervical"),
      ] as Parameters<typeof planHeadline>[0]["differentials"],
    });

    expect(headline).toEqual({
      mostLikely: "AVC isquêmico de território da ACM esquerda",
      cannotMiss: [
        "Hemorragia intraparenquimatosa hipertensiva",
        "Hipoglicemia (mimetizador)",
        "Hematoma subdural",
      ],
    });
  });

  it("não repete a mais provável entre as que não pode perder", () => {
    const headline = planHeadline({
      understanding: {
        likely: [{ hypothesis: "Sepse", why: "febre e hipotensão" }],
      } as Parameters<typeof planHeadline>[0]["understanding"],
      differentials: [stroke("sepse"), stroke("Dengue grave")] as Parameters<
        typeof planHeadline
      >[0]["differentials"],
    });

    expect(headline.cannotMiss).toEqual(["Dengue grave"]);
  });

  it("sem entendimento (análise antiga), o primeiro diferencial segue como a hipótese principal", () => {
    const headline = planHeadline({
      understanding: undefined,
      differentials: [
        stroke("Síndrome coronariana aguda", false),
        stroke("Dissecção de aorta"),
        stroke("Pericardite", false),
      ] as Parameters<typeof planHeadline>[0]["differentials"],
    });

    expect(headline).toEqual({
      mostLikely: "Síndrome coronariana aguda",
      cannotMiss: ["Dissecção de aorta"],
    });
  });
});
