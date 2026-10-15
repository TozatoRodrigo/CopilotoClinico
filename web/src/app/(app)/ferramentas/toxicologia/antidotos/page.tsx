import { AntidoteGuide } from '../_components/antidote-guide';
import { ToxicologyModulePage } from '../_components/toxicology-shell';

export default function AntidotosPage() {
  return (
    <ToxicologyModulePage moduleId="antidotos">
      <AntidoteGuide />
    </ToxicologyModulePage>
  );
}
