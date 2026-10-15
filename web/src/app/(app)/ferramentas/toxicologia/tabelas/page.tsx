import { ReferenceTables } from '../_components/reference-tables';
import { ToxicologyModulePage } from '../_components/toxicology-shell';

export default function TabelasPage() {
  return (
    <ToxicologyModulePage moduleId="tabelas">
      <ReferenceTables />
    </ToxicologyModulePage>
  );
}
