"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Stethoscope } from "@phosphor-icons/react";
import { useAuth } from "@/lib/auth-store";
import { cn } from "@/lib/utils";
import type { NavItem } from "@/components/layout/clinical-sidebar";

export interface FocusRailProps {
  navItems: NavItem[];
}

export function FocusRail({ navItems }: FocusRailProps) {
  const pathname = usePathname();
  const { physician } = useAuth();

  const initials = (physician?.name ?? "Dr").slice(0, 2).toUpperCase();

  return (
    <aside
      className="flex w-[68px] shrink-0 flex-col items-center gap-2 py-5"
      style={{ background: "var(--sidebar-dark-bg)" }}
    >
      <span
        className="mb-3 flex h-9 w-9 items-center justify-center rounded-[10px]"
        style={{ background: "var(--sidebar-dark-bg-elevated)" }}
      >
        <Stethoscope
          className="h-[19px] w-[19px]"
          style={{ color: "var(--sidebar-dark-accent)" }}
        />
      </span>

      {navItems.map((item) => {
        const isActive =
          pathname === item.href || pathname.startsWith(item.href + "/");
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-label={item.label}
            aria-current={isActive ? "page" : undefined}
            title={item.label}
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-[10px] transition-colors",
            )}
            style={{
              background: isActive
                ? "var(--sidebar-dark-bg-elevated)"
                : "transparent",
              color: isActive
                ? "var(--sidebar-dark-accent)"
                : "var(--sidebar-dark-text-muted)",
            }}
          >
            <Icon className="h-[19px] w-[19px]" />
          </Link>
        );
      })}

      <div className="flex-1" />

      <span
        className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold"
        style={{
          background: "var(--sidebar-dark-accent)",
          color: "var(--sidebar-dark-bg)",
        }}
      >
        {initials}
      </span>
    </aside>
  );
}
