# De-identificação: corpus e medição

Mede quanto do que identifica o paciente some antes de o texto ir ao modelo:
nome, apelido, parente, médico, endereço, prontuário, telefone, CPF, CNS e
nascimento. Também mede se termos clínicos que parecem nome sobrevivem
(Glasgow, Murphy, Wells, Chagas, Guillain-Barré...).

O corpus é sintético e determinístico (`corpus.ts`): nenhum dado real.

```bash
pnpm eval:deid                 # gera o corpus e mede a regex de hoje (maskPII)
```

Para medir o OpenMed (ou outro modelo), rode o script Python sobre o corpus e
passe a saída:

```bash
pip install "transformers>=4.44" torch
python3 evals/deid/openmed_redact.py --corpus evals/deid/out/corpus.jsonl \
  --out evals/deid/out/openmed-44m.jsonl
pnpm eval:deid --predictions evals/deid/out/openmed-44m.jsonl
```

Cada mascarador externo aparece duas vezes no relatório: sozinho e somado à
regex, que é como entraria no pipeline. Meta proposta no plano de impacto:
pelo menos 95% dos nomes mascarados e nenhum termo clínico perdido.

O corpus gerado por templates é o ponto de partida. Antes de decidir, vale
acrescentar relatos escritos por médicos (sem dado real), porque o modelo pode
ir bem no template e mal no texto de plantão.
