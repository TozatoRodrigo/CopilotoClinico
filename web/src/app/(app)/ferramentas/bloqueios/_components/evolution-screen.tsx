'use client';

import { useId } from 'react';
import { ArrowCounterClockwise, FileText } from '@phosphor-icons/react';
import {
  buildBlockEvolutionNote,
  EVOLUTION_ANESTHETICS,
  EVOLUTION_BLOCK_TYPES,
  EVOLUTION_COMPLICATIONS,
  EVOLUTION_DOSE_RANGE,
  EVOLUTION_EPINEPHRINE,
  EVOLUTION_INSERTIONS,
  EVOLUTION_NEEDLES,
  EVOLUTION_SIDES,
  EVOLUTION_TRANSDUCERS,
  EVOLUTION_VOLUME_RANGE,
} from '@clinical-tools/blocks/evolution';
import { CopyToChartButton } from '@/components/domain/clinical-tools/copy-to-chart-button';
import { NumericField } from '@/components/domain/clinical-tools/numeric-field';
import { Button } from '@/components/ui/button';
import { SectionHeader } from '@/components/layout/page-header';
import { useSessionValue } from './block-session';
import { BlocksPage, CheckboxRow, ChoiceGroup, SelectField, TextField } from './blocks-ui';
import {
  draftToForm,
  EMPTY_EVOLUTION_DRAFT,
  parseEvolutionDraft,
  type EvolutionDraft,
} from './evolution-draft';

const EVOLUTION_DRAFT_KEY = 'bloqueios-evolucao';

const asOptions = <T extends string>(values: readonly T[]) =>
  values.map((value) => ({ value, label: value }));

/**
 * /ferramentas/bloqueios/evolucao — modelo de evolução do bloqueio. O texto
 * se monta ao vivo enquanto o médico preenche (o ANY pedia "Gerar texto") e
 * vai para o prontuário pelo botão de copiar. O rascunho fica na aba por 30
 * minutos, para dar para conferir a dose máxima no meio e voltar.
 */
