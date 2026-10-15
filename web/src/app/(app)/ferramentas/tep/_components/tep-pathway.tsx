'use client';

import { useEffect, useRef } from 'react';
import { STABILITY } from '@clinical-tools/tep/content';
import type { TepPathwayState } from '@clinical-tools/tep/pathway';
import { ClassificationStep } from './classification-step';
import { DiagnosisStep } from './diagnosis-step';
import { ManagementStep } from './management-step';
import { OptionList, StepHeader } from './tep-parts';
import type { TepDispatch } from './tep-state';
import { UnstableStep } from './unstable-step';

/**
 * Roteiro do TEP (aba Roteiro): um passo por vez, como no ANY. O estado é o
 * reducer do motor; a tela só escolhe o passo e manda as ações. Quando o passo
 * ou a pergunta mudam, o foco vai para o título novo (teclado e leitor de
 * tela acompanham), mas não na primeira abertura.
 */
export function TepPathway({ state, dispatch }: { state: TepPathwayState; dispatch: TepDispatch }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const position = `${state.step}:${state.question}`;
  const previous = useRef(position);

  useEffect(() => {
    if (previous.current === position) return;
    previous.current = position;
    headingRef.current?.focus();
  }, [position]);

  switch (state.step) {
    case 'estabilidade':
      return (
        <div className="flex flex-col gap-5">
          <StepHeader
            step="estabilidade"
            title={STABILITY.title}
            description={STABILITY.description}
            headingRef={headingRef}
          />
          <OptionList
            label={STABILITY.title}
            options={[
              { value: 'estavel', label: STABILITY.stable },
              { value: 'instavel', label: STABILITY.unstable },
            ]}
            onSelect={(value) => dispatch({ type: 'estabilidade', stable: value === 'estavel' })}
          />
        </div>
      );
    case 'instavel':
      return <UnstableStep state={state} dispatch={dispatch} headingRef={headingRef} />;
    case 'diagnostico':
      return <DiagnosisStep state={state} dispatch={dispatch} headingRef={headingRef} />;
    case 'classificacao':
      return <ClassificationStep state={state} dispatch={dispatch} headingRef={headingRef} />;
    case 'conduta':
      // O parse da sessão recusa conduta sem categoria; aqui só por tipo.
      return state.category ? (
        <ManagementStep
          state={state}
          category={state.category}
          dispatch={dispatch}
          headingRef={headingRef}
        />
      ) : null;
  }
}
