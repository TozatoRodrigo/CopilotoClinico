# Estudo de UX/UI e redesign "Notion da saúde" (out/2026)

Diagnóstico da interface anterior ("Prontuário Vivo", sidebar teal escura),
direção escolhida e o que mudou em cada tela. A especificação viva do sistema
está em [design-system.md](../design-system.md) e os tokens em
[design-tokens.md](../design-tokens.md).

## 1. Contexto de uso

- **Quem**: médico de plantão (emergência), muitas vezes no celular, com
  interrupções constantes, cansaço e luz variável (madrugada). Compliance e
  admin usam o console no desktop.
- **Tarefa central**: capturar o caso (voz ou texto) → ler a análise do
  copiloto (o que muda a conduta primeiro) → gerar e assinar o documento.
- **Restrições**: cor tem significado médico-legal (âmbar = muda a conduta,
  verde = conduta confirmada); nada pode competir com um alerta clínico;
  contraste e legibilidade sob estresse importam mais que estética.

## 2. Diagnóstico da versão anterior

Avaliação heurística (Nielsen + contexto clínico) a partir do código e de
capturas com dados de exemplo.

| # | Problema | Onde | Impacto |
| --- | --- | --- | --- |
| 1 | **Cor de ação diluída**: o teal da marca pintava sidebar inteira, botão "Novo caso", cartão de métrica, botões de linha e links. A regra "teal só onde há ação" não se sustentava. | Shell, Plantão | O olho não sabe qual é a próxima ação; alertas âmbar competem com blocos teal grandes. |
| 2 | **Três famílias tipográficas** (serifa display, sans, mono) — mono usado decorativamente em datas, contadores e rótulos, serifa nos títulos. | Todas | Ruído visual, leitura mais lenta de números e IDs, aspecto de "template". |
| 3 | **Rótulos em caixa-alta com tracking** (10–12px) para seções e métricas. | Plantão, cartões, tabelas | Menor legibilidade, sensação de painel técnico. |
| 4 | **Contraste insuficiente** em sinais críticos: o badge "N aguardando reavaliação" era texto âmbar-escuro sobre âmbar (1,9:1; mínimo AA é 4,5:1). | Fila do plantão | O alerta mais importante da tela era o menos legível. |
| 5 | **Cartões demais**: cada linha da fila era um cartão com borda, sombra e raio de 14px; seções duplicadas ("Olhe primeiro" + "Fila do plantão" com dois avisos quase iguais). | Plantão, listas | Densidade baixa, rolagem extra, hierarquia achatada. |
| 6 | **Controles flutuantes** (busca, tema, avatar) sobrepostos ao conteúdo no canto superior, sem barra própria e sem trilha de navegação (só o detalhe do caso tinha breadcrumb). | Shell | Falta de "onde estou"; ações de conta difíceis de achar. |
| 7 | **Busca ⌘K falsa**: abria um diálogo com campo somente-leitura "em breve". | Shell | Promessa não cumprida (heurística de consistência/controle). |
| 8 | **Dois produtos visuais**: workspace com sidebar teal escura e console admin com sidebar clara diferente; telas de foco com um terceiro "rail" de ícones sem rótulo. | Shell / Admin | Curva de aprendizado e manutenção duplicada. |
| 9 | **Mobile**: FAB de microfone flutuando sobre a lista + aba "Novo" duplicando a mesma ação; header escuro. | Mobile | Toques acidentais, conteúdo encoberto. |
| 10 | **Telas de foco com header próprio e `h-screen`** dentro do shell (captura). | Captura | Duas barras, rolagem interna, conflito com o padding do shell. |
| 11 | **Tabela responsiva desalinhada**: linhas clicáveis renderizavam as células como `flex` dentro de um único `td`, desalinhando cabeçalho e colunas. | Casos, Auditoria | Leitura de colunas prejudicada. |
| 12 | Ícone do app (PWA) era um quadrado teal liso, sem marca. | Instalação | Baixo reconhecimento na tela inicial do celular. |

