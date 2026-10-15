import { describe, expect, it } from 'vitest';
import {
  laryngealMaskSize,
  laryngealTubeSize,
  suggestedTube,
  supraglotticDeviceText,
} from './devices';

describe('tubo e dispositivos extraglóticos', () => {
  it('tubo pelo sexo', () => {
    expect(suggestedTube('M')).toBe('8,5 ou 8,0 mm');
    expect(suggestedTube('F')).toBe('8,0 ou 7,5 mm');
  });

  it('máscara laríngea pelo peso: < 50 → 3, < 70 → 4, senão 5', () => {
    expect([40, 49.9, 50, 69.9, 70, 200].map(laryngealMaskSize)).toEqual([3, 3, 4, 4, 5, 5]);
  });

  it('tubo laríngeo pela altura: < 155 → 3, < 180 → 4, senão 5', () => {
    expect([100, 154.9, 155, 179.9, 180, 250].map(laryngealTubeSize)).toEqual([3, 3, 4, 4, 5, 5]);
  });

  it('texto do plano B, com e sem altura, e sem peso', () => {
    expect(supraglotticDeviceText(72, null)).toBe('Máscara laríngea: tamanho 5');
    expect(supraglotticDeviceText(60, 170)).toBe(
      'Máscara laríngea: tamanho 4 | Tubo laríngeo: tamanho 4',
    );
    expect(supraglotticDeviceText(null, 170)).toBe(
      'Máscara laríngea: informe o peso | Tubo laríngeo: tamanho 4',
    );
  });
});
