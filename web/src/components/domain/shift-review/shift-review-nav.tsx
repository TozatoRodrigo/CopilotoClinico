"use client";

import Link from "next/link";
import { useMessages } from "@/lib/messages/use-messages";
import { cn } from "@/lib/utils";
import { SHIFT_REVIEW_HREF } from "./shift-review-entry";

export const SHIFT_REVIEW_MAP_HREF = "/revise-seu-plantao/seu-mapa";

export type ShiftReviewSection = "review" | "map";

const SECTIONS: { id: ShiftReviewSection; href: string }[] = [
  { id: "review", href: SHIFT_REVIEW_HREF },
  { id: "map", href: SHIFT_REVIEW_MAP_HREF },
];

/**
 * CC-802 — abas "Revisão da semana" e "Seu mapa". São páginas (links com
 * `aria-current`), não painéis: cada aba tem a sua URL e abrir o mapa não
 * pede a geração das perguntas da semana.
 */
export function ShiftReviewNav({ current }: { current: ShiftReviewSection }) {
  const copy = useMessages().shiftReview.tabs;
  return (
    <nav aria-label={copy.label}>
      <ul className="flex gap-1 border-b border-border">
        {SECTIONS.map((section) => {
          const active = section.id === current;
          return (
            <li key={section.id}>
              <Link
                href={section.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative -mb-px inline-flex h-10 items-center rounded-sm px-2 text-sm font-medium whitespace-nowrap transition-colors outline-none hover:bg-hover focus-visible:ring-[3px] focus-visible:ring-ring/40 sm:h-9",
                  "after:absolute after:inset-x-1 after:bottom-0 after:h-0.5 after:rounded-full after:bg-foreground",
                  active
                    ? "text-foreground after:opacity-100"
                    : "text-muted-foreground after:opacity-0 hover:text-foreground",
                )}
              >
                {copy[section.id]}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