## 3. Direção: "o Notion da saúde"

Por que Notion: é a referência de interface calma para trabalho de
conhecimento — página branca, estrutura por tipografia e espaço, uma cor de
ação, blocos reutilizáveis (callout, toggle, database, propriedades) e
teclado-first. Esses blocos mapeiam quase 1:1 para o trabalho clínico:

| Bloco Notion | Uso clínico |
| --- | --- |
| Página com propriedades | Caso (paciente, vertical, status, gravidade, datas) |
| Database (tabela/lista) | Fila do plantão, Casos, Auditoria, Verificações CRM |
| Callout colorido | Pergunta bloqueadora (laranja), conduta confirmada (verde), incerteza/IA (azul) |
| Toggle ▸ | Raciocínio da IA, diferenciais, metadados técnicos |
| Tags pastel | Status, vertical, tipo de documento, fonte da diretriz |
| Busca ⌘K | Ir para qualquer caso, página ou ação |

Ajustes "da saúde" sobre o Notion puro:

- **Contraste AA obrigatório**: os tons de texto do Notion (laranja, amarelo,
  vermelho, cinza) foram escurecidos o mínimo para passar 4,5:1; verificação em
  CI cobre 67 pares (claro e escuro).
- **Cores clínicas fixas** reaproveitam a paleta do Notion: laranja = muda a
  conduta, verde = confirmada, vermelho = erro/crítico, azul = ação/IA.
  Categorias usam roxo/marrom/rosa/amarelo, nunca as cores clínicas.
- **Voz em primeiro lugar**: "Novo caso por voz" é a única ação azul do
  Plantão e o botão central da barra inferior no celular.
- **Modo foco**: captura, análise e edição de documento abrem com o sidebar
  recolhido (⌘\ alterna), como uma página do Notion em tela cheia.

## 4. Decisões de sistema

- **Tipografia do sistema** (a mesma pilha do Notion): nenhuma fonte baixada,
  renderização nativa, números tabulares. Mono só para IDs, hashes e CRM.
- **Escala**: título de página 40px negrito, H2 18px, UI 14px, leitura 15–16px.
- **Superfícies**: página branca, sidebar `#F7F7F5`, hover translúcido,
  linhas de 1px `#E9E9E7`; sombras só em popovers.
- **Shell único** para workspace e console: sidebar clara recolhível,
  seletor de conta no topo, barra superior de 44px com trilha da rota, busca
  ⌘K real (páginas, ações e casos via `GET /encounters?search=`).
- **Primitivos novos**: `Page`, `PageHeader`/`SectionHeader`, `Callout`,
  `Disclosure`, `PropertyList`, `Kbd`, tags com 9 tons (`Badge`).
- **Tabela estilo database**: linhas finas horizontais e verticais, cabeçalho
  cinza sem caixa-alta, linha inteira clicável com o link real na 1ª célula
  (colunas alinhadas), lista com divisórias no mobile.

## 5. O que mudou em cada tela

