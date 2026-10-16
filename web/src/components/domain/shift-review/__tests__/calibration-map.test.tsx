import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CalibrationMap } from "../calibration-map";
import { calibrationMap } from "./fixtures";

function section(name: string): HTMLElement {
  const heading = screen.getByRole("heading", { name });
  const element = heading.closest("section");
  if (!element) throw new Error(`section "${name}" not found`);
  return element;
}

function themeCard(title: string): HTMLElement {
  const heading = screen.getByRole("heading", { level: 3, name: title });
  const element = heading.closest("li");
  if (!element) throw new Error(`theme "${title}" not found`);
  return element;
}

describe("CalibrationMap", () => {
  it("shows the four quadrants of every answer, with the dangerous one marked", () => {
    render(<CalibrationMap map={calibrationMap()} />);

    const overview = section("Todas as respostas");
    expect(
      within(overview).getByText("Suas últimas 20 respostas, de todos os temas."),
    ).toBeInTheDocument();
    const quadrants = within(overview).getAllByRole("listitem");
    expect(quadrants.map((item) => item.dataset.quadrant)).toEqual([
      "knew_right",
      "guessed_right",
      "knew_wrong",
      "guessed_wrong",
    ]);
    const danger = quadrants[2]!;
    expect(within(danger).getByText("Erra achando que sabe")).toBeInTheDocument();
    expect(within(danger).getByText("4")).toBeInTheDocument();
    expect(within(danger).getByText('Marcou "Sei" e errou')).toBeInTheDocument();
    expect(danger.className).toContain("bg-tone-red-bg");
    expect(within(overview).getByText("Acertou 13 de 20 · Calibração 55%")).toBeInTheDocument();
  });

  it("lists the themes with confident misses first, with what to study", () => {
    render(<CalibrationMap map={calibrationMap()} />);

    expect(
      within(section("Por tema"))
        .getAllByRole("heading", { level: 3 })
        .map((heading) => heading.textContent),
    ).toEqual(["Cefaleia", "Dispneia"]);

    const headache = themeCard("Cefaleia");
    expect(
      within(headache).getByText("Cefaleia em trovoada · Hemorragia subaracnóidea"),
    ).toBeInTheDocument();
    expect(within(headache).getByText("10 respostas")).toBeInTheDocument();
    expect(within(headache).getByText("Acertou 8 de 10 · Calibração 80%")).toBeInTheDocument();
    expect(
      within(headache).getByText('Errou 2 vezes marcando "Sei". Para estudar:'),
    ).toBeInTheDocument();
    expect(
      within(headache).getByText("Diretriz de cefaleia na emergência · 2024"),
    ).toBeInTheDocument();
    expect(within(headache).getByRole("link", { name: "Abrir a fonte" })).toHaveAttribute(
      "href",
      "https://example.org/cefaleia.pdf",
    );
    expect(within(headache).getByText("Cartão revisado")).toBeInTheDocument();

    const dyspnea = themeCard("Dispneia");
    expect(within(dyspnea).queryByText(/Para estudar/)).not.toBeInTheDocument();
    expect(within(dyspnea).getByText("Acertou 5 de 8 · Calibração 38%")).toBeInTheDocument();
  });

  it("draws each theme bar for the eyes only, proportional to the quadrants", () => {
    const { container } = render(<CalibrationMap map={calibrationMap()} />);

    const bar = themeCard("Cefaleia").querySelector<HTMLElement>("[data-slot=quadrant-bar]");
    expect(bar).toHaveAttribute("aria-hidden", "true");
    const segments = [...(bar?.querySelectorAll<HTMLElement>("[data-quadrant]") ?? [])];
    expect(segments.map((segment) => [segment.dataset.quadrant, segment.style.width])).toEqual([
      ["knew_right", "80%"],
      ["knew_wrong", "20%"],
    ]);
    for (const other of container.querySelectorAll("[data-slot=quadrant-bar]")) {
      expect(other).toHaveAttribute("aria-hidden", "true");
    }
  });

  it("shows only the count for themes with few answers", () => {
    render(<CalibrationMap map={calibrationMap()} />);

    const few = section("Poucos dados");
    expect(
      within(few).getByText("Com menos de 3 respostas no tema, ainda não dá para tirar conclusão."),
    ).toBeInTheDocument();
    expect(within(few).getByText("Hipercalemia")).toBeInTheDocument();
    expect(within(few).getByText("2 respostas")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { level: 3, name: "Hipercalemia" }),
    ).not.toBeInTheDocument();
  });

  it("offers the same numbers as a table for screen readers", async () => {
    render(<CalibrationMap map={calibrationMap()} />);

    await userEvent.click(screen.getByRole("button", { name: "Ver o mapa em tabela" }));

    const table = screen.getByRole("table", {
      name: "Respostas por tema: acerto × o quanto você sabia",
    });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toEqual([
      "Tema",
      "Respostas",
      "Acertos",
      "Sabe e sabe que sabe",
      "Acerta chutando",
      "Erra achando que sabe",
      "Erra e sabe que não sabe",
      "Calibração",
    ]);
    const rows = within(table).getAllByRole("row").slice(1);
    expect(
      rows.map((row) =>
        within(row)
          .getAllByRole("cell")
          .map((cell) => cell.textContent),
      ),
    ).toEqual([
      ["10", "8", "8", "0", "2", "0", "80%"],
      ["8", "5", "0", "5", "0", "3", "38%"],
      ["2", "Poucos dados"],
      ["20", "13", "8", "5", "4", "3", "55%"],
    ]);
    expect(rows.map((row) => within(row).getByRole("rowheader").textContent)).toEqual([
      "Cefaleia",
      "Dispneia",
      "Hipercalemia",
      "Todos os temas",
    ]);
  });

  it("says so when no theme with enough answers has a confident miss", () => {
    const base = calibrationMap();
    render(
      <CalibrationMap
        map={{
          ...base,
          themes: base.themes.filter((theme) => theme.key !== "syndrome:cefaleia"),
        }}
      />,
    );

    expect(
      screen.getByText('Nenhum erro marcando "Sei" nos temas com respostas suficientes.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Para estudar/)).not.toBeInTheDocument();
  });

  it("skips the theme section when every theme has few answers", () => {
    const base = calibrationMap();
    render(
      <CalibrationMap
        map={{ ...base, themes: base.themes.filter((theme) => theme.status === "few_answers") }}
      />,
    );

    expect(screen.queryByRole("heading", { name: "Por tema" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Poucos dados" })).toBeInTheDocument();
  });
});
