"""Inferência do OpenMed PII em ONNX: texto → rótulo de cada token.

Sem torch: o tokenizador é o `tokenizers` (Rust) e o modelo roda no
onnxruntime, em CPU. Texto longo é cortado em janelas com sobreposição, para
a memória e o tempo não crescerem com o quadrado do tamanho do texto; cada
token fica com a previsão da janela em que está mais longe da borda.
"""

from __future__ import annotations

import json
import threading
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import onnxruntime as ort
from tokenizers import Tokenizer

from spans import Entity, TokenPrediction, best_window, identity_entities, windows_of

CLS_ID = 1
SEP_ID = 2
PAD_ID = 0


class Busy(Exception):
    """A fila de inferência não andou dentro do prazo."""


def create_session(model_path: Path, threads: int) -> ort.InferenceSession:
    """Sessão com o mínimo de memória (ADR-020).

    O grafo já sai otimizado do export_onnx.py e os pesos ficam em
    model.onnx.data, mapeado do disco. Otimizar de novo, pré-empacotar os pesos
    ou manter a arena de memória criaria cópias: cada uma custa dezenas de MB
    num serviço que tem 400.
    """
    options = ort.SessionOptions()
    options.intra_op_num_threads = threads
    options.inter_op_num_threads = 1
    options.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
    options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_DISABLE_ALL
    options.enable_cpu_mem_arena = False
    options.add_session_config_entry("session.disable_prepacking", "1")
    return ort.InferenceSession(
        str(model_path), sess_options=options, providers=["CPUExecutionProvider"]
    )


@dataclass(frozen=True)
class NerSettings:
    model_dir: Path
    threads: int = 1
    # Tokens de texto por janela (mais [CLS] e [SEP]); o modelo foi treinado até 512.
    window: int = 256
    # Tokens de contexto de cada lado que a janela vizinha repete.
    overlap: int = 32
    threshold: float = 0.5
    # Quanto cada janela espera pela vez dela antes de desistir (Busy).
    queue_timeout_s: float = 2.0


class NerModel:
    def __init__(self, settings: NerSettings) -> None:
        if settings.overlap * 2 >= settings.window:
            raise ValueError("overlap precisa ser menor que metade da janela")
        self.settings = settings
        self.tokenizer = Tokenizer.from_file(str(settings.model_dir / "tokenizer.json"))
        # O tokenizer.json corta em 512 tokens; aqui quem corta são as janelas.
        self.tokenizer.no_truncation()
        self.tokenizer.no_padding()
        labels = json.loads((settings.model_dir / "labels.json").read_text(encoding="utf-8"))
        self.id2label = {int(index): label for index, label in labels.items()}
        self.session = create_session(settings.model_dir / "model.onnx", settings.threads)
        # Uma janela por vez: a memória fica no que foi medido, e um anexo
        # longo não segura a fila — o relato que chega entra entre duas janelas.
        self._lock = threading.Lock()

    def entities(self, text: str) -> list[Entity]:
        return identity_entities(text, self.token_predictions(text), self.settings.threshold)

    def token_predictions(self, text: str) -> list[TokenPrediction]:
        encoding = self.tokenizer.encode(text, add_special_tokens=False)
        ids = encoding.ids
        if not ids:
            return []
        windows = windows_of(len(ids), self.settings.window, self.settings.overlap)
        probabilities = [self._run(ids[start:end]) for start, end in windows]

        predictions: list[TokenPrediction] = []
        for index, (start, end) in enumerate(encoding.offsets):
            if end <= start:
                continue
            window_index, position = best_window(index, windows)
            row = probabilities[window_index][position]
            label_id = int(row.argmax())
            predictions.append(
                TokenPrediction(
                    label=self.id2label[label_id],
                    score=float(row[label_id]),
                    start=start,
                    end=end,
                )
            )
        return predictions

    def _run(self, window_ids: list[int]) -> np.ndarray:
        """Probabilidades de cada token da janela, sem [CLS]/[SEP]."""
        input_ids = np.array([[CLS_ID, *window_ids, SEP_ID]], dtype=np.int64)
        if not self._lock.acquire(timeout=self.settings.queue_timeout_s):
            raise Busy()
        try:
            (logits,) = self.session.run(
                ["logits"], {"input_ids": input_ids, "attention_mask": np.ones_like(input_ids)}
            )
        finally:
            self._lock.release()
        return _softmax(logits[0, 1 : 1 + len(window_ids)])


def _softmax(logits: np.ndarray) -> np.ndarray:
    shifted = logits - logits.max(axis=-1, keepdims=True)
    exp = np.exp(shifted)
    return exp / exp.sum(axis=-1, keepdims=True)
