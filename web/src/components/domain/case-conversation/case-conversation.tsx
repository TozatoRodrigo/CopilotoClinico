"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowsClockwise, WarningCircle } from "@phosphor-icons/react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Disclosure } from "@/components/ui/disclosure";
import { Page } from "@/components/layout/page";
import { useCaseConversation, type CaseConversation as Conversation } from "@/hooks/use-case-conversation";
import { useMessages } from "@/lib/messages/use-messages";
import { useEncounterDetail } from "@/lib/clinical-queries";
import { caseContext } from "@/lib/practice-sites";
import type { Messages } from "@/lib/messages";
import {
  COMPLEMENT_QUESTION_ID,
  fromIntakeQuestion,
  UNDERSTANDING_CORRECTION_QUESTION_ID,
} from "@/lib/case-conversation";
import type { DemoCasePreset } from "@/lib/demo-case-presets";
import type { CaseUnderstanding, ConversationTurn, IntakeAnswerValue, IntakeView } from "@/lib/types";
import { AnalysisView } from "./analysis-view";
import { CaseComposer } from "./case-composer";
import { ConversationComposer } from "./conversation-composer";
import { ConversationSkeleton } from "./conversation-skeleton";
import { QuestionCard, type QuestionAnswer } from "./question-card";
import { CopilotMessage, PhysicianMessage, TypingLine } from "./thread-message";

/** Respostas que não respondem a uma pergunta: o texto do médico fala por si. */
const FREE_TEXT_IDS = new Set([COMPLEMENT_QUESTION_ID, UNDERSTANDING_CORRECTION_QUESTION_ID]);

function answerValue(answer: QuestionAnswer): { value: IntakeAnswerValue; label: string } {
  if (answer.kind === "choice" || answer.kind === "unknown") {
    return { value: answer.value, label: answer.value };
  }
  return { value: answer.value, label: answer.label };
}

/**
 * ADR-014 — Copiloto guiado: o caso inteiro numa conversa só. O médico manda
 * o caso; o Copiloto diz o que entendeu e, se faltar algo que muda a
 * conduta, pergunta — uma coisa por vez, no máximo 3 — antes de montar o
 * plano. Paciente instável e caso completo vão direto ao plano. As
 * perguntas que a decisão deixa depois do plano seguem no mesmo fio.
 */
export function CaseConversation({
  encounterId,
  demoPreset,
  startNew = false,
}: {
  encounterId: string;
  demoPreset: DemoCasePreset | null;
  /** "Reanalisar": abre o editor para um relato novo mesmo com conversa anterior. */
  startNew?: boolean;
}) {
  const messages = useMessages();
  const router = useRouter();
  const conversation = useCaseConversation(encounterId);
  // CC-602 — o relato começa com o contexto com que o caso nasceu (o local
  // de plantão escolhido ao criar o caso).
  const encounterQuery = useEncounterDetail(encounterId);
  const [composingNew, setComposingNew] = useState(startNew);

  if (conversation.phase === "loading") return <ConversationSkeleton />;

  if (conversation.loadError && !conversation.conversation) {
    return (
      <Page width="narrow">
        <Alert variant="destructive">
          <WarningCircle weight="fill" />
          <AlertTitle>{messages.errors.analysisLoadTitle}</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>{conversation.loadError}</span>
            <Button variant="outline" size="sm" onClick={conversation.reload}>
              {messages.common.actions.tryAgain}
            </Button>
          </AlertDescription>
        </Alert>
      </Page>
    );
  }

  const composing = conversation.phase === "compose" || composingNew;
  if (composing && !conversation.pendingCase) {
    // Sem o caso ainda, o relato não sabe o contexto; caso que não carrega
    // não trava o relato (começa sem nada marcado, como antes).
    if (encounterQuery.isPending) return <ConversationSkeleton />;
    return (
      <Page width="narrow" className="gap-6">
        <CaseComposer
          encounterId={encounterId}
          demoPreset={demoPreset}
          initialContext={caseContext(encounterQuery.data?.context, demoPreset?.context)}
          sending={conversation.startingCase}
          error={conversation.startError}
          onSubmit={async (input) => {
            const result = await conversation.startCase(input);
            if (result === "started" && composingNew) {
              setComposingNew(false);
              router.replace(`/encounters/${encounterId}/conversation`);
            }
            return result;
          }}
        />
      </Page>
    );
  }

  return <ConversationThread encounterId={encounterId} conversation={conversation} />;
}

