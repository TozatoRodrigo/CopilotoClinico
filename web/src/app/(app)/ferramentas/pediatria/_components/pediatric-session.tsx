'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { BroselowKey } from '@clinical-tools/pediatrics/broselow';
import {
  resolvePediatricPatient,
  type PediatricInputs,
  type PediatricPatient,
} from '@clinical-tools/pediatrics/weight';

/**
 * Peso, cor, comprimento e idade da criança, compartilhados entre a tela de Pediatria e a
 * de cada cenário. Mora no layout da rota: vale enquanto o médico navega
 * dentro de Pediatria e some ao sair, como o ANY, que começava sempre vazio
 * para não reaproveitar o peso do paciente anterior. Nada sai do aparelho.
 */

interface PediatricSession {
  inputs: PediatricInputs;
  patient: PediatricPatient;
  setWeight: (raw: string) => void;
  setBroselow: (key: BroselowKey | null) => void;
  setLength: (raw: string) => void;
  setAge: (raw: string) => void;
  reset: () => void;
}

const EMPTY: PediatricInputs = { weight: '', broselow: null, length: '', age: '' };

const PediatricSessionContext = createContext<PediatricSession | null>(null);

export function PediatricSessionProvider({ children }: { children: ReactNode }) {
  const [inputs, setInputs] = useState<PediatricInputs>(EMPTY);

  const session = useMemo<PediatricSession>(
    () => ({
      inputs,
      patient: resolvePediatricPatient(inputs),
      // Digitar o peso desfaz a cor: o peso aferido passa a ser a fonte (como no ANY).
      setWeight: (raw) =>
        setInputs((current) => ({
          ...current,
          weight: raw,
          broselow: raw.trim() === '' ? current.broselow : null,
        })),
      // Escolher a cor limpa o peso e o comprimento digitados: a cor passa a ser a fonte.
      setBroselow: (key) =>
        setInputs((current) => ({ ...current, broselow: key, weight: '', length: '' })),
      // Medir o comprimento desfaz a cor escolhida (o peso aferido continua mandando).
      setLength: (raw) =>
        setInputs((current) => ({
          ...current,
          length: raw,
          broselow: raw.trim() === '' ? current.broselow : null,
        })),
      setAge: (raw) => setInputs((current) => ({ ...current, age: raw })),
      reset: () => setInputs(EMPTY),
    }),
    [inputs],
  );

  return (
    <PediatricSessionContext.Provider value={session}>{children}</PediatricSessionContext.Provider>
  );
}

export function usePediatricSession(): PediatricSession {
  const session = useContext(PediatricSessionContext);
  if (!session) throw new Error('usePediatricSession fora do PediatricSessionProvider');
  return session;
}
