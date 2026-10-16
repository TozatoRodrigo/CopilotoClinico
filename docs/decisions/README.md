# Decisões de arquitetura (ADRs)

Cada ADR registra uma decisão de arquitetura, de dado ou de comportamento
clínico: o contexto, o que foi decidido e o que isso custa. O status vem do
cabeçalho de cada arquivo.

| ADR                                                      | Decisão                                                                      | Status                                                      |
| -------------------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------- |
| [001](ADR-001-nestjs-prisma-stack.md)                    | Stack do backend: NestJS, Prisma e PostgreSQL                                | Aceito                                                      |
| [002](ADR-002-audit-chain-hash.md)                       | Auditoria com hash encadeado, não blockchain                                 | Aceito; fórmula emendada pela 015                           |
| [003](ADR-003-mfa-deferred.md)                           | MFA diferido para o R1                                                       | Aceito; o MFA TOTP já existe no módulo `auth`               |
| [004](ADR-004-patient-ref-pseudonymization.md)           | `patientRef` como identificador opaco                                        | Aceito                                                      |
| [005](ADR-005-decision-loop-audit.md)                    | Auditoria do loop de decisão conversacional                                  | Aceito                                                      |
| [006](ADR-006-three-way-decision-prompt.md)              | Prompt de decisão em três vias: recomendar, perguntar ou declarar incerteza  | Aceito                                                      |
| [007](ADR-007-protocol-data-model.md)                    | Protocolos versionados em árvore de decisão                                  | Aceito                                                      |
| [008 (protocolos)](ADR-008-protocol-execution-engine.md) | Motor de execução de protocolo, modo guiado determinístico                   | Aceito                                                      |
| [008 (diretrizes)](ADR-008-guideline-review-pipeline.md) | Ingestão de diretrizes em lote com revisão por curador                       | Aceito                                                      |
| [009](ADR-009-institutional-multi-tenancy.md)            | Multi-tenancy institucional na base de conhecimento                          | Aceito; emenda em PR aberto (#206)                          |
| [010](ADR-010-official-unreviewed-guidelines.md)         | Base oficial do MS como fonte "oficial, não revisada"                        | Aceito; `preliminary` alterado pela 012                     |
| [011](ADR-011-pcdt-document-routing.md)                  | Roteamento por documento e afunilamento guiado pelos PCDTs                   | Proposto; não implementado                                  |
| [012](ADR-012-fontes-nao-revisadas-preliminares.md)      | Fonte não revisada por médico sempre embasa conduta preliminar               | Proposto; implementado na Fase 0-C, aguarda revisão clínica |
| [013](ADR-013-raciocinio-em-etapas.md)                   | Raciocínio em etapas e conduta em duas camadas                               | Proposto; atrás de flags                                    |
| [014](ADR-014-copiloto-guiado.md)                        | Copiloto guiado: perguntar antes do plano                                    | Aceito; atrás de `COPILOT_INTAKE`                           |
| [015](ADR-015-hash-canonico-trilha-auditoria.md)         | Hash canônico da trilha de auditoria                                         | Aceito                                                      |
| [016](ADR-016-modelo-da-decisao-por-gravidade.md)        | Modelo da decisão por gravidade do caso                                      | Aceito; sem efeito sem `AI_DECISION_*`                      |
| 017                                                      | Ferramentas de beira-leito (incorporação do ANY App)                         | Em PR aberto (#180)                                         |
| [018](ADR-018-document-content-hash-versioning.md)       | Versionamento do selo de integridade dos documentos                          | Aceito                                                      |
| [019](ADR-019-cartoes-revisados.md)                      | Cartões revisados: modelo, rascunho com citação literal e anti-circularidade | Proposto; base implementada, aguarda revisão clínica        |
| 020                                                      | Modelo local de de-identificação no pipeline                                 | Em PR aberto (#205)                                         |
| [021](ADR-021-texto-clinico-cifrado-em-repouso.md)       | Texto clínico cifrado em repouso                                             | Proposto; atrás de `CLINICAL_TEXT_ENCRYPTION`               |

## Numeração

- **Há duas ADR-008.** A do motor de protocolo e a da ingestão de diretrizes
  foram escritas em paralelo, em PRs abertos no mesmo dia (#43 e #44), e as
  duas entraram com o mesmo número. Outras ADRs, o código e os planos já as
  citam como "ADR-008", então elas não foram renumeradas: o tema
  (protocolos ou diretrizes) desfaz a ambiguidade.
- **A 017 e a 020 estão em PRs abertos** (#180 e #205). O número fica
  reservado; os arquivos aparecem aqui quando os PRs entrarem.
- **A 018 nasceu como 012.** Foi renumerada antes do merge, em 14/10/2026,
  porque a 012 saiu antes para as fontes não revisadas.
- ADR mergeada não muda de número. A próxima livre é a **022**; confira os PRs
  abertos antes de usar um número.

## Como escrever uma ADR

Veja [CONTRIBUTING.md](../../CONTRIBUTING.md#como-escrever-uma-adr).