export function EvolutionScreen() {
  const [draft, setDraft] = useSessionValue<EvolutionDraft>(
    EVOLUTION_DRAFT_KEY,
    parseEvolutionDraft,
    () => EMPTY_EVOLUTION_DRAFT,
  );
  const previewId = useId();
  const note = buildBlockEvolutionNote(draftToForm(draft));

  const set =
    <K extends keyof EvolutionDraft>(key: K) =>
    (value: EvolutionDraft[K]) =>
      setDraft((current) => ({ ...current, [key]: value }));

  return (
    <BlocksPage
      icon={FileText}
      title="Nota de evolução do bloqueio"
      description="Preencha o que foi feito; o texto se monta abaixo e vai para o prontuário pelo botão de copiar."
      current="evolucao"
      actions={
        <Button type="button" variant="outline" onClick={() => setDraft(EMPTY_EVOLUTION_DRAFT)}>
          <ArrowCounterClockwise aria-hidden="true" />
          Limpar
        </Button>
      }
    >
      <section aria-labelledby="evolucao-procedimento" className="flex flex-col gap-4">
        <SectionHeader
          title={<span id="evolucao-procedimento">Procedimento</span>}
          className="border-b border-border pb-1.5"
        />
        <TextField
          label="Indicação do bloqueio"
          value={draft.indication}
          onValueChange={set('indication')}
          placeholder="Ex.: fratura de colo femoral D"
        />
        <SelectField
          label="Tipo de bloqueio"
          value={draft.blockType}
          options={EVOLUTION_BLOCK_TYPES}
          onValueChange={set('blockType')}
        />
        <ChoiceGroup
          legend="Lateralidade"
          value={draft.side}
          options={EVOLUTION_SIDES}
          onValueChange={set('side')}
        />
        <SelectField
          label="Transdutor"
          value={draft.transducer}
          options={EVOLUTION_TRANSDUCERS}
          onValueChange={(value) => set('transducer')(value as EvolutionDraft['transducer'])}
        />
        <SelectField
          label="Agulha"
          value={draft.needle}
          options={EVOLUTION_NEEDLES}
          onValueChange={(value) => set('needle')(value as EvolutionDraft['needle'])}
        />
        <ChoiceGroup
          legend="Técnica de inserção"
          value={draft.insertion}
          options={asOptions(EVOLUTION_INSERTIONS)}
          onValueChange={set('insertion')}
        />
      </section>

      <section aria-labelledby="evolucao-anestesico" className="flex flex-col gap-4">
        <SectionHeader
          title={<span id="evolucao-anestesico">Anestésico local</span>}
          className="border-b border-border pb-1.5"
        />
        <SelectField
          label="Anestésico"
          value={draft.anesthetic}
          options={EVOLUTION_ANESTHETICS}
          onValueChange={set('anesthetic')}
        />
        <div className="grid grid-cols-2 gap-3">
          <NumericField
            label="Volume"
            unit={EVOLUTION_VOLUME_RANGE.unit}
            range={EVOLUTION_VOLUME_RANGE}
            value={draft.volume}
            onValueChange={set('volume')}
            placeholder="20"
          />
          <NumericField
            label="Dose total"
            unit={EVOLUTION_DOSE_RANGE.unit}
            range={EVOLUTION_DOSE_RANGE}
            value={draft.dose}
            onValueChange={set('dose')}
            placeholder="100"
          />
        </div>
        <ChoiceGroup
          legend="Epinefrina"
          value={draft.epinephrine}
          options={asOptions(EVOLUTION_EPINEPHRINE)}
          onValueChange={set('epinephrine')}
        />
      </section>

      <section aria-labelledby="evolucao-avaliacao" className="flex flex-col gap-3">
        <SectionHeader
          title={<span id="evolucao-avaliacao">Avaliação pós-bloqueio</span>}
          description="Vem marcado como no ANY; confira antes de copiar."
          className="border-b border-border pb-1.5"
        />
        <div className="flex flex-col">
          <CheckboxRow
            label="Bloqueio sensitivo presente"
            checked={draft.sensoryBlock}
            onCheckedChange={set('sensoryBlock')}
          />
          <CheckboxRow
            label="Bloqueio motor presente"
            checked={draft.motorBlock}
            onCheckedChange={set('motorBlock')}
          />
          <CheckboxRow
            label="Sem sinais de LAST"
            checked={draft.lastSignsAbsent}
            onCheckedChange={set('lastSignsAbsent')}
          />
        </div>
        <ChoiceGroup
          legend="Intercorrências"
          value={draft.complication}
          options={asOptions(EVOLUTION_COMPLICATIONS)}
          onValueChange={(value) => set('complication')(value || 'Nenhuma')}
          allowEmpty={false}
        />
        {draft.complication === 'Sim' ? (
          <TextField
            label="Descreva a intercorrência"
            value={draft.complicationDescription}
            onValueChange={set('complicationDescription')}
          />
        ) : null}
      </section>

      <section aria-labelledby="evolucao-responsavel" className="flex flex-col gap-4">
        <SectionHeader
          title={<span id="evolucao-responsavel">Responsável</span>}
          className="border-b border-border pb-1.5"
        />
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="Nome"
            value={draft.responsible}
            onValueChange={set('responsible')}
            placeholder="Dr(a). Nome"
          />
          <TextField
            label="CRM"
            value={draft.crm}
            onValueChange={set('crm')}
            placeholder="00000-GO"
          />
        </div>
      </section>

      <section aria-labelledby={previewId} className="flex flex-col gap-3">
        <SectionHeader
          title={<span id={previewId}>Texto da evolução</span>}
          className="border-b border-border pb-1.5"
        />
        <pre className="rounded-lg bg-surface-subtle px-4 py-3 font-mono text-[0.8125rem] leading-relaxed whitespace-pre-wrap text-foreground">
          {note}
        </pre>
        <CopyToChartButton text={note} />
      </section>
    </BlocksPage>
  );
}
