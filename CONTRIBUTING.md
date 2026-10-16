# Como contribuir

Este guia vale para quem muda código, documentação ou conteúdo clínico do
Copiloto Clínico. O repositório é privado; o backlog fica no ClickUp, com
acesso interno, e cada história tem um código `CC-xxx`.

## Fluxo

1. Pegue a história no ClickUp e anote o `CC-xxx`.
2. Crie a branch a partir da `main` atualizada:

   ```bash
   git switch main && git pull
   git switch -c feat/local-de-plantao
   ```

   Prefixos: `feat/`, `fix/`, `docs/`, `chore/`, `ci/`, `test/` e `refactor/`.
   O nome vem em português, curto, com hífens.

3. Faça commits pequenos, no padrão abaixo.
4. Rode o checklist e abra o PR contra a `main`. O template já traz as seções.
5. O merge é só por squash, com CI verde e revisão. A branch é apagada depois
   (o repositório faz isso sozinho).

O GitHub não aplica branch protection em repositório privado no plano
gratuito. "CI verde e revisão antes do merge" é regra deste guia: ninguém faz
push direto na `main`.

## PR pequeno e independente

- Um PR por história, ou por um pacote coeso de histórias pequenas.
- Todo PR sai da `main` e é mergeável sozinho.
- Nunca empilhe um PR sobre a branch de outro. Um PR empilhado já foi mergeado
  na base errada. Se você depende de outro PR, espere ele entrar e atualize a
  sua branch.
- PR que não pode entrar antes de algo (uma chave, uma decisão, a cessão do
  ANY) diz isso no topo do corpo.

## Título, commit e corpo do PR

**Título do PR:** `<tipo>(<escopo>): <resumo> (CC-xxx)`, em português. O
squash usa o título como mensagem do commit na `main`.

```
feat(copiloto): local de plantão salvo no perfil (CC-602)
fix(auth): IP real na auditoria (CC-026)
docs(runbook): rotação da chave do texto clínico
```

Tipos: `feat`, `fix`, `docs`, `chore`, `ci`, `test` e `refactor`. O escopo é o
módulo ou a área (`copiloto`, `auth`, `lgpd`, `web`, `evals`, `docker`…).

**Commits:** Conventional Commits em português, no mesmo formato do título. O
`(CC-xxx)` é opcional no commit. No título do PR, entra sempre que houver
história.

**Corpo do PR:**

- `## What`: o que muda, em itens curtos.
- `## Why`: o problema que resolve.
- `## Testing`: os comandos que você rodou e o resultado (número de testes).
- `## Flags`: cada flag nova, o padrão e como ligar. Só quando houver.
- `## Pendências`: o que depende de alguém (migration a aplicar, chave,
  revisão médica). Só quando houver.

## Checklist antes do PR

Na raiz:

```bash
pnpm typecheck
pnpm lint
pnpm test:cov                # o CI exige a cobertura mínima de vitest.config.ts
pnpm test:e2e
pnpm exec prisma validate    # se mexeu no schema
```

Em `web/`, se mexeu no web:

```bash
pnpm exec tsc --noEmit
pnpm lint
pnpm test
node scripts/check-contrast.mjs
NEXT_PUBLIC_API_URL=http://localhost:3000/v1 pnpm build
```

- Rode o Prettier só nos arquivos que você mudou:
  `pnpm exec prettier --write <arquivos>`. No repositório inteiro, ele
  reformata fixtures e quebra testes.
