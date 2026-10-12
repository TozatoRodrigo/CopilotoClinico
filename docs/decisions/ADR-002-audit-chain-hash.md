# ADR-002: Estratégia de Auditoria — Hash Encadeado vs. Blockchain

**Status:** Aceito  
**Data:** 2026-06-05

## Decisão

Hash encadeado SHA-256 no PostgreSQL com trigger de imutabilidade, verificação diária via cron.

## Por que NÃO blockchain

O Copiloto Clínico é single-tenant por hospital. O modelo de ameaça é: administrador de banco comprometido, não adversários distribuídos. Blockchain adicionaria:
- Complexidade operacional (nó, gas fees ou permissioned network)
- Latência de confirmação incompatível com uso clínico
- Curva de aprendizado para auditores regulatórios brasileiros (CFM não exige blockchain)

## Por que hash encadeado é suficiente

- `afterHash[N] = SHA256(JSON(dados_N))` — conteúdo verificável independentemente
- `beforeHash[N] = SHA256(afterHash[N-1] + JSON(dados_N))` — elo na cadeia
- Trigger PostgreSQL bloqueia UPDATE/DELETE na camada de banco
- REVOKE TRUNCATE bloqueia limpeza em massa
- Escrita da cadeia serializada com `pg_advisory_xact_lock` dentro da transação, evitando que eventos concorrentes bifurquem o mesmo elo
- Verificação diária detecta qualquer ruptura antes de auditoria regulatória

## Trade-offs aceitos

Um superuser comprometido com acesso DDL pode ainda corromper dados (ALTER TABLE). Mitigação: auditoria de acesso privilegiado ao banco via logs do PostgreSQL, separação de roles entre app e DBA.

## Emenda — 12/10/2026: hash canônico (ADR-015)

A fórmula `JSON(dados_N)` acima vale para os registros legados
(`hash_version` NULL) e não reproduzia: o `jsonb` não guarda a ordem das
chaves e o Prisma reescreve parte dos números não inteiros ao gravar, então
o verificador falhava já no primeiro registro com payload de 2+ chaves. Os
registros novos usam JSON canônico (RFC 8785), com a versão dentro do texto
hasheado e o payload gravado como esse texto (`::jsonb`). O verificador
reconstrói os legados sem reescrever nenhum hash. Detalhes, alternativas e
limites na ADR-015.
