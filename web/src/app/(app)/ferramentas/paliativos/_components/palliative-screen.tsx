'use client';

import { useCallback, useEffect, useReducer, useRef, type ElementType } from 'react';
import {
  BookOpen,
  CaretLeft,
  CaretRight,
  ChatCircleText,
  FirstAidKit,
  HandHeart,
  Lightbulb,
  MagnifyingGlass,
  Scales,
  Toolbox,
} from '@phosphor-icons/react';
import {
  PALLIATIVE_EXTRAS,
  PALLIATIVE_INTRO,
  PALLIATIVE_MODULES,
  PALLIATIVE_STEPS,
  type PalliativeModule,
  type PalliativeModuleId,
  type PalliativeScreen as Screen,
} from '@clinical-tools/palliative/content';
import { PALLIATIVE_PROVENANCE, PALLIATIVE_TOOL_NAME } from '@clinical-tools/palliative/provenance';
import {
  INITIAL_PALLIATIVE_STATE,
  palliativeReducer,
  parsePalliativeScreen,
} from '@clinical-tools/palliative/state';
import { DecisionSupportNotice } from '@/components/domain/clinical-tools/decision-support-notice';
import { ContentProvenanceNote } from '@/components/domain/clinical-tools/reference-section';
import { Page } from '@/components/layout/page';
import { PageHeader, SectionHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { useToolFavorites } from '@/lib/tool-favorites';
import { cn } from '@/lib/utils';
import { FavoriteButton } from '../../_components/tool-entries';
import {
  CommunicateSection,
  DecideSection,
  IdentifySection,
  MythsSection,
  ReferencesSection,
  SymptomsSection,
} from './guide-sections';
import { ScalesSection } from './scales-section';

const MODULE_ICON: Record<PalliativeModuleId, ElementType> = {
  identificar: MagnifyingGlass,
  decidir: Scales,
  comunicar: ChatCircleText,
  manejar: FirstAidKit,
  ferramentas: Toolbox,
  mitos: Lightbulb,
  referencias: BookOpen,
};

/**
 * Tela no endereço (`#decidir`): o voltar do navegador (e do Android) volta
 * à tela anterior do roteiro em vez de sair da ferramenta.
 */
function useScreenInAddress(open: (screen: Screen) => void) {
  useEffect(() => {
    const sync = () => open(parsePalliativeScreen(window.location.hash) ?? 'inicio');
    sync();
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, [open]);
}

function ModuleCard({
  module,
  index,
  onOpen,
}: {
  module: PalliativeModule;
  index?: number;
  onOpen: (screen: Screen) => void;
}) {
  const Icon = MODULE_ICON[module.id];
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(module.id)}
        className="flex min-h-14 w-full items-center gap-3 rounded-md border border-border px-3 py-2.5 text-left transition-colors duration-75 hover:bg-hover focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none"
      >
        <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-foreground">
            {index !== undefined ? `${index}. ` : ''}
            {module.title}
          </span>
          <span className="block text-xs text-pretty text-muted-foreground">{module.subtitle}</span>
        </span>
        <CaretRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>
    </li>
  );
}

function Home({ onOpen }: { onOpen: (screen: Screen) => void }) {
  return (
    <div className="flex flex-col gap-6">
      <p className="text-[0.9375rem] text-pretty text-muted-foreground">{PALLIATIVE_INTRO}</p>
      <section aria-labelledby="paliativos-roteiro" className="flex flex-col gap-2">
        <SectionHeader title={<span id="paliativos-roteiro">Roteiro</span>} />
        <ul className="grid gap-2 sm:grid-cols-2">
          {PALLIATIVE_STEPS.map((module, index) => (
            <ModuleCard key={module.id} module={module} index={index + 1} onOpen={onOpen} />
          ))}
        </ul>
      </section>
      <section aria-labelledby="paliativos-apoio" className="flex flex-col gap-2">
        <SectionHeader title={<span id="paliativos-apoio">Apoio</span>} />
        <ul className="flex flex-col gap-2">
          {PALLIATIVE_EXTRAS.map((module) => (
            <ModuleCard key={module.id} module={module} onOpen={onOpen} />
          ))}
        </ul>
      </section>
    </div>
  );
}

