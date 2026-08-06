# Fontes embutidas no PDF

Mesmas famílias usadas na identidade visual do app (`web/src/app/layout.tsx`,
carregadas via `next/font/google`), baixadas do repositório oficial
[google/fonts](https://github.com/google/fonts) para embutir nos PDFs gerados
pelo `document-pdf.builder.ts` — garante que o documento assinado tenha a
mesma tipografia da tela em que foi revisado.

| Arquivo                        | Família           | Uso no PDF                                   |
| ------------------------------- | ----------------- | --------------------------------------------- |
| `DMSans-Variable.ttf`           | DM Sans            | Corpo de texto (parágrafos)                   |
| `DMSerifDisplay-Regular.ttf`    | DM Serif Display   | Título do documento e letra S/O/A/P do SOAP   |
| `IBMPlexMono-Regular.ttf`       | IBM Plex Mono      | Metadados, código do documento, rodapé/hash   |
| `IBMPlexMono-SemiBold.ttf`      | IBM Plex Mono      | Rótulos de seção (uppercase)                  |

Todas licenciadas sob a [SIL Open Font License 1.1](https://openfontlicense.org/)
— textos completos em `OFL-*.txt` nesta pasta, conforme exigido pela licença.
