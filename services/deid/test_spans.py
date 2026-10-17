"""Regras de spans.py, sem o modelo: `python -m unittest discover services/deid`."""

import unittest

from spans import (
    Entity,
    TokenPrediction,
    best_window,
    group_tokens,
    identity_entities,
    merge_adjacent,
    to_whole_words,
    utf16_offsets,
    windows_of,
)


def token(label: str, text: str, piece: str, score: float = 0.9, start_at: int = 0) -> TokenPrediction:
    start = text.index(piece, start_at)
    return TokenPrediction(label=label, score=score, start=start, end=start + len(piece))


class GroupTokensTest(unittest.TestCase):
    def test_junta_b_e_i_do_mesmo_tipo_como_o_aggregation_simple(self) -> None:
        text = "Rua das Flores 12"
        tokens = [
            token("B-STREET", text, "Rua", 0.9),
            token("I-STREET", text, " das", 0.7),
            token("I-STREET", text, " Flores", 0.8),
            token("B-BUILDINGNUMBER", text, " 12", 0.6),
        ]

        entities = group_tokens(tokens)

        self.assertEqual([(e.label, e.start, e.end) for e in entities], [("STREET", 0, 14), ("BUILDINGNUMBER", 14, 17)])
        self.assertAlmostEqual(entities[0].score, 0.8)

    def test_b_novo_abre_outra_entidade_e_o_e_descartado(self) -> None:
        text = "Ana Lima e Pedro"
        tokens = [
            token("B-FIRSTNAME", text, "Ana"),
            token("B-LASTNAME", text, " Lima"),
            token("O", text, " e"),
            token("B-FIRSTNAME", text, " Pedro"),
        ]

        self.assertEqual([e.label for e in group_tokens(tokens)], ["FIRSTNAME", "LASTNAME", "FIRSTNAME"])


class WholeWordsTest(unittest.TestCase):
    def test_estende_ate_a_palavra_inteira_sem_o_espaco_das_pontas(self) -> None:
        text = "trazida por Edivaldo hoje"
        partial = Entity("FIRSTNAME", text.index(" Edi"), text.index("valdo"), 0.9)

        whole = to_whole_words(text, partial)

        self.assertEqual(text[whole.start : whole.end], "Edivaldo")

    def test_espaco_na_frente_nao_puxa_a_palavra_anterior(self) -> None:
        text = "Dona Maria"
        whole = to_whole_words(text, Entity("FIRSTNAME", 4, 10, 0.9))  # " Maria"

        self.assertEqual(text[whole.start : whole.end], "Maria")


class MergeTest(unittest.TestCase):
    def test_junta_sobreposicao_e_vizinho_do_mesmo_tipo(self) -> None:
        text = "Ana Paula Gomes, Rua X"
        merged = merge_adjacent(
            text,
            [
                Entity("FIRSTNAME", 0, 3, 0.6),
                Entity("FIRSTNAME", 4, 9, 0.9),
                Entity("LASTNAME", 8, 15, 0.7),
                Entity("STREET", 17, 22, 0.8),
            ],
        )

        self.assertEqual([(e.label, e.start, e.end) for e in merged], [("FIRSTNAME", 0, 15), ("STREET", 17, 22)])
        self.assertEqual(merged[0].score, 0.9)


class IdentityEntitiesTest(unittest.TestCase):
    def test_so_identidade_acima_do_limiar(self) -> None:
        text = "Maria, 54 anos, de Recife, 50 mg"
        tokens = [
            token("B-FIRSTNAME", text, "Maria", 0.95),
            token("B-AGE", text, " 54", 0.99),
            token("B-CITY", text, " Recife", 0.99),
            token("B-AMOUNT", text, " 50", 0.99),
            token("B-LASTNAME", text, " mg", 0.3),
        ]

        entities = identity_entities(text, tokens, threshold=0.5)

        self.assertEqual([(e.label, text[e.start : e.end]) for e in entities], [("FIRSTNAME", "Maria")])


class Utf16Test(unittest.TestCase):
    def test_emoji_conta_dois(self) -> None:
        text = "a😷b"
        self.assertEqual(utf16_offsets(text), [0, 1, 3, 4])


class WindowsTest(unittest.TestCase):
    def test_texto_curto_e_uma_janela(self) -> None:
        self.assertEqual(windows_of(10, 256, 32), [(0, 10)])

    def test_janelas_cobrem_tudo_com_sobreposicao(self) -> None:
        windows = windows_of(600, 256, 32)

        self.assertEqual(windows, [(0, 256), (192, 448), (384, 600)])

    def test_cada_token_fica_com_a_janela_em_que_esta_mais_longe_da_borda(self) -> None:
        windows = windows_of(600, 256, 32)

        self.assertEqual(best_window(10, windows), (0, 10))
        self.assertEqual(best_window(250, windows), (1, 58))
        self.assertEqual(best_window(599, windows), (2, 215))


if __name__ == "__main__":
    unittest.main()
