"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import clsx from "clsx";
import {
  BarChart3,
  FileText,
  LayoutDashboard,
  MessageCircleQuestion,
  Users,
} from "lucide-react";

type AppShellProps = {
  children: React.ReactNode;
};

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/meeting-room", label: "Meeting Room", icon: Users, requiresConfirmation: true },
  { href: "/group-interview", label: "Group Interview", icon: Users },
  { href: "/resume", label: "Resume", icon: FileText },
  { href: "/interview", label: "Interview", icon: MessageCircleQuestion },
  { href: "/results", label: "Results", icon: BarChart3 },
];

const shellRoutes = new Set([
  "/dashboard",
  "/meeting-room", "/resume",
  "/group-interview",
  "/interview",
  "/results",
  "/home",
]);

export function AppShell({ children }: AppShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [pendingRoute, setPendingRoute] = useState<string | null>(null);
  const [isConfirmationOpen, setIsConfirmationOpen] = useState(false);

  const isMeetingRoomPending = useMemo(() => pendingRoute === "/meeting-room", [pendingRoute]);

  const openMeetingRoomConfirmation = (href: string) => {
    setPendingRoute(href);
    setIsConfirmationOpen(true);
  };

  const closeMeetingRoomConfirmation = () => {
    setPendingRoute(null);
    setIsConfirmationOpen(false);
  };

  const confirmMeetingRoomNavigation = () => {
    if (pendingRoute) {
      router.push(pendingRoute);
    }
    closeMeetingRoomConfirmation();
  };

  const shouldShowShell = shellRoutes.has(pathname);
  if (!shouldShowShell) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-[var(--app-bg)] text-[var(--app-fg)]">
      <div className="relative flex w-full">
        {/* ── Desktop Sidebar ─────────────────────────────── */}
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 border-r border-[var(--border-default)] bg-white/70 px-5 py-7 backdrop-blur-2xl lg:flex lg:flex-col">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[var(--accent-primary)]">
              Sentinence
            </p>
            <h1 className="mt-3 text-lg font-bold text-[var(--text-primary)]">
              Interview Studio
            </h1>
            <p className="mt-1.5 text-xs text-[var(--text-tertiary)]">
              Practice, reflect, improve.
            </p>
          </div>

          <nav className="mt-8 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;
              const sharedClassName = clsx(
                "flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-[13px] font-medium transition-all duration-200",
                active
                  ? "border-[var(--accent-primary)]/20 bg-[var(--accent-primary)]/8 text-[var(--accent-primary)] shadow-sm"
                  : "border-transparent text-[var(--text-secondary)] hover:border-[var(--border-default)] hover:bg-[var(--surface-secondary)] hover:text-[var(--text-primary)]"
              );

              if (item.requiresConfirmation) {
                return (
                  <button
                    key={item.href}
                    type="button"
                    onClick={() => openMeetingRoomConfirmation(item.href)}
                    className={clsx("w-full", sharedClassName)}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </button>
                );
              }

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={clsx(
                    "flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-[13px] font-medium transition-all duration-200",
                    active
                      ? "border-[var(--accent-primary)]/20 bg-[var(--accent-primary)]/8 text-[var(--accent-primary)] shadow-sm"
                      : "border-transparent text-[var(--text-secondary)] hover:border-[var(--border-default)] hover:bg-[var(--surface-secondary)] hover:text-[var(--text-primary)]"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)] p-3.5 text-xs text-[var(--text-tertiary)] leading-relaxed">
            One thoughtful interview at a time. Keep your momentum going.
          </div>
        </aside>

        {/* ── Main Content ────────────────────────────────── */}
        <main className="w-full px-4 pb-24 pt-6 sm:px-6 lg:px-8 lg:pb-8 lg:pt-8">
          {children}
        </main>
      </div>

      {/* ── Mobile Bottom Nav ─────────────────────────────── */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-[var(--border-default)] bg-white/85 px-3 py-2 backdrop-blur-2xl lg:hidden">
        <div
          className="mx-auto grid max-w-xl gap-1"
          style={{
            gridTemplateColumns: `repeat(${navItems.length}, minmax(0, 1fr))`,
          }}
        >
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            const mobileClassName = clsx(
              "flex flex-col items-center justify-center rounded-lg px-2 py-2 text-[11px] font-medium transition-all",
              active ? "bg-[var(--accent-primary)]/8 text-[var(--accent-primary)]" : "text-[var(--text-tertiary)] hover:bg-[var(--surface-secondary)] hover:text-[var(--text-secondary)]"
            );

            if (item.requiresConfirmation) {
              return (
                <button
                  key={item.href}
                  type="button"
                  onClick={() => openMeetingRoomConfirmation(item.href)}
                  className={mobileClassName}
                >
                  <Icon className="mb-1 h-4 w-4" />
                  {item.label}
                </button>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  "flex flex-col items-center justify-center rounded-lg px-2 py-2 text-[11px] font-medium transition-all",
                  active
                    ? "bg-[var(--accent-primary)]/8 text-[var(--accent-primary)]"
                    : "text-[var(--text-tertiary)] hover:bg-[var(--surface-secondary)] hover:text-[var(--text-secondary)]"
                )}
              >
                <Icon className="mb-1 h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>

      {isConfirmationOpen && isMeetingRoomPending ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-[var(--border-default)] bg-[var(--surface-primary)] p-5 shadow-2xl">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-tertiary)]">Meeting Room</p>
            <h2 className="mt-2 text-xl font-semibold text-[var(--text-primary)]">Are you ready to enter the meeting?</h2>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              You are about to join a live team scenario room with discussion prompts.
            </p>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeMeetingRoomConfirmation}
                className="rounded-lg border border-[var(--border-default)] bg-[var(--surface-secondary)] px-4 py-2 text-sm text-[var(--text-secondary)] transition hover:bg-[var(--surface-tertiary)]"
              >
                Not yet
              </button>
              <button
                type="button"
                onClick={confirmMeetingRoomNavigation}
                className="rounded-lg bg-[var(--accent-primary)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--accent-primary)]/90"
              >
                Yes, enter now
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
