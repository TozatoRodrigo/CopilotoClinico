# Design tokens — paleta "Prontuário" (Notion da saúde)

Tokens definidos em `web/src/app/globals.css` (`:root` / `.dark`) e expostos
como utilitários do Tailwind em `@theme inline`. Guia de uso completo:
[design-system.md](design-system.md).

A base é a paleta do Notion. Os tons de texto foram escurecidos o mínimo
necessário para que **todo texto com significado passe em WCAG AA (≥ 4.5:1)**
— verificado em CI por `web/scripts/check-contrast.mjs` (job `web-quality`).

## Superfícies, texto e linhas

| Token | Claro | Escuro | Utilitário |
| --- | --- | --- | --- |
| `--bg` | `#FFFFFF` | `#191919` | `bg-background` |
| `--bg-sidebar` | `#F7F7F5` | `#202020` | `bg-sidebar` |
| `--bg-subtle` | `#FBFBFA` | `#1E1E1E` | `bg-surface-subtle` |
| `--bg-input` | `rgba(242,241,238,.6)` | `rgba(255,255,255,.055)` | `bg-surface-input` |
| `--bg-hover` / `--bg-active` | `rgba(55,53,47,.06/.09)` | `rgba(255,255,255,.055/.09)` | `bg-hover`, `bg-active` |
| `--fg` | `#37352F` | `#D4D4D4` | `text-foreground` |
| `--fg-secondary` | `#6F6E69` | `#9B9B9B` | `text-muted-foreground` |
| `--fg-tertiary` | `#A5A29A` | `#5F5F5F` | `text-fg-tertiary` (só placeholder/decorativo) |
| `--divider` | `#E9E9E7` | `#2F2F2F` | `border-border` |
| `--input-border` | `#DEDCD8` | `#373737` | `border-input` |
| `--brand` | `#1D72C6` | `#1D72C6` | `bg-primary` (texto branco 4.9:1) |
| `--link` | `#1D72C6` | `#529CCA` | `text-link` (no escuro, `text-primary` também usa `--link`) |

## Paleta Notion (`--tone-*`)

Cada tom tem quatro usos: `tone-x` (texto/ícone), `tone-x-bg` (fundo de
bloco/callout), `tone-x-tag` (fundo de tag) e `tone-x-ink` (texto sobre bloco
ou tag).

| Tom | texto (claro) | bloco | tag | tinta | Uso |
| --- | --- | --- | --- | --- | --- |
| gray | `#6F6E69` | `#F1F1EF` | `#E3E2E0` | `#32302C` | neutro, rascunho, metadado |
| brown | `#91614C` | `#F4EEEE` | `#EEE0DA` | `#442A1E` | categoria |
| orange | `#A5570A` | `#FBECDD` | `#FADEC9` | `#49290E` | **muda a conduta** |
| yellow | `#906721` | `#FBF3DB` | `#FDECC8` | `#402C1B` | categoria |
| green | `#3F7959` | `#EDF3EC` | `#DBEDDB` | `#1C3829` | **conduta confirmada** |
| blue | `#2F749B` | `#E7F3F8` | `#D3E5EF` | `#183347` | IA, em revisão, informação |
| purple | `#875FA5` | `#F6F3F9` | `#E8DEEE` | `#412454` | categoria |
| pink | `#B54782` | `#FAF1F5` | `#F5E0E9` | `#4C2337` | categoria |
| red | `#BB433E` | `#FDEBEC` | `#FFE2DD` | `#5D1715` | **erro, destrutivo, crítico** |

Valores do tema escuro estão em `globals.css` (`.dark`) e também passam AA.

## Semântica clínica (nomes legados)

Os tokens da paleta A2 continuam disponíveis porque carregam significado
médico-legal; agora são aliases da paleta acima:

| Token legado | Aponta para | Significado |
| --- | --- | --- |
| `--ink`, `--ink-soft`, `--paper`, `--line` | `--fg`, `--fg-secondary`, `--bg`, `--divider` | texto, texto secundário, página, linhas |
| `--teal` / `clinical-teal` | `--brand` | ação primária (nome histórico — hoje é azul) |
| `--teal-tint`, `--teal-deep` | `--tone-blue-bg`, `--tone-blue-ink` | fundo/tinta de "em revisão", IA |
| `--amber*` / `clinical-amber*` | `--tone-orange*` | **muda a conduta** — nunca decorativo |
| `--green*` / `clinical-green*` | `--tone-green*` | **conduta confirmada** — nunca decorativo |
| `--error*` / `clinical-error*` | `--tone-red*` | erro / destrutivo / gravidade crítica |

## Raios e sombras

- `--radius: 6px` → `rounded-sm` 4px · `rounded-md` 5px · `rounded-lg` 6px ·
  `rounded-xl` 8px.
- `shadow-xs` = quase plana (cartões); `shadow-sm` = cartão leve;
  `shadow-md`…`shadow-2xl` = sombra de popover do Notion (camadas finas).

## Tipografia

Pilha de sistema do Notion (`ui-sans-serif, -apple-system, "Segoe UI",
Helvetica…`), serifa `Georgia` e mono `SFMono/Menlo`. Nenhuma fonte é baixada.
Escala: `xs` 12 · `sm` 14 (UI) · `base` 16 · `lg` 18 · `xl` 20 · `2xl` 24 ·
`3xl` 30 · `4xl` 40 (título de página).
