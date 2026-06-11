import type { TurnRecord } from "@/hooks/use-copilot-conversation";

export function TurnHistory({ turns }: { turns: TurnRecord[] }) {
  if (turns.length === 0) return null;

  return (
    <div className="space-y-2">
      <h2 className="text-lg font-semibold">Histórico de turnos</h2>
      <div className="space-y-2">
        {turns.map((turn) => (
          <details key={turn.turnIndex} className="rounded-lg border px-4 py-2">
            <summary className="cursor-pointer select-none font-medium">
              Turno {turn.turnIndex + 1}
            </summary>
            <div className="mt-2 space-y-1 text-sm text-muted-foreground">
              <p>{turn.analysis.reasoning}</p>
              {turn.analysis.recommendations.map((rec, index) => (
                <p key={index}>• {rec.action}</p>
              ))}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
