# REG-001 - Enquadramento Regulatorio do Modo Decisao

**Versao:** 0.1  
**Data:** 2026-06-12  
**Status:** Draft interno para revisao com Dr. Joao + especialista regulatorio externo  
**Escopo:** modo decisao do Copiloto Clinico, com foco em apoio a decisao, protocolos institucionais e trilha auditavel

## Aviso importante

Este documento **nao e parecer juridico** e nao substitui validacao com consultoria regulatoria especializada em ANVISA/CFM.

Ha um ponto de validacao logo no titulo da historia: o backlog cita **RDC 657/2022**, mas a referencia setorial hoje associada a classificacao de risco de dispositivos medicos e software para saude e tratada aqui como **RDC 751/2022, de 15 de setembro de 2022**, que precisa ser confirmada por especialista externo antes de qualquer decisao formal.

## Resumo executivo

### Tese principal

O Copiloto Clinico deve continuar sendo posicionado, nesta fase, como:

**apoio a decisao com confirmacao humana auditavel, citacao obrigatoria e declaracao explicita de incerteza**

e **nao** como sistema autonomo de diagnostico, prescricao ou execucao terapeutica.

### Conclusao operacional

- **Go** para demos e design partners, desde que o framing comercial continue restrito a apoio a decisao, sem promessa de autonomia clinica.
- **No-go**, por ora, para escalar pilotos como produto que "dirige conduta" sem fechar revisao regulatoria externa e pacote formal de qualidade/risco.
- **No-go**, por ora, para acoplar teleconsultoria medico-medico como extensao natural do MVP sem desenho juridico-operacional separado.

## Base normativa de trabalho

### Fontes regulatorias

- **CFM Resolucao no 2.314/2022, de 20 de abril de 2022**: marco de telemedicina usado como referencia para limites de teleinterconsulta/teleconsultoria e responsabilidade profissional.
- **CFM Resolucao no 1.821/2007**: referencia para digitalizacao, guarda e manuseio de prontuario eletronico e intercambio de informacoes de saude.
- **RDC 751/2022, de 15 de setembro de 2022**: tratada neste draft como referencia operacional para classificacao de risco de dispositivos medicos e software, ate validacao externa do uso de "RDC 657/2022" no backlog.

### Normas tecnicas de preparacao regulatoria

- **ISO 14971:2019**: estrutura de gerenciamento de risco para dispositivos medicos.
- **IEC 62304**: processos de ciclo de vida de software para software de dispositivo medico.

## Mapa de funcionalidades vs. enquadramento proposto

| Funcionalidade | Estado atual | Leitura regulatoria de trabalho | Observacoes |
|---|---|---|---|
| Geracao de documentos (SOAP/SBAR/etc.) | Implementada | Tendencia a menor risco regulatorio, se apresentada como automacao documental | Manter separada da proposta de "recomendar conduta" |
| Loop de perguntas + recomendacoes com citacao | Implementado | **Maior risco de enquadramento como software medico/SaMD** | Aqui o produto deixa de ser so produtividade e passa a influenciar conduta |
| Declaracao de incerteza quando a evidencia e insuficiente | Implementada | Mitiga risco, mas nao elimina enquadramento | Ajuda a sustentar framing de apoio, nao autonomia |
| Protocolos institucionais guiados | Implementados | Menor risco que uma IA aberta, mas ainda clinico | Continua precisando revisao humana e governanca por instituicao |
| Trilha de auditoria encadeada por hash | Implementada | Mitiga risco e fortalece conformidade | Relevante para CFM, LGPD e eventual dossie ANVISA |
| Tutor senior / teleconsultoria | Nao implementado | Produto separado ou subproduto com exigencias proprias | Nao misturar com o MVP atual |

## Classificacao proposta por funcionalidade

### 1. Geracao de documentos

**Proposta:** tratar como modulo de produtividade/documentacao assistida, nao como motor de decisao.

**Racional:**

- o valor principal e reduzir tempo administrativo;
- o documento ainda passa por revisao humana;
- o repositorio ja possui gate auditavel de confirmacao humana antes de finalizacao do atendimento.

**Leitura operacional:** este modulo deve permanecer fora da promessa comercial de "sistema que orienta a conduta".

### 2. Loop de perguntas com recomendacao citada

**Proposta:** assumir que este e o componente com maior probabilidade de enquadramento como software medico.  
**Inferencia:** quanto mais o produto prioriza recomendacao clinica, organiza perguntas que mudam conduta e sugere proximos passos, maior a chance de ser entendido como software que influencia decisao diagnostica ou terapeutica.

