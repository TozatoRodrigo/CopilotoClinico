'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type {
  AclsMedicationId,
  AclsRhythm,
  EpinephrineIntervalSeconds,
} from '@clinical-tools/acls/content';
import type { RoscChecklistItemId } from '@clinical-tools/acls/reversible-causes';
import {
  aclsReducer,
  cycleDueAt,
  INITIAL_ACLS_STATE,
  selectEpinephrineTimer,
  type AclsAction,
  type AclsRhythmCheckResult,
  type AclsState,
} from '@clinical-tools/acls/session';
import { createAclsAudio, type AclsAudio } from '@/lib/acls/audio';
import { ACLS_VIBRATION, vibrate } from '@/lib/acls/haptics';
import { saveAclsRecord } from '@/lib/acls/history-storage';
import { loadAclsSession, saveAclsSession } from '@/lib/acls/session-storage';
import { createScreenWakeLock, type WakeLockStatus } from '@/lib/acls/wake-lock';

/**
 * Parada em curso (CC-313), acima das rotas: mora no AppShell, então o
 * relógio, os alertas e o metrônomo continuam quando o médico abre outra
 * ferramenta (Via aérea, Tox) ou outra tela, e a parada está igual na volta.
 * A conta é toda do reducer do motor; aqui só há relógio, som, vibração e
 * tela acesa.
 */

/** Frequência do relógio da tela: o m:ss nunca fica mais de 1/4 s atrasado. */
const TICK_MS = 250;

export interface AclsSession {
  state: AclsState;
  /** Agora (ms), atualizado a cada 250 ms enquanto a parada corre. */
  now: number;
  metronomeOn: boolean;
  wakeLock: WakeLockStatus;
  start(): void;
  selectRhythm(rhythm: AclsRhythm): void;
  checkRhythm(result: AclsRhythmCheckResult, etco2?: number): void;
  registerShock(): void;
  registerMedication(medication: AclsMedicationId): void;
  setAdvancedAirway(value: boolean): void;
  setEpinephrineInterval(seconds: EpinephrineIntervalSeconds): void;
  toggleCompressionPause(): void;
  /** Liga ou desliga; `false` quando o navegador não tem áudio. */
  toggleMetronome(): boolean;
  toggleRoscItem(item: RoscChecklistItemId): void;
  discard(): void;
}

const AclsSessionContext = createContext<AclsSession | null>(null);

export interface AclsSessionProviderProps {
  children: ReactNode;
  /** Relógio (ms); o teste troca por um falso. */
  clock?: () => number;
  /** Som; o teste troca por um falso. */
  createAudio?: () => AclsAudio;
}

