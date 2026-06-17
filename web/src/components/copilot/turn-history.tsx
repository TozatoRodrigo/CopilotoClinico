import type { TurnRecord } from "@/hooks/use-copilot-conversation";
import { messages } from "@/lib/messages";

export function TurnHistory({ turns }: { turns: TurnRecord[] }) {
  if (turns.length === 0) return null;

  return (
    <div className="space-y-2">
      <h2 className="text-lg font-semibold">{messages.copilot.turns.history}</h2>
      <div className="space-y-2">
        {turns.map((turn) => (
          <details key={turn.turnIndex} className="rounded-lg border px-4 py-2">
            <summary className="cursor-pointer select-none font-medium">
              {messages.copilot.turns.turnLabel(turn.turnIndex + 1)}
            </summary>
            <div className="mt-2 space-y-1 text-sm text-muted-foreground">
              <p>{turn.analysis.reasoning}</p>
              {turn.analysis.recommendations.map((rec, index) => (
                <p key={index}>
                  • {labelForCategory(rec.category)} {rec.action}
                </p>
              ))}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}

function labelForCategory(category?: string): string {
  const c = messages.recommendation.category;
  switch (category) {
    case "stabilization":
      return messages.recommendation.categoryBracket(c.stabilization);
    case "diagnostic":
      return messages.recommendation.categoryBracket(c.diagnostic);
    case "verify":
      return messages.recommendation.categoryBracket(c.verify);
    case "therapeutic":
    default:
      return messages.recommendation.categoryBracket(c.therapeutic);
  }
}