/** Atalhos entre os módulos (o menu flutuante do ANY), rolando na horizontal no celular. */
function ModuleNav({
  current,
  onOpen,
}: {
  current: PalliativeModuleId;
  onOpen: (screen: Screen) => void;
}) {
  const activeRef = useRef<HTMLButtonElement>(null);
  // No celular a fileira rola na horizontal; o módulo aberto precisa aparecer nela.
  useEffect(() => {
    activeRef.current?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [current]);
  return (
    <nav aria-label="Módulos do roteiro" className="flex flex-col gap-2">
      <Button
        type="button"
        variant="ghost"
        className="-ml-2 w-fit"
        onClick={() => onOpen('inicio')}
      >
        <CaretLeft aria-hidden="true" />
        Início do roteiro
      </Button>
      <ul className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {PALLIATIVE_MODULES.map((module) => {
          const active = module.id === current;
          return (
            <li key={module.id} className="shrink-0">
              <button
                ref={active ? activeRef : undefined}
                type="button"
                aria-current={active ? 'page' : undefined}
                onClick={() => onOpen(module.id)}
                className={cn(
                  'flex min-h-10 items-center rounded-md border px-3 text-sm whitespace-nowrap transition-colors duration-100 focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none',
                  active
                    ? 'border-primary bg-tone-blue-bg font-medium text-tone-blue-ink'
                    : 'border-border text-foreground hover:bg-hover',
                )}
              >
                {module.title}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * /ferramentas/paliativos — o PaliaPath do ANY (CC-329): identificar
 * (SPICT-BR), decidir (SAVED), comunicar (REDMAP/NURSE), manejar sintomas,
 * escalas (ECOG, PPS, PPI), conversor de opioides, hipodermóclise, mitos e
 * referências. O estado mora num reducer do motor; aqui só há desenho.
 */
export function PalliativeScreen() {
  const favorites = useToolFavorites();
  const [state, dispatch] = useReducer(palliativeReducer, INITIAL_PALLIATIVE_STATE);

  const show = useCallback((screen: Screen) => dispatch({ type: 'open-screen', screen }), []);
  useScreenInAddress(show);

  function open(screen: Screen) {
    if (screen === state.screen) return;
    window.history.pushState(
      null,
      '',
      screen === 'inicio' ? window.location.pathname : `#${screen}`,
    );
    show(screen);
    window.scrollTo({ top: 0 });
  }

  const current = PALLIATIVE_MODULES.find((module) => module.id === state.screen);

  return (
    <Page width="narrow">
      <PageHeader
        icon={HandHeart}
        iconTone="blue"
        title={PALLIATIVE_TOOL_NAME}
        description="Identificar, decidir, comunicar e manejar sintomas no paciente com necessidades paliativas."
        actions={
          <FavoriteButton
            favoriteKey="tool:paliativos"
            name={PALLIATIVE_TOOL_NAME}
            favorites={favorites}
          />
        }
      />

      <div className="flex flex-col gap-4">
        <DecisionSupportNotice />
        {current ? <ModuleNav current={current.id} onOpen={open} /> : null}
      </div>

      {current ? (
        <section aria-labelledby="paliativos-modulo" className="flex flex-col gap-4">
          <SectionHeader
            title={<span id="paliativos-modulo">{current.title}</span>}
            description={current.subtitle}
          />
          {state.screen === 'identificar' ? <IdentifySection /> : null}
          {state.screen === 'decidir' ? <DecideSection state={state} dispatch={dispatch} /> : null}
          {state.screen === 'comunicar' ? <CommunicateSection /> : null}
          {state.screen === 'manejar' ? (
            <SymptomsSection state={state} dispatch={dispatch} />
          ) : null}
          {state.screen === 'ferramentas' ? (
            <ScalesSection state={state} dispatch={dispatch} />
          ) : null}
          {state.screen === 'mitos' ? <MythsSection state={state} dispatch={dispatch} /> : null}
          {state.screen === 'referencias' ? <ReferencesSection /> : null}
        </section>
      ) : (
        <Home onOpen={open} />
      )}

      <ContentProvenanceNote
        provenance={PALLIATIVE_PROVENANCE}
        className="border-t border-border pt-4"
      />
    </Page>
  );
}