| Tela | Antes | Depois |
| --- | --- | --- |
| **Shell** | Sidebar teal escura, controles flutuantes, rail de ícones nas telas de foco, admin com outro shell | Sidebar clara única (workspace e console), seletor de conta no topo, barra superior com trilha, ⌘K real, ⌘\ recolhe; modo foco recolhe o sidebar |
| **Plantão** | Serifa + mono, cartões por linha, dois avisos repetidos, badge ilegível | Título negrito, métricas planas, fila como lista do Notion com tags e "Reavaliar" legível, casos piloto como galeria |
| **Casos** | Tabela com colunas desalinhadas, filtros soltos | Database: views por status (abas), busca, filtros em pílula, colunas com tags, paginação discreta; lista com divisórias no celular |
| **Novo caso** | Formulário em cartões | Página estreita, preset demo em callout, contexto como tags alternáveis |
| **Detalhe do caso** | Breadcrumb próprio, ações misturadas | Página com propriedades (paciente, status, vertical editável, gravidade, etapa), próxima ação no topo, "Cancelar caso" no menu ⋯, histórico em blocos |
| **Captura** | Header fixo próprio + `h-screen` | Página de escrita: ditado em destaque, editor sem bordas, contexto como propriedades, barra de ação fixa no rodapé (⌘↵ envia) |
| **Análise** | Blocos coloridos competindo | Ordem de leitura clínica: o que muda a conduta (callouts laranja) → plano (Agora / Em seguida / Se piorar) → raciocínio em toggles → fontes como notas → gerar documento |
| **Documentos** | Lista em cartões | Lista com tipo e status como tags; "Gerar documento" num único menu |
| **Editor de documento** | Header próprio, campos em caixas | Documento do Notion: barra com "Salvo/Salvando…", propriedades (tipo, status, versão, hash), seções sem caixa; assinado vira papel com selo verde e hash completo |
| **Auditoria** | Filtros que não filtravam | Database com views por período, filtros compactos, eventos legíveis com tags por entidade, detalhe expansível |
| **Diretrizes** | Busca e catálogo misturados | Busca como protagonista (estilo "Ask"), biblioteca como database com toggles; curadoria em aba para compliance |
| **Configurações** | Abas em cartão | Layout de configurações do Notion: navegação lateral, linhas "título + descrição ↔ controle", zona de perigo separada |
| **Verificação de CRM** | Barra própria, tokens removidos | Página estreita com callout por estado (pendente, em análise, rejeitado) |
| **Landing** | Painel escuro, serifa | Página de marketing estilo notion.com com "product shot" do app em HTML |
| **Login / cadastro / onboarding** | Campos de CRM e "manter sessão" que não faziam nada | Coluna central de 360px, erros inline, onboarding com cartões de opção |
| **Console admin** | Shell próprio, tabelas densas | Mesmo shell do workspace; visão geral com métricas, filas e custo de IA; verificações CRM e curadoria como databases; analytics com gráficos limpos |
| **/dev/components** | Vitrine antiga | Vitrine completa do design system (cores, tipografia, todos os primitivos e componentes clínicos) |

### Bugs encontrados e corrigidos durante o redesign

- `/` e `/privacidade` exigiam login: visitantes nunca viam a landing e o
  link da política de privacidade no cadastro levava ao login.
- Abrir qualquer `/admin/*` diretamente redirecionava para o Plantão (o layout
  do console decidia antes de o login carregar).
- Filtros "Confirmações"/"Análises de IA" da auditoria enviavam nomes de
  entidade inexistentes (`document`, `ai_interaction`) e a view "Hoje" nunca
  incluía eventos do dia (fim do intervalo à meia-noite UTC).
- Campos de CRM e "Manter sessão" do login eram exibidos mas nunca enviados.
- Casos piloto abriam bloqueados: o identificador "Demo Gripal 48h" era lido
  como nome completo pelo detector de PII.
- Erro 401 de senha errada aparecia como "Sessão expirada".
- Filtro "Só protocolos do hospital" em Diretrizes não filtrava.
- Botões em estado de carregamento perdiam o nome acessível.

## 6. Como medir

Eventos já existentes no Umami permitem comparar antes/depois:

- Tempo do login até o 1º caso criado e até o 1º documento confirmado.
- Uso do ⌘K/Buscar (novo) e cliques na trilha da barra superior.
- Taxa de casos com pergunta bloqueadora respondida antes de gerar documento.
- Toques em "Novo caso por voz" vs "Digitar" no celular.

## 7. Próximos passos sugeridos

- Teste de usabilidade moderado com 3–5 plantonistas (tarefa: caso de dor
  torácica do início à assinatura, no celular, à noite/tema escuro).
- Edição inline de propriedades do caso (vertical, status) direto na página.
- Visualização "quadro" (kanban) da fila do plantão por status.
