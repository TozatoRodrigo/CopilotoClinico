"""Latência do serviço de de-identificação sobre N relatos (critério 3 da CC-203).

Só biblioteca padrão: roda na VPS sem instalar nada. Lê o corpus do eval:deid
(evals/deid/out/corpus.jsonl, ou qualquer JSONL com "text") e manda um relato
por vez, como a API faz. A memória se mede à parte, com `docker stats`.

    python3 services/deid/bench.py --url http://127.0.0.1:8099 \\
        --corpus evals/deid/out/corpus.jsonl --count 100 [--join 6]

`--join N` junta N relatos do corpus em um (o corpus tem ~160 caracteres por
relato; um caso de plantão completo tem 800 a 1.500).
"""

from __future__ import annotations

import argparse
import json
import statistics
import time
import urllib.request


def percentile(values: list[float], fraction: float) -> float:
    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, round(fraction * len(ordered)) - 1))
    return ordered[index]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--url", default="http://127.0.0.1:8000")
    parser.add_argument("--corpus", required=True)
    parser.add_argument("--count", type=int, default=100)
    parser.add_argument("--join", type=int, default=1, help="relatos do corpus por pedido")
    args = parser.parse_args()

    with open(args.corpus, encoding="utf-8") as corpus:
        texts = [json.loads(line)["text"] for line in corpus if line.strip()]
    joined = [" ".join(texts[i : i + args.join]) for i in range(0, len(texts), args.join)]
    texts = (joined * (args.count // max(1, len(joined)) + 1))[: args.count]

    latencies: list[float] = []
    service: list[float] = []
    for text in texts:
        body = json.dumps({"text": text}).encode("utf-8")
        request = urllib.request.Request(
            f"{args.url}/v1/entities",
            data=body,
            headers={"Content-Type": "application/json"},
        )
        started = time.perf_counter()
        with urllib.request.urlopen(request, timeout=60) as response:
            payload = json.loads(response.read())
        latencies.append((time.perf_counter() - started) * 1000)
        service.append(float(payload["latencyMs"]))

    chars = [len(text) for text in texts]
    print(
        json.dumps(
            {
                "relatos": len(texts),
                "chars_media": round(statistics.fmean(chars)),
                "chars_max": max(chars),
                "ida_e_volta_ms": {
                    "p50": round(percentile(latencies, 0.5), 1),
                    "p95": round(percentile(latencies, 0.95), 1),
                    "max": round(max(latencies), 1),
                },
                "inferencia_ms": {
                    "p50": round(percentile(service, 0.5), 1),
                    "p95": round(percentile(service, 0.95), 1),
                },
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
