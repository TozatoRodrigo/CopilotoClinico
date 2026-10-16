#!/usr/bin/env python3
"""Mascara o corpus da de-identificação com um modelo OpenMed PII.

Lê o corpus gerado por `pnpm eval:deid` (evals/deid/out/corpus.jsonl) e
escreve um JSONL com {"id", "redacted", "entities"} por nota, para medir com
`pnpm eval:deid --predictions <arquivo>`. Roda em CPU; nada sai da máquina
depois do download do modelo.

Uso:
    pip install "transformers>=4.44" torch
    python3 evals/deid/openmed_redact.py \\
        --model OpenMed/OpenMed-PII-Portuguese-SuperClinical-Small-44M-v1 \\
        --corpus evals/deid/out/corpus.jsonl \\
        --out evals/deid/out/openmed-44m.jsonl
"""

import argparse
import json

from transformers import pipeline

DEFAULT_MODEL = "OpenMed/OpenMed-PII-Portuguese-SuperClinical-Small-44M-v1"

# Só o que identifica a pessoa. Idade, quantidade e data comum ficam: "54 anos"
# e "losartana 50 mg" são dado clínico, e o modelo marca os dois (AGE, AMOUNT).
# Cidade também fica (procedência pesa em dengue, febre amarela, Chagas), e
# tratamento ("Dr.", "Sra.", PREFIX) não identifica ninguém.
IDENTITY_ENTITIES = {
    "FIRSTNAME",
    "MIDDLENAME",
    "LASTNAME",
    "ACCOUNTNAME",
    "STREET",
    "BUILDINGNUMBER",
    "ZIPCODE",
    "PHONE",
    "EMAIL",
    "SSN",
    "DATEOFBIRTH",
    "IBAN",
    "CREDITCARD",
    "MASKEDNUMBER",
}


def to_whole_words(text: str, entity: dict) -> dict:
    """Estende o trecho até a palavra inteira: o modelo às vezes marca só "Edi" de "Edivaldo"."""
    start, end = entity["start"], entity["end"]
    while start > 0 and text[start - 1].isalnum():
        start -= 1
    while end < len(text) and text[end].isalnum():
        end += 1
    return {**entity, "start": start, "end": end}


def merge_adjacent(text: str, entities: list[dict]) -> list[dict]:
    """Junta trechos do mesmo tipo que se tocam ou se sobrepõem ("Edi" + "valdo")."""
    merged: list[dict] = []
    for entity in sorted((to_whole_words(text, e) for e in entities), key=lambda e: e["start"]):
        previous = merged[-1] if merged else None
        overlapping = previous is not None and entity["start"] < previous["end"]
        touching_same_type = (
            previous is not None
            and previous["entity_group"] == entity["entity_group"]
            and text[previous["end"] : entity["start"]].strip() == ""
        )
        # Sobreposição de tipos diferentes vira um trecho só: trocar dois
        # rótulos no mesmo lugar corromperia o texto.
        if previous and (overlapping or touching_same_type):
            previous["end"] = max(previous["end"], entity["end"])
            previous["score"] = max(previous["score"], entity["score"])
        else:
            merged.append(dict(entity))
    return merged


def redact(text: str, entities: list[dict]) -> str:
    """Troca cada entidade pelo rótulo, do fim para o começo (os índices não mudam)."""
    redacted = text
    for entity in sorted(entities, key=lambda e: e["start"], reverse=True):
        start = entity["start"]
        # O tokenizador às vezes inclui o espaço antes da palavra: ele fica.
        while start < entity["end"] and text[start].isspace():
            start += 1
        redacted = redacted[:start] + f"[{entity['entity_group']}]" + redacted[entity["end"] :]
    return redacted


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--corpus", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument(
        "--threshold",
        type=float,
        default=0.5,
        help="score mínimo para mascarar uma entidade (padrão 0.5)",
    )
    parser.add_argument(
        "--aggregation",
        default="simple",
        choices=["simple", "first", "average", "max"],
        help="como o pipeline junta subtokens (padrão simple; o script depois estende cada trecho à palavra inteira)",
    )
    parser.add_argument(
        "--all-entities",
        action="store_true",
        help="mascara tudo o que o modelo marcar, inclusive idade e quantidade",
    )
    args = parser.parse_args()

    ner = pipeline("token-classification", model=args.model, aggregation_strategy=args.aggregation)

    with open(args.corpus, encoding="utf-8") as corpus, open(args.out, "w", encoding="utf-8") as out:
        for line in corpus:
            if not line.strip():
                continue
            note = json.loads(line)
            entities = merge_adjacent(note["text"], [
                {
                    "entity_group": entity["entity_group"],
                    "start": int(entity["start"]),
                    "end": int(entity["end"]),
                    "score": round(float(entity["score"]), 4),
                }
                for entity in ner(note["text"])
                if float(entity["score"]) >= args.threshold
                and (args.all_entities or entity["entity_group"] in IDENTITY_ENTITIES)
            ])
            out.write(
                json.dumps(
                    {"id": note["id"], "redacted": redact(note["text"], entities), "entities": entities},
                    ensure_ascii=False,
                )
                + "\n"
            )


if __name__ == "__main__":
    main()
