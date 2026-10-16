<!--
Título: <tipo>(<escopo>): <resumo> (CC-xxx)
Ex.: feat(copiloto): local de plantão salvo no perfil (CC-602)
Se o PR não pode entrar antes de algo (chave, decisão, cessão), diga aqui no topo.
-->

## What

<!-- O que muda, em itens curtos. -->

## Why

<!-- O problema que resolve. Cite a história: CC-xxx. -->

## Testing

<!-- Comandos que você rodou e o resultado, com o número de testes. -->

## Flags

<!-- Cada flag nova: nome, padrão e como ligar. Apague a seção se não houver. -->

## Pendências

<!-- Migration a aplicar, chave, decisão ou revisão médica. Apague a seção se não houver. -->

## Checklist

- [ ] CI verde
- [ ] Testes novos cobrem a mudança
- [ ] Nenhum dado de paciente em código, teste, fixture, log, URL, analytics ou Sentry
- [ ] Migration nova e datada, revisada, sem editar migration antiga (ou: não há migration)
- [ ] Mudança clínica ou de IA atrás de flag com padrão seguro, documentada no `.env.example` e no runbook (ou: não se aplica)
- [ ] Conteúdo clínico com os rótulos `conteúdo clínico` e `revisão clínica` e o ok de um médico (ou: não se aplica)
- [ ] História `CC-xxx` citada no título e no corpo (ou: PR sem história)
