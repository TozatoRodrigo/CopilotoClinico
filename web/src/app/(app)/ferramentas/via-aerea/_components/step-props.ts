import type { AirwayView } from '@clinical-tools/airway/derive';
import type { AirwayAction, AirwayState } from '@clinical-tools/airway/state';

/** O que todo passo do roteiro recebe: estado, o que o motor deriva dele, ações e o peso comum. */
export interface StepProps {
  state: AirwayState;
  view: AirwayView;
  dispatch: (action: AirwayAction) => void;
  /** Peso digitado (texto cru), comum às ferramentas adultas. */
  weight: string;
  onWeightChange: (raw: string) => void;
}