export function AclsSessionProvider({
  children,
  clock = Date.now,
  createAudio = createAclsAudio,
}: AclsSessionProviderProps) {
  // O AppShell só monta no cliente, depois do login: ler o aparelho no
  // inicializador é seguro (mesmo padrão dos favoritos).
  const [state, dispatch] = useReducer(
    aclsReducer,
    undefined,
    () => loadAclsSession(clock()) ?? INITIAL_ACLS_STATE,
  );
  const [now, setNow] = useState(clock);
  const [metronomeOn, setMetronomeOn] = useState(false);
  const [wakeLock, setWakeLock] = useState<WakeLockStatus>('off');
  const running = state.status === 'running';

  const audioRef = useRef<AclsAudio | null>(null);
  const stateRef = useRef(state);
  /** Vencimento já avisado (ciclo e epinefrina): um aviso por vencimento. */
  const alertedCycleRef = useRef<number | null>(null);
  const alertedEpinephrineRef = useRef<number | null>(null);

  const audio = useCallback((): AclsAudio => {
    audioRef.current ??= createAudio();
    return audioRef.current;
  }, [createAudio]);

  useEffect(() => {
    stateRef.current = state;
    saveAclsSession(state);
  }, [state]);

  // Relógio e alertas. O ciclo vencido é registrado na hora em que venceu
  // (e não quando o timer percebeu): a linha do tempo marca 2:00 mesmo se o
  // navegador atrasou.
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      const at = clock();
      setNow(at);
      const current = stateRef.current;
      const due = cycleDueAt(current);
      if (due !== null && at >= due && alertedCycleRef.current !== due) {
        alertedCycleRef.current = due;
        dispatch({ type: 'complete-cycle', at: due });
        audio().playAlert();
        vibrate(ACLS_VIBRATION.cycleEnd);
      }
      const epinephrine = selectEpinephrineTimer(current, at);
      if (epinephrine?.due && alertedEpinephrineRef.current !== current.lastEpinephrineAt) {
        alertedEpinephrineRef.current = current.lastEpinephrineAt;
        audio().playAlert();
        vibrate(ACLS_VIBRATION.epinephrineDue);
      }
    }, TICK_MS);
    return () => clearInterval(id);
  }, [running, clock, audio]);

  // Tela acesa e som enquanto a parada corre, inclusive a restaurada depois
  // de recarregar. O iOS só libera áudio num toque: a parada restaurada
  // destrava no primeiro toque em qualquer lugar.
  useEffect(() => {
    if (!running) return;
    const lock = createScreenWakeLock(setWakeLock);
    lock.request();
    const unlock = () => audio().unlock();
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      lock.release();
      audioRef.current?.release();
      audioRef.current = null;
    };
  }, [running, audio]);

  const start = useCallback(() => {
    const at = clock();
    // Dentro do toque de "Iniciar": é aqui que o iOS deixa criar o áudio.
    audio().unlock();
    alertedCycleRef.current = null;
    alertedEpinephrineRef.current = null;
    setMetronomeOn(false);
    setNow(at);
    dispatch({ type: 'start', at });
  }, [clock, audio]);

  const selectRhythm = useCallback(
    (rhythm: AclsRhythm) => dispatch({ type: 'select-rhythm', at: clock(), rhythm }),
    [clock],
  );

  const checkRhythm = useCallback(
    (result: AclsRhythmCheckResult, etco2?: number) => {
      const action: AclsAction = {
        type: 'check-rhythm',
        at: clock(),
        result,
        ...(etco2 === undefined ? {} : { etco2 }),
      };
      const next = aclsReducer(stateRef.current, action);
      dispatch(action);
      if (next.status !== 'finished' || next.report !== null) return;
      // CC-314: a parada encerrada vai para o histórico do aparelho na hora,
      // com o relatório pronto; o médico não precisa lembrar de gerar.
      setMetronomeOn(false);
      const record = saveAclsRecord(next);
      if (record) dispatch({ type: 'record-report', number: record.number, recordId: record.id });
    },
    [clock],
  );

  const registerShock = useCallback(() => {
    dispatch({ type: 'register-shock', at: clock() });
    vibrate(ACLS_VIBRATION.shock);
  }, [clock]);

  const registerMedication = useCallback(
    (medication: AclsMedicationId) => {
      dispatch({ type: 'register-medication', at: clock(), medication });
      if (medication === 'epinefrina') vibrate(ACLS_VIBRATION.epinephrineGiven);
    },
    [clock],
  );

  const setAdvancedAirway = useCallback(
    (value: boolean) => {
      dispatch({ type: 'set-advanced-airway', at: clock(), value });
      // Com via aérea avançada, o metrônomo ganha o bipe de ventilação a cada 6 s.
      if (metronomeOn) audio().setVentilation(value);
    },
    [clock, metronomeOn, audio],
  );

  const setEpinephrineInterval = useCallback(
    (seconds: EpinephrineIntervalSeconds) =>
      dispatch({ type: 'set-epinephrine-interval', seconds }),
    [],
  );

  const toggleCompressionPause = useCallback(
    () => dispatch({ type: 'toggle-compression-pause', at: clock() }),
    [clock],
  );

  const toggleMetronome = useCallback((): boolean => {
    if (metronomeOn) {
      audio().stopMetronome();
      setMetronomeOn(false);
      return true;
    }
    const started = audio().startMetronome({ ventilation: state.advancedAirway });
    setMetronomeOn(started);
    return started;
  }, [metronomeOn, audio, state.advancedAirway]);

  const toggleRoscItem = useCallback(
    (item: RoscChecklistItemId) => dispatch({ type: 'toggle-rosc-item', item }),
    [],
  );

  const discard = useCallback(() => {
    setMetronomeOn(false);
    dispatch({ type: 'discard' });
  }, []);

  const value = useMemo<AclsSession>(
    () => ({
      state,
      now,
      metronomeOn: metronomeOn && running,
      wakeLock,
      start,
      selectRhythm,
      checkRhythm,
      registerShock,
      registerMedication,
      setAdvancedAirway,
      setEpinephrineInterval,
      toggleCompressionPause,
      toggleMetronome,
      toggleRoscItem,
      discard,
    }),
    [
      state,
      now,
      metronomeOn,
      running,
      wakeLock,
      start,
      selectRhythm,
      checkRhythm,
      registerShock,
      registerMedication,
      setAdvancedAirway,
      setEpinephrineInterval,
      toggleCompressionPause,
      toggleMetronome,
      toggleRoscItem,
      discard,
    ],
  );

  return <AclsSessionContext.Provider value={value}>{children}</AclsSessionContext.Provider>;
}

export function useAclsSession(): AclsSession {
  const session = useContext(AclsSessionContext);
  if (!session) throw new Error('useAclsSession precisa do AclsSessionProvider (AppShell)');
  return session;
}

/** Para quem aparece com ou sem a área Ferramentas (a faixa global). */
export function useOptionalAclsSession(): AclsSession | null {
  return useContext(AclsSessionContext);
}
