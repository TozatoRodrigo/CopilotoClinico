"use client";

import { ArrowSquareOut, Warning } from "@phosphor-icons/react";
import { SourceOriginBadge } from "@/components/domain/source-origin-badge";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { Disclosure } from "@/components/ui/disclosure";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
  TableWrapper,
} from "@/components/ui/table";
import { useMessages } from "@/lib/messages/use-messages";
import type { Messages } from "@/lib/messages";
import { SHIFT_REVIEW_QUADRANTS } from "@/lib/shift-review-contract";
import { toneBg, toneInk, type Tone } from "@/lib/tone";
import { cn } from "@/lib/utils";
import type {
  ShiftReviewCalibrationMap,
  ShiftReviewMapTheme,
  ShiftReviewQuadrant,
  ShiftReviewQuadrantTally,
  ShiftReviewStudySuggestion,
} from "@contracts/shift-review";

/**
 * CC-802 — "Seu mapa": acerto × o quanto o médico sabia, por tema (método de
 * avaliação por grau de certeza do Dr. Luiz). Sem biblioteca de gráfico:
 * quadro 2 × 2, uma barra empilhada por tema e uma tabela equivalente para
 * leitor de tela. "Erra achando que sabe" é o quadrante perigoso: vermelho
 * (risco), com ícone e o que estudar.
 */

type MappedTheme = Extract<ShiftReviewMapTheme, { status: "mapped" }>;
type MapCopy = Messages["shiftReview"]["map"];

const QUADRANT_TONE: Record<ShiftReviewQuadrant, Tone> = {
  knew_right: "green",
  guessed_right: "yellow",
  knew_wrong: "red",
  guessed_wrong: "gray",
};

/** Preenchimento da barra e da legenda (classes literais para o Tailwind). */
const QUADRANT_FILL: Record<ShiftReviewQuadrant, string> = {
  knew_right: "bg-tone-green",
  guessed_right: "bg-tone-yellow",
  knew_wrong: "bg-tone-red",
  guessed_wrong: "bg-tone-gray",
};

function percent(part: number, total: number): number {
  return total === 0 ? 0 : Math.round((part / total) * 100);
}

function isMapped(theme: ShiftReviewMapTheme): theme is MappedTheme {
  return theme.status === "mapped";
}

/** Rótulo do tema: a síndrome; sem ela, o tema mais frequente das perguntas. */
function useThemeLabel() {
  const syndromes = useMessages().understanding.syndromes;
  return (theme: ShiftReviewMapTheme): { title: string; detail: string | null } => {
    if (theme.syndrome) {
      return {
        title: syndromes[theme.syndrome],
        detail: theme.topics.length > 0 ? theme.topics.join(" · ") : null,
      };
    }
    const [first, ...rest] = theme.topics;
    return { title: first ?? "—", detail: rest.length > 0 ? rest.join(" · ") : null };
  };
}

export function CalibrationMap({ map }: { map: ShiftReviewCalibrationMap }) {
  const copy = useMessages().shiftReview.map;
  const mapped = map.themes.filter(isMapped);
  const fewAnswers = map.themes.filter((theme) => !isMapped(theme));
  const toStudy = mapped.filter((theme) => theme.quadrants.knew_wrong > 0).length;

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="calibration-overview-title" className="flex flex-col gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 id="calibration-overview-title" className="text-lg font-semibold text-foreground">
            {copy.overviewTitle}
          </h2>
          <p className="text-[0.8125rem] text-muted-foreground">
            {copy.overviewDescription(map.answered)}
          </p>
        </div>
        <QuadrantGrid quadrants={map.quadrants} copy={copy} />
        <div className="flex flex-col gap-0.5">
          <p className="text-sm font-medium text-foreground">
            {copy.accuracy(map.correct, map.answered)} ·{" "}
            {copy.calibration(percent(map.calibrated, map.answered))}
          </p>
          <p className="text-[0.8125rem] text-muted-foreground">
            {copy.calibrationHint(map.calibrated, map.answered)}
          </p>
        </div>
      </section>

      {mapped.length > 0 && (
        <section aria-labelledby="calibration-themes-title" className="flex flex-col gap-3">
          <div className="flex flex-col gap-0.5">
            <h2 id="calibration-themes-title" className="text-lg font-semibold text-foreground">
              {copy.themesTitle}
            </h2>
            {toStudy > 0 && (
              <p className="text-[0.8125rem] text-muted-foreground">{copy.themesDescription}</p>
            )}
          </div>
          {toStudy === 0 && <Callout tone="green">{copy.noneToStudy}</Callout>}
          <ul className="flex flex-col gap-3">
            {mapped.map((theme) => (
              <ThemeCard key={theme.key} theme={theme} copy={copy} />
            ))}
          </ul>
        </section>
      )}

      {fewAnswers.length > 0 && <FewAnswers themes={fewAnswers} minAnswers={map.minThemeAnswers} />}

      <Disclosure title={copy.tableToggle}>
        <CalibrationTable map={map} />
      </Disclosure>
    </div>
  );
}

