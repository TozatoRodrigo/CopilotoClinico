// Checks WCAG AA contrast ratios for the design-system palette (docs/design-tokens.md).
// Run with: node scripts/check-contrast.mjs
//
// Os valores abaixo espelham web/src/app/globals.css (:root e .dark). Ao mudar
// um token lá, atualize aqui — o CI (job web-quality) falha se algum par cair
// abaixo do mínimo.

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

const LIGHT = {
  bg: "#FFFFFF",
  sidebar: "#F7F7F5",
  fg: "#37352F",
  fgSecondary: "#6F6E69",
  brand: "#1D72C6",
  tones: {
    gray: { text: "#6F6E69", bg: "#F1F1EF", tag: "#E3E2E0", ink: "#32302C" },
    brown: { text: "#91614C", bg: "#F4EEEE", tag: "#EEE0DA", ink: "#442A1E" },
    orange: { text: "#A5570A", bg: "#FBECDD", tag: "#FADEC9", ink: "#49290E" },
    yellow: { text: "#906721", bg: "#FBF3DB", tag: "#FDECC8", ink: "#402C1B" },
    green: { text: "#3F7959", bg: "#EDF3EC", tag: "#DBEDDB", ink: "#1C3829" },
    blue: { text: "#2F749B", bg: "#E7F3F8", tag: "#D3E5EF", ink: "#183347" },
    purple: { text: "#875FA5", bg: "#F6F3F9", tag: "#E8DEEE", ink: "#412454" },
    pink: { text: "#B54782", bg: "#FAF1F5", tag: "#F5E0E9", ink: "#4C2337" },
    red: { text: "#BB433E", bg: "#FDEBEC", tag: "#FFE2DD", ink: "#5D1715" },
  },
};

const DARK = {
  bg: "#191919",
  sidebar: "#202020",
  card: "#202020",
  fg: "#D4D4D4",
  fgSecondary: "#9B9B9B",
  link: "#529CCA",
  tones: {
    gray: { text: "#9B9B9B", bg: "#2F2F2F", tag: "#373737", ink: "#E3E3E3" },
    brown: { text: "#BA856F", bg: "#4A3228", tag: "#603B2C", ink: "#E3E3E3" },
    orange: { text: "#C77D48", bg: "#5C3B23", tag: "#854C1D", ink: "#EDEDED" },
    yellow: { text: "#CA9849", bg: "#564328", tag: "#6E5225", ink: "#EDEDED" },
    green: { text: "#529E72", bg: "#243D30", tag: "#2B593F", ink: "#E3E3E3" },
    blue: { text: "#379AD3", bg: "#143A4E", tag: "#28456C", ink: "#E3E3E3" },
    purple: { text: "#9E6AD3", bg: "#3C2D49", tag: "#492F64", ink: "#E3E3E3" },
    pink: { text: "#D15796", bg: "#4E2C3C", tag: "#69314C", ink: "#E3E3E3" },
    red: { text: "#E65B58", bg: "#522E2A", tag: "#6E3630", ink: "#E3E3E3" },
  },
};

// Pairs are [foreground, background, label, minimum ratio]
// 4.5 = AA normal text, 3.0 = AA large text / UI components (icons, focus rings).
const PAIRS = [
  [LIGHT.fg, LIGHT.bg, "claro · texto sobre página", 4.5],
  [LIGHT.fg, LIGHT.sidebar, "claro · texto sobre sidebar", 4.5],
  [LIGHT.fgSecondary, LIGHT.bg, "claro · texto secundário sobre página", 4.5],
  [LIGHT.fgSecondary, LIGHT.sidebar, "claro · texto secundário sobre sidebar", 4.5],
  [LIGHT.fgSecondary, LIGHT.tones.gray.bg, "claro · texto secundário sobre bloco cinza", 4.5],
  ["#FFFFFF", LIGHT.brand, "claro · branco sobre botão primário", 4.5],
  [LIGHT.brand, LIGHT.bg, "claro · link sobre página", 4.5],
  [DARK.fg, DARK.bg, "escuro · texto sobre página", 4.5],
  [DARK.fg, DARK.sidebar, "escuro · texto sobre sidebar", 4.5],
  [DARK.fgSecondary, DARK.bg, "escuro · texto secundário sobre página", 4.5],
  [DARK.fgSecondary, DARK.card, "escuro · texto secundário sobre cartão", 4.5],
  ["#FFFFFF", LIGHT.brand, "escuro · branco sobre botão primário", 4.5],
  [DARK.link, DARK.bg, "escuro · link sobre página", 4.5],
];

for (const [name, t] of Object.entries(LIGHT.tones)) {
  PAIRS.push([t.text, LIGHT.bg, `claro · ${name} texto sobre página`, 4.5]);
  PAIRS.push([t.ink, t.bg, `claro · ${name} tinta sobre bloco`, 4.5]);
  PAIRS.push([t.ink, t.tag, `claro · ${name} tinta sobre tag`, 4.5]);
}
for (const [name, t] of Object.entries(DARK.tones)) {
  PAIRS.push([t.text, DARK.bg, `escuro · ${name} texto sobre página`, 4.5]);
  PAIRS.push([t.ink, t.bg, `escuro · ${name} tinta sobre bloco`, 4.5]);
  PAIRS.push([t.ink, t.tag, `escuro · ${name} tinta sobre tag`, 4.5]);
}

let hasFailure = false;

for (const [fg, bg, label, min] of PAIRS) {
  const ratio = contrastRatio(fg, bg);
  const pass = ratio >= min;
  if (!pass) hasFailure = true;
  const status = pass ? "PASS" : "FAIL";
  console.log(`[${status}] ${label}: ${ratio.toFixed(2)}:1 (mínimo ${min.toFixed(1)}:1)`);
}

if (hasFailure) {
  console.error("\nFalha: uma ou mais combinações de tokens não atingem o contraste WCAG AA.");
  process.exit(1);
}

console.log("\nTodas as combinações de tokens atendem ao contraste WCAG AA.");