- O CI roda `pnpm test:integration` num Postgres próprio e o Playwright
  (`e2e.yml`). Integração local só num banco descartável (runbook, "Rodar
  testes de integração").
- O CI também recusa `: any`, teste pulado e `console.log` em `src/`; no web,
  as fontes Geist e Inter, import direto de `lucide-react`, cor fora dos tokens
  nas telas do caso e import de valor de `@contracts` (o web importa só tipos).

## Migrations

- Toda mudança de schema vira uma migration nova, datada:
  `prisma/migrations/<AAAAMMDDHHMMSS>_<nome>/migration.sql`. Para gerar com a
  role dona do banco local:

  ```bash
  DATABASE_URL="$MIGRATION_DATABASE_URL" pnpm prisma migrate dev --create-only --name <nome>
  ```

- Nunca edite uma migration que já está na `main`: a produção já a aplicou e o
  Prisma confere o checksum. Para desfazer, crie outra migration com o inverso
  (runbook, "Rollback de Migration").
- Prefira migration aditiva. No deploy, a migration roda antes da API nova, e
  a versão anterior precisa continuar funcionando sobre o schema novo (runbook,
  "Aplicar migrations em produção").
- Mexeu em `audit_log`? Leia o aviso do runbook: a trilha é gravada por SQL em
  `AuditService`, e coluna nova entra nesse `INSERT`.
- Avise em `## Pendências` que há migration a aplicar no deploy.

## Flags

- Mudança de comportamento clínico ou de IA entra atrás de flag, com padrão
  seguro: desligada.
- Leia a flag a cada chamada com `readBooleanFlag` ou `readChoiceFlag`
  (`src/config/feature-flag.ts`). Valor ausente ou desconhecido cai no padrão,
  e trocar a flag não exige rebuild.
- Documente a flag no `.env.example` e na tabela "Variáveis de Ambiente
  Críticas" do `docs/runbook.md`: o que liga, o padrão, o que aparece no log e
  como voltar atrás.
- Flag que muda a análise clínica só é ligada em produção depois do gabarito
  clínico ([docs/evals/gabarito-clinico.md](docs/evals/gabarito-clinico.md)).

## Dado clínico

- **Nenhum dado de paciente** em log, teste, fixture, URL, analytics ou
  Sentry. Isso inclui "exemplo" copiado de caso real.
- Fixtures e casos de avaliação são sintéticos. Caso real anonimizado e áudio
  de ditado ficam fora do Git (`evals/intake/cases-local/`,
  `evals/transcription/audio-local/`, já no `.gitignore`).
- Log estruturado leva ids, contagens e nomes de campo. Nunca o texto do caso,
  do prompt ou da resposta.
- URL leva só ids opacos. O texto vai no corpo da requisição.
- Texto clínico passa pela de-identificação antes de ser gravado ou de ir a um
  modelo: `screenClinicalText`
  (`src/modules/copilot/guardrails/clinical-text-screening.ts`) aplica a
  máscara de PII (`maskPII`), a redação do `patientRef` e a barreira de
  injeção. Nota livre usa `maskFreeText`.
- Coluna nova com texto clínico entra em `CLINICAL_TEXT_FIELDS`
  (`src/config/clinical-text/clinical-text-fields.ts`), para ser cifrada em
  repouso (ADR-021). Não filtre nem ordene pelo conteúdo de um campo cifrado: a
  extensão do Prisma lança `ClinicalTextQueryError`.
- O payload da trilha de auditoria leva ids, hashes e contagens, nunca texto
  livre nem dado pessoal.
- Evento de analytics só da lista fechada de `web/src/lib/analytics.ts`, sem
  texto livre.

## Referência congelada do ANY

Com o PR #180 (ADR-017), `tests/any-reference/` passa a guardar o código de
cálculo do ANY App copiado sem alteração, com a origem e o sha256 do original
no cabeçalho de cada arquivo.

- Não edite esses arquivos. `reference-integrity.spec.ts` confere o hash.
- Nada em `src/`, `web/src`, `evals/` ou `scripts/` importa de lá. A pasta
  serve só aos testes diferenciais, que comparam cada função portada com a
  original.
- A área de ferramentas fica atrás de `NEXT_PUBLIC_FERRAMENTAS` até a cessão do
  ANY e a revisão clínica do conteúdo.

## Como escrever uma ADR

Decisão de arquitetura, de dado ou de comportamento clínico que alguém vai
querer entender depois vira ADR.

- Arquivo `docs/decisions/ADR-NNN-titulo-curto.md`, com o próximo número livre.
  Confira também os PRs abertos: número usado num PR aberto não se reaproveita.
- Cabeçalho: `**Status:**` (Proposto, Aceito, ou "alterada pela ADR-NNN"),
  `**Data:**` e `**Relaciona:**`.
- Seções: `## Contexto`, `## Decisão` e `## Consequências`. Alternativas
  descartadas entram na decisão ou numa seção própria.
- ADR mergeada não muda de número nem de conteúdo. Se a decisão mudar, escreva
  outra ADR e atualize o status da anterior.
- Acrescente a ADR ao [índice](docs/decisions/README.md).

## Quem revisa o quê

| O que muda                                                                                                  | Quem revisa                               |
| ----------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Código, infra, CI e documentação técnica                                                                    | Rodrigo (@TozatoRodrigo)                  |
| Conteúdo clínico: dose, escore, conduta, texto clínico, casos do gabarito, cartões, protocolos e diretrizes | Um médico, com o rótulo `revisão clínica` |

PR com conteúdo clínico leva os rótulos `conteúdo clínico` e
`revisão clínica` e só entra com o ok escrito do médico no próprio PR. Para
apontar um erro clínico sem abrir PR, use o formulário "Revisão clínica" em
Issues.

## Rótulos

| Rótulo                 | Quando usar                                              |
| ---------------------- | -------------------------------------------------------- |
| `tipo: bug`            | Algo não funciona como deveria                           |
| `tipo: funcionalidade` | História nova do backlog                                 |
| `tipo: melhoria`       | Melhora algo que já existe                               |
| `tipo: documentação`   | README, runbook, ADR ou documento de compliance          |
| `tipo: segurança`      | Vulnerabilidade, controle de acesso ou exposição de dado |
| `tipo: infra`          | CI, Docker, deploy e observabilidade                     |
| `tipo: refatoração`    | Muda a estrutura sem mudar o comportamento               |
| `dependências`         | Atualização de dependência (Dependabot)                  |
| `área: api`            | Backend NestJS                                           |
| `área: web`            | Frontend Next.js                                         |
| `área: banco`          | Prisma, migrations e dados                               |
| `área: ia`             | Gateway de IA, prompts e roteamento de modelo            |
| `área: avaliação`      | Gabarito clínico, prova cega e medições                  |
| `área: lgpd`           | Privacidade, consentimento, exportação e eliminação      |
| `área: cartões`        | Cartões revisados e pergunta rápida                      |
| `área: ferramentas`    | Calculadoras e ferramentas de beira-leito                |
| `conteúdo clínico`     | Muda dose, escore, conduta ou texto clínico              |
| `revisão clínica`      | Precisa do ok de um médico antes do merge                |
| `prioridade: alta`     | Entra na sprint atual                                    |
| `prioridade: urgente`  | Afeta paciente, segurança ou produção agora              |
| `bloqueado`            | Espera decisão, acesso ou outra entrega                  |
| `precisa de decisão`   | Depende de uma escolha de produto, clínica ou jurídica   |

## Segurança

Vulnerabilidade não vira issue. Siga o [SECURITY.md](SECURITY.md).