function QuadrantGrid({ quadrants, copy }: { quadrants: ShiftReviewQuadrantTally; copy: MapCopy }) {
  return (
    <ul className="grid grid-cols-2 gap-2">
      {SHIFT_REVIEW_QUADRANTS.map((quadrant) => {
        const tone = QUADRANT_TONE[quadrant];
        return (
          <li
            key={quadrant}
            data-quadrant={quadrant}
            className={cn(
              "flex flex-col gap-1 rounded-md px-3 py-2.5",
              toneBg[tone],
              tone === "gray" ? "text-foreground" : toneInk[tone],
            )}
          >
            <span className="flex items-start gap-1.5 text-[0.8125rem] font-semibold">
              {quadrant === "knew_wrong" && (
                <Warning weight="fill" className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              )}
              {copy.quadrants[quadrant]}
            </span>
            <span className="text-2xl leading-none font-semibold tabular-nums">
              {quadrants[quadrant]}
            </span>
            <span className="text-xs text-pretty opacity-90">{copy.quadrantHints[quadrant]}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** Barra empilhada só para os olhos: os números vêm na legenda e na tabela. */
function QuadrantBar({
  quadrants,
  answered,
}: {
  quadrants: ShiftReviewQuadrantTally;
  answered: number;
}) {
  return (
    <div
      aria-hidden="true"
      data-slot="quadrant-bar"
      className="flex h-2 w-full gap-px overflow-hidden rounded-full bg-tone-gray-tag"
    >
      {SHIFT_REVIEW_QUADRANTS.filter((quadrant) => quadrants[quadrant] > 0).map((quadrant) => (
        <div
          key={quadrant}
          data-quadrant={quadrant}
          className={QUADRANT_FILL[quadrant]}
          style={{ width: `${(quadrants[quadrant] / answered) * 100}%` }}
        />
      ))}
    </div>
  );
}

function ThemeCard({ theme, copy }: { theme: MappedTheme; copy: MapCopy }) {
  const label = useThemeLabel()(theme);
  const misses = theme.quadrants.knew_wrong;
  return (
    <li
      data-theme={theme.key}
      className="flex flex-col gap-3 rounded-lg border border-border bg-card px-4 py-3.5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-foreground">{label.title}</h3>
          {label.detail && <p className="text-[0.8125rem] text-muted-foreground">{label.detail}</p>}
        </div>
        <span className="shrink-0 pt-0.5 text-[0.8125rem] text-muted-foreground tabular-nums">
          {copy.answers(theme.answered)}
        </span>
      </div>

      <QuadrantBar quadrants={theme.quadrants} answered={theme.answered} />

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[0.8125rem]">
        {SHIFT_REVIEW_QUADRANTS.map((quadrant) => {
          const danger = quadrant === "knew_wrong" && theme.quadrants[quadrant] > 0;
          return (
            <div key={quadrant} className="flex items-start gap-1.5">
              <span
                aria-hidden="true"
                className={cn("mt-1 size-2.5 shrink-0 rounded-sm", QUADRANT_FILL[quadrant])}
              />
              <dt
                className={cn(
                  "min-w-0 flex-1",
                  danger ? "font-medium text-tone-red" : "text-muted-foreground",
                )}
              >
                {copy.quadrants[quadrant]}
              </dt>
              <dd className="font-semibold text-foreground tabular-nums">
                {theme.quadrants[quadrant]}
              </dd>
            </div>
          );
        })}
      </dl>

      <p className="text-[0.8125rem] text-muted-foreground">
        {copy.accuracy(theme.correct, theme.answered)} ·{" "}
        {copy.calibration(percent(theme.calibrated, theme.answered))}
      </p>

      {misses > 0 && (
        <StudySuggestions misses={misses} suggestions={theme.studySuggestions} copy={copy} />
      )}
    </li>
  );
}

function StudySuggestions({
  misses,
  suggestions,
  copy,
}: {
  misses: number;
  suggestions: ShiftReviewStudySuggestion[];
  copy: MapCopy;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-md bg-tone-red-bg px-3.5 py-3 text-tone-red-ink">
      <p className="flex items-start gap-1.5 text-sm font-semibold">
        <Warning
          weight="fill"
          className="mt-0.5 size-4 shrink-0 text-tone-red"
          aria-hidden="true"
        />
        {copy.studyTitle(misses)}
      </p>
      {suggestions.length === 0 ? (
        <p className="text-[0.8125rem]">{copy.studyEmpty}</p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {suggestions.map((suggestion, index) => (
            <li
              key={`${suggestion.kind}:${suggestion.title}:${index}`}
              className="flex flex-col gap-1"
            >
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium">
                  {suggestion.title}
                  {suggestion.kind === "cited_source" && suggestion.version
                    ? ` · ${suggestion.version}`
                    : ""}
                </p>
                {suggestion.kind === "cited_source" ? (
                  <SourceOriginBadge origin={suggestion.origin ?? undefined} />
                ) : (
                  <Badge variant="success">{copy.knowledgeCard}</Badge>
                )}
              </div>
              {suggestion.excerpt && (
                <p className="line-clamp-2 text-[0.8125rem] opacity-90">{suggestion.excerpt}</p>
              )}
              {suggestion.kind === "cited_source" && suggestion.url && (
                <a
                  href={suggestion.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-6 w-fit items-center gap-1 text-[0.8125rem] font-medium underline underline-offset-4"
                >
                  {copy.openSource}
                  <ArrowSquareOut className="size-3.5" aria-hidden="true" />
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FewAnswers({ themes, minAnswers }: { themes: ShiftReviewMapTheme[]; minAnswers: number }) {
  const copy = useMessages().shiftReview.map;
  const labelOf = useThemeLabel();
  return (
    <section aria-labelledby="calibration-few-title" className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <h2 id="calibration-few-title" className="text-base font-semibold text-foreground">
          {copy.fewAnswersTitle}
        </h2>
        <p className="text-[0.8125rem] text-muted-foreground">
          {copy.fewAnswersDescription(minAnswers)}
        </p>
      </div>
      <ul className="flex flex-col divide-y divide-border border-y border-border">
        {themes.map((theme) => (
          <li
            key={theme.key}
            data-theme={theme.key}
            className="flex items-center justify-between gap-3 py-2 text-sm"
          >
            <span className="min-w-0 text-foreground">{labelOf(theme).title}</span>
            <span className="shrink-0 text-muted-foreground tabular-nums">
              {copy.answers(theme.answered)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** O mapa inteiro em números: o equivalente do quadro e das barras para leitor de tela. */
function CalibrationTable({ map }: { map: ShiftReviewCalibrationMap }) {
  const copy = useMessages().shiftReview.map;
  const labelOf = useThemeLabel();
  return (
    <TableWrapper>
      <Table>
        <TableCaption>{copy.tableCaption}</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">{copy.tableTheme}</TableHead>
            <TableHead scope="col">{copy.tableAnswers}</TableHead>
            <TableHead scope="col">{copy.tableCorrect}</TableHead>
            {SHIFT_REVIEW_QUADRANTS.map((quadrant) => (
              <TableHead key={quadrant} scope="col">
                {copy.quadrants[quadrant]}
              </TableHead>
            ))}
            <TableHead scope="col">{copy.tableCalibration}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {map.themes.map((theme) => (
            <TableRow key={theme.key}>
              <TableHead scope="row" className="font-medium text-foreground">
                {labelOf(theme).title}
              </TableHead>
              <TableCell className="tabular-nums">{theme.answered}</TableCell>
              {isMapped(theme) ? (
                <>
                  <TableCell className="tabular-nums">{theme.correct}</TableCell>
                  {SHIFT_REVIEW_QUADRANTS.map((quadrant) => (
                    <TableCell key={quadrant} className="tabular-nums">
                      {theme.quadrants[quadrant]}
                    </TableCell>
                  ))}
                  <TableCell className="tabular-nums">
                    {percent(theme.calibrated, theme.answered)}%
                  </TableCell>
                </>
              ) : (
                <TableCell
                  colSpan={SHIFT_REVIEW_QUADRANTS.length + 2}
                  className="text-muted-foreground"
                >
                  {copy.fewAnswers}
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableHead scope="row" className="font-medium text-foreground">
              {copy.tableAll}
            </TableHead>
            <TableCell className="tabular-nums">{map.answered}</TableCell>
            <TableCell className="tabular-nums">{map.correct}</TableCell>
            {SHIFT_REVIEW_QUADRANTS.map((quadrant) => (
              <TableCell key={quadrant} className="tabular-nums">
                {map.quadrants[quadrant]}
              </TableCell>
            ))}
            <TableCell className="tabular-nums">{percent(map.calibrated, map.answered)}%</TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </TableWrapper>
  );
}
