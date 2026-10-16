# Changelog

O que muda no Copiloto Clínico, no formato
[Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/). Uma linha por PR,
com o número.

Não há versão a cada merge: a versão é marcada no deploy. Quem faz o deploy
move o que foi para produção de "Não lançado" para uma seção com a data do
deploy. Quando a linha cita uma flag, o padrão dela e como ligá-la estão no
runbook, em "Variáveis de Ambiente Críticas".

## [Não lançado]

Entrou na `main` em 16/10/2026.

### Segurança

- Limite de tentativas que o `X-Forwarded-For` não burla e bloqueio por conta no MFA (CC-025) (#203)
- Diretriz e protocolo institucional só para quem tem vínculo ativo com a instituição (CC-019) (#197)
- Apagar uma instituição não torna globais os protocolos e as diretrizes dela (CC-021) (#198)
- Token de médico eliminado é recusado; teste de MFA estável (CC-018) (#194)
- Injeção de comandos em português detectada e teto para o texto livre (#170)
- API sem vulnerabilidade alta em produção: Fastify 5.12.7 e NestJS 11.2.7 (CC-022) (#200)
- Web com Next 16.3.8 e sharp 0.35.5, otimizador de imagens desligado (CC-022) (#199)
- Selo do documento (`contentHash` v2) cobre o conteúdo aninhado (ADR-018) (#143)

### Privacidade e LGPD

- Texto clínico cifrado em repouso, com leitura dupla e migração em lote; atrás de `CLINICAL_TEXT_ENCRYPTION`, desligada por padrão (CC-207, ADR-021) (#196)
- Texto clínico fora do log, da URL e do Sentry; Groq no DPA (#168)
- Texto livre e dado pessoal fora do payload da trilha de auditoria (#147)
- Consentimento de IA aplicado e fila sem o texto do caso (CC-010, CC-011, CC-013) (#181)
- Áudio das capturas eliminado depois dos 30 dias de retenção (#146)
- Capturas de áudio na exportação, sem o áudio cifrado (#149)
- Anexos e capturas de áudio na exportação e na eliminação (#142)
- Máscara de PII tira o prontuário pelo rótulo e o nome depois de tratamento ou apelido, sem tocar os epônimos; `DEID_CONTEXT_RULES`, ligada por padrão (CC-201, CC-202, CC-206) (#177)
- Termos de uso e política de privacidade versionados, com aceite no próximo acesso; atrás de `LEGAL_TERMS_V2` (CC-905) (#190)
- Arquitetura e política LGPD conferidas com o código (CC-008) (#175)

### Funcionalidades (atrás de flag)

- Cartões revisados: modelo, rascunho por IA com citação literal e anti-circularidade; rascunho atrás de `KNOWLEDGE_CARDS_DRAFT_ENABLED` (CC-402, CC-403, CC-412) (#179)
- Entrar com Google ou Microsoft; liga com as credenciais `OAUTH_*` (CC-334) (#183)
- "Revise seu plantão": perguntas sobre os próprios casos, com grau de certeza; `COPILOT_SHIFT_REVIEW` (CC-801) (#191)
- Beta por convite, com lista de espera e onboarding; `BETA_INVITE_REQUIRED` (CC-702) (#189)
- E-mail transacional por SMTP; sem `SMTP_HOST`, só log (CC-015) (#188)
- Discutir o caso com um médico da equipe, em modo concierge; `COPILOT_MENTORING` (CC-707, CC-708) (#186)
- Local de plantão salvo no perfil e transferência quando falta recurso; `COPILOT_SITE_CONTEXT` (CC-602, CC-603) (#184)
- Linha de "por quê" em cada conduta do "Fazer agora"; `COPILOT_WHY_LINE` (CC-601) (#178)
- Reserva de provedor: se a Groq cair, a etapa repete na Anthropic; `AI_FALLBACK_MODEL` (CC-107) (#174)

### Correções

- Edição de prescrição e alta não perde a lista estruturada (#148)
- Especialidade salva, troca de senha por `PATCH`, Dockerfile órfão removido e consentimento de analytics aplicado (CC-014) (#187)

### Infra e CI

- Imagem da API só com dependências de produção (CC-024) (#201)
- Playwright e lint do web rodando de verdade e bloqueantes (CC-023) (#202)
- CI recusa import de valor de `@contracts` no web, para a imagem do web não quebrar (#193)
- Painel de custo e latência por etapa e modelo, com alertas de custo, p95 e cota (CC-004, CC-005) (#176)
- Teste do `sealJson` sem o falso positivo do base64 que aparecia em ~2% das execuções (#204)

### Avaliação

- Feedback do médico vira rascunho de caso do gabarito; "Não encontrei o que precisava" e eventos de produto no Umami, sem texto livre (CC-703, CC-704) (#185)
- Gabarito mede a conversa antes do plano (CC-106) (#182)
- Leitura do caso por modelo, com latência e erros de dado (`pnpm eval:intake`) (#192)
- Transcrição: Whisper large-v3 contra o turbo, e a variável `WHISPER_MODEL` (CC-205) (#195)
- De-identificação com OpenMed só com entidades de identidade, palavra inteira e regex antes (#172)
