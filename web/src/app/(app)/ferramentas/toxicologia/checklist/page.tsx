import { ExamChecklist } from '../_components/exam-checklist';
import { ToxicologyModulePage } from '../_components/toxicology-shell';

export default function ChecklistPage() {
  return (
    <ToxicologyModulePage moduleId="checklist">
      <ExamChecklist />
    </ToxicologyModulePage>
  );
}
