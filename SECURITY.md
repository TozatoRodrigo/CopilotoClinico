# Segurança

O Copiloto Clínico trata dado de saúde. Uma falha de segurança aqui pode
expor paciente e médico, então ela é tratada em privado e antes de qualquer
outra tarefa.

## Como reportar uma vulnerabilidade

Não abra issue nem PR público sobre a falha, e não comente sobre ela em canal
compartilhado.

1. Fale direto com o mantenedor, Rodrigo Tozato (@TozatoRodrigo), por um canal
   privado que você já usa com ele.
2. Se a aba **Security** do repositório oferecer "Report a vulnerability" ou um
   rascunho de security advisory, use-a. Hoje o repositório é privado no plano
   gratuito do GitHub, e esses recursos podem não aparecer: nesse caso, o
   contato direto é o caminho.
3. Descreva o que encontrou, como reproduzir, o que fica exposto e desde
   quando, se souber. Mande trechos de código, rotas e ids, nunca o dado
   exposto.

O mantenedor confirma o recebimento, avalia o impacto e combina com você a
correção e o que pode ser dito depois.

## O que não fazer

- Não ponha dado real de paciente em issue, PR, commit, teste, fixture, log,
  captura de tela ou mensagem. Isso vale também para "só um exemplo" ou para o
  dado de um caso já anonimizado à mão.
- Não teste a falha contra a produção além do mínimo para confirmá-la, e nunca
  com dado de outro médico.
- Não copie chave, token, senha ou `.env` para o relato. Se uma chave vazou,
  diga qual e onde: o mantenedor a troca.

## O que já existe

- [docs/runbook.md](docs/runbook.md), seção "Logs de nível ERROR que exigem
  atenção imediata": o que fazer quando a cadeia de auditoria rompe, a
  retenção de áudio falha ou aparece tentativa de injeção. Em suspeita de
  adulteração, o roteiro é isolar o sistema, investigar os registros e acionar
  o DPO.
- [docs/compliance/LGPD.md](docs/compliance/LGPD.md): que dado existe, onde
  fica, por quanto tempo e quais suboperadores o recebem.
- [docs/compliance/DPA_PROVIDER.md](docs/compliance/DPA_PROVIDER.md): situação
  dos contratos de tratamento de dados com os provedores de IA.

O repositório ainda não tem um plano formal de resposta a incidente com
notificação à ANPD e aos titulares. Até ele existir, qualquer suspeita de
vazamento de dado pessoal vai direto ao mantenedor, que decide a comunicação.
