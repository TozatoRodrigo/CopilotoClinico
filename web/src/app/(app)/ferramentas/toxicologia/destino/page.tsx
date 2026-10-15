import { DispositionScreen } from '../_components/disposition-screen';
import { ToxicologyModulePage } from '../_components/toxicology-shell';

export default function DestinoPage() {
  return (
    <ToxicologyModulePage moduleId="destino">
      <DispositionScreen />
    </ToxicologyModulePage>
  );
}
