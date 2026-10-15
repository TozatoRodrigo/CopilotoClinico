# Design system "Prontuário" — o Notion da saúde

Linguagem visual do Copiloto Clínico a partir do redesign de outubro/2026.
Inspirada no Notion (página branca, sidebar cinza-quente, tipografia do
sistema, cor só onde há significado) e ajustada para uso clínico: todo texto
com significado passa em contraste WCAG AA e as cores clínicas têm
significado médico-legal fixo.

- Tokens: `web/src/app/globals.css` · tabela de cores: [design-tokens.md](design-tokens.md)
- Estudo de UX que motivou o redesign: [ux-ui-redesign.md](ux-ui-redesign.md)

## Princípios

1. **O conteúdo é a interface.** Chrome mínimo: sem cartões coloridos, sem
   sombras difusas, sem faixas escuras. A página é branca; a estrutura vem da
   tipografia, do espaço e de linhas de 1px.
2. **Uma cor de ação.** Azul (`primary`) só para a ação principal da tela e
   links. Todo o resto é escala de cinza quente.
3. **Cor = significado clínico.** Laranja muda a conduta, verde é conduta
   confirmada, vermelho é risco/erro. Nunca decorativos (ver tabela abaixo).
4. **Blocos, não telas.** Cada página é uma sequência de blocos do Notion:
   título, propriedades, callouts, toggles, databases. Reaproveite os
   primitivos em vez de inventar layouts.
5. **Teclado e calma.** ⌘K busca tudo, ⌘\ recolhe o sidebar, foco sempre
   visível. Movimento curto (100–200ms), nada pisca sem motivo.

## Fundamentos

### Cores

Use sempre classes do Tailwind ligadas aos tokens — nunca hex nem paleta crua
do Tailwind (`red-500`, `teal-600`…).

| Papel | Classe | Notas |
| --- | --- | --- |
| Fundo da página | `bg-background` | branco / `#191919` no escuro |
| Sidebar | `bg-sidebar` | `#F7F7F5` / `#202020` |
| Superfície sutil | `bg-surface-subtle` | rodapés, áreas secundárias |
| Hover / ativo | `bg-hover`, `bg-active` | translúcidos, funcionam sobre qualquer fundo |
| Texto | `text-foreground` | `#37352F` |
| Texto secundário | `text-muted-foreground` | `#6F6E69` (AA em branco, sidebar e cinza) |
| Placeholder / decorativo | `text-fg-tertiary` | **não** usar para texto que precisa ser lido |
| Linhas | `border-border` | `#E9E9E7`; inputs usam `border-input` |
| Ação | `bg-primary`, `text-primary`, `text-link` | azul Notion escurecido para AA |

**Paleta Notion (`tone-*`)** — nove tons, cada um com quatro usos:
`text-tone-x` (texto/ícone), `bg-tone-x-bg` (fundo de bloco/callout),
`bg-tone-x-tag` (pílula) e `text-tone-x-ink` (texto sobre `-bg`/`-tag`).
Tons: `gray brown orange yellow green blue purple pink red`. Em código, use os
mapas de `web/src/lib/tone.ts` (`toneText`, `toneBg`, `toneTag`, `toneInk`).

#### Semântica clínica (fixa)

| Significado | Tom | Classes de atalho |
| --- | --- | --- |
| **Muda a conduta** — pergunta bloqueadora, alerta que exige ação, reavaliação | `orange` | `clinical-amber`, `clinical-amber-bg`, `clinical-amber-foreground` |
| **Conduta confirmada/assinada** | `green` | `clinical-green*` |
| **Erro, destrutivo, gravidade crítica** | `red` | `clinical-error*`, `destructive` |
| **Ação primária, IA, em revisão** | `blue` | `primary`, `clinical-teal*` (nome legado) |
| Neutro, rascunho, metadado | `gray` | `secondary`, `muted` |
| Categorias sem peso clínico (vertical, tipo de doc, fonte) | `purple`, `brown`, `pink`, `yellow` | `Badge variant="purple"` etc. |

Os nomes `clinical-*`, `--ink`, `--teal`… continuam existindo porque carregam
significado clínico, mas agora derivam da paleta Notion. `clinical-teal` é o
azul de ação (o nome é histórico).

### Tipografia

Pilha de sistema do Notion (`font-sans`): SF Pro no Apple, Segoe UI no
Windows. Nenhuma fonte é baixada. `font-serif` (Georgia) existe para leitura
longa opcional; `font-mono` **só** para IDs, hashes, CRM e códigos.

