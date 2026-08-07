# Manual do Usuário — Copiloto Clínico de Plantão

**Público-alvo:** Médicos, equipe de compliance e administradores da instituição.
**Versão:** R0

---

## 1. O que é o Copiloto Clínico

O Copiloto Clínico é um assistente de IA para médicos em plantão. Você narra ou digita o caso do paciente, e o sistema:

- Analisa o quadro clínico com base em diretrizes médicas reais (ACLS, ATLS, protocolos institucionais);
- Sinaliza red flags e faz perguntas bloqueadoras antes de sugerir qualquer conduta;
- Gera documentos prontos (SOAP, SBAR, prescrição, alta, atestado) para você revisar e confirmar;
- Registra tudo numa trilha de auditoria com hash — cada documento confirmado é rastreável e imutável, atendendo às exigências do CFM.

**Princípio central: a conduta é sempre sua.** O Copiloto nunca confirma um documento sozinho — ele só sugere, cita a evidência, e espera sua revisão humana.

---

## 2. Criando sua conta e fazendo login

### Primeiro acesso

1. Acesse a tela de login e clique em **"Criar conta com CRM"**.
2. Preencha nome, e-mail, senha (mínimo 8 caracteres — o sistema mostra a força da senha), UF e número do CRM.
3. Aceite a Política de Privacidade (processamento de dados conforme a LGPD).
4. Clique em **"Criar conta com CRM"**.

> ⚠️ Seu CRM passa por verificação. **Até a aprovação, seus documentos ficam com o selo "CRM pendente" — mas você já pode usar o sistema normalmente** enquanto isso.

### Login no dia a dia

Você pode entrar de duas formas:
- **CRM** (UF + número): pensado para acesso rápido no hospital;
- **E-mail e senha**.

O toggle **"Manter sessão neste dispositivo do hospital"** mantém você logado por mais tempo — útil em terminais compartilhados de plantão. Sua sessão expira depois de um período de inatividade por segurança; se isso acontecer, uma mensagem clara de "sessão expirada" aparece e basta logar de novo.

---

## 3. Visão geral do Plantão (Dashboard)

Ao entrar, você cai na tela **Plantão** — seu painel do dia:

| Elemento | O que mostra |
|---|---|
| **Aguardando sua revisão** | Quantos casos têm análise pronta esperando você confirmar um documento |
| **Casos hoje / Rascunhos / Confirmados** | Contadores rápidos do seu movimento no plantão |
| **Fila do plantão** | Lista dos últimos casos, com status (em revisão, rascunho, assinado) e tempo desde a criação |
| **Casos piloto** | Casos de demonstração prontos para treinar o fluxo sem usar um caso real |

Use **"Ver todos os casos"** ou o menu **Casos** para ver o histórico completo.

---

## 4. Registrando um novo caso

Clique em **"Novo caso por voz"** (tela inicial ou botão flutuante) ou **"Digitar"** para começar.

### Captura por voz

1. Toque no microfone.
2. Fale o quadro clínico normalmente, como você narraria para um colega.
3. Toque novamente para parar — o áudio é transcrito automaticamente e inserido no campo de texto (o áudio em si **não é armazenado**, só o texto, para minimização de dados conforme a LGPD).
4. Revise e edite o texto transcrito livremente antes de analisar.

### Captura por texto

Digite o caso diretamente no campo de texto. Use os **modelos de queixa** (dor torácica, dispneia, febre, trauma etc.) para agilizar, se quiser.

### Marcadores antes de analisar

- **Recursos disponíveis**: TC, Labs, UTI, SUS — marque o que está disponível no seu plantão agora. Isso muda as recomendações (ex: uma conduta que dependa de TC não é sugerida se você não marcar TC disponível).
- **Red flags**: Imunossuprimido, Gestante, Anticoagulante (críticas), Pediátrico, 65+ (atenção), Alergia (informativa). Marcar esses chips garante que o Copiloto sempre considere esses fatores de risco na análise, mesmo que você não os tenha mencionado explicitamente no texto.

Quando o campo mostrar **"Pronto para analisar"**, clique em **"Analisar com Copiloto"**.

> 🔒 **Nunca digite nome completo, CPF ou outros identificadores diretos do paciente no texto livre.** O sistema filtra PII automaticamente antes de enviar à IA, mas a prática correta é usar apenas o identificador interno do caso (prontuário/etiqueta), nunca dados que identifiquem a pessoa.

---

## 5. Entendendo a análise do Copiloto

Depois de analisar, você vê:

- **Raciocínio clínico**: o resumo do que a IA entendeu do caso.
- **Red flags**: achados críticos/de atenção, cada um com uma ação recomendada.
- **Plano sugerido**: recomendações concretas, cada uma **citando a diretriz de origem** (fonte, versão, trecho exato) com um nível de confiança. Recomendações fora da estabilização imediata vêm marcadas como *preliminares* quando há um red flag crítico em aberto — elas pedem mais confirmação antes de virarem conduta definitiva.
- **Diagnósticos diferenciais**: hipóteses a considerar, com o que ajudaria a distingui-las.
- **Perguntas bloqueadoras** ("O copiloto precisa saber"): perguntas que mudam a conduta e que o sistema não conseguiu responder sozinho a partir do texto.

