# De-identificação: corpus e medição

Mede quanto do que identifica o paciente some antes de o texto ir ao modelo:
nome, apelido, parente, médico, endereço, prontuário, telefone, CPF, CNS e
nascimento. Também mede se termos clínicos que parecem nome sobrevivem
(Glasgow, Murphy, Wells, Chagas, Guillain-Barré...).

O corpus é sintético e determinístico (`corpus.ts`): nenhum dado real.

```bash
pnpm eval:deid                 # gera o corpus e mede a regex de hoje (maskPII)
```

Para medir o OpenMed (ou outro modelo), rode o script Python sobre o corpus já
mascarado pela regex (a ordem do pipeline: regex primeiro, modelo depois) e
passe a saída:

```bash
pip install "transformers>=4.44" torch
python3 evals/deid/openmed_redact.py --corpus evals/deid/out/corpus-regex.jsonl \
  --out evals/deid/out/regex-then-openmed44m.jsonl
pnpm eval:deid --predictions evals/deid/out/regex-then-openmed44m.jsonl
```

O script mascara só o que identifica a pessoa (nome, endereço, telefone,
documentos, nascimento). Idade, quantidade e data comum ficam, porque o modelo
marca "54 anos" e "50 mg" (`--all-entities` mascara tudo). Cada trecho é
estendido até a palavra inteira, e trechos sobrepostos viram um só.

## Resultado em 14/10/2026 (200 relatos, OpenMed SuperClinical 44M, CPU)

| Tipo | regex hoje | regex + OpenMed 44M |
| --- | --- | --- |
| nome do paciente | 0% | 90% |
| parente / médico | 0% | 94% / 94% |
| apelido ("Zé", "Tião") | 0% | 68% |
| endereço | 0% | 98% |
| prontuário | 0% | 16% |
| telefone, CPF, CNS, nascimento | 100% | 100% |
| termos clínicos intactos | 100% | 97% |

O que falta para a meta: o modelo confunde Babinski, Kernig e Brudzinski com
nome de pessoa (precisa de lista de epônimos protegidos), e prontuário só sai
com regra de contexto na regex ("prontuário", "RH", "registro" seguidos de
número). O LiteClinical 66M ficou abaixo (69% dos nomes). Meta proposta no plano de impacto:
pelo menos 95% dos nomes mascarados e nenhum termo clínico perdido.

O corpus gerado por templates é o ponto de partida. Antes de decidir, vale
acrescentar relatos escritos por médicos (sem dado real), porque o modelo pode
ir bem no template e mal no texto de plantão.

## Regras de contexto da regex (CC-201, CC-202, CC-206)

A regex mascara também o prontuário pelo rótulo ("prontuário 4587213") e o
nome depois de tratamento ou apelido ("Seu Zé", "Dona Cida", "Tião"), sem
tocar os epônimos da lista protegida. O corpus traz 22 relatos escritos à mão
(`deid-m01`...) com essas formas e as armadilhas clínicas ("BE -5,2", "leito
12", "dona de casa", "Seu Holter"). Para medir sem as regras novas:

```bash
DEID_CONTEXT_RULES=off pnpm eval:deid
```

Arquivo de predições gerado antes dos relatos à mão não tem os ids `deid-m*`:
rode o script do modelo de novo sobre o `corpus.jsonl` atual.
