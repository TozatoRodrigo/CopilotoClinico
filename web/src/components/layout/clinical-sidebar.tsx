"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Microphone, Stethoscope, WifiHigh } from "@phosphor-icons/react";
import { useAuth } from "@/lib/auth-store";
import { useOnlineStatus } from "@/components/providers/offline-provider";
import { cn } from "@/lib/utils";

export interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  /** Contador opcional exibido à direita do item (ex: casos aguardando). */
  count?: number | string;
}

export interface ClinicalSidebarProps {
  navItems: NavItem[];
  showShiftWidget?: boolean;
  showOnlineStatus?: boolean;
  institutionName?: string;
}

function ShiftClock() {
  const [time, setTime] = React.useState("");

  React.useEffect(() => {
    function update() {
      const now = new Date();
      setTime(
        now.toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      );
    }
    update();
    const interval = setInterval(update, 30_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <span style={{ fontFamily: "var(--font-ibm-plex-mono)" }} className="text-[1.625rem] font-medium">
      {time || "--:--"}
    </span>
  );
}

export function ClinicalSidebar({
  navItems,
  showShiftWidget = false,
  showOnlineStatus = false,
  institutionName,
}: ClinicalSidebarProps) {
  const pathname = usePathname();
  const { physician } = useAuth();
  const { isOnline } = useOnlineStatus();

  const initials = (physician?.name ?? "Dr").slice(0, 2).toUpperCase();
  const crmFormatted = physician
    ? `CRM ${physician.crmUf}-${physician.crmNumber}`
    : "";

  return (
    <aside
      className="flex w-[264px] shrink-0 flex-col p-5"
      style={{
        background: "var(--sidebar-dark-bg)",
        color: "var(--sidebar-dark-text)",
      }}
    >
      <div className="flex items-center gap-2.5 px-2 pb-5">
        <span
          className="flex h-[34px] w-[34px] items-center justify-center rounded-[9px]"
          style={{ background: "var(--sidebar-dark-bg-elevated)" }}
        >
          <Stethoscope
            className="h-[19px] w-[19px]"
            style={{ color: "var(--sidebar-dark-accent)" }}
          />
        </span>
        <div>
          <p
            className="text-[0.9rem] font-semibold"
            style={{ color: "var(--sidebar-dark-text-bright)" }}
          >
            Copiloto Clínico
          </p>
          {institutionName && (
            <p
              className="text-[0.7rem]"
              style={{ color: "var(--sidebar-dark-text-dim)" }}
            >
              {institutionName}
            </p>
          )}
        </div>
      </div>

      <Link
        href="/encounters/new"
        className="mb-4 flex h-11 shrink-0 items-center justify-center gap-2 rounded-[10px] text-[0.86rem] font-bold transition-opacity hover:opacity-90"
        style={{
          background: "var(--sidebar-dark-accent)",
          color: "var(--sidebar-dark-bg)",
        }}
      >
        <Microphone className="h-[18px] w-[18px]" weight="fill" />
        Novo caso
      </Link>

      {showShiftWidget && (
        <div
          className="mb-5 rounded-xl p-3.5"
          style={{ border: "1px solid var(--sidebar-dark-border-subtle)" }}
        >
          <div className="flex items-center justify-between">
            <p
              className="text-[0.7rem] font-semibold uppercase tracking-[0.08em]"
              style={{ color: "var(--sidebar-dark-text-dim)" }}
            >
              Plantão ativo
            </p>
            <span
              className="h-[7px] w-[7px] rounded-full"
              style={{ background: "var(--sidebar-dark-green-online)" }}
            />
          </div>
          <ShiftClock />
          <p
            className="mt-0.5 text-[0.72rem]"
            style={{
              fontFamily: "var(--font-ibm-plex-mono)",
              color: "var(--sidebar-dark-text-dim)",
            }}
          >
            07:00 → 19:00
          </p>
        </div>
      )}

      <nav aria-label="Navegação principal" className="flex flex-col gap-0.5">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-[0.84rem] font-medium transition-colors",
              )}
              style={{
                background: isActive
                  ? "var(--sidebar-dark-bg-elevated)"
                  : "transparent",
                color: isActive
                  ? "var(--sidebar-dark-text-bright)"
                  : "var(--sidebar-dark-text-muted)",
                borderLeft: isActive
                  ? "3px solid var(--sidebar-dark-accent)"
                  : "3px solid transparent",
              }}
            >
              <Icon className="h-[17px] w-[17px]" />
              <span className="flex-1">{item.label}</span>
              {item.count !== undefined && item.count !== null && item.count !== '' && (
                <span
                  className="font-mono text-[0.7rem]"
                  style={{
                    color: isActive
                      ? "var(--sidebar-dark-text-bright)"
                      : "var(--sidebar-dark-text-dim)",
                  }}
                >
                  {item.count}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="flex-1" />

      {showOnlineStatus && (
        <div
          className="mb-3 flex items-center gap-2 rounded-[9px] px-2.5 py-2 text-xs"
          style={{
            color: "var(--sidebar-dark-text-muted)",
            background: "rgba(255,255,255,0.05)",
          }}
        >
          <WifiHigh
            className="h-[15px] w-[15px]"
            style={{ color: "var(--sidebar-dark-green-online)" }}
          />
          {isOnline ? "Online · fila sincronizada" : "Offline"}
        </div>
      )}

      <div
        className="flex items-center gap-2.5 pt-3.5"
        style={{ borderTop: "1px solid var(--sidebar-dark-divider)" }}
      >
        <span
          className="flex h-9 w-9 items-center justify-center rounded-full text-[0.8rem] font-bold"
          style={{
            background: "var(--sidebar-dark-accent)",
            color: "var(--sidebar-dark-bg)",
          }}
        >
          {initials}
        </span>
        <div className="min-w-0">
          <p
            className="text-[0.8rem] font-semibold"
            style={{ color: "var(--sidebar-dark-text-bright)" }}
          >
            {physician?.name ?? "Médico"}
          </p>
          <p
            className="text-[0.66rem]"
            style={{
              fontFamily: "var(--font-ibm-plex-mono)",
              color: "var(--sidebar-dark-text-dim)",
            }}
          >
            {crmFormatted}
            {!physician?.crmVerified && (
              <span style={{ color: "#F5C36B" }}> · verificação pendente</span>
            )}
          </p>
        </div>
      </div>
    </aside>
  );
}
