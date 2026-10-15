import { DecontaminationFlow } from '../_components/decontamination-flow';
import { ToxicologyModulePage } from '../_components/toxicology-shell';

export default function DescontaminacaoPage() {
  return (
    <ToxicologyModulePage moduleId="descontaminacao">
      <DecontaminationFlow />
    </ToxicologyModulePage>
  );
}
