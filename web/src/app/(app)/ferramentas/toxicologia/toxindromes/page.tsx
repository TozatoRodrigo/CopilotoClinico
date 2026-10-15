import { ToxicologyModulePage } from '../_components/toxicology-shell';
import { ToxidromeFlow } from '../_components/toxidrome-flow';

export default function ToxindromesPage() {
  return (
    <ToxicologyModulePage moduleId="toxindromes">
      <ToxidromeFlow />
    </ToxicologyModulePage>
  );
}
