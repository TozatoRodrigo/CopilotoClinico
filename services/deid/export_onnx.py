"""Baixa o OpenMed PII 44M numa revisão fixa, confere os hashes e exporta para ONNX int8.

Roda no estágio de build da imagem (Dockerfile) e à mão, para medir:

    pip install -r requirements-export.txt     # e o torch de CPU
    python export_onnx.py --out ./model        # baixa do Hugging Face
    python export_onnx.py --source <pasta com os arquivos do modelo> --out ./model

Saída em --out: model.onnx + model.onnx.data (int8, já otimizado), tokenizer.json,
labels.json e MODEL_REVISION. O binário nunca vai para o git: a imagem refaz
a exportação a partir dos pesos conferidos pelo hash (ADR-020).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sys
import tempfile
from pathlib import Path

MODEL_ID = "OpenMed/OpenMed-PII-Portuguese-SuperClinical-Small-44M-v1"
REVISION = "e74186eb0bd7800ea68d9ee9442e8621cb2a4928"
# sha256 dos arquivos da revisão acima. Mudou o hash, a imagem não sai: peso
# trocado no repositório do modelo não entra em produção sem revisão.
EXPECTED_SHA256 = {
    "config.json": "9c9a995bfb7587b197c3a1259c777b9e0da8fba875977751231df6d7baf45208",
    "model.safetensors": "84060a833d915a52f7426c768a24331cfc77cb5a7fbb3371b8074e42d7c71003",
    "tokenizer.json": "a29e21faec7433ee508590c7bee5dc869fddb335aacf11d53be766cf0fd81294",
    "tokenizer_config.json": "7931febe14783fb3e26ca14599a0fee4faac0284b7f94094e559d0bbcd8bfe3d",
}
# Frases para conferir que o ONNX concorda com o modelo original.
CHECK_SENTENCES = [
    "Dona Maria da Silva, 54 anos, mora na Rua das Flores, 123, Jardim Ângela.",
    "Paciente José Carlos Pereira trazido pela filha Ana Paula. Glasgow 14, Kernig negativo.",
    "Sr. Edivaldo Fernandes, DM2 e HAS, em uso de losartana 50 mg. Murphy positivo.",
]
# A exportação em si não pode mudar rótulo; a quantização muda uns poucos
# (2 a 5 de 78 tokens, conforme a CPU, sem efeito no eval:deid). Quem mede a
# qualidade de verdade é o `pnpm eval:deid` contra o serviço (ADR-020).
MIN_EXPORT_AGREEMENT = 0.99
MIN_QUANTIZED_AGREEMENT = 0.90
# Pesos fora do .onnx, cada um num offset múltiplo de 64 KiB: assim o
# onnxruntime mapeia o arquivo (mmap) em vez de copiar 180 MB para a memória.
EXTERNAL_DATA = "model.onnx.data"
EXTERNAL_ALIGNMENT = 65536


def sha256_of(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for block in iter(lambda: file.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def download(target: Path) -> Path:
    from huggingface_hub import snapshot_download

    return Path(
        snapshot_download(
            MODEL_ID,
            revision=REVISION,
            allow_patterns=list(EXPECTED_SHA256),
            local_dir=target,
        )
    )


def verify(source: Path) -> None:
    for name, expected in EXPECTED_SHA256.items():
        actual = sha256_of(source / name)
        if actual != expected:
            sys.exit(f"hash diferente em {name}: esperado {expected}, veio {actual}")
    print("hashes conferidos", file=sys.stderr)


def export(source: Path, fp32_path: Path) -> None:
    import torch
    from transformers import AutoModelForTokenClassification, AutoTokenizer

    model = AutoModelForTokenClassification.from_pretrained(source)
    model.eval()

    class LogitsOnly(torch.nn.Module):
        def __init__(self, inner: torch.nn.Module) -> None:
            super().__init__()
            self.inner = inner

        def forward(self, input_ids: torch.Tensor, attention_mask: torch.Tensor) -> torch.Tensor:
            return self.inner(input_ids=input_ids, attention_mask=attention_mask).logits

    # Exemplo de verdade, com padding: o exportador congela o que depende do
    # valor da entrada, e com input_ids/attention_mask só de 1 o ONNX saiu
    # concordando em 8% dos tokens.
    tokenizer = AutoTokenizer.from_pretrained(source)
    example = tokenizer(CHECK_SENTENCES[:2], padding=True, return_tensors="pt")
    batch = torch.export.Dim("batch")
    sequence = torch.export.Dim("sequence", max=4096)
    # O exportador dynamo: o antigo (TorchScript) congela parte da posição
    # relativa do DeBERTa e erra o logit em até 2,6 no mesmo texto.
    torch.onnx.export(
        LogitsOnly(model),
        (example["input_ids"], example["attention_mask"]),
        str(fp32_path),
        input_names=["input_ids", "attention_mask"],
        output_names=["logits"],
        dynamic_shapes={
            "input_ids": {0: batch, 1: sequence},
            "attention_mask": {0: batch, 1: sequence},
        },
        opset_version=18,
        dynamo=True,
        external_data=False,
    )


def quantize(fp32_path: Path, int8_path: Path) -> None:
    from onnxruntime.quantization import QuantType, quantize_dynamic

    # Gather quantiza a tabela de embeddings (128 mil tokens x 768): é dois
    # terços do modelo (565 MB em fp32, 166 MB em int8).
    quantize_dynamic(
        str(fp32_path),
        str(int8_path),
        weight_type=QuantType.QInt8,
        op_types_to_quantize=["MatMul", "Gather"],
    )


def optimize(int8_path: Path, optimized_path: Path) -> None:
    """Otimiza o grafo uma vez, no build: o serviço carrega sem otimizar e sem cópia de peso."""
    import onnxruntime as ort

    options = ort.SessionOptions()
    # EXTENDED, não ALL: o nível ALL troca o layout pela CPU de quem exporta.
    options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_EXTENDED
    options.optimized_model_filepath = str(optimized_path)
    options.add_session_config_entry("session.disable_prepacking", "1")
    ort.InferenceSession(str(int8_path), sess_options=options, providers=["CPUExecutionProvider"])


def save_with_external_data(model_path: Path, out_dir: Path) -> None:
    import onnx
    from onnx.external_data_helper import set_external_data

    model = onnx.load(str(model_path))
    offset = 0
    with (out_dir / EXTERNAL_DATA).open("wb") as data:
        for tensor in model.graph.initializer:
            raw = tensor.raw_data
            if len(raw) < 4096:
                continue
            padding = (-offset) % EXTERNAL_ALIGNMENT
            data.write(b"\0" * padding)
            offset += padding
            data.write(raw)
            set_external_data(tensor, location=EXTERNAL_DATA, offset=offset, length=len(raw))
            tensor.ClearField("raw_data")
            tensor.data_location = onnx.TensorProto.EXTERNAL
            offset += len(raw)
    onnx.save_model(model, str(out_dir / "model.onnx"))


def check_agreement(source: Path, model_dir: Path) -> float:
    """Fração dos tokens em que o ONNX dá o mesmo rótulo que o modelo original.

    O ONNX roda com as opções do serviço (ner.py), as frases num lote com
    padding; o original, uma a uma, sem padding.
    """
    import numpy as np
    import torch
    from transformers import AutoModelForTokenClassification, AutoTokenizer

    from ner import create_session

    model = AutoModelForTokenClassification.from_pretrained(source)
    model.eval()
    tokenizer = AutoTokenizer.from_pretrained(source)
    session = create_session(model_dir / "model.onnx", threads=1)
    batch = tokenizer(CHECK_SENTENCES, padding=True, return_tensors="np")
    (logits,) = session.run(
        ["logits"],
        {"input_ids": batch["input_ids"], "attention_mask": batch["attention_mask"]},
    )
    same = total = 0
    for row, sentence in enumerate(CHECK_SENTENCES):
        encoded = tokenizer(sentence, return_tensors="pt")
        with torch.no_grad():
            expected = model(**encoded).logits.argmax(-1).numpy()[0]
        actual = np.asarray(logits)[row, : expected.size].argmax(-1)
        same += int((actual == expected).sum())
        total += expected.size
    return same / total


def require_agreement(name: str, agreement: float, minimum: float) -> None:
    print(f"concordância ONNX {name} x original: {agreement:.3f}", file=sys.stderr)
    if agreement < minimum:
        sys.exit(f"ONNX {name} concorda em só {agreement:.3f} dos tokens (mínimo {minimum})")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument(
        "--source",
        type=Path,
        help="pasta com os arquivos do modelo já baixados (padrão: baixa a revisão fixa)",
    )
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory() as workdir:
        work = Path(workdir)
        source = args.source or download(work / "source")
        verify(source)

        fp32_dir = work / "fp32"
        fp32_dir.mkdir()
        export(source, fp32_dir / "model.onnx")
        require_agreement("fp32", check_agreement(source, fp32_dir), MIN_EXPORT_AGREEMENT)

        quantize(fp32_dir / "model.onnx", work / "model.int8.onnx")
        shutil.rmtree(fp32_dir)
        optimize(work / "model.int8.onnx", work / "model.optimized.onnx")
        save_with_external_data(work / "model.optimized.onnx", args.out)
        require_agreement("int8", check_agreement(source, args.out), MIN_QUANTIZED_AGREEMENT)

        shutil.copyfile(source / "tokenizer.json", args.out / "tokenizer.json")
        config = json.loads((source / "config.json").read_text(encoding="utf-8"))
        (args.out / "labels.json").write_text(
            json.dumps(config["id2label"], ensure_ascii=False, indent=1), encoding="utf-8"
        )
        (args.out / "MODEL_REVISION").write_text(f"{MODEL_ID}@{REVISION}\n", encoding="utf-8")
    for name in ("model.onnx", EXTERNAL_DATA):
        print(f"{name} sha256 {sha256_of(args.out / name)}", file=sys.stderr)


if __name__ == "__main__":
    main()
