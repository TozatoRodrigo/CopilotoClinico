# ADR-018: Versionamento do selo de integridade dos documentos (contentHash)

**Status:** Aceito
**Data:** 2026-10-10 (proposta como ADR-012; renumerada em 2026-10-14, porque a ADR-012 saiu antes para as fontes não revisadas)
**Relacionado:** CLIN-003 (gate de confirmação), ADR-002 (hash encadeado da auditoria), ADR-015 (JSON canônico da trilha; `canonicalJson` equivalente em `src/modules/audit/audit-hash.ts`)

## Contexto

O `contentHash` é o selo médico-legal do documento confirmado: SHA-256 do
conteúdo efetivo (`physicianEdits ?? content`) no momento da confirmação. Desde
o CLIN-003 (#5, 2026-06-05), ele era calculado assim:

```ts
JSON.stringify(obj, Object.keys(obj).sort());
```

Um array como segundo argumento do `JSON.stringify` não ordena só a raiz: ele
**filtra as chaves em todos os níveis**. Chave aninhada que não existe na raiz
some do texto hasheado:

```
{ medicamentos: [{ medicamento: 'AAS', dosagem: '100 mg' }] }  →  {"medicamentos":[{}]}
```

Alcance real, pelo formato dos geradores e da tela de edição:

- **SOAP, SBAR, alta e atestado** têm só strings, booleanos, `null` e arrays de
  strings na raiz. Para esse formato o texto v1 é idêntico ao canônico: o
  selo sempre cobriu o documento inteiro.
- **Prescrição** tem `medicamentos: MedicamentoItem[]`. Confirmada sem edição,
  o selo cobria só a **quantidade** de medicamentos — não nome, dose, via,
  frequência nem duração.
- **Edições do médico** gravadas pela tela atual são planas (strings), então
  ficavam cobertas. Edições com objetos aninhados (API direta, versões antigas
  da tela) teriam o mesmo problema.

Achado relacionado: `confirm()` passava o selo como `afterHash` para
`AuditService.log()`, que ignora esse parâmetro e calcula o próprio hash a
partir do payload. O selo da confirmação **nunca entrou na trilha de
auditoria**; só o hash da geração, no payload do `DOCUMENT_GENERATED`.

## Decisão

1. **v2 = SHA-256 do JSON canônico RFC 8785 (JCS)**: chaves ordenadas por
   unidade UTF-16 em todos os níveis, arrays na ordem original, números e
   strings como no `JSON.stringify`. O conteúdo é normalizado antes como o
   Postgres o guarda (sem `undefined`), para o hash da geração bater com o
   recalculado do banco. Saída inalterada: 64 caracteres hexadecimais.
2. **Coluna `documents.content_hash_version` (SMALLINT)**. A migration marca
   todo hash existente como `1`. Um `CHECK` exige versão se e somente se houver
   hash: gravar hash sem versão falha na hora, em vez de gerar selo ambíguo.
3. **Selar sempre com a versão atual** (`sealContent`, que devolve hash e
   versão juntos para o `data` do Prisma). **Verificar com o algoritmo da versão
   gravada** (`verifyContentSeal`). O v1 fica congelado em
   `src/modules/documents/content-hash.ts`, só para verificação.
4. **Não re-selar documentos confirmados.** Recalcular o hash hoje atestaria o
   conteúdo atual, inclusive qualquer alteração feita depois da confirmação. O
   selo vale pelo que o médico confirmou, quando confirmou.
5. **Rascunhos com hash v1 recebem v2 na confirmação**, porque `confirm()`
   sempre sela de novo o conteúdo efetivo.
6. **O selo vai no payload** do `DOCUMENT_GENERATED` e do
   `DOCUMENT_CONFIRMED` (`contentHash` + `contentHashVersion`). O payload entra
   no hash encadeado (ADR-002): alterar conteúdo e `content_hash` juntos no
   banco não apaga o selo original. O parâmetro morto `afterHash` saiu de
   `AuditService.log()`.
7. **`GET /v1/encounters/:encounterId/documents/:id/integrity`** recalcula o
   selo de um documento confirmado e responde `intact`, `mismatch` ou
   `unconfirmed`. `mismatch` gera `logger.error` e evento no Sentry, só com
   `documentId` e versão — sem conteúdo clínico.

## Alternativas descartadas

- **Prefixo `v2:` no próprio hash.** Exige alargar o `CHAR(64)` e quebra quem
  trata o campo como hexadecimal (`hash.slice(0, 8)` na UI, rodapé do PDF).
- **Re-selar tudo com v2.** Ver decisão 4.
- **Pacote npm de JSON canônico (`canonicalize`).** O algoritmo precisa ficar
  estável para sempre. Uma função de 10 linhas com os vetores de teste da RFC
  8785 evita mudança por upgrade de dependência, e qualquer implementação JCS
  externa reproduz o v2.
- **`DEFAULT 1` na coluna.** Código que esquecesse a versão gravaria hash v2
  rotulado como v1, sem erro na escrita.

## Consequências

- **Prescrições v1 confirmadas sem edição continuam sem cobertura dos campos
  dos medicamentos.** A verificação devolve `intact` mesmo se a dose mudou
  depois. Não há correção retroativa honesta (decisão 4). A defesa desses
  registros é o controle de acesso ao banco (trade-off já aceito no ADR-002).
  Para medir a exposição:

  ```sql
  SELECT type, count(*)
  FROM documents
  WHERE content_hash_version = 1
    AND confirmed_by IS NOT NULL
    AND jsonb_path_exists(COALESCE(physician_edits, content),
                          '$.*.** ? (@.type() == "object")')
  GROUP BY type;
  ```

- **Janela de deploy.** Entre a migration e a subida do container novo, a API
  antiga falha ao **gerar** documento (violação do `CHECK`). Confirmar continua
  funcionando: a API antiga grava hash v1 numa linha já marcada como v1.
- **Rollback só da aplicação** exige remover o `CHECK`
  (`ALTER TABLE documents DROP CONSTRAINT documents_content_hash_version_paired`).
  Rascunhos criados em v2 e confirmados pelo código antigo ficariam com hash v1
  rotulado v2 e falhariam na verificação.
- **Mudar o algoritmo de novo** = nova versão em `CONTENT_HASHERS`, nunca
  editar uma existente. Os testes fixam os hashes v1 e v2 de uma prescrição
  para pegar mudança acidental.
