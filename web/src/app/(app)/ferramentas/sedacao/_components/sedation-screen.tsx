'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { ArrowCounterClockwise, ArrowLeft, ArrowRight, Pill } from '@phosphor-icons/react';
import { SCREEN_INFO, SEDATION_PROVENANCE } from '@clinical-tools/sedation/content';
import { buildSedationChartNote, deriveSedation } from '@clinical-tools/sedation/derive';
import {
  hasSedationProgress,
  INITIAL_SEDATION_STATE,
  parseSedationState,
  sedationReducer,
  type SedationAction,
  type SedationState,
} from '@clinical-tools/sedation/state';
import { CopyToChartButton } from '@/components/domain/clinical-tools/copy-to-chart-button';
import { DecisionSupportNotice } from '@/components/domain/clinical-tools/decision-support-notice';
import { ContentProvenanceNote } from '@/components/domain/clinical-tools/reference-section';
import { Page } from '@/components/layout/page';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { useToolFavorites } from '@/lib/tool-favorites';
import { FavoriteButton } from '../../_components/tool-entries';
import { SedationBlockView, type BlockContext } from './sedation-blocks';
import { Trail } from './sedation-parts';
import { useToolSession, useToolWeight } from '@/lib/tool-session';

const TOOL_NAME = 'Sedação procedimental e agitação';

/** Ações que trocam de tela: depois delas a página volta ao topo e o foco vai para o título. */
const NAVIGATION = new Set<SedationAction['type']>(['choose', 'advance', 'back', 'reset']);

/**
 * /ferramentas/sedacao (CC-328): o SedaPath do ANY no design system. Via e
 * dose pelo grau de colaboração, urgência e sedação recente; toda conta,
 * texto clínico e regra vêm do motor (`@clinical-tools/sedation`), e a tela
 * guarda o estado na aba e desenha os blocos que ele manda.
 */
export function SedationScreen() {
  const favorites = useToolFavorites();
  const [state, setState] = useToolSession<SedationState>(
    'sedacao',
    parseSedationState,
    () => INITIAL_SEDATION_STATE,
  );
  const [weight, setWeight] = useToolWeight();
  const view = useMemo(() => deriveSedation(state, weight), [state, weight]);
  const note = useMemo(() => buildSedationChartNote(state, weight), [state, weight]);

  const headingRef = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);
  useEffect(() => {
    // Na primeira pintura o foco fica onde o navegador pôs; depois de cada
    // troca de tela ele vai para o título, para teclado e leitor de tela.
    if (!moved.current) return;
    moved.current = false;
    headingRef.current?.focus();
  }, [view.screen, state.path.length]);

  const dispatch = useCallback(
    (action: SedationAction) => {
      setState((current) => sedationReducer(current, action));
      if (NAVIGATION.has(action.type)) {
        moved.current = true;
        window.scrollTo?.({ top: 0 });
      }
    },
    [setState],
  );

  const restart = useCallback(() => {
    dispatch({ type: 'reset' });
    setWeight('');
  }, [dispatch, setWeight]);

  const context: BlockContext = { state, dispatch, weight, onWeightChange: setWeight };
  const inProgress = hasSedationProgress(state) || weight.trim() !== '';

  return (
    <Page width="narrow">
      <PageHeader
        icon={Pill}
        iconTone="blue"
        title={TOOL_NAME}
        description="Via e dose pelo grau de colaboração, urgência e sedação recente."
        actions={
          <FavoriteButton favoriteKey="tool:sedacao" name={TOOL_NAME} favorites={favorites} />
        }
      />
      <div className="flex flex-col gap-3">
        <DecisionSupportNotice />
        <Trail path={view.path} />
      </div>

      <section aria-labelledby="sedacao-tela" className="flex flex-col gap-4">
        <h2
          id="sedacao-tela"
          ref={headingRef}
          tabIndex={-1}
          className="text-xl font-semibold text-foreground focus-visible:outline-none"
        >
          {SCREEN_INFO[view.screen].title}
        </h2>
        {view.blocks.map((block, index) => (
          <SedationBlockView key={`${block.kind}-${index}`} block={block} context={context} />
        ))}

        <div className="flex flex-wrap gap-2 border-t border-border pt-4">
          {view.path.length > 1 ? (
            <Button type="button" variant="outline" onClick={() => dispatch({ type: 'back' })}>
              <ArrowLeft aria-hidden="true" />
              Voltar
            </Button>
          ) : null}
          {view.next ? (
            <Button type="button" className="flex-1" onClick={() => dispatch({ type: 'advance' })}>
              {view.next.label}
              <ArrowRight aria-hidden="true" />
            </Button>
          ) : null}
          {view.final ? (
            <Button type="button" className="flex-1" onClick={restart}>
              <ArrowCounterClockwise aria-hidden="true" />
              Novo paciente
            </Button>
          ) : inProgress ? (
            <Button type="button" variant="ghost" onClick={restart}>
              <ArrowCounterClockwise aria-hidden="true" />
              Novo paciente
            </Button>
          ) : null}
        </div>
      </section>

      <footer className="flex flex-col gap-3 border-t border-border pt-4">
        {note ? <CopyToChartButton text={note} /> : null}
        <ContentProvenanceNote provenance={SEDATION_PROVENANCE} />
      </footer>
    </Page>
  );
}