function ConversationThread({
  encounterId,
  conversation,
}: {
  encounterId: string;
  conversation: Conversation;
}) {
  const messages = useMessages();
  const copy = messages.conversation;
  const [correcting, setCorrecting] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const latestPlanRef = useRef<HTMLDivElement>(null);

  const { intake, turns, followUps, phase } = conversation;
  const caseText =
    conversation.pendingCase?.caseText ?? intake?.caseText ?? turns[0]?.caseText ?? null;
  const answeredFollowUps = followUps.questions.filter((question) => question.id in followUps.answers);

  // Pergunta nova ou mensagem nova: a conversa desce até ela. Plano novo: o
  // topo do plano, não o fim (o médico lê a hipótese e o "Fazer agora"
  // primeiro). As perguntas de depois do plano ficam dentro dele ("Falta
  // saber"): responder uma não leva a tela para o fim da página.
  const showingPlan = phase === "plan" && !conversation.rebuilding;
  const scrollKey = [
    phase,
    intake?.answers.length,
    intake?.pendingQuestionId,
    conversation.rebuilding,
    conversation.rebuildUnderstanding !== null,
  ].join("|");
  useEffect(() => {
    if (showingPlan) return;
    bottomRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [scrollKey, showingPlan]);
  useEffect(() => {
    if (turns.length > 0) latestPlanRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [turns.length]);

  return (
    <Page width="narrow" className="gap-6">
      <div className="flex flex-col gap-6" aria-label={copy.title}>
        {caseText && <PhysicianMessage author={copy.you}>{caseText}</PhysicianMessage>}

        {conversation.pendingCase && (
          <CopilotMessage author={copy.copilot}>
            <TypingLine label={copy.reading} />
          </CopilotMessage>
        )}

        {intake && (
          <IntakeThread
            intake={intake}
            conversation={conversation}
            messages={messages}
            onCorrect={() => setCorrecting(true)}
          />
        )}

        {phase === "planning" && (
          <CopilotMessage author={copy.copilot}>
            <TypingLine label={copy.buildingPlan} hint={copy.buildingPlanHint} />
            {conversation.stream.status === "streaming" && (
              <StreamingUnderstanding
                understanding={conversation.stream.understanding}
                label={copy.understood}
              />
            )}
          </CopilotMessage>
        )}

        {phase === "plan_failed" && (
          <Alert variant="destructive">
            <WarningCircle weight="fill" />
            <AlertTitle>{copy.planFailed}</AlertTitle>
            <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
              {conversation.planError !== copy.planFailed && <span>{conversation.planError}</span>}
              <Button variant="outline" size="sm" onClick={conversation.retryPlan}>
                <ArrowsClockwise weight="bold" />
                {copy.retryPlan}
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {turns.map((turn, index) => {
          const isLatest = index === turns.length - 1;
          const pendingQuestions =
            isLatest && !conversation.rebuilding && followUps.pending ? (
              <>
                {answeredFollowUps.map((question) => (
                  <AnsweredQuestion
                    key={question.id}
                    question={question.question}
                    answer={followUps.answers[question.id]?.label ?? ""}
                    author={copy.you}
                  />
                ))}
                <QuestionCard
                  key={followUps.pending.id}
                  question={followUps.pending}
                  onAnswer={(answer) => {
                    const { value, label } = answerValue(answer);
                    if (!followUps.pending) return;
                    conversation.answerFollowUp(
                      followUps.pending.id,
                      typeof value === "object" ? label : value,
                      label,
                    );
                  }}
                />
                {conversation.isLastAllowedTurn && (
                  <p className="text-[0.8125rem] text-muted-foreground">{copy.lastRound}</p>
                )}
              </>
            ) : undefined;
          return (
            <div key={turn.interactionId} className="flex flex-col gap-6">
              {index > 0 && <TurnAnswers turn={turn} author={copy.you} />}
              {isLatest ? (
                <div ref={latestPlanRef} className="scroll-mt-16">
                  <AnalysisView
                    encounterId={encounterId}
                    turn={turn}
                    maxTurns={conversation.maxTurns}
                    current
                    hasPendingQuestion={followUps.pending !== null}
                    pendingQuestions={pendingQuestions}
                    correction={
                      conversation.canRespond
                        ? {
                            onSubmit: conversation.correctUnderstanding,
                            submitting: conversation.rebuilding,
                          }
                        : undefined
                    }
                  />
                </div>
              ) : (
                <Disclosure title={copy.previousPlan(turn.turnIndex + 1)}>
                  <AnalysisView
                    encounterId={encounterId}
                    turn={turn}
                    maxTurns={conversation.maxTurns}
                    current={false}
                    hasPendingQuestion={false}
                  />
                </Disclosure>
              )}
            </div>
          );
        })}

        {/* A reanálise por streaming mostra o entendimento refeito assim que
            chega, como no primeiro plano; a rodada anterior fica acima até a
            nova chegar. */}
        {conversation.rebuilding && (
          <CopilotMessage author={copy.copilot}>
            <TypingLine label={copy.rebuildingPlan} hint={copy.buildingPlanHint} />
            <StreamingUnderstanding
              understanding={conversation.rebuildUnderstanding}
              label={copy.understood}
            />
          </CopilotMessage>
        )}

        {conversation.respondError && !conversation.rebuilding && (
          <Alert variant="destructive">
            <WarningCircle weight="fill" />
            <AlertTitle>{messages.copilot.reanalyze.errorTitle}</AlertTitle>
            <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
              <span>{conversation.respondError}</span>
              <Button variant="outline" size="sm" onClick={conversation.retryRespond}>
                <ArrowsClockwise weight="bold" />
                {copy.retryPlan}
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* A margem deixa o fim da conversa acima do campo fixo de baixo
            (e, no celular, da barra de abas). */}
        <div ref={bottomRef} className="scroll-mb-52 md:scroll-mb-40" />
      </div>

      <ThreadComposer
        conversation={conversation}
        correcting={correcting}
        onCorrected={() => setCorrecting(false)}
      />
    </Page>
  );
}

/** As perguntas de antes do plano: "Entendi", a pergunta da vez e as respostas dadas. */
function IntakeThread({
  intake,
  conversation,
  messages,
  onCorrect,
}: {
  intake: IntakeView;
  conversation: Conversation;
  messages: Messages;
  onCorrect: () => void;
}) {
  const copy = messages.conversation;
  const questions = intake.questions.map(fromIntakeQuestion);
  const pending = questions.find((question) => question.id === intake.pendingQuestionId) ?? null;
  const answering = conversation.answeringIntake;
  const asking = intake.status === "asking";

  if (intake.path === "unstable") {
    return (
      <CopilotMessage author={copy.copilot}>
        <Callout tone="red" icon={<WarningCircle weight="fill" />} title={copy.unstableTitle(intake.instabilityFindings.join(", "))}>
          {copy.unstableBody}
        </Callout>
      </CopilotMessage>
    );
  }

  if (intake.path === "complete") {
    return (
      <CopilotMessage author={copy.copilot}>
        {intake.summary && <Understood summary={intake.summary} label={copy.understood} />}
        <p>{copy.complete}</p>
      </CopilotMessage>
    );
  }

  if (intake.path !== "ask") return null;

  return (
    <>
      <CopilotMessage author={copy.copilot}>
        {intake.summary && <Understood summary={intake.summary} label={copy.understood} />}
        {asking && (
          <button
            type="button"
            onClick={onCorrect}
            className="self-start rounded-sm text-[0.8125rem] text-link underline-offset-4 hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none"
          >
            {copy.correct}
          </button>
        )}
        <p>{copy.questionsIntro(questions.length)}</p>
      </CopilotMessage>

      {intake.answers.map((answer) =>
        answer.questionId === UNDERSTANDING_CORRECTION_QUESTION_ID ? (
          <div key={answer.answeredAt} className="flex flex-col gap-4">
            <PhysicianMessage author={copy.you}>{answer.answer}</PhysicianMessage>
            <CopilotMessage author={copy.copilot}>
              <p>{copy.correctionNoted}</p>
            </CopilotMessage>
          </div>
        ) : (
          <AnsweredQuestion
            key={answer.questionId}
            question={answer.question}
            answer={answer.answer}
            author={copy.you}
          />
        ),
      )}

      {answering && !intake.answers.some((answer) => answer.questionId === answering.questionId) && (
        <PhysicianMessage author={copy.you} className="opacity-70">
          {answering.label}
        </PhysicianMessage>
      )}

      {pending && !answering && (
        <CopilotMessage author={copy.copilot}>
          <QuestionCard
            key={pending.id}
            question={pending}
            onAnswer={(answer) => {
              const { value, label } = answerValue(answer);
              void conversation.answerIntake(pending.id, value, label, "tap");
            }}
          />
        </CopilotMessage>
      )}

      {conversation.intakeError && (
        <Alert variant="destructive">
          <WarningCircle weight="fill" />
          <AlertTitle>{messages.errors.title}</AlertTitle>
          <AlertDescription>{conversation.intakeError}</AlertDescription>
        </Alert>
      )}

      {intake.closeReason && intake.closeReason !== "not_needed" && (
        <CopilotMessage author={copy.copilot}>
          <p>
            {intake.closeReason === "urgent_answer"
              ? copy.urgentStop
              : intake.closeReason === "skipped"
                ? copy.skipped
                : copy.allAnswered}
          </p>
        </CopilotMessage>
      )}
    </>
  );
}

/**
 * O entendimento que chega pelo streaming enquanto o plano é montado: uma
 * frase, como o "Entendi:" das perguntas. O entendimento completo fica no
 * plano, em "Ver raciocínio".
 */
function StreamingUnderstanding({
  understanding,
  label,
}: {
  understanding: CaseUnderstanding | null;
  label: string;
}) {
  if (!understanding) return null;
  return (
    <p className="text-[0.9375rem] text-muted-foreground">
      <strong className="font-semibold text-foreground">{label}</strong>{" "}
      {understanding.problemRepresentation}
    </p>
  );
}

function Understood({ summary, label }: { summary: string; label: string }) {
  return (
    <p>
      <strong className="font-semibold">{label}</strong> {summary}
    </p>
  );
}

/** Pergunta já respondida: a pergunta discreta e a resposta do médico ao lado. */
function AnsweredQuestion({
  question,
  answer,
  author,
}: {
  question: string;
  answer: string;
  author: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="pl-9 text-[0.8125rem] text-muted-foreground">{question}</p>
      <PhysicianMessage author={author}>{answer}</PhysicianMessage>
    </div>
  );
}

/** O que o médico informou para gerar esta rodada do plano. */
function TurnAnswers({ turn, author }: { turn: ConversationTurn; author: string }) {
  if (turn.answeredQuestions.length === 0) return null;
  return (
    <PhysicianMessage author={author}>
      <span className="flex flex-col gap-2">
        {turn.answeredQuestions.map((answer) => (
          <span key={answer.questionId} className="flex flex-col">
            {!FREE_TEXT_IDS.has(answer.questionId) && (
              <span className="text-[0.8125rem] text-muted-foreground">{answer.question}</span>
            )}
            <span>{answer.answer}</span>
          </span>
        ))}
      </span>
    </PhysicianMessage>
  );
}

/**
 * O campo de baixo muda com a conversa: responde a pergunta da vez (antes
 * ou depois do plano), corrige o entendimento ou acrescenta algo ao caso.
 */
function ThreadComposer({
  conversation,
  correcting,
  onCorrected,
}: {
  conversation: Conversation;
  correcting: boolean;
  onCorrected: () => void;
}) {
  const messages = useMessages();
  const copy = messages.conversation;
  const { intake, phase, followUps } = conversation;

  const sticky =
    "sticky bottom-[calc(3.25rem+env(safe-area-inset-bottom))] z-20 -mx-4 border-t border-border bg-background px-4 py-3 sm:-mx-8 sm:px-8 md:bottom-0 md:mx-0 md:px-0";

  if (phase === "asking" && intake) {
    const pendingId = intake.pendingQuestionId;
    const answered = intake.answers.filter(
      (answer) => answer.questionId !== UNDERSTANDING_CORRECTION_QUESTION_ID,
    ).length;
    const busy = conversation.answeringIntake !== null || conversation.skippingIntake;
    return (
      <div className={sticky}>
        <ConversationComposer
          key={correcting ? "correcting" : "answering"}
          autoFocus={correcting}
          placeholder={correcting ? copy.correctionPlaceholder : copy.composer.answerPlaceholder}
          disabled={busy}
          onSend={async (text, channel) => {
            if (correcting) {
              const accepted = await conversation.correctIntake(text, channel);
              if (accepted) onCorrected();
              return accepted;
            }
            if (!pendingId) return false;
            return conversation.answerIntake(pendingId, text, text, channel);
          }}
          meta={
            <>
              <span>{copy.progress(Math.min(answered + 1, intake.questions.length), intake.questions.length)}</span>
              <button
                type="button"
                onClick={conversation.skipIntake}
                disabled={busy}
                className="rounded-sm font-medium text-link underline-offset-4 hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none disabled:opacity-50"
              >
                {copy.analyzeNow}
              </button>
            </>
          }
        />
      </div>
    );
  }

  if (phase === "plan" && !conversation.rebuilding) {
    const pending = followUps.pending;
    if (pending) {
      const answered = Object.keys(followUps.answers).length;
      return (
        <div className={sticky}>
          <ConversationComposer
            placeholder={copy.composer.answerPlaceholder}
            disabled={false}
            onSend={(text) => {
              conversation.answerFollowUp(pending.id, text, text);
              return true;
            }}
            meta={
              <>
                <span>{copy.progress(answered + 1, followUps.questions.length)}</span>
                <button
                  type="button"
                  onClick={conversation.finishFollowUps}
                  className="rounded-sm font-medium text-link underline-offset-4 hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none"
                >
                  {answered > 0 ? copy.rebuildNow : copy.keepPlan}
                </button>
              </>
            }
          />
        </div>
      );
    }
    return (
      <div className={sticky}>
        <ConversationComposer
          placeholder={conversation.canRespond ? copy.composer.complementPlaceholder : copy.limitReached}
          disabled={!conversation.canRespond}
          onSend={(text) => {
            conversation.complementCase(text);
            return true;
          }}
        />
      </div>
    );
  }

  return (
    <div className={sticky}>
      <ConversationComposer
        placeholder={phase === "plan_failed" ? copy.planFailed : copy.composer.waitingPlaceholder}
        disabled
        onSend={() => false}
      />
    </div>
  );
}
