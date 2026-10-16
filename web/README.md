# Web do Copiloto Clínico

Aplicação Next.js 16 (App Router) que o médico usa no navegador. Fala com a API
em `NEXT_PUBLIC_API_URL` (padrão `http://localhost:3000/v1`). Como rodar o
projeto inteiro: [README da raiz](../README.md).

## Comandos

```bash
pnpm install
pnpm dev --port 3001                 # http://localhost:3001
pnpm test                            # Vitest
pnpm lint                            # ESLint
pnpm exec tsc --noEmit               # typecheck
node scripts/check-contrast.mjs      # contraste AA da paleta
pnpm build                           # build de produção
```

## Regras deste pacote

- Esta versão do Next muda APIs e convenções: leia o [AGENTS.md](AGENTS.md) e a
  documentação em `node_modules/next/dist/docs/` antes de escrever código.
- De `@contracts/*` importe só tipos. A imagem do web (`docker/Dockerfile.web`)
  copia só `web/`, e o CI recusa import de valor.
- Cores só pelos tokens do design system ([docs/design-system.md](../docs/design-system.md)).
  Ícones pelo provedor do projeto, nunca `lucide-react` direto. Sem Geist nem
  Inter.
- Evento de analytics só da lista fechada de `src/lib/analytics.ts`.
