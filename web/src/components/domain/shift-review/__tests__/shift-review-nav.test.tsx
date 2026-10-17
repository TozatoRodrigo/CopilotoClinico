import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ShiftReviewNav } from "../shift-review-nav";

describe("ShiftReviewNav", () => {
  it("links the week review and the map, marking the current page", () => {
    render(<ShiftReviewNav current="map" />);

    const nav = screen.getByRole("navigation", { name: "Seções da revisão" });
    expect(nav).toBeInTheDocument();
    const review = screen.getByRole("link", { name: "Revisão da semana" });
    const map = screen.getByRole("link", { name: "Seu mapa" });
    expect(review).toHaveAttribute("href", "/revise-seu-plantao");
    expect(review).not.toHaveAttribute("aria-current");
    expect(map).toHaveAttribute("href", "/revise-seu-plantao/seu-mapa");
    expect(map).toHaveAttribute("aria-current", "page");
  });
});