### Quando aparece "incerteza"

Se o Copiloto não encontra diretriz aplicável na base (ou a evidência é insuficiente), ele **se recusa a inventar uma recomendação** — mostra `uncertainty` e explica o motivo. Isso é uma proteção de segurança clínica, não um erro do sistema.

### Respondendo perguntas e reanalisando

Responda as perguntas bloqueadoras nos campos apresentados e clique em **"Reanalisar com as respostas"**. O Copiloto gera uma nova análise já considerando suas respostas, podendo transformar recomendações preliminares em definitivas.

---

## 6. Gerando e revisando documentos

Na aba **Documento**, escolha o tipo a gerar:

| Tipo | Uso |
|---|---|
| **SOAP** | Evolução clínica estruturada |
| **SBAR** | Comunicação/passagem de plantão |
| **Prescrição** | Receituário |
| **Alta** | Resumo e orientações de alta |
| **Atestado** | Atestado médico |

O documento é gerado a partir da análise confirmada. **Você pode editar o conteúdo livremente antes de confirmar** — o Copiloto propõe, você decide o texto final.

---

## 7. Confirmando documentos

Ao clicar em **"Confirmar"**, o sistema avisa: *"Tem certeza que deseja confirmar este documento? Esta ação é irreversível e ficará registrada na trilha de auditoria."*

O que acontece na confirmação:
- O documento recebe um **hash SHA-256** e é registrado numa cadeia de auditoria **append-only** (nada pode ser alterado ou apagado depois, nem por um administrador do banco de dados);
- Fica associado a você como médico responsável, com data/hora;
- Se a análise tinha sinalizado incerteza, você confirma ciente disso — a responsabilidade final da conduta é sempre do médico.

Depois de confirmado, o documento fica disponível para download/impressão a partir da tela de documentos do caso.

---

## 8. Base de Diretrizes Clínicas

No menu **Diretrizes**, você pode buscar protocolos diretamente (ex: "sepse", "AVC", "trauma"):

- **Resposta direta**: um resumo já citando as fontes, com botão para copiar com citações ou usar no caso atual;
- **Fontes**: lista de trechos de diretrizes (públicas ou institucionais do seu hospital), com versão e data de validade.

Use os filtros de especialidade (Trauma, Cardíaco, Pediátrico, Neuro, Geral) ou o toggle **"Só protocolos do hospital"** para restringir a busca.

> Usuários com permissão de **curadoria** (compliance/admin) veem uma aba **Curadoria**, onde novos trechos de diretriz ingeridos ficam pendentes de aprovação antes de entrarem na base de busca — nada vira evidência citável sem revisão humana.

---

## 9. Configurações e perfil

No menu de perfil (canto superior direito), acesse **Configurações**, dividida em 3 abas:

- **Perfil**: nome, dados de contato;
- **Segurança**: troca de senha, sessões ativas;
- **Privacidade**: gestão de consentimento LGPD.

---

## 10. Privacidade e LGPD

- Todo texto livre passa por um filtro de PII antes de ser enviado à IA;
- O identificador do paciente (`patientRef`) que você digita nunca é enviado ao provedor de IA — é redigido automaticamente;
- Você pode exportar ou solicitar a exclusão dos seus dados a partir da tela de Privacidade, conforme seus direitos na LGPD.

---

## 11. Papéis de acesso

| Papel | O que vê a mais |
|---|---|
| **Médico** | Fluxo padrão: casos, diretrizes, documentos |
| **Compliance** | Acesso ao Console Administrativo: fila de verificações de CRM, curadoria de diretrizes |
| **Admin** | Tudo acima + gestão de usuários, analytics, configurações do sistema |

O acesso ao Console Administrativo (`/admin`) é restrito — médicos que tentarem acessar são redirecionados de volta ao Plantão com um aviso.

---

## 12. Perguntas frequentes

**Minha sessão caiu no meio do plantão, e agora?**
É normal — por segurança, a sessão expira depois de um tempo. Basta logar de novo; nenhum caso salvo é perdido.

**O ditado por voz não transcreveu nada / veio errado?**
Confira se o navegador tem permissão de microfone (tanto do site quanto do sistema operacional) e se o microfone correto está selecionado. Em caso de dúvida, use "Digitar" como alternativa — o resultado final é idêntico.

**Por que a análise disse que não tem recomendação?**
O sistema só recomenda o que consegue citar de uma diretriz real. Se a base não tem evidência para aquele cenário específico, ele avisa em vez de inventar — reporte à equipe se achar que uma diretriz relevante está faltando na base.

**Posso desfazer um documento confirmado?**
Não — confirmação é irreversível por design (trilha de auditoria imutável, exigência CFM). Gere um novo documento/aditamento se precisar corrigir algo depois da confirmação.

**Meu CRM ainda está "pendente", isso me impede de usar o sistema?**
Não. Você usa normalmente; os documentos apenas carregam o selo "CRM pendente" até a verificação ser concluída pela equipe de compliance.

---

## Suporte

Em caso de dúvidas não cobertas aqui, contate a equipe de engenharia: rodrigo.tozato@strivium.com.br.
