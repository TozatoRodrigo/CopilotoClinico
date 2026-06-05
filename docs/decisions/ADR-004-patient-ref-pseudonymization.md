# ADR-004: patientRef como Identificador Opaco (Pseudonimização LGPD)

**Status:** Aceito  
**Data:** 2026-06-05  
**Tarefa:** LGPD-001 — https://app.clickup.com/t/90132565680/86ahx6fj7

## Contexto

O campo `patientRef` em `Encounter` é uma string livre usada para correlacionar atendimentos do mesmo paciente. Sem restrições, poderia armazenar CPF, nome completo ou outros dados pessoais diretos, tornando o banco do Copiloto Clínico uma fonte primária de PII — sujeita a todos os direitos da LGPD (acesso, retificação, esquecimento).

## Decisão

**`patientRef` é um identificador de correlação opaco — nunca dados pessoais.**

O sistema do hospital (HIS/EMR) é quem sabe quem é o paciente. O Copiloto Clínico precisa apenas correlacionar atendimentos do mesmo paciente, não identificar o paciente em si.

### Identificadores aceitos
- Número de prontuário: `PRN-2024-00123`
- UUID interno do hospital: `550e8400-e29b-41d4-a716-446655440000`
- Hash (ex: SHA-256 com salt por tenant do CPF)
- Código opaco do sistema: `HOSP-XK9L-2024`

### Identificadores rejeitados (validação no schema)
- CPF sem formatação: `12345678901` (exatamente 11 dígitos)
- CPF com formatação: `123.456.789-01`
- Nome completo: `Maria Silva`, `João da Silva`, `Ana Paula Costa`

### Implementação
Validação via Zod `refine()` em `encounter.schemas.ts`:
```typescript
patientRef: z.string().min(1).max(50).refine(isValidPatientRef, { message: PATIENT_REF_VALIDATION_ERROR })
```

## Consequências

### Positivas
- O banco do Copiloto Clínico nunca é fonte primária de PII de pacientes
- Direito ao esquecimento (LGPD Art. 18, VI) não entra em conflito com trilha de auditoria
- Conformidade com LGPD Art. 13 (pseudonimização como técnica de segurança)
- Risco de vazamento de dados de pacientes significativamente reduzido

### Negativas
- Integração hospitalar precisa gerar/fornecer o identificador opaco
- Validação via regex pode ter falsos negativos (nomes simples como "Ana Paz")

## Alternativa Rejeitada

Hash do CPF com salt por tenant: permite correlação sem expor o CPF real. Rejeitado para R0 por: (a) exige definir o salt por tenant antes de ter multi-tenancy; (b) adiciona complexidade na integração hospitalar. Candidato natural para R1/R2.
