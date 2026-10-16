# DPA — Data Processing Agreement com Provider de IA

**Status:** ⚠️ PENDENTE — Verificação manual necessária antes de produção  
**Tarefa:** LGPD-005 — https://app.clickup.com/t/90132565680/86ahx6fkc  
**Data de revisão:** 2026-10-13 (Groq, Sentry e modelos abertos)

## O que é este documento

O Copiloto Clínico envia texto clínico para um provider de IA externo (configurado via `AI_PROVIDER` em `.env`). Todo prompt pode conter informações clínicas de pacientes. Sem um Data Processing Agreement (DPA) que garanta zero-retenção ou anonimização, o envio pode constituir violação da LGPD e do sigilo médico (CFM Res. 2.217/2018).

## Checklist de Verificação do Provider

Antes de colocar em produção com dados reais de pacientes, verificar:

### Obrigatório
- [ ] **DPA assinado** com o provider de IA (ou confirmação escrita de zero-retenção)
- [ ] **Zero-retenção para API calls** confirmada — dados não usados para treino
- [ ] **Opt-out de data training** ativo (se provider não oferecer zero-retenção por padrão)
- [ ] **Região de processamento** dentro do Brasil ou país com "nível adequado de proteção" (LGPD Art. 33)
- [ ] **Subprocessadores** listados e aprovados (se provider usa infraestrutura terceira)

### Recomendado
- [ ] **Prazo máximo de retenção** para logs de API documentado (ex: 30 dias para abuse monitoring)
- [ ] **Criptografia em trânsito** via TLS 1.2+ (verificar certificado do provider)
- [ ] **Processo de notificação de breach** definido com SLA

## Estado Atual por Provider

### Anthropic (provider padrão)
- DPA disponível: https://www.anthropic.com/legal/privacy
- Zero-retenção: disponível via "Privacy-preserving mode" — verificar se está ativo na API key
- Ação requerida: confirmar com Anthropic que a API key está em modo zero-retenção

### OpenAI (provider alternativo)
- DPA disponível: https://openai.com/policies/data-processing-addendum
- Zero-retenção: `"training": false` na API (verificar headers da requisição)
- Ação requerida: confirmar DPA assinado com cliente empresarial
- Em produção desde 12/10/2026: nenhuma chamada (`EMBEDDING_PROVIDER=none`, decisão na Anthropic)

### Groq (já em uso: ditado por voz; candidata a modelo de etapa)
- O que recebe hoje: **o áudio do ditado, antes de qualquer máscara** (`WHISPER_PROVIDER=groq`, `whisper-large-v3`). O texto transcrito passa pelo `maskPII()` só depois de voltar.
- O que pode receber: texto do caso já redigido, se um perfil `groq` for usado numa etapa (`AI_PROVIDER_PROFILES`, runbook "Um provedor por etapa").
- Retenção: a documentação diz que entradas e saídas de inferência não são guardadas por padrão, mas podem ficar até 30 dias para confiabilidade e abuso. **Zero Data Retention** (ZDR) se liga no console (Data Controls) e desliga batch e fine-tuning, que não usamos. https://console.groq.com/docs/your-data
- Região: dados guardados em buckets do Google Cloud nos EUA. É transferência internacional (LGPD Art. 33).
- Ação requerida: ligar ZDR na organização, guardar evidência (captura do Data Controls com data), confirmar os termos de uso para treino e listar a Groq entre os suboperadores da política de privacidade.

### Sentry (monitoramento de erros)
- Recebe a exceção e a pilha de chamadas dos erros 5xx e alertas por mensagem, quando `SENTRY_DSN` está configurado. O corpo da requisição não é enviado (`sendDefaultPii` desligado), e os logs de acesso só registram os nomes dos campos do corpo.
- Ação requerida: confirmar região e retenção do projeto no Sentry antes de ligar o DSN em produção.

### Modelos abertos de empresas chinesas (GLM, Qwen, DeepSeek, Kimi)
- Só por provedores nos EUA ou na UE com retenção zero (ex.: Groq). Nunca pelas APIs próprias das empresas de origem com texto clínico.

## Proteções implementadas no código (independentes do DPA)

Mesmo sem DPA assinado, as seguintes proteções estão ativas:

1. **LGPD-001**: `patientRef` é identificador opaco — não é dado pessoal direto
2. **LGPD-005 — Camada 1**: `maskPII()` redige CPF, CNPJ, telefone, email, CEP, RG antes do envio
3. **LGPD-005 — Camada 2**: `redactPatientRef()` substitui explicitamente o `patientRef` por `[PATIENT_REF_REDACTED]`
4. **`inputRedacted`**: apenas o texto redatado é armazenado no banco — o original nunca persiste

Estas proteções reduzem o risco mas **NÃO substituem o DPA** para fins de conformidade LGPD.

## Responsável

Encarregado de dados (DPO) da Strivium — contato: rodrigo.tozato@strivium.com.br
