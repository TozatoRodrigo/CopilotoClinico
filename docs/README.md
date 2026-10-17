# Documentação

Índice de tudo o que está em `docs/`. Comece pela arquitetura; para operar a
produção, vá ao runbook.

## Sistema e operação

| Documento                              | O que tem                                                                                                                             |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| [architecture.md](architecture.md)     | Containers, mapa de módulos, flags da análise, gateway de IA, fluxos da análise e do documento, trilha, crons, modelo de dados e ADRs |
| [runbook.md](runbook.md)               | Deploy na VPS, migrations em produção, cada flag com log e rollback, e-mail, login social, monitoramento e erros que pedem ação       |
| [manual-usuario.md](manual-usuario.md) | Manual para médico, compliance e admin. O [PDF](manual-usuario.pdf) é de agosto de 2026 e pode estar atrás do `.md`                   |

## Decisões

| Documento                                  | O que tem                                                |
| ------------------------------------------ | -------------------------------------------------------- |
| [decisions/README.md](decisions/README.md) | Índice das ADRs, com status, e como numerar uma ADR nova |

## Privacidade e regulação

| Documento                                                            | O que tem                                                                                               |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| [compliance/LGPD.md](compliance/LGPD.md)                             | Que dado pessoal existe, onde fica, por quanto tempo, quem o recebe e como o titular exerce os direitos |
| [compliance/DPA_PROVIDER.md](compliance/DPA_PROVIDER.md)             | Contratos de tratamento de dados com os provedores de IA e o que ainda falta verificar                  |
| [compliance/REGULATORIO_RDC657.md](compliance/REGULATORIO_RDC657.md) | Rascunho do enquadramento do modo decisão na RDC 657 (software como dispositivo médico)                 |

## Conteúdo clínico

| Documento                                      | O que tem                                                                                                                 |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| [guidelines-catalog.md](guidelines-catalog.md) | Catálogo das diretrizes da base de conhecimento: fontes, versões, cenários e pendências                                   |
| [guidelines/drafts/](guidelines/drafts/)       | Pacotes de diretriz em rascunho (KB-001, KB-003 a KB-006), que entram na base pela ingestão e pela curadoria de um médico |

## Avaliação

| Documento                                              | O que tem                                                                                    |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| [evals/gabarito-clinico.md](evals/gabarito-clinico.md) | Gabarito clínico: casos, variantes, juiz e o portão de release de toda mudança clínica       |
| [evals/leitura-do-caso.md](evals/leitura-do-caso.md)   | Leitura do caso do Copiloto guiado por modelo: latência e erros de dado (`pnpm eval:intake`) |
| [evals/transcricao.md](evals/transcricao.md)           | Transcrição do ditado: Whisper large-v3 contra o turbo (`pnpm eval:transcription`)           |

A medição da de-identificação fica junto do código, em
[`evals/deid/README.md`](../evals/deid/README.md).

## Interface

| Documento                            | O que tem                                                                                 |
| ------------------------------------ | ----------------------------------------------------------------------------------------- |
| [design-system.md](design-system.md) | Design system "Prontuário": tipografia, componentes e cores clínicas com significado fixo |
| [design-tokens.md](design-tokens.md) | Tokens de cor da paleta, com contraste AA                                                 |

## Planos de trabalho

Planos que guiaram uma entrega. Ficam como registro; o estado atual está na
arquitetura, no runbook e nas ADRs.

| Documento                                                                    | O que tem                                                                                |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| [planos/plano-base-contexto.md](planos/plano-base-contexto.md)               | Base de contexto, a partir dos reportes de campo de 03/09/2026 (dengue, cefaleia, anexo) |
| [planos/plano-fontes-oficiais-pcdt.md](planos/plano-fontes-oficiais-pcdt.md) | Base oficial do MS (PCDT, DDT, DB, PU) no Copiloto; decisão na ADR-010                   |
| [planos/ux-ui-redesign.md](planos/ux-ui-redesign.md)                         | Estudo de UX e o redesign "Notion da saúde" de outubro de 2026                           |

## Fora de `docs/`

- [README](../README.md): o que é, como rodar e os comandos principais.
- [CONTRIBUTING](../CONTRIBUTING.md): fluxo de branch e PR, migration, flag,
  dado clínico e revisão.
- [SECURITY](../SECURITY.md): como reportar uma vulnerabilidade.
- [CHANGELOG](../CHANGELOG.md): o que mudou, por PR.
