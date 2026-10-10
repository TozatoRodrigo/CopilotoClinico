'use client';

/**
 * UX-05 — Convite de instalação do PWA na tela inicial do celular.
 *
 * Contexto da reunião: decisão consciente de NÃO publicar nas lojas de app
 * neste momento (custo de conta de desenvolvedor Apple + máquina macOS
 * dedicada), usando o navegador com atalho instalável como caminho técnico.
 * A infraestrutura (manifest.json, ícones) já existia — faltava só o
 * momento de UX que converte "site que abri uma vez" em "app no bolso".
 *
 * Regras de comportamento (ver ticket UX-05):
 * - Aparece só depois da primeira análise concluída com sucesso — nunca no
 *   primeiro segundo da primeira visita (chamar markFirstAnalysisDone()).
 * - Só em mobile (< 768px) e fora do modo standalone.
 * - Android/Chrome: captura `beforeinstallprompt` e dispara no toque do CTA.
 * - iOS/Safari: não existe API de instalação — mostra instrução visual
 *   (Compartilhar → Adicionar à Tela de Início).
 * - Dispensa: no máximo 1x por sessão, no máximo 2x no total (localStorage).
 */
import { useCallback, useEffect, useState } from 'react';
import { DownloadSimple, Export, X } from '@phosphor-icons/react';
import { LogoMark } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const ANALYSIS_DONE_KEY = 'pwa_install_first_analysis_done';
const DISMISS_COUNT_KEY = 'pwa_install_dismiss_count';
const SESSION_DISMISS_KEY = 'pwa_install_dismissed_this_session';
const MAX_TOTAL_DISMISSALS = 2;
const MOBILE_BREAKPOINT_PX = 768;

/** Chamar após a primeira análise concluída com sucesso (ver capture/page.tsx). */
export function markFirstAnalysisDone(): void {
  try {
    localStorage.setItem(ANALYSIS_DONE_KEY, '1');
  } catch {
    // storage indisponível — não é crítico, o banner simplesmente não aparece
  }
}

type Platform = 'ios' | 'android' | 'other';

function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent;
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    // iPadOS 13+ finge ser Mac com touch — distingue de um Mac de verdade.
    (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
  if (isIOS) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'other';
}

function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false;
  const iosStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone;
  return window.matchMedia?.('(display-mode: standalone)').matches === true || iosStandalone === true;
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

function readDismissCount(): number {
  try {
    return Number(localStorage.getItem(DISMISS_COUNT_KEY) ?? '0');
  } catch {
    return 0;
  }
}

export function InstallPromptBanner() {
  // Detecção de ambiente via inicializador preguiçoso do useState (roda uma
  // única vez por montagem, não a cada render) em vez de useEffect — evita
  // "setState síncrono dentro de efeito" (react-hooks/set-state-in-effect).
  // Seguro para SSR: `window`/`navigator` são guardados, e o componente só
  // renderiza algo além de `null` quando `visible` vira true — o que nunca
  // acontece na passagem de servidor — então não há risco de mismatch de
  // hidratação mesmo que o valor inicial "correto" só apareça no cliente.
  const [platform] = useState<Platform>(() =>
    typeof window === 'undefined' ? 'other' : detectPlatform(),
  );
  const [eligible] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return (
      detectPlatform() !== 'other' &&
      window.innerWidth < MOBILE_BREAKPOINT_PX &&
      !isStandaloneDisplay()
    );
  });
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  // Android/Chrome: captura o prompt nativo em vez de deixá-lo disparar
  // sozinho, para controlar o momento (só depois da 1ª análise).
  useEffect(() => {
    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    }
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  useEffect(() => {
    if (!eligible) return;
    // iOS não tem beforeinstallprompt — a instrução visual não depende dele.
    if (platform === 'android' && !deferredPrompt) return;

    function evaluateVisibility() {
      try {
        const analysisDone = localStorage.getItem(ANALYSIS_DONE_KEY) === '1';
        const dismissedThisSession = sessionStorage.getItem(SESSION_DISMISS_KEY) === '1';
        const dismissCount = readDismissCount();
        if (analysisDone && !dismissedThisSession && dismissCount < MAX_TOTAL_DISMISSALS) {
          setVisible(true);
        }
      } catch {
        // storage indisponível — não mostra (falha silenciosa e segura)
      }
    }

    evaluateVisibility();
    // A primeira análise pode acontecer DEPOIS deste efeito já ter rodado
    // (o banner monta uma vez no layout raiz) — reavalia quando o
    // localStorage muda em outra aba/página da mesma sessão.
    window.addEventListener('storage', evaluateVisibility);
    return () => window.removeEventListener('storage', evaluateVisibility);
  }, [eligible, platform, deferredPrompt]);

  const dismiss = useCallback(() => {
    setVisible(false);
    try {
      sessionStorage.setItem(SESSION_DISMISS_KEY, '1');
      localStorage.setItem(DISMISS_COUNT_KEY, String(readDismissCount() + 1));
    } catch {
      // não-crítico
    }
  }, []);

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setVisible(false);
  }, [deferredPrompt]);

  if (!visible) return null;

  // Cartão estilo toast do Notion (sombra de popover). No mobile fica acima
  // da barra inferior do AppShell (~56px + safe area) para não cobri-la.
  return (
    <div
      role="region"
      aria-label="Instalar o Copiloto Clínico na tela inicial"
      className={cn(
        'fixed inset-x-3 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-50 rounded-xl bg-popover p-3 text-popover-foreground shadow-lg',
        'duration-200 animate-in fade-in-0 slide-in-from-bottom-2',
        'sm:inset-x-auto sm:right-4 sm:w-[22rem] md:bottom-4',
      )}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-background"
        >
          <LogoMark />
        </span>
        <div className="min-w-0 flex-1 space-y-0.5 pt-0.5">
          <p className="text-sm font-semibold text-foreground">Adicionar à tela inicial</p>
          {platform === 'ios' ? (
            <p className="text-[0.8125rem] text-pretty text-muted-foreground">
              Toque em <Export className="inline size-3.5 align-text-bottom" aria-hidden="true" />{' '}
              <strong className="font-medium text-foreground">Compartilhar</strong> e depois em{' '}
              <strong className="font-medium text-foreground">&quot;Adicionar à Tela de Início&quot;</strong>{' '}
              para abrir o Copiloto direto do seu celular, sem o navegador.
            </p>
          ) : (
            <p className="text-[0.8125rem] text-pretty text-muted-foreground">
              Acesse o Copiloto direto do seu celular, como um aplicativo — sem abrir o navegador
              toda vez.
            </p>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={dismiss}
          aria-label="Dispensar"
          className="-mt-1 -mr-1 text-muted-foreground"
        >
          <X />
        </Button>
      </div>
      {platform === 'android' && (
        <div className="mt-3 flex justify-end pl-[3.25rem]">
          <Button size="sm" className="max-sm:h-10 max-sm:w-full max-sm:text-sm" onClick={() => void handleInstall()}>
            <DownloadSimple aria-hidden="true" />
            Instalar
          </Button>
        </div>
      )}
    </div>
  );
}