| Uso | Classe |
| --- | --- |
| Título de página | `PageHeader` (ou `font-display text-3xl md:text-4xl`) |
| H2 de seção | `SectionHeader` (`text-lg font-semibold`) |
| H3 / título de bloco | `text-base font-semibold` |
| Corpo de leitura | `text-[0.9375rem]` ou `text-base` |
| UI (padrão do body) | `text-sm` (14px) |
| Metadado / legenda | `text-xs text-muted-foreground` / `text-[0.8125rem]` |

Proibido: rótulos em caixa-alta com tracking largo (`uppercase tracking-…`),
`font-mono` decorativo, títulos com serifa display.

### Espaço, raio, sombra, ícone

- Ritmo vertical entre blocos de página: `gap-8` (o `Page` já aplica); dentro
  de um bloco `gap-2`/`gap-3`.
- Raios: `rounded-sm` (4px: tags, itens de menu), `rounded-md` (5px: botões,
  inputs, itens do sidebar), `rounded-lg` (6px: cartões, tabelas),
  `rounded-xl` (8px: dialogs, popovers). Nada de `rounded-2xl`/`[14px]`.
- Sombras: só popovers/dialogs (`shadow-md`/`shadow-lg`, já nos primitivos).
  Cartões usam `border`, sem sombra (`shadow-sm` é quase plana, use com parcimônia).
- Ícones: Phosphor `regular`, 16px em texto (`size-4`), 18px no sidebar,
  `duotone` grande como ícone de página (via `PageHeader icon`). Ícones de UI
  são cinza (`text-muted-foreground`); cor só com significado.

## Layout

### Shell (`AppShell` / `AdminShell`)

- **Sidebar** (240px, `bg-sidebar`): seletor de workspace/conta no topo, Buscar
  (⌘K), Plantão, Novo caso, seções "Workspace" e "Governança", status online no
  rodapé. Recolhível (botão « no hover, ⌘\); começa recolhido nas telas de foco
  (captura, análise, edição de documento).
- **Barra superior** (44px): trilha da rota (`RouteBreadcrumbs`) à esquerda;
  fila offline, tema e (no mobile) conta à direita. **Páginas não devem
  renderizar a própria trilha nem um header fixo próprio** — a barra já mostra.
  Para elementos fixos dentro da página use `sticky top-11`.
- **Mobile**: barra inferior (Plantão, Casos, Novo caso por voz, Diretrizes,
  Buscar); o menu ☰ abre o sidebar num sheet. O `main` tem `pb-28` para não
  esconder conteúdo atrás da barra. Com `NEXT_PUBLIC_FERRAMENTAS=on`
  (ADR-017), Ferramentas ocupa o lugar de Buscar e a busca vira uma lupa na
  barra superior.
- O `main` já aplica padding lateral responsivo (`px-4 → xl:px-24`) e topo.

### Página

```tsx
<Page width="default">            {/* narrow 720 · default 960 · wide 1200 · full */}
  <PageHeader icon={House} iconTone="blue" title="Plantão" description="…" actions={<Button>…</Button>} />
  <section>…blocos…</section>
</Page>
```

- `PageHeader`: ícone grande opcional (Phosphor duotone), título 40px negrito,
  descrição cinza, ações à direita, `properties` opcional logo abaixo.
- `SectionHeader`: título de seção + contagem + ação ("Ver todos →").

## Componentes (`web/src/components/ui`)

| Componente | Quando usar |
| --- | --- |
| `Button` | `default` = ação principal (1 por tela); `outline` = secundária; `ghost` = ações de baixa ênfase/ícones; `destructive` = apagar/cancelar caso; `link` = texto clicável. Tamanhos `sm` (28px) em barras de ferramentas, `default` (32px), `lg` (40px) só em CTAs de entrada (login, novo caso). |
| `Badge` | Tag do Notion. Variantes semânticas `success`/`warning`/`destructive`/`default`(azul)/`secondary`(cinza) e de categoria `purple`/`brown`/`pink`/`yellow`/`gray`/`blue`. Texto normal, sem caixa-alta. |
| `Callout` | Bloco de destaque estático com ícone (`tone`). Para dicas, avisos de contexto, resumos da IA. |
| `Alert` | Igual ao callout, mas com `role="alert"` (anunciado). Para erros e avisos que surgem após uma ação. |
| `Disclosure` | Toggle do Notion (▸). Raciocínio da IA, metadados técnicos, detalhes longos. |
| `PropertyList`/`PropertyRow` | Metadados da página (paciente, vertical, status, datas). |
| `Table` / `DataTable` | Databases. Linhas finas, cabeçalho cinza sem caixa-alta, linha inteira clicável. No mobile vira lista com divisórias. |
| `Tabs` | `default` = abas sublinhadas (views); `segmented` = alternância curta. |
| `Card` | Só quando o conteúdo é realmente um objeto destacável (ex.: galeria). Prefira blocos soltos na página com `SectionHeader`. |
| `StatCard`/`StatStrip` | Métricas do Plantão/Admin. `highlight` (fundo azul) só para a métrica que pede ação. |
| `Input`/`Textarea`/`Select` | Campos com fundo quente (`bg-surface-input`) e borda sutil; `Label` em cinza 13px acima do campo. |
| `Dialog`/`Sheet`/`DropdownMenu` | Popovers com sombra em camadas do Notion, sem borda. Itens de menu de 28px. |
| `Kbd` | Atalhos (⌘K, ↵). |
| `EmptyState` | Estados vazios: ícone cinza, título, uma frase, uma ação. |
| `ProgressSteps` | Trilha Captura / Análise / Documento. |

