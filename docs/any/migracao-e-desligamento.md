# ANY App: migrar os usuários e desligar (CC-335, CC-336)

Runbook do fim do ANY (any.app.br): convidar quem usa o ANY para o Copiloto,
levar cada endereço do ANY para a ferramenta equivalente e apagar os dados
antigos. Tudo aqui roda **no dia**, com acesso ao Supabase e ao Netlify do ANY
(CC-301). O código já está pronto e testado sem esses acessos.

**Antes de começar, precisa estar no ar:**

- cessão assinada (CC-301), cobrindo os dados de uso, e a **base legal** do
  envio definida pelo jurídico;
- beta por convite (CC-702, PR #189) e login Google/Microsoft (CC-334, PR #183),
  para a pessoa entrar com a mesma conta do ANY;
- Ferramentas ligadas em produção (`NEXT_PUBLIC_FERRAMENTAS=on`, ADR-017). Sem
  elas `/ferramentas` é 404 e todo redirecionamento cai numa página de erro.

## Linha do tempo

| Quando            | O quê                                                                      | Registro na trilha              |
| ----------------- | -------------------------------------------------------------------------- | ------------------------------- |
| D-14 a D-7        | Export do Supabase, `pnpm any:import-users`, envio do e-mail com a data D0 | `ANY_USERS_IMPORT` (automático) |
| Logo após o envio | Apagar o export e o arquivo de envio                                       | `arquivo_envio_apagado`         |
| D0                | Publicar o `_redirects` no ANY; desligar o login do Supabase               | `redirecionamento_publicado`    |
| D0 a D+30         | Janela de leitura: dados do Supabase intactos, só leitura                  | —                               |
| D+30              | Apagar os dados do Supabase e conferir                                     | `dados_supabase_apagados`       |
| D+30              | Desligar o projeto do ANY no Netlify (o redirecionamento continua)         | `projeto_netlify_desligado`     |

Os registros fora do automático são feitos com:

```bash
pnpm any:decommission-log --etapa <etapa> --admin <e-mail de um ADMIN> --nota "<o que foi feito>"
```

A nota vai para a trilha de auditoria (cadeia de hash, ADR-015): sem e-mail de
ninguém (o comando recusa `@`).

---

## Parte 1 — Convidar os usuários (CC-335)

### 1. Export do Supabase

O ANY guarda os usuários em `auth.users` (login Google ou Microsoft; o
Supabase chama a Microsoft de `azure`) e o uso em `public.pageviews`
(`tool`, `user_id`, `action`, `device`). Formato que o import lê — CSV com
cabeçalho, UTF-8:

| Coluna          | Conteúdo                                                    | Obrigatória          |
| --------------- | ----------------------------------------------------------- | -------------------- |
| `email`         | e-mail da conta                                             | sim                  |
| `provedor`      | `google`, `azure`/`microsoft` ou vazio                      | sim (pode ser vazia) |
| `cadastro`      | data de cadastro (`2026-08-23 14:22:01+00` ou ISO)          | sim                  |
| `ultimo_acesso` | último acesso; vazio = nunca voltou                         | sim (pode ser vazia) |
| `favoritos`     | ids do ANY separados por `\|` (ex.: `gcs\|fórmula-winters`) | não                  |

No **SQL Editor** do Supabase do ANY, rode e use **Export → CSV** do resultado
(não salve a consulta com resultado no projeto):

```sql
-- CC-335: usuários do ANY para o convite do Copiloto.
select
  u.email,
  coalesce(u.raw_app_meta_data->>'provider', '') as provedor,
  u.created_at as cadastro,
  greatest(u.last_sign_in_at, pv.ultimo) as ultimo_acesso
from auth.users u
left join (
  select user_id, max(created_at) as ultimo
  from public.pageviews
  where user_id is not null
  group by user_id
) pv on pv.user_id = u.id
where u.email is not null
order by u.created_at;
```

Confira o nome da coluna de data de `pageviews` (o padrão do Supabase é
`created_at`). Se a coluna `deleted_at` existir em `auth.users`, acrescente
`and u.deleted_at is null`.

**Favoritos não vêm no export.** No ANY eles moram no aparelho
(`localStorage`, chave `any-app-calc-favorites`), não no Supabase. O mapa
id-do-ANY → id-no-Copiloto e o parâmetro opaco (`?favoritos=`, só ids de
ferramenta) estão prontos em `src/shared/any-migration/any-favorites.ts`; o
import usa a coluna `favoritos` se ela vier. Falta, se o time quiser: (a) a
leitura do parâmetro no web, junto com as Ferramentas (`useToolFavorites`), e
(b) uma página-ponte no ANY, antes do D0, que leia o `localStorage` e abra
`/ferramentas?favoritos=<parâmetro>`. Sem isso, o médico refaz os favoritos (no
máximo 15 nas Ferramentas).

### 2. Rodar o import

```bash
pnpm any:import-users --file export.csv \
  --base-legal "<hipótese legal> — <documento que a sustenta>" \
  --data-mudanca 2027-02-15 --admin <e-mail de um ADMIN> \
  --site https://copiloto.servidortozato.cloud --dry-run
```

| Opção             |                                                                                                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--file`          | o CSV do passo 1                                                                                                                                                         |
| `--base-legal`    | vai para a trilha como está (10 a 500 caracteres, sem e-mail). Ex.: "Legítimo interesse (art. 7º, IX), cessão do ANY de AAAA-MM-DD (CC-301)" — **o texto é do jurídico** |
| `--data-mudanca`  | D0, o dia em que any.app.br passa a redirecionar (vai no e-mail)                                                                                                         |
| `--admin`         | e-mail de uma conta ADMIN do Copiloto: quem gerou os convites e o autor na trilha                                                                                        |
| `--site`          | origem do web, base dos links (padrão: `WEB_PUBLIC_URL`)                                                                                                                 |
| `--validade-dias` | validade dos convites, 1 a 180 (padrão 90; precisa passar do D0)                                                                                                         |
| `--saida`         | arquivo de envio (padrão: `any-envio-<data>.csv` ao lado do export)                                                                                                      |
| `--complementar`  | já houve um import antes (export só com gente nova)                                                                                                                      |
| `--dry-run`       | lê tudo, consulta o banco e não grava nada                                                                                                                               |

O que ele faz:

1. Lê e valida o export. Linha com problema aparece pelo **número e motivo**
   (`email_invalido`, `provedor_desconhecido`, `cadastro_invalido`,
   `ultimo_acesso_invalido`, `colunas_a_mais_ou_a_menos`) e **bloqueia** a
   gravação: corrija o arquivo e rode de novo — quem ficasse de fora não seria
   avisado.
2. Junta e-mails repetidos no arquivo (a mesma pessoa com Google e Microsoft).
3. Procura cada e-mail nas contas do Copiloto, sem diferenciar maiúsculas.
   **Quem já tem conta não ganha convite nem é vinculado:** recebe só o aviso
   com o link das Ferramentas.
4. Grava na trilha `ANY_USERS_IMPORT` com a base legal, o sha256 do export e as
   contagens — **antes** de criar convites. Se a trilha falhar, nada é criado.
5. Cria um convite de uso único por pessoa nova no lote **"base ANY"** (o mesmo
   mecanismo do console Beta → Convites) e registra `BETA_INVITES_CREATED`.
6. Escreve o arquivo de envio, com permissão 600, sem sobrescrever outro.

Saída: relatório em JSON só com contagens e números de linha; código 0
(gravou ou dry-run ok), 2 (bloqueado: linha inválida, export já importado,
import anterior sem `--complementar`) ou 1 (erro). O mesmo export (mesmo
sha256) nunca entra duas vezes.

**Em produção (VPS)** a imagem de runtime não tem `scripts/`: use o estágio
`builder`, como na ingestão de diretrizes, com o export numa pasta só sua:

```bash
install -d -m 700 ~/any-migracao          # na VPS; copie o export para cá (scp)
cd ~/apps/copiloto-clinico/docker
docker build -q -f Dockerfile.api --target builder -t copiloto-ingest:tmp ..
set -a; . ./.env.production; set +a
APPDB="postgresql://${POSTGRES_APP_USER}:${POSTGRES_APP_PASSWORD}@copiloto-db:5432/copiloto_clinico?schema=public"
docker run --rm --network docker_copiloto-net --user "$(id -u):$(id -g)" -e HOME=/tmp \
  -v ~/any-migracao:/dados -e DATABASE_URL="$APPDB" --entrypoint sh copiloto-ingest:tmp \
  -c 'npx --no-install tsx scripts/any-import-users.ts --file /dados/export.csv --base-legal "..." --data-mudanca AAAA-MM-DD --admin <e-mail> --site https://copiloto.servidortozato.cloud --dry-run'
docker rmi copiloto-ingest:tmp
```

`--user` faz o arquivo de envio sair com o seu usuário (com root, só o root o
leria). A role da aplicação (`copiloto_app`) já pode inserir em
`beta_invites` e `audit_log`. Tire o `--dry-run` quando o relatório estiver
certo.

### 3. Enviar

O arquivo de envio tem uma linha por pessoa:

`email, tipo, provedor, link, codigo_convite, data_mudanca, data_mudanca_texto, convite_valido_ate`

- `tipo=convite`: link `/register?convite=XXXX-XXXX`, válido até
  `convite_valido_ate`;
- `tipo=aviso`: já tem conta; link `/ferramentas`.

O e-mail transacional (CC-015, PR #188) só envia templates fechados e não tem
envio em lote: até existir um template para este convite, mande pela mala
direta do provedor de e-mail. Rascunho (**revisão jurídica e do Gustavo
antes de usar**; o aviso de tratamento do art. 9º é obrigatório):

> **Assunto:** O ANY agora faz parte do Copiloto Clínico
>
> A partir de {{data_mudanca_texto}}, as ferramentas do ANY (calculadoras,
> ACLS, infusões, pediatria e as demais) passam a abrir no Copiloto Clínico, e
> any.app.br leva você direto a cada uma. Crie seu acesso com a mesma conta
> Google ou Microsoft que você usa no ANY: {{link}} (convite {{codigo_convite}},
> válido até {{convite_valido_ate}}).
>
> Seus dados do ANY (e-mail e registro de acesso) são usados só para este
> convite e serão apagados 30 dias depois da mudança. Se não quiser o
> convite, basta ignorar este e-mail. Dúvidas sobre seus dados: <canal do
> encarregado>.

Para `tipo=aviso`, troque o segundo parágrafo por "Você já tem conta no
Copiloto: as ferramentas estão em {{link}}."

**Depois do envio:** apague o export e o arquivo de envio da máquina e da VPS
(`shred -u` no Linux), **e a lista importada no provedor de e-mail** (é uma
cópia dos e-mails). Registre:

```bash
pnpm any:decommission-log --etapa arquivo_envio_apagado --admin <e-mail> \
  --nota "export e envio apagados da VPS e da lista do provedor"
```

### 4. Medir (meta: ≥ 60% dos ativos em 30 dias)

```sql
-- Convites do ANY aceitos (o console Beta → Convites mostra o mesmo lote)
SELECT count(*) FILTER (WHERE uses_count > 0) AS aceitos, count(*) AS convites
FROM beta_invites WHERE batch_label = 'base ANY';

-- Base da meta: quantos estavam ativos (acesso nos 90 dias antes do import)
SELECT created_at, payload->>'activeUsers' AS ativos, payload->>'invites' AS convites,
       payload->>'existingAccounts' AS ja_tinham_conta
FROM audit_log WHERE action = 'ANY_USERS_IMPORT' ORDER BY created_at;
```

A taxa é aproximada (aceitos ÷ ativos): de propósito, o Copiloto não guarda
qual e-mail recebeu qual convite.

---

## Parte 2 — Desligar o ANY (CC-336)

### 1. O mapa de redirecionamento

Fonte: `src/shared/any-migration/any-redirects.ts` (versão no topo do
arquivo), com as rotas do ANY v4 (`v2/src/App.tsx`, revisão `95c8fba`). Todo
redirecionamento é **301** e a query string segue junto (o `?drug=` dos links
antigos do ANY é aceito pela tela de Infusões).

| ANY                           | Copiloto                                               |
| ----------------------------- | ------------------------------------------------------ |
| `/`, `/login`, qualquer outro | `/ferramentas`                                         |
| `/calculadoras`               | `/ferramentas/calculadoras`                            |
| `/infusion`                   | `/ferramentas/infusoes`                                |
| `/acls`                       | `/ferramentas/acls`                                    |
| `/airway`                     | `/ferramentas/via-aerea`                               |
| `/shock`                      | `/ferramentas/choque-septico`                          |
| `/tep`                        | `/ferramentas/tep`                                     |
| `/ped`                        | `/ferramentas/pediatria`                               |
| `/tox`                        | `/ferramentas/toxicologia`                             |
| `/keto`                       | `/ferramentas/cad-ehh`                                 |
| `/vm`                         | `/ferramentas/ventilacao-mecanica`                     |
| `/seda`                       | `/ferramentas/sedacao`                                 |
| `/block`                      | `/ferramentas/bloqueios`                               |
| `/palia`                      | `/ferramentas/paliativos`                              |
| `/dengue`                     | `/ferramentas/dengue`                                  |
| `/hetrinped`, `/hetrinped/*`  | `https://hetrinped.netlify.app/…` (provisório, CC-337) |

O teste (`any-redirects.spec.ts`) garante que toda rota conhecida do ANY tem
regra própria, que todo destino existe no catálogo das Ferramentas, e que os
arquivos em `deploy/any-app/` estão em dia com o mapa. Quando as Ferramentas
entrarem na base, `copiloto-tools-snapshot.spec.ts` passa a conferir o
catálogo de verdade.

Mudou o mapa ou o domínio do Copiloto:

```bash
pnpm any:redirects --site https://<domínio do Copiloto>   # regrava deploy/any-app/
```

Um 301 fica no cache do navegador: corrija o mapa **antes** de publicar.

### 2. Publicar (D0)

1. Confira que `/ferramentas` abre em produção (flag ligada).
2. Teste num deploy de rascunho, sem mexer no site no ar:

   ```bash
   netlify deploy --site <id do site do ANY> --dir deploy/any-app        # sem --prod: URL de rascunho
   for p in / /acls '/infusion?drug=noradrenalina' /keto /hetrinped/ /qualquer; do
     curl -s -o /dev/null -w "%{http_code} %{redirect_url}  $p\n" "https://<url-do-rascunho>$p"
   done
   ```

   Todas as linhas: `301` e o destino da tabela.

3. Publique: o mesmo comando com `--prod`. O deploy só tem o `_redirects` (o
   `netlify.toml` em `deploy/any-app/` é o equivalente para quem publica pelo
   git: ele substitui o `v2/netlify.toml` do ANY, e o `_redirects` substitui
   `v2/public/_redirects`; use um ou outro).
4. Pare os deploys automáticos do repositório do ANY (Site configuration →
   Build & deploy → **Stop builds**), senão um push no ANY republica o app.
5. Repita o `curl` em `https://any.app.br` e `https://anyapp.netlify.app`.
6. No Supabase do ANY: **Authentication → Providers**, desligue Google e Azure
   (ninguém entra mais) e apague a Edge Function `calculate-dose`.
7. Registre: `--etapa redirecionamento_publicado --nota "deploy <id>, site <nome>"`.

### 3. Janela de 30 dias de leitura (D0 a D+30)

O app está fora do ar, mas os dados do Supabase ficam intactos, só para
leitura: suporte a quem diz que não recebeu o convite, um export complementar
(`--complementar`) e a medição. Ninguém grava nada lá.

Se o produto quiser guardar o uso por ferramenta, exporte **agregado**, sem
`user_id` (não é dado pessoal):

```sql
select tool, date_trunc('week', created_at) as semana,
       count(*) as aberturas, count(distinct user_id) as pessoas
from public.pageviews group by 1, 2 order by 2, 1;
```

### 4. D+30: apagar os dados do Supabase

Checklist (anote cada resultado; vai na nota do registro):

- [ ] D0 + 30 dias vencido.
- [ ] Medição do passo 4 da Parte 1 anotada.
- [ ] Uso agregado exportado (opcional, acima).
- [ ] **Contagem antes** (SQL de verificação abaixo).
- [ ] **Remoção** (SQL abaixo).
- [ ] **Contagem depois**: toda tabela com dado de usuário em 0.
- [ ] Storage do Supabase vazio (Storage → buckets), se houver bucket.
- [ ] Registro na trilha com as contagens.
- [ ] Projeto do Supabase apagado (Settings → General → Delete project), com o
      Gustavo de acordo (CC-301). Só isso leva os backups automáticos e os logs
      de API/Auth do Supabase, que guardam e-mail e IP por alguns dias.

SQL de verificação — conta as linhas de toda tabela de `public`, `auth` e
`storage`, para nenhuma tabela ficar esquecida:

```sql
select table_schema || '.' || table_name as tabela,
       (xpath('/row/c/text()', query_to_xml(
          format('select count(*) as c from %I.%I', table_schema, table_name),
          false, true, '')))[1]::text::bigint as linhas
from information_schema.tables
where table_schema in ('public', 'auth', 'storage') and table_type = 'BASE TABLE'
order by 1;
```

Remoção:

```sql
begin;
delete from public.pageviews;          -- uso por pessoa (user_id)
-- + toda outra tabela de public com dado de usuário que a verificação mostrar
delete from auth.audit_log_entries;    -- trilha do Supabase Auth: e-mail e IP
delete from auth.flow_state;
delete from auth.refresh_tokens;       -- explícito: token antigo pode não ter sessão
delete from auth.sessions;
delete from auth.identities;
delete from auth.users;                -- o resto (mfa, one_time_tokens) vai em cascata
commit;
```

Tabelas de controle do Supabase (`auth.schema_migrations`, `auth.instances`,
`storage.migrations`, `storage.buckets`) podem continuar com linhas: não têm
dado de usuário. Registro:

```bash
pnpm any:decommission-log --etapa dados_supabase_apagados --admin <e-mail> \
  --nota "verificação D+30: antes 70 usuários; projeto apagado em AAAA-MM-DD" \
  --contagens "auth.users=0,auth.identities=0,auth.sessions=0,auth.refresh_tokens=0,auth.audit_log_entries=0,public.pageviews=0"
```

O comando recusa `dados_supabase_apagados` sem contagens ou com alguma acima
de zero.

### 5. D+30: desligar o projeto do Netlify

"Desligar" é o **app** sair: sem build, sem variáveis (`VITE_SUPABASE_*`), sem
os deploys antigos do app. O **redirecionamento continua**, senão quem tem o
ANY salvo cai num erro (meta: zero tráfego perdido). Dois caminhos:

- **Recomendado — o mesmo site, só redirecionando:** desvincule o repositório
  (Site configuration → Build & deploy → Link repository → Unlink), apague as
  variáveis de ambiente e os deploys antigos (pela API do Netlify:
  `DELETE /api/v1/deploys/<id>`, todos menos o do `_redirects`). Mantém
  `any.app.br` e `anyapp.netlify.app`.
- **Projeto novo:** crie um site só com `deploy/any-app`, mude o domínio
  `any.app.br` para ele e apague o site antigo. Some `anyapp.netlify.app` (o
  endereço anterior ao domínio).

Mantenha o domínio `any.app.br` registrado enquanto houver tráfego (veja o
Analytics do Netlify) — no mínimo 12 meses. Registre
`--etapa projeto_netlify_desligado`.

### 6. HETRIN Ped (CC-337, decisão pendente)

- `any.app.br/hetrinped/` vai, por ora, para `hetrinped.netlify.app` (sem login
  e offline, como a equipe do Hospital Estadual de Trindade já usa). A CC-337
  decide o destino final (standalone apontando para a fonte canônica, ou
  perfil institucional no Copiloto); o destino muda no mapa.
- **Aviso à equipe do HETRIN antes do D0** (Gustavo): a cópia em
  `any.app.br/hetrinped` deixa de ser atualizada; usar `hetrinped.netlify.app`.
- **Risco:** o HETRIN tem service worker cache-first. Em aparelho que instalou
  a cópia de `any.app.br/hetrinped/`, ele continua abrindo do cache, e com o
  `sw.js` redirecionado a atualização falha: as doses ficam congeladas na
  v1.1.7 nesse aparelho. Correção possível, a decidir na CC-337: servir em
  `/hetrinped/sw.js` um service worker que limpa o cache e se desregistra (um
  arquivo em `deploy/any-app/hetrinped/sw.js` e uma regra `200` antes do
  `/hetrinped/*`).

---

## Dados pessoais (resumo LGPD)

| Onde                        | O quê                                                          | Até quando                        |
| --------------------------- | -------------------------------------------------------------- | --------------------------------- |
| Export do Supabase (CSV)    | e-mail, provedor, cadastro, último acesso                      | apagado logo após o envio         |
| Arquivo de envio (CSV, 600) | e-mail, link e código do convite                               | apagado logo após o envio         |
| Provedor de e-mail          | a lista importada para a mala direta                           | apagada logo após o envio         |
| `beta_invites`              | código aleatório, lote "base ANY"                              | como os demais convites do beta   |
| `audit_log`                 | base legal, sha256 do export, contagens, ids de convite, autor | trilha permanente; sem e-mail     |
| Logs da API / do comando    | contagens, ids e números de linha                              | sem e-mail, sem código de convite |
| Supabase do ANY             | contas e uso                                                   | apagado em D+30, com registro     |

Pendências de humano: hipótese legal e texto do e-mail (jurídico), aviso ao
HETRIN e destino final (CC-337), acesso ao Supabase/Netlify/domínio (CC-301).