**Implicacoes praticas:**

- o framing precisa continuar em "apoio a decisao" e nao "decide pelo medico";
- qualquer expansao para prescricao autonoma, scoring fechado ou tratamento padronizado sem confirmacao humana aumenta muito o risco regulatorio;
- a separacao entre recomendacao preliminar e confirmacao humana precisa ficar ainda mais explicita na UX e no discurso comercial.

### 3. Execucao de protocolo institucional

**Proposta:** tratar como modo clinico mais controlado do que a recomendacao aberta, mas ainda dentro do perimetro regulatorio.

**Racional:**

- ha curadoria humana do protocolo;
- a logica e deterministica;
- o risco cai quando o produto e descrito como executor auditavel de protocolo do proprio hospital, com validacao local.

**Limite:** isso **nao** significa dispensa de regulacao. Significa apenas que o argumento de seguranca e melhor do que no modo generativo aberto.

### 4. Tutor senior / teleconsultoria

**Proposta:** manter fora do MVP regulatorio principal.

**Racional:**

- abre nova camada de responsabilidade medico-medico;
- muda a natureza do produto de software assistivo para operacao de rede assistencial;
- depende de desenho de SLA, responsabilidade clinica, prontuario, remuneracao e cobertura regulatoria especifica.

## Mitigacoes que o repositorio ja possui

### 1. Confirmacao humana auditavel

O fluxo de documentos implementa o gate descrito como `CLIN-003`: um documento so e finalizado apos confirmacao humana, com `confirmedBy`, `confirmedAt` e `contentHash`.

**Leitura regulatoria:** isso fortalece a tese de "humano no loop", mas hoje esta mais forte na camada documental do que na camada de recomendacao clinica em si.

### 2. Citacao obrigatoria

O output validator impede recomendacoes sem `citationChunkId` valido e rejeita recomendacoes sem base recuperada.

**Leitura regulatoria:** esse e um diferencial forte de rastreabilidade da recomendacao.

### 3. Declaracao de incerteza

O sistema aceita e exige `uncertaintyReason` quando a evidencia e insuficiente.

**Leitura regulatoria:** isso reduz o risco de falsa completude e reforca o framing de apoio.

### 4. Auditoria inviolavel

O produto ja possui:

- `audit_log` append-only;
- hash encadeado;
- trigger que bloqueia `UPDATE`/`DELETE`;
- verificacao diaria da cadeia;
- auditoria do loop de decisao conversacional.

**Leitura regulatoria:** esta e hoje uma das fortalezas mais concretas do repositorio.

### 5. Minimizacao de dados clinicos

PII e redatada antes do envio ao provedor de IA e `patientRef` e tratado como identificador opaco.

**Leitura regulatoria:** ajuda no vetor LGPD/seguranca, mas nao resolve sozinho o enquadramento do software como tecnologia de decisao.

## Gaps para um caminho regulatorio serio

### Gap 1. Arquivo formal de gerenciamento de risco (ISO 14971)

Hoje existem mitigacoes tecnicas espalhadas em ADRs, testes e codigo, mas nao existe ainda:

- hazard analysis formal;
- matriz severidade x probabilidade;
- lista de hazardous situations por funcionalidade;
- verificacao documentada da eficacia de cada controle.

### Gap 2. Pacote de ciclo de vida de software (IEC 62304)

O repositorio ja tem testes, ADRs, CI e versionamento, mas nao existe ainda um pacote IEC 62304 explicitamente organizado com:

- classificacao de seguranca do software;
- plano de desenvolvimento/regressao por classe;
- rastreabilidade requisito -> implementacao -> teste;
- procedimento formal de problem resolution e change assessment sob lente de seguranca.

### Gap 3. Fronteira produto assistivo vs. software que dirige conduta

Esse gap e de **claim** tanto quanto de engenharia.

Se o produto for vendido como:

- "sugere proximos passos com base em diretrizes, para confirmacao do medico"  
  o enquadramento e mais defensavel;

mas se for vendido como:

- "indica o que fazer",
- "padroniza conduta",
- "reduz erro diagnostico por decisao automatizada"

o risco regulatorio sobe de forma relevante.

### Gap 4. Ausencia de dossie de validacao clinica

Ha boa cobertura de teste tecnico, mas ainda falta:

- protocolo de validacao clinica por cenario;
- metricas de falso positivo/falso negativo por red flag;
- aceitacao clinica documentada por classe de caso;
- versao controlada do conjunto de avaliacao.

### Gap 5. Processo formal para teleconsultoria / teleinterconsulta

Se `HIL-001` evoluir, faltara no produto:

