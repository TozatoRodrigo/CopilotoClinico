# DPA — Data Processing Agreement com Provider de IA

**Status:** ⚠️ PENDENTE — Verificação manual necessária antes de produção  
**Tarefa:** LGPD-005 — https://app.clickup.com/t/90132565680/86ahx6fkc  
**Data de revisão:** 2026-06-05

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

## Proteções implementadas no código (independentes do DPA)

Mesmo sem DPA assinado, as seguintes proteções estão ativas:

1. **LGPD-001**: `patientRef` é identificador opaco — não é dado pessoal direto
2. **LGPD-005 — Camada 1**: `maskPII()` redige CPF, CNPJ, telefone, email, CEP, RG antes do envio
3. **LGPD-005 — Camada 2**: `redactPatientRef()` substitui explicitamente o `patientRef` por `[PATIENT_REF_REDACTED]`
4. **`inputRedacted`**: apenas o texto redatado é armazenado no banco — o original nunca persiste

Estas proteções reduzem o risco mas **NÃO substituem o DPA** para fins de conformidade LGPD.

## Responsável

Encarregado de dados (DPO) da Strivium — contato: rodrigo.tozato@strivium.com.br
