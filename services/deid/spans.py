"""Do rótulo de cada token aos trechos que identificam alguém.

Só biblioteca padrão: é a parte com regra de negócio (quais entidades contam,
palavra inteira, junção de trechos) e roda nos testes sem o modelo. Segue o
filtro medido em evals/deid/openmed_redact.py (PR #172).
"""

from __future__ import annotations

from dataclasses import dataclass
from statistics import fmean
from typing import Iterable, Sequence

# Só o que identifica a pessoa. Idade, quantidade e data comum ficam: "54 anos"
# e "losartana 50 mg" são dado clínico, e o modelo marca os dois (AGE, AMOUNT).
# Cidade também fica (procedência pesa em dengue, febre amarela, Chagas), e
# tratamento ("Dr.", "Sra.", PREFIX) não identifica ninguém.
IDENTITY_ENTITIES = frozenset(
    {
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
)


@dataclass(frozen=True)
class TokenPrediction:
    """Rótulo de um token ("B-FIRSTNAME", "I-STREET", "O") e onde ele está no texto."""

    label: str
    score: float
    start: int
    end: int


@dataclass(frozen=True)
class Entity:
    label: str
    start: int
    end: int
    score: float


def _split_tag(label: str) -> tuple[str, str]:
    if label.startswith("B-"):
        return "B", label[2:]
    if label.startswith("I-"):
        return "I", label[2:]
    return "I", label


def group_tokens(tokens: Sequence[TokenPrediction]) -> list[Entity]:
    """Junta tokens em entidades como o pipeline do transformers com aggregation "simple".

    Um token continua a entidade anterior quando tem o mesmo tipo e não abre
    outra ("B-"). O score da entidade é a média dos tokens; "O" é descartado.
    """
    groups: list[list[TokenPrediction]] = []
    for token in tokens:
        if groups:
            bi, tag = _split_tag(token.label)
            _, last_tag = _split_tag(groups[-1][-1].label)
            if tag == last_tag and bi != "B":
                groups[-1].append(token)
                continue
        groups.append([token])

    entities = []
    for group in groups:
        _, tag = _split_tag(group[0].label)
        if tag == "O":
            continue
        entities.append(
            Entity(
                label=tag,
                start=group[0].start,
                end=group[-1].end,
                score=fmean(token.score for token in group),
            )
        )
    return entities


def to_whole_words(text: str, entity: Entity) -> Entity:
    """Estende o trecho até a palavra inteira e tira o espaço das pontas.

    O modelo às vezes marca só "Edi" de "Edivaldo", e o tokenizador inclui o
    espaço antes da palavra no token.
    """
    start, end = entity.start, entity.end
    while start < end and text[start].isspace():
        start += 1
    while end > start and text[end - 1].isspace():
        end -= 1
    while start > 0 and text[start - 1].isalnum():
        start -= 1
    while end < len(text) and text[end].isalnum():
        end += 1
    return Entity(label=entity.label, start=start, end=end, score=entity.score)


def merge_adjacent(text: str, entities: Iterable[Entity]) -> list[Entity]:
    """Junta trechos que se sobrepõem, ou do mesmo tipo separados só por espaço.

    Sobreposição de tipos diferentes vira um trecho só (fica o primeiro
    rótulo): trocar dois rótulos no mesmo lugar corromperia o texto.
    """
    merged: list[Entity] = []
    for entity in sorted(entities, key=lambda e: (e.start, e.end)):
        previous = merged[-1] if merged else None
        if previous is not None:
            overlapping = entity.start < previous.end
            touching_same_type = (
                previous.label == entity.label and text[previous.end : entity.start].strip() == ""
            )
            if overlapping or touching_same_type:
                merged[-1] = Entity(
                    label=previous.label,
                    start=previous.start,
                    end=max(previous.end, entity.end),
                    score=max(previous.score, entity.score),
                )
                continue
        merged.append(entity)
    return merged


def identity_entities(
    text: str, tokens: Sequence[TokenPrediction], threshold: float
) -> list[Entity]:
    """Entidades de identidade acima do limiar, em palavra inteira e sem sobreposição."""
    kept = [
        to_whole_words(text, entity)
        for entity in group_tokens(tokens)
        if entity.label in IDENTITY_ENTITIES and entity.score >= threshold
    ]
    return merge_adjacent(text, (entity for entity in kept if entity.end > entity.start))


def utf16_offsets(text: str) -> list[int]:
    """Posição UTF-16 de cada índice do texto (Python conta code points; o JavaScript, UTF-16).

    `offsets[i]` é a posição do i-ésimo caractere; `offsets[len(text)]`, o fim.
    """
    offsets = [0] * (len(text) + 1)
    position = 0
    for index, char in enumerate(text):
        offsets[index] = position
        position += 2 if ord(char) > 0xFFFF else 1
    offsets[len(text)] = position
    return offsets


def windows_of(total: int, window: int, overlap: int) -> list[tuple[int, int]]:
    """Janelas [início, fim) que cobrem `total` tokens, vizinhas repetindo `overlap` de cada lado."""
    if total <= window:
        return [(0, total)]
    step = window - 2 * overlap
    windows = []
    start = 0
    while True:
        end = min(start + window, total)
        windows.append((start, end))
        if end == total:
            return windows
        start += step


def best_window(index: int, windows: list[tuple[int, int]]) -> tuple[int, int]:
    """A janela em que o token está mais longe da borda, e a posição dele nela."""
    best = (0, index - windows[0][0])
    best_margin = -1
    for window_index, (start, end) in enumerate(windows):
        if start <= index < end:
            margin = min(index - start, end - 1 - index)
            if margin > best_margin:
                best, best_margin = (window_index, index - start), margin
    return best
