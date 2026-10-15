'use client';

import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Check, Hospital, PencilSimple, Plus, Star, Trash } from '@phosphor-icons/react';
import {
  FACILITY_TYPES,
  FACILITY_TYPE_LABELS,
  PRACTICE_SITE_LIMITS,
  SITE_SPECIALISTS,
  SITE_SPECIALIST_LABELS,
} from '@contracts/practice-site';
import { ApiError } from '@/lib/api-client';
import {
  describeSite,
  emptySiteForm,
  siteFormFrom,
  specialistsLabel,
  toPracticeSiteInput,
  type SiteFormValues,
} from '@/lib/practice-sites';
import type { FacilityType, PracticeSite, PracticeSiteInput, SiteSpecialist } from '@/lib/types';
import {
  useDeletePracticeSite,
  usePracticeSites,
  useSavePracticeSite,
} from '@/hooks/use-practice-sites';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleTag } from '@/components/ui/toggle-tag';
import { SettingsPane, SettingsRow, SettingsSection } from '../_components/settings-layout';

const RESOURCE_TOGGLES: Array<{ key: 'hasCT' | 'hasLab' | 'hasICU' | 'isSus'; label: string }> = [
  { key: 'hasCT', label: 'Tomografia' },
  { key: 'hasLab', label: 'Laboratório' },
  { key: 'hasICU', label: 'UTI' },
  { key: 'isSus', label: 'Atendimento SUS' },
];

type Editing = { kind: 'new' } | { kind: 'edit'; site: PracticeSite } | null;

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

/**
 * CC-602 — onde o médico dá plantão. O local padrão preenche o contexto de
 * cada caso novo (o que o serviço tem e não tem, porte, especialistas e
 * tempo até a referência); no caso, dá para trocar. Nada aqui é dado de
 * paciente.
 */
export function SitesTab() {
  const sitesQuery = usePracticeSites();
  const save = useSavePracticeSite();
  const remove = useDeletePracticeSite();
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<PracticeSite | null>(null);

  const sites = sitesQuery.data ?? [];
  const atLimit = sites.length >= PRACTICE_SITE_LIMITS.sitesPerPhysician;

  async function makeDefault(site: PracticeSite) {
    const parsed = toPracticeSiteInput({ ...siteFormFrom(site), isDefault: true });
    if (!parsed.ok) return;
    try {
      await save.mutateAsync({ id: site.id, input: parsed.input });
      toast.success(`${site.name} é o local padrão dos casos novos.`);
    } catch (error) {
      toast.error(errorMessage(error, 'Erro ao trocar o local padrão.'));
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await remove.mutateAsync(deleting.id);
      toast.success('Local excluído.');
      setDeleting(null);
    } catch (error) {
      toast.error(errorMessage(error, 'Erro ao excluir o local.'));
    }
  }

  return (
    <SettingsPane
      title="Locais de plantão"
      description="Onde você dá plantão e o que o serviço tem. O local padrão preenche o contexto de cada caso novo — dá para trocar no caso. A análise considera o que falta no serviço para indicar transferência e regulação."
    >
      <SettingsSection
        title="Seus locais"
        icon={Hospital}
        description={`Até ${PRACTICE_SITE_LIMITS.sitesPerPhysician} locais. Sem dado de paciente.`}
      >
        {sitesQuery.isPending ? (
          <div className="flex flex-col gap-2 py-4" aria-busy="true">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-72" />
          </div>
        ) : sitesQuery.isError ? (
          <SettingsRow
            title="Não foi possível carregar seus locais"
            description={errorMessage(sitesQuery.error, 'Tente de novo em instantes.')}
            control={
              <Button variant="outline" size="sm" onClick={() => void sitesQuery.refetch()}>
                Tentar de novo
              </Button>
            }
          />
        ) : sites.length === 0 ? (
          <SettingsRow
            title="Nenhum local salvo"
            description="Sem local, os recursos (TC, laboratório, UTI) são marcados a cada caso e o que não foi marcado conta como não informado."
          />
        ) : (
          sites.map((site) => (
            <SettingsRow
              key={site.id}
              title={
                <>
                  {site.name}
                  {site.isDefault && (
                    <Badge variant="blue">
                      <Star weight="fill" aria-hidden="true" />
                      Padrão
                    </Badge>
                  )}
                </>
              }
              description={describeSite(site, site)}
              control={
                <>
                  {!site.isDefault && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void makeDefault(site)}
                      disabled={save.isPending}
                    >
                      Tornar padrão
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditing({ kind: 'edit', site })}
                    aria-label={`Editar ${site.name}`}
                  >
                    <PencilSimple aria-hidden="true" />
                    Editar
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setDeleting(site)}
                    aria-label={`Excluir ${site.name}`}
                  >
                    <Trash aria-hidden="true" />
                  </Button>
                </>
              }
            >
              <p className="text-[0.8125rem] text-muted-foreground">
                {specialistsLabel(site.specialists)}
              </p>
            </SettingsRow>
          ))
        )}
        <div className="py-4">
          <Button
            variant="outline"
            onClick={() => setEditing({ kind: 'new' })}
            disabled={sitesQuery.isPending || atLimit}
          >
            <Plus aria-hidden="true" />
            Adicionar local
          </Button>
        </div>
      </SettingsSection>

      {editing && (
        <SiteFormDialog
          key={editing.kind === 'edit' ? editing.site.id : 'new'}
          initial={
            editing.kind === 'edit' ? siteFormFrom(editing.site) : emptySiteForm(sites.length === 0)
          }
          title={editing.kind === 'edit' ? `Editar ${editing.site.name}` : 'Novo local de plantão'}
          saving={save.isPending}
          onCancel={() => setEditing(null)}
          onSubmit={async (input) => {
            try {
              await save.mutateAsync({
                id: editing.kind === 'edit' ? editing.site.id : undefined,
                input,
              });
              toast.success('Local salvo.');
              setEditing(null);
            } catch (error) {
              toast.error(errorMessage(error, 'Erro ao salvar o local.'));
            }
          }}
        />
      )}

      <Dialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir {deleting?.name}?</DialogTitle>
            <DialogDescription>
              Os casos já abertos guardam uma cópia do local e não mudam. Se for o padrão, o local
              mais antigo passa a ser o padrão.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => void confirmDelete()}
              loading={remove.isPending}
            >
              Excluir local
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsPane>
  );
}

