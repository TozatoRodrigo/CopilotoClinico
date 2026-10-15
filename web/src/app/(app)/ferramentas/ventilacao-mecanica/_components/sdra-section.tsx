import {
  SDRA_CITATION,
  SDRA_COLUMNS,
  SDRA_DESCRIPTION,
  SDRA_GLOBAL_2024_CHANGES,
  SDRA_SEVERITY,
} from '@clinical-tools/ventilation/sdra';
import { RESULT_TONE } from '@/components/domain/clinical-tools/result-tone';
import { Callout } from '@/components/ui/callout';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableWrapper,
} from '@/components/ui/table';
import { toneTag } from '@/lib/tone';
import { cn } from '@/lib/utils';

/** Critérios de SDRA pela definição Global 2024, como no VM Guide do ANY. */
export function SdraCriteria() {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[0.9375rem] text-pretty text-muted-foreground">{SDRA_DESCRIPTION}</p>
      <TableWrapper>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Gravidade</TableHead>
              <TableHead>{SDRA_COLUMNS.pf}</TableHead>
              <TableHead>{SDRA_COLUMNS.sf}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {SDRA_SEVERITY.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <span
                    className={cn(
                      'rounded-[3px] px-1.5 py-0.5 text-sm font-medium',
                      toneTag[RESULT_TONE[row.tone]],
                    )}
                  >
                    {row.severity}
                  </span>
                </TableCell>
                <TableCell className="tabular-nums">{row.pf}</TableCell>
                <TableCell className="tabular-nums">{row.sf}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableWrapper>
      <Callout tone="gray" title="Novidades da definição Global 2024:">
        <ul className="flex list-disc flex-col gap-0.5 pl-5">
          {SDRA_GLOBAL_2024_CHANGES.map((change) => (
            <li key={change}>{change}</li>
          ))}
        </ul>
      </Callout>
      <p className="text-xs text-pretty text-muted-foreground">Referência: {SDRA_CITATION}</p>
    </div>
  );
}