- delimitacao de responsabilidade entre medico assistente e tutor;
- registro em prontuario da conversa e da opiniao;
- politica de escalonamento e contingencia;
- enquadramento comercial e regulatorio do servico.

## Proposta de classificacao de risco de trabalho

### Modo "documentacao"

**Proposta:** manter fora do centro regulatorio do modo decisao.  
**Risco:** comparativamente menor.

### Modo "apoio a decisao com recomendacao citada"

**Proposta:** assumir desde ja que este modo deve ser tratado como candidato a enquadramento regulado, com preparacao compativel com software medico.  
**Risco de subestimar:** alto.

### Modo "protocolo institucional guiado"

**Proposta:** tratar como modo clinico controlado, com potencial para argumentacao mais favoravel do que o modo generativo aberto, mas ainda dentro do radar regulatorio.

## Roadmap regulatorio proposto

### Fase 0. Agora

- manter framing comercial de apoio a decisao, nunca autonomia;
- usar o produto em design partners e demos controladas;
- nao prometer teleconsultoria como extensao trivial do MVP.

### Fase 1. Proximas 2 a 4 semanas

- validar com especialista externo se a referencia correta e mesmo `RDC 751/2022` e nao `RDC 657/2022`;
- abrir matriz de riscos por funcionalidade;
- consolidar inventario de controles ja implementados;
- criar documento de claims permitidos vs. claims proibidos.

### Fase 2. Antes de escalar pilotos

- montar pacote inicial ISO 14971;
- organizar rastreabilidade minima estilo IEC 62304;
- definir plano de validacao clinica e relatorios de evidencia;
- revisar contrato, site e materiais comerciais.

### Fase 3. Decisao go/no-go de registro

Somente apos a revisao externa:

- confirmar enquadramento por funcionalidade;
- estimar custo, prazo e impacto de registro;
- decidir se o caminho e:
  - registrar o produto como software medico,
  - restringir escopo comercial para manter menor risco,
  - ou separar produtos/modos com claims diferentes.

## Mensagem comercial recomendada

### Pode usar

- "apoio a decisao com confirmacao humana"
- "recomendacoes com citacao de diretrizes"
- "trilha auditavel de perguntas, respostas e confirmacoes"
- "declara incerteza quando a evidencia e insuficiente"

### Evitar

- "diagnostica"
- "define conduta"
- "substitui discussao com preceptor"
- "automatiza prescricao"
- "reduz erro medico" sem validacao clinica/regulatoria formal

## Decisao recomendada

### Go / No-go

- **Go** para seguir desenvolvimento como produto de apoio a decisao auditavel.
- **Go** para continuar demos e pilotos limitados com framing conservador.
- **No-go** para escalar comercialmente como software que dirige conduta antes de revisao externa.
- **No-go** para acoplar tutor senior como se fosse apenas feature de backlog.

## Checklist de fechamento da historia

- [ ] Revisao deste documento com Dr. Joao
- [ ] Revisao com especialista regulatorio externo
- [ ] Confirmacao formal da referencia ANVISA correta (`RDC 657/2022` vs `RDC 751/2022`)
- [ ] Definicao dos claims comerciais aprovados
- [ ] Criacao do plano de gap closure para ISO 14971 / IEC 62304

## Referencias usadas neste draft

- Repositorio local:
  - `docs/architecture.md`
  - `docs/compliance/LGPD.md`
  - `docs/decisions/ADR-002-audit-chain-hash.md`
  - `docs/decisions/ADR-005-decision-loop-audit.md`
  - `docs/decisions/ADR-006-three-way-decision-prompt.md`
  - `src/modules/documents/documents.service.spec.ts`
- Fontes externas consultadas para orientacao inicial e conferencia de datas/numeracoes:
  - Resolucao CFM no 2.314/2022 (telemedicina) - conferir versao oficial no CFM/DOU
  - Resolucao CFM no 1.821/2007 (prontuario eletronico) - conferir versao oficial no CFM
  - RDC 751/2022 (dispositivos medicos) - conferir versao oficial na ANVISA/DOU
  - [ISO 14971 overview](https://en.wikipedia.org/wiki/ISO_14971)
  - [IEC 62304 overview](https://en.wikipedia.org/wiki/IEC_62304)
  - [PACS / referencia setorial a RDC 751/2022](https://pt.wikipedia.org/wiki/PACS)
  - [Prontuario eletronico / referencia setorial a CFM 1.821/2007](https://pt.wikipedia.org/wiki/Prontu%C3%A1rio_Eletr%C3%B4nico)
