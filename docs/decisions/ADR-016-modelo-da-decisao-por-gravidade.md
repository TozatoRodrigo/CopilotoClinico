# ADR-016: Modelo da decisão por gravidade do caso

**Status:** Aceito — sem efeito até `AI_DECISION_MODEL` ou `AI_DECISION_CRITICAL_MODEL` serem configurados
**Data:** 2026-10-13
**Relaciona:** ADR-013 (raciocínio em etapas), ADR-014 (Copiloto guiado)

## Contexto

Na reunião de 13/10/2026 com o Dr. Ripardo e o Dr. Luiz Cerqueira César, o
custo do modelo virou requisito de produto. Hoje toda decisão usa o Opus 5.5
com esforço alto: cerca de US$ 0,24 por análise e 81 s na primeira análise
real com as regras v3. Numa assinatura paga pelo médico, quem usa muito custa
mais do que paga.

Os testes no gabarito mostram que o modelo pesa nos casos graves. No bake-off
de 10/10, com o mesmo pipeline, o modelo barato da OpenAI teve 12 casos com
erro crítico e o Opus, 1. Trocar o modelo de tudo por um barato seria arriscar
justamente o AVC na janela e a sepse.

## Decisão

A decisão escolhe o modelo pela gravidade que a Etapa 1 já identifica:

- **Caso grave:** `instability.present` ou `timeCritical`. Usa
  `AI_DECISION_CRITICAL_MODEL`.
- **Caso comum:** usa `AI_DECISION_MODEL`.
- **Sem entendimento** (`legacy`, ou a Etapa 1 falhou): conta como grave. Na
  dúvida, o modelo forte.

Vazios, os dois caem no `AI_MODEL`, e nada muda. O crítico vazio repete o
comum. As duas variáveis aceitam `perfil:modelo` (perfis do gateway), então a
rota comum pode ir para outro provedor.

`timeCritical` passa da leitura do caso (ADR-014) para a Etapa 1, com o mesmo
texto como regra 10. O schema da leitura não muda (o campo só deixa de ser uma
extensão dela). Entendimentos gravados antes desta ADR leem `timeCritical`
como `false` (`StoredCaseUnderstandingSchema`); a saída do modelo continua
obrigada a trazê-lo.

A rota sai no log (`DECISION_MODEL route=... model=...`) e em
`ai_interactions.params.decisionRoute`. A nova tentativa de validação usa o
mesmo modelo do turno.

## Consequências

- A regra 10 muda o que a Etapa 1 produz. O gabarito mede o efeito antes de
  qualquer mudança em produção (fase 1 do plano de impacto).
- O valor da rota depende de a Etapa 1 marcar bem o que é tempo-crítico. Um
  falso "comum" num caso grave manda a decisão para o modelo mais fraco. O
  gabarito precisa mostrar a taxa de casos críticos roteados como comuns.
- Configurar as variáveis em produção exige aprovação depois da medição.
