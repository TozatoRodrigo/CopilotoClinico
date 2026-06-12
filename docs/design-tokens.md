# Design tokens — paleta clínica Strivium (A2)

Tokens definidos em `web/src/app/globals.css` (`:root` / `.dark`), como
custom properties em `oklch()` com fallback hex. Cor aqui é **semântica
clínica**: cada cor carrega um significado médico-legal fixo e não deve ser
usada por decoração.

| Token | Hex (light) | Significado clínico | Uso típico |
| --- | --- | --- | --- |
| `--ink` | `#10243A` | Texto principal, appbar | `text-foreground` |
| `--ink-soft` | `#46586C` | Texto secundário | `text-muted-foreground` |
| `--paper` | `#F4F7F8` | Fundo de app (frio, clínico — nunca branco puro) | `bg-background` |
| `--card` | `#FFFFFF` | Fundo de cartões/painéis | `bg-card` |
| `--line` | `#E1E8EC` | Bordas e divisores | `border-border` |
| `--teal` | `#0E7C7B` | **Ação primária / marca** — só aparece quando há uma ação a tomar | `bg-primary`, `text-primary` |
| `--teal-deep` | `#0A5A59` | Texto sobre fundos com tinta de marca | `text-secondary-foreground`, `text-accent-foreground` |
| `--teal-tint` | `#E3F1F0` | Fundo sutil de marca (hover, secundário) | `bg-secondary`, `bg-accent` |
| `--amber` | `#B45309` | **Exclusivo: "muda a conduta"** — pergunta blocker, alerta clínico que exige ação do médico | `border-clinical-amber`, `text-clinical-amber` |
| `--amber-bg` | `#FDF4E3` | Fundo de alerta "muda a conduta" | `bg-clinical-amber-bg` |
| `--amber-foreground` | `#7C2D12` | Texto sobre `--amber-bg` | `text-clinical-amber-foreground` |
| `--green` | `#1E7F4F` | **Exclusivo: conduta confirmada/definitiva** | `text-success`, `bg-clinical-green` |
| `--green-bg` | `#E9F5EE` | Fundo de conduta confirmada | `bg-clinical-green-bg` |
| `--green-foreground` | `#14532D` | Texto sobre `--green-bg` | `text-clinical-green-foreground` |
| `--error` | `#B3382E` | Erro / destrutivo (vermelho dessaturado, sem neon) | `text-destructive`, `bg-destructive` |

## Regras anti-template

- Proibido: gradientes roxo/azul, glassmorphism, sombras difusas grandes, dark
  mode por padrão, neon, ilustrações 3D genéricas.
- Sombra única do sistema: `0 1px 2px rgba(16,36,58,.06), 0 4px 12px rgba(16,36,58,.05)`
  (aplicada via tokens `--shadow-*` em `@theme inline` — qualquer `shadow-sm`/`shadow-md`/`shadow-lg` já usa essa definição).
- Border-radius contido: `--radius-lg` (10px) para inputs/botões, `--radius-xl`
  (14px) para cards, totalmente arredondado (`rounded-full`/`rounded-4xl`) para chips.
- Âmbar nunca decora: se um elemento está âmbar, o médico precisa agir
  (pergunta blocker, alerta de incerteza). Verde só aparece em conduta já
  confirmada. Teal só aparece quando há uma ação primária na tela.

## Contraste (WCAG AA)

Todas as combinações texto/fundo da tabela acima são verificadas por
`web/scripts/check-contrast.mjs` (rodado no CI, job `web-quality`).