function SiteFormDialog({
  initial,
  title,
  saving,
  onCancel,
  onSubmit,
}: {
  initial: SiteFormValues;
  title: string;
  saving: boolean;
  onCancel: () => void;
  onSubmit: (input: PracticeSiteInput) => Promise<void>;
}) {
  const [values, setValues] = useState<SiteFormValues>(initial);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof SiteFormValues>(key: K, value: SiteFormValues[K]) {
    setValues((previous) => ({ ...previous, [key]: value }));
  }

  function toggleSpecialist(specialist: SiteSpecialist) {
    setValues((previous) => ({
      ...previous,
      specialists: previous.specialists.includes(specialist)
        ? previous.specialists.filter((item) => item !== specialist)
        : [...previous.specialists, specialist],
    }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = toPracticeSiteInput(values);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setError(null);
    await onSubmit(parsed.input);
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              Descreva o serviço como ele é no seu plantão. Nada de dado de paciente.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            <Label htmlFor="site-name">Nome do local</Label>
            <Input
              id="site-name"
              value={values.name}
              onChange={(event) => update('name', event.target.value)}
              maxLength={PRACTICE_SITE_LIMITS.nameMaxChars}
              placeholder="Ex.: UPA Centro"
              autoComplete="off"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="site-facility">Porte do serviço</Label>
            <Select
              value={values.facilityType}
              onValueChange={(value) => update('facilityType', value as FacilityType)}
            >
              <SelectTrigger id="site-facility" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FACILITY_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {FACILITY_TYPE_LABELS[type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium text-foreground">
              O que o serviço tem
            </legend>
            <div className="flex flex-wrap gap-1.5">
              {RESOURCE_TOGGLES.map((resource) => (
                <ToggleTag
                  key={resource.key}
                  pressed={values[resource.key]}
                  onClick={() => update(resource.key, !values[resource.key])}
                  activeClassName="bg-tone-blue-tag text-tone-blue-ink"
                  activeIcon={<Check weight="bold" className="text-tone-blue" />}
                >
                  {resource.label}
                </ToggleTag>
              ))}
            </div>
            <p className="text-[0.8125rem] text-muted-foreground">
              Desmarcado = o serviço não tem. É o que leva a análise a indicar transferência.
            </p>
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium text-foreground">
              Especialistas no plantão (presentes ou de sobreaviso)
            </legend>
            <div className="flex flex-wrap gap-1.5">
              {SITE_SPECIALISTS.map((specialist) => (
                <ToggleTag
                  key={specialist}
                  pressed={values.specialists.includes(specialist)}
                  onClick={() => toggleSpecialist(specialist)}
                  activeClassName="bg-tone-blue-tag text-tone-blue-ink"
                  activeIcon={<Check weight="bold" className="text-tone-blue" />}
                >
                  {SITE_SPECIALIST_LABELS[specialist]}
                </ToggleTag>
              ))}
            </div>
          </fieldset>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="site-reference-minutes">Tempo até a referência (min)</Label>
              <Input
                id="site-reference-minutes"
                inputMode="numeric"
                value={values.referenceTravelMinutes}
                onChange={(event) => update('referenceTravelMinutes', event.target.value)}
                placeholder="Ex.: 90"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="site-reference-km">Distância até a referência (km)</Label>
              <Input
                id="site-reference-km"
                inputMode="numeric"
                value={values.referenceDistanceKm}
                onChange={(event) => update('referenceDistanceKm', event.target.value)}
                placeholder="Ex.: 70"
              />
            </div>
          </div>

          <label className="flex cursor-pointer items-start gap-2.5 text-sm text-foreground">
            <input
              type="checkbox"
              checked={values.isDefault}
              onChange={(event) => update('isDefault', event.target.checked)}
              className="mt-0.5 size-4 shrink-0 cursor-pointer rounded-sm accent-primary"
            />
            <span>
              Usar como padrão nos casos novos
              <span className="block text-[0.8125rem] text-muted-foreground">
                O primeiro local salvo já vira o padrão.
              </span>
            </span>
          </label>

          {error && (
            <p role="alert" className="text-[0.8125rem] text-destructive">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancelar
            </Button>
            <Button type="submit" loading={saving}>
              Salvar local
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
