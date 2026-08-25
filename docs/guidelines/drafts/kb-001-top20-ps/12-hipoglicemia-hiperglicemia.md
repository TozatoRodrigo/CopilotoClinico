---
source: Hipoglicemia e hiperglicemia aguda no PS
sourceVersion: ADA 2025
specialty: endocrinologia
evidenceLevel: I-A
cenario: hipoglicemia_hiperglicemia
red_flags: rebaixamento do sensório | cetose/cetoacidose | desidratação grave | potassio alterado | osmolaridade elevada
---

Alterações agudas de glicemia no PS exigem primeiro identificar risco imediato neurológico e metabólico. Hipoglicemia sintomática com rebaixamento, convulsão ou incapacidade de deglutição é tratamento imediato, não discussão diagnóstica prolongada. Hiperglicemia importante pede separação entre descompensação simples, cetoacidose diabética e estado hiperosmolar.

Na hiperglicemia, o raciocínio depende de vômitos, dor abdominal, respiração de Kussmaul, cetonemia/cetonúria, alteração do sensório, desidratação e osmolaridade. Potássio sérico e função renal mudam segurança da insulinoterapia e da reposição. Infecção, infarto e suspensão de insulina são gatilhos frequentes que precisam ser procurados.

Perguntas-chave: o paciente está consciente e tolera via oral, há cetose/cetoacidose, existe desidratação grave, o potássio está baixo, há sinais infecciosos/sepse, existe alteração neurológica. Sem isso não dá para recomendar insulina ou alta com segurança.

No material, frases com “rebaixamento do sensório”, “CAD”, “estado hiperosmolar”, “potássio” e “fator precipitante” precisam ter alta recuperabilidade porque são dados determinantes para a conduta.

Este é exatamente o tipo de par com conduta oposta descrito no incidente que motivou o guardrail de coerência diagnóstica (S21-CLIN-01): dar insulina a um paciente hipoglicêmico, ou tratar uma cetoacidose como hiperglicemia simples sem checar potássio antes da insulina, são os dois erros de inversão possíveis aqui. Ver os cenários `hipoglicemia_hiperglicemia`/subtipo `hipoglicemia` e `hipoglicemia_hiperglicemia`/subtipo `cetoacidose_hiperosmolar` (KB-004) para o detalhamento de cada lado e a regra de segurança (nunca insulina com potássio <3,3-3,5mEq/L).
