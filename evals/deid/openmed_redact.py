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


def redact(text: str, entities: list[dict]) -> str:
    """Troca cada entidade pelo rótulo, do fim para o começo (os índices não mudam)."""
    redacted = text
    for entity in sorted(entities, key=lambda e: e["start"], reverse=True):
        redacted = redacted[: entity["start"]] + f"[{entity['entity_group']}]" + redacted[entity["end"] :]
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
    args = parser.parse_args()

    ner = pipeline("token-classification", model=args.model, aggregation_strategy="simple")

    with open(args.corpus, encoding="utf-8") as corpus, open(args.out, "w", encoding="utf-8") as out:
        for line in corpus:
            if not line.strip():
                continue
            note = json.loads(line)
            entities = [
                {
                    "entity_group": entity["entity_group"],
                    "start": int(entity["start"]),
                    "end": int(entity["end"]),
                    "score": round(float(entity["score"]), 4),
                }
                for entity in ner(note["text"])
                if float(entity["score"]) >= args.threshold
            ]
            out.write(
                json.dumps(
                    {"id": note["id"], "redacted": redact(note["text"], entities), "entities": entities},
                    ensure_ascii=False,
                )
                + "\n"
            )


if __name__ == "__main__":
    main()
