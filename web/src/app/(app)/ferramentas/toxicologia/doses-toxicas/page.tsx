import { ToxicDoseLookup } from '../_components/toxic-dose-lookup';
import { ToxicologyModulePage } from '../_components/toxicology-shell';

export default function DosesToxicasPage() {
  return (
    <ToxicologyModulePage moduleId="doses-toxicas">
      <ToxicDoseLookup />
    </ToxicologyModulePage>
  );
}
