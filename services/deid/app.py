"""Serviço de de-identificação (CC-203, ADR-020): onde há nome, endereço e documento no texto.

Devolve só os trechos (rótulo, início, fim, score); quem mascara é a API, que
ainda tira dos trechos os epônimos protegidos (CC-202). Nada do texto vai para
o log: só tamanho, quantidade de trechos e latência.

Offsets em unidades UTF-16, as do JavaScript: emoji no relato não desloca o
trecho mascarado.
"""

from __future__ import annotations

import logging
import os
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncIterator

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from ner import Busy, NerModel, NerSettings
from spans import utf16_offsets

MAX_CHARS = int(os.environ.get("DEID_MAX_CHARS", "60000"))

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("deid")

state: dict[str, object] = {}


def _settings() -> NerSettings:
    return NerSettings(
        model_dir=Path(os.environ.get("DEID_MODEL_DIR", "/model")),
        threads=int(os.environ.get("DEID_THREADS", "1")),
        window=int(os.environ.get("DEID_WINDOW_TOKENS", "256")),
        threshold=float(os.environ.get("DEID_THRESHOLD", "0.5")),
        # Quanto cada janela espera na fila antes de desistir (503). A API corta
        # antes (DEID_TIMEOUT_MS) e segue com a regex; a fila não acumula
        # trabalho que ninguém vai ler.
        queue_timeout_s=float(os.environ.get("DEID_QUEUE_TIMEOUT_S", "2")),
    )


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    settings = _settings()
    started = time.perf_counter()
    model = NerModel(settings)
    # Aquece: a primeira chamada do onnxruntime aloca os buffers.
    model.entities("Paciente Maria da Silva, 54 anos.")
    revision_file = settings.model_dir / "MODEL_REVISION"
    revision = revision_file.read_text(encoding="utf-8").strip() if revision_file.exists() else "-"
    state["model"] = model
    state["revision"] = revision
    logger.info(
        "DEID_READY revision=%s threads=%d loadMs=%d",
        revision,
        settings.threads,
        (time.perf_counter() - started) * 1000,
    )
    yield


app = FastAPI(title="copiloto-deid", lifespan=lifespan, docs_url=None, redoc_url=None)


class EntitiesRequest(BaseModel):
    text: str = Field(max_length=MAX_CHARS)


class EntityOut(BaseModel):
    label: str
    start: int
    end: int
    score: float


class EntitiesResponse(BaseModel):
    entities: list[EntityOut]
    revision: str
    latencyMs: float


@app.get("/health")
def health() -> dict[str, str]:
    if "model" not in state:
        raise HTTPException(status_code=503, detail="loading")
    return {"status": "ok", "revision": str(state["revision"])}


@app.post("/v1/entities", response_model=EntitiesResponse)
def entities(request: EntitiesRequest) -> EntitiesResponse:
    model = state.get("model")
    if not isinstance(model, NerModel):
        raise HTTPException(status_code=503, detail="loading")
    started = time.perf_counter()
    try:
        found = model.entities(request.text)
    except Busy:
        logger.warning("DEID_BUSY chars=%d", len(request.text))
        raise HTTPException(status_code=503, detail="busy") from None
    offsets = utf16_offsets(request.text)
    latency_ms = (time.perf_counter() - started) * 1000
    logger.info(
        "DEID_INFER chars=%d entities=%d latencyMs=%.1f",
        len(request.text),
        len(found),
        latency_ms,
    )
    return EntitiesResponse(
        entities=[
            EntityOut(
                label=entity.label,
                start=offsets[entity.start],
                end=offsets[entity.end],
                score=round(entity.score, 4),
            )
            for entity in found
        ],
        revision=str(state["revision"]),
        latencyMs=round(latency_ms, 1),
    )
