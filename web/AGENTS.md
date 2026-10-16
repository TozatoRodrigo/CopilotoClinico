<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Contratos compartilhados (`@contracts/*`)

A imagem do web (`docker/Dockerfile.web`) copia só `web/`: de `@contracts/*` importe só tipos (`import type` ou `import { type X }`). Valor (constante, rótulo, função, schema) é espelhado em `src/lib/<contrato>-contract.ts`, com comentário apontando a origem, e `tests/web-mirrors/<contrato>.spec.ts` (na raiz) confere que as duas cópias batem. O CI recusa import de valor (`scripts/check-contracts-type-only.mjs`).
