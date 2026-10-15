import type {
  CadEhhAction,
  CadEhhScreen,
  CadEhhState,
  PanelGuidance,
  PanelReading,
} from '@clinical-tools/cad-ehh/roteiro';

/** O que toda tela do roteiro recebe: estado, leituras do motor e navegação. */
export interface CadEhhScreenProps {
  state: CadEhhState;
  dispatch: (action: CadEhhAction) => void;
  panel: PanelReading;
  guidance: PanelGuidance;
  /** Peso válido (adulto, 40–200 kg) ou `null`. */
  weight: number | null;
  /** Texto digitado no campo de peso, comum às ferramentas adultas. */
  weightRaw: string;
  onWeightChange: (raw: string) => void;
  go: (screen: CadEhhScreen) => void;
}
