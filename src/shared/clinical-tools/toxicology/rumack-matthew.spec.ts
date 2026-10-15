import { describe, expect, it } from 'vitest';
import { assessRumackMatthew, rumackMatthewLine } from './rumack-matthew';

describe('nomograma de Rumack-Matthew (CC-308)', () => {
  it('começa em 150 mcg/mL às 4 h e cai à metade a cada ~4 h (0,173 arredonda ln 2/4)', () => {
    expect(rumackMatthewLine(4)).toBe(150);
    expect(rumackMatthewLine(8)).toBe(75.1);
    expect(rumackMatthewLine(24)).toBe(4.7);
  });

  it('nível no limite da linha conta como acima (indica NAC)', () => {
    expect(assessRumackMatthew(4, 150)).toEqual({ line: 150, aboveLine: true });
    expect(assessRumackMatthew(4, 149)).toEqual({ line: 150, aboveLine: false });
    expect(assessRumackMatthew(8, 75)).toEqual({ line: 75.1, aboveLine: false });
  });
});
