// Checks WCAG AA contrast ratios for the clinical token palette (A2 — design tokens).
// Run with: node scripts/check-contrast.mjs

function srgbToLinear(c) {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex) {
  const h = hex.replace("#", "");
  const r = srgbToLinear(parseInt(h.slice(0, 2), 16));
  const g = srgbToLinear(parseInt(h.slice(2, 4), 16));
  const b = srgbToLinear(parseInt(h.slice(4, 6), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(hexA, hexB) {
  const lumA = relativeLuminance(hexA);
  const lumB = relativeLuminance(hexB);
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

// Pairs are [foreground, background, label, minimum ratio]
// 4.5 = AA normal text, 3.0 = AA large text / UI components (icons, focus rings).
const PAIRS = [
  ["#10243A", "#F4F7F8", "ink sobre paper (texto principal)", 4.5],
  ["#10243A", "#FFFFFF", "ink sobre card (texto principal)", 4.5],
  ["#46586C", "#F4F7F8", "ink-soft sobre paper (texto secundário)", 4.5],
  ["#46586C", "#FFFFFF", "ink-soft sobre card (texto secundário)", 4.5],
  ["#FFFFFF", "#0E7C7B", "branco sobre teal (botão primário)", 4.5],
  ["#0A5A59", "#E3F1F0", "teal-deep sobre teal-tint (badge/secundário)", 4.5],
  ["#7C2D12", "#FDF4E3", "amber-foreground sobre amber-bg (blocker)", 4.5],
  ["#FFFFFF", "#B45309", "branco sobre amber (alerta sólido)", 4.5],
  ["#14532D", "#E9F5EE", "green-foreground sobre green-bg (confirmado)", 4.5],
  ["#FFFFFF", "#1E7F4F", "branco sobre green (confirmado sólido)", 4.5],
  ["#FFFFFF", "#B3382E", "branco sobre error (destrutivo)", 4.5],
  ["#B3382E", "#F4F7F8", "error sobre paper (texto de erro)", 4.5],
  ["#0E7C7B", "#F4F7F8", "teal sobre paper (link/ícone)", 3.0],
  ["#E1E8EC", "#F4F7F8", "line sobre paper (borda, UI)", 1.0],
];

let hasFailure = false;

for (const [fg, bg, label, min] of PAIRS) {
  const ratio = contrastRatio(fg, bg);
  const pass = ratio >= min;
  if (!pass) hasFailure = true;
  const status = pass ? "PASS" : "FAIL";
  console.log(
    `[${status}] ${label}: ${ratio.toFixed(2)}:1 (mínimo ${min.toFixed(1)}:1)`
  );
}

if (hasFailure) {
  console.error("\nFalha: uma ou mais combinações de tokens não atingem o contraste WCAG AA.");
  process.exit(1);
}

console.log("\nTodas as combinações de tokens atendem ao contraste WCAG AA.");