## Ferramentas clínicas (`web/src/components/domain/clinical-tools`)

Componentes das calculadoras e roteiros de beira-leito (ADR-017). Toda conta e
todo texto clínico vêm do motor (`src/shared/clinical-tools`); o componente só
desenha. Vitrine em `/dev/components#ferramentas`.

| Componente | Quando usar |
| --- | --- |
| `NumericField` | Valor com unidade dentro do campo, vírgula ou ponto, faixa aceita como dica. Erro acima do máximo na hora; abaixo do mínimo ao sair do campo. |
| `WeightField` | Peso adulto (40–200 kg) ou pediátrico (0,5–50 kg). |
| `ScoreItemList` | Itens de escore como rádio nativo, pontos à direita (classificação e parâmetro de fórmula não mostram ponto). |
| `CalculatorResult` | Resultado ao vivo (`role="status"`): valor, faixa, resultados secundários e ação sugerida. Tom: baixo risco cinza, intermediário laranja, alto vermelho. Quando a faixa é o resultado (CAM-ICU), o nome dela ocupa o lugar do número. |
| `ReferenceSection` / `ContentProvenanceNote` | Por que usar, quando usar, pérolas, citação; origem, versão e revisão do conteúdo. |
| `CopyToChartButton` | Texto para o prontuário, com o texto selecionável se a área de transferência falhar. |
| `DecisionSupportNotice` | Aviso fixo "Apoio à decisão; não substitui o julgamento clínico." |
| `CalculatorView` | Tudo acima montado a partir de uma `CalculatorDefinition`, com os campos que o ANY abria preenchidos (FiO₂ 21%) e o aviso de versão aproximada (GRACE, APACHE II) acima dos campos. |

## Receitas de página

- **Database** (Casos, Auditoria, Verificações CRM, Diretrizes admin): `Page
  width="wide"` → `PageHeader` → barra de view (abas/filtros à esquerda,
  busca + botão azul "Novo" à direita, tudo `size="sm"`) → `DataTable`.
- **Página com propriedades** (detalhe do caso): `PageHeader` com
  `properties={<PropertyList>…}` → blocos (callouts, linha do tempo, documentos).
- **Documento** (editor SOAP etc.): coluna `narrow`, título editável grande,
  corpo em blocos; ações (Confirmar/Assinar) na barra de ações do topo da página.
- **Formulário** (novo caso, configurações): `Page width="narrow"`, campos
  empilhados com `Label` acima, uma ação primária no fim.
- **Autenticação**: coluna central de 360px, marca no topo, título negrito,
  campos e botão azul de largura total, texto legal em `text-xs`.

## Faça / não faça

- ✅ Estrutura com espaço e linhas de 1px · ✅ cinza para tudo que não pede ação
- ✅ `Callout tone="orange"` para o que muda a conduta · ✅ tags pastel para categorias
- ❌ hex/`rgba()` inline ou `style={{ color: 'var(--…)' }}` em páginas
- ❌ `uppercase tracking-[…]` em rótulos · ❌ `font-mono` fora de IDs/hashes
- ❌ `shadow-[…]` custom, `rounded-[14px]`, `rounded-2xl` · ❌ gradientes, glassmorphism
- ❌ laranja/verde/vermelho como decoração · ❌ trilha/header fixo próprio dentro da página

## Acessibilidade

- Texto com significado ≥ 4.5:1 (verificado por `web/scripts/check-contrast.mjs`).
- Alvos de toque ≥ 40px no mobile (botões e itens já crescem em `max-sm`).
- Estado nunca só por cor: tags têm texto, alertas têm ícone + texto.
- Foco visível (`ring` azul) em todo elemento interativo.
