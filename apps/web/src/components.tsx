/* ============================================================================
 * Miami Stories DOJ Portal
 * Section: Shared Layout and UI Components
 * Owner: albeen-sknight
 * Repository: https://github.com/albeen-sknight
 * Copyright: (c) 2026 albeen-sknight. All rights reserved.
 * Last reviewed: 2026-06-23
 * ========================================================================== */

import { ArrowRight, ExternalLink, Menu, Scale, X } from "lucide-react";
import { PropsWithChildren, useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import type { CurrentUserResponse } from "@shotta-doj/shared";
import { authStartUrl } from "./api";
import { publicNav } from "./data";

const DISCORD_INVITE_URL = "https://discord.gg/sYt6JWAdx7";

export function Layout({ children, me, onLogout }: PropsWithChildren<{ me: CurrentUserResponse | null; onLogout: () => void }>) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [dashboardOpen, setDashboardOpen] = useState(false);
  const { pathname } = useLocation();

  const authenticated = me?.authenticated === true;
  const canViewDashboard = authenticated && (me.actionPermissions.includes("VIEW_DASHBOARD") || me.actionPermissions.includes("ADMIN"));
  const isAdmin = authenticated && me.actionPermissions.includes("ADMIN");

  useEffect(() => {
    if (!drawerOpen) return;
    if (canViewDashboard) setDashboardOpen(pathname.startsWith("/dashboard"));
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [drawerOpen]);

  return (
    <div className="min-h-screen min-w-0 overflow-x-clip bg-ink text-white">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-ink/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <Link to="/" className="flex min-w-0 items-center gap-3">
            <img src="/logo-160.webp" alt="" className="h-10 w-10 shrink-0 rounded-full object-cover ring-1 ring-gold/40 sm:h-11 sm:w-11" />
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold uppercase tracking-[0.14em] text-gold sm:text-sm sm:tracking-[0.18em]">Miami Stories</p>
              <p className="truncate text-sm font-semibold sm:text-base">Department of Justice</p>
            </div>
          </Link>
          <nav className="hidden min-w-0 items-center gap-1 lg:flex">
            {publicNav.map((item) => (
              <NavLink key={item.href} to={item.href} className={navClass}>
                {item.label}
              </NavLink>
            ))}
            <a href={DISCORD_INVITE_URL} target="_blank" rel="noopener noreferrer" className="rounded-md border border-gold/40 px-3 py-2 text-sm font-semibold text-gold hover:bg-gold hover:text-black">
              Join Today
            </a>
            {authenticated ? (
              <div className="ml-2 flex min-w-0 max-w-[15rem] items-center gap-3 rounded-md border border-white/10 px-3 py-2">
                {me.user.avatarUrl ? <img src={me.user.avatarUrl} alt="" className="h-7 w-7 shrink-0 rounded-full" /> : null}
                <Link to="/dashboard" className="max-w-36 truncate text-sm font-semibold">{me.user.discordGlobalName ?? me.user.discordUsername}</Link>
                <button type="button" onClick={onLogout} className="shrink-0 text-sm text-muted hover:text-white">Logout</button>
              </div>
            ) : (
              <a className="ml-2 rounded-md bg-gold px-4 py-2 text-sm font-semibold text-black" href={authStartUrl()}>
                Login with Discord
              </a>
            )}
          </nav>
          {/* Hamburger button visible on all screens */}
          <button
            type="button"
            className="ml-auto inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-white/15 hover:border-gold/50 lg:ml-2"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation drawer"
          >
            <Menu className="h-5 w-5 text-gold" />
          </button>
        </div>
      </header>

      {/* Slide-out Drawer */}
      {drawerOpen && (
        <>
          <div 
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm transition-opacity" 
            onClick={() => setDrawerOpen(false)} 
          />
          <div 
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col border-l border-gold/20 bg-panel p-4 shadow-2xl sm:p-6"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation drawer"
          >
            <div className="mb-4 flex shrink-0 items-center justify-between border-b border-white/10 pb-4">
              <span className="font-semibold text-gold tracking-wide uppercase text-xs">DOJ Portal Menu</span>
              <button 
                type="button" 
                onClick={() => setDrawerOpen(false)}
                className="text-muted hover:text-white"
                aria-label="Close menu"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            {/* User Info Block */}
            {authenticated ? (
              <div className="flex items-center gap-3 bg-black/30 rounded-md border border-white/5 p-3 mb-5">
                {me.user.avatarUrl ? <img src={me.user.avatarUrl} alt="" className="h-10 w-10 rounded-full" /> : null}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate text-white">{me.user.discordGlobalName ?? me.user.discordUsername}</p>
                  <p className="text-xs text-muted truncate">Logged in via Discord</p>
                </div>
                <button 
                  type="button" 
                  onClick={() => { onLogout(); setDrawerOpen(false); }} 
                  className="text-xs font-semibold text-gold hover:text-white border border-gold/30 rounded px-2 py-1"
                >
                  Logout
                </button>
              </div>
            ) : (
              <div className="bg-black/30 rounded-md border border-white/5 p-4 mb-5">
                <a 
                  className="block w-full text-center rounded-md bg-gold px-4 py-2 text-sm font-semibold text-black" 
                  href={authStartUrl()} 
                  onClick={() => setDrawerOpen(false)}
                >
                  Login with Discord
                </a>
              </div>
            )}

            {/* Navigation Lists */}
            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto pr-1">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-gold/60 mb-2">Main</p>
                <div className="grid gap-1">
                  <DrawerLink to="/" label="Home" active={pathname === "/"} onClick={() => setDrawerOpen(false)} />
                  <DrawerLink to="/resources" label="Resources" active={pathname === "/resources"} onClick={() => setDrawerOpen(false)} />
                  <DrawerLink to="/faq" label="FAQ" active={pathname === "/faq"} onClick={() => setDrawerOpen(false)} />
                  <DrawerLink to="/docket" label="Docket" active={pathname === "/docket"} onClick={() => setDrawerOpen(false)} />
                  <DrawerLink to="/lawyers" label="Lawyers" active={pathname === "/lawyers"} onClick={() => setDrawerOpen(false)} />
                  <DrawerLink to="/services" label="Services" active={pathname === "/services"} onClick={() => setDrawerOpen(false)} />
                </div>
              </div>

              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-gold/60 mb-2">Personal</p>
                <div className="grid gap-1">
                  {authenticated && (
                    <DrawerLink to="/requests/mine" label="My Requests" active={pathname === "/requests/mine"} onClick={() => setDrawerOpen(false)} />
                  )}
                  <DrawerLink to="/bar-exam" label="Bar Exam" active={pathname === "/bar-exam"} onClick={() => setDrawerOpen(false)} />
                </div>
              </div>

              {canViewDashboard && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gold/60 mb-2">Dashboard</p>
                  <button
                    type="button"
                    onClick={() => setDashboardOpen((open) => !open)}
                    className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm font-semibold transition ${
                      pathname.startsWith("/dashboard") ? "border-gold/40 bg-gold/10 text-gold" : "border-white/10 text-zinc-200 hover:border-gold/50"
                    }`}
                    aria-expanded={dashboardOpen}
                  >
                    <span>Dashboard tools</span>
                    <span className="text-xs">{dashboardOpen ? "Hide" : "Show"}</span>
                  </button>
                  {dashboardOpen ? (
                    <div className="mt-2 grid gap-1 pl-2 border-l border-white/10">
                      <DrawerLink to="/dashboard" label="Overview" active={pathname === "/dashboard"} onClick={() => setDrawerOpen(false)} />
                      {canViewJudicialTools(me) && (
                        <DrawerLink to="/dashboard/judicial" label="Judicial" active={pathname === "/dashboard/judicial"} onClick={() => setDrawerOpen(false)} />
                      )}
                      {canManageDocket(me) && (
                        <DrawerLink to="/dashboard/docket" label="Docket Tools" active={pathname.startsWith("/dashboard/docket")} onClick={() => setDrawerOpen(false)} />
                      )}
                      {canManageRequests(me) && (
                        <DrawerLink to="/dashboard/requests" label="Service Requests" active={pathname.startsWith("/dashboard/requests")} onClick={() => setDrawerOpen(false)} />
                      )}
                      {isAdmin && (
                        <DrawerLink to="/dashboard/discord" label="Discord Diagnostics" active={pathname === "/dashboard/discord"} onClick={() => setDrawerOpen(false)} />
                      )}
                      {canUseDeletionLog(me) && (
                        <DrawerLink to="/dashboard/deletion-log" label="Deletion Log" active={pathname === "/dashboard/deletion-log"} onClick={() => setDrawerOpen(false)} />
                      )}
                      {canViewTranscripts(me) && (
                        <DrawerLink to="/dashboard/transcripts" label="Ticket Transcripts" active={pathname.startsWith("/dashboard/transcripts")} onClick={() => setDrawerOpen(false)} />
                      )}
                      {canManageResources(me) && (
                        <DrawerLink to="/dashboard/resources" label="Resource Admin" active={pathname === "/dashboard/resources"} onClick={() => setDrawerOpen(false)} />
                      )}
                      {canManageFaq(me) && (
                        <DrawerLink to="/dashboard/faq" label="FAQ Admin" active={pathname === "/dashboard/faq"} onClick={() => setDrawerOpen(false)} />
                      )}
                      {canUseBarWorkspace(me) && (
                        <DrawerLink to="/dashboard/bar" label="Bar Admin" active={pathname === "/dashboard/bar"} onClick={() => setDrawerOpen(false)} />
                      )}
                      {canReviewBarExam(me) && (
                        <DrawerLink to="/dashboard/bar-exam" label="Bar Exam Review" active={pathname.startsWith("/dashboard/bar-exam") && pathname !== "/dashboard/bar-exam/versions"} onClick={() => setDrawerOpen(false)} />
                      )}
                      {canReviewBarExam(me) && (
                        <DrawerLink to="/dashboard/bar-exam/versions" label="Bar Exam Versions" active={pathname === "/dashboard/bar-exam/versions"} onClick={() => setDrawerOpen(false)} />
                      )}
                    </div>
                  ) : null}
                </div>
              )}

              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-gold/60 mb-2">CTA</p>
                <div className="grid gap-1">
                  <a href={DISCORD_INVITE_URL} target="_blank" rel="noopener noreferrer" onClick={() => setDrawerOpen(false)} className="rounded-md border border-gold/30 px-3 py-2 text-sm font-semibold text-gold hover:bg-gold hover:text-black">
                    Join Today
                  </a>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
      <main className="min-w-0">{children}</main>
      <LegalFooter />
    </div>
  );
}

function LegalFooter() {
  const links = [
    ["Legal Notice", "/legal"],
    ["Privacy Policy", "/privacy"],
    ["Cookie Policy", "/cookies"],
    ["Terms of Use", "/terms"],
    ["Contact / DOJ Portal", "/services"]
  ] as const;
  return (
    <footer className="border-t border-white/10 bg-black px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-6 text-sm text-muted lg:grid-cols-[0.85fr_1.15fr]">
        <div className="flex min-w-0 gap-4">
          <img src="/logo-160.webp" alt="" className="h-12 w-12 shrink-0 rounded-full object-cover ring-1 ring-gold/40" />
          <div className="min-w-0">
            <p className="font-semibold text-white">Miami Stories Department of Justice</p>
            <p className="mt-1 text-gold">Integrity. Due Process. Public Trust.</p>
            <p className="mt-2">Miami Stories, Miami, Florida</p>
          </div>
        </div>
        <div className="space-y-4">
          <p className="text-zinc-300">(c) 2026 Miami Stories Department of Justice Portal. All rights reserved.</p>
          <p>
            Unauthorized copying, redistribution, resale, sublicensing, scraping, republication, cloning, modification,
            derivative use, or reuse of this portal, its design, source code, written materials, workflows, records
            structure, forms, templates, administrative systems, or branding is prohibited without prior permission from
            the project owner.
          </p>
          <p>This portal is for Miami Stories community proceedings and administrative use. It does not provide real-world legal advice.</p>
          <nav className="flex flex-wrap gap-x-4 gap-y-2" aria-label="Legal and policy links">
            {links.map(([label, href]) => (
              <Link key={href} to={href} className="font-semibold text-gold hover:text-white">
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </footer>
  );
}

function navClass({ isActive }: { isActive: boolean }) {
  return `rounded-md px-3 py-2 text-sm font-medium transition ${isActive ? "bg-white/10 text-white" : "text-muted hover:bg-white/5 hover:text-white"}`;
}

export function PageHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <section className="border-b border-white/10 bg-raised px-4 py-14 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl min-w-0">
        <p className="break-words text-sm font-semibold uppercase tracking-[0.18em] text-gold">{eyebrow}</p>
        <h1 className="mt-3 max-w-4xl break-words text-3xl font-semibold sm:text-5xl">{title}</h1>
        <p className="mt-4 max-w-3xl break-words text-base text-muted sm:text-lg">{description}</p>
      </div>
    </section>
  );
}

export function Card({ children, className = "" }: PropsWithChildren<{ className?: string }>) {
  return <div className={`min-w-0 max-w-full break-words rounded-md border border-white/10 bg-panel p-4 shadow-gold sm:p-5 ${className}`}>{children}</div>;
}

export function ButtonLink({ href, children, variant = "primary" }: PropsWithChildren<{ href: string; variant?: "primary" | "ghost" }>) {
  return (
    <Link
      to={href}
      className={
        variant === "primary"
          ? "inline-flex w-full items-center justify-center gap-2 rounded-md bg-gold px-4 py-3 text-sm font-semibold text-black sm:w-auto"
          : "inline-flex w-full items-center justify-center gap-2 rounded-md border border-white/15 px-4 py-3 text-sm font-semibold text-white hover:bg-white/10 sm:w-auto"
      }
    >
      {children}
      <ArrowRight className="h-4 w-4" />
    </Link>
  );
}

export function ExternalAnchor({ href, children }: PropsWithChildren<{ href: string }>) {
  const safeHref = safeExternalHref(href);
  if (!safeHref) {
    return <span className="inline-flex max-w-full items-center gap-2 break-all text-sm font-semibold text-muted">Invalid external link</span>;
  }
  return (
    <a className="inline-flex max-w-full items-center gap-2 break-all text-sm font-semibold text-gold hover:text-white" href={safeHref} target="_blank" rel="noreferrer">
      {children}
      <ExternalLink className="h-4 w-4 shrink-0" />
    </a>
  );
}

function safeExternalHref(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function Badge({ children }: PropsWithChildren) {
  return <span className="max-w-full break-words rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-gold">{children}</span>;
}

export function Markdown({ content }: { content: string }) {
  const blocks = content.split(/\n{2,}/);
  return (
    <div className="space-y-3 text-sm leading-6 text-zinc-200">
      {blocks.map((block, index) => {
        const lines = block.split("\n").filter(Boolean);
        if (lines.every((line) => line.trim().startsWith("- "))) {
          return (
            <ul key={index} className="list-disc space-y-1 pl-5">
              {lines.map((line) => (
                <li key={line}>{renderInline(line.replace(/^- /, ""))}</li>
              ))}
            </ul>
          );
        }
        return <p key={index} className="break-words">{renderInline(block)}</p>;
      })}
    </div>
  );
}

function renderInline(text: string) {
  const match = text.match(/^(.*)\[([^\]]+)\]\(([^)]+)\)(.*)$/);
  if (!match) return text;
  const safeHref = safeMarkdownHref(match[3]);
  if (!safeHref) {
    return (
      <>
        {match[1]}
        {match[2]}
        {match[4]}
      </>
    );
  }
  if (safeHref.startsWith("/")) {
    return (
      <>
        {match[1]}
        <Link className="text-gold underline-offset-4 hover:underline" to={safeHref}>
          {match[2]}
        </Link>
        {match[4]}
      </>
    );
  }
  return (
    <>
      {match[1]}
      <a className="text-gold underline-offset-4 hover:underline" href={safeHref} target="_blank" rel="noreferrer">
        {match[2]}
      </a>
      {match[4]}
    </>
  );
}

function safeMarkdownHref(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return trimmed;
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function LoadingState() {
  return <Card>Loading DOJ records...</Card>;
}

export function ErrorState({ message }: { message: string }) {
  return <Card className="border-red-500/40 text-red-100">{message}</Card>;
}

function DrawerLink({ to, label, active, onClick }: { to: string; label: string; active: boolean; onClick: () => void }) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className={`block break-words rounded-md px-3 py-2 text-sm font-medium transition ${
        active 
          ? "bg-gold/10 text-gold border-l-2 border-gold pl-2.5" 
          : "text-muted hover:bg-white/5 hover:text-white"
      }`}
    >
      {label}
    </Link>
  );
}

function canManageDocket(me: CurrentUserResponse | null): boolean {
  return me?.authenticated === true && (me.actionPermissions.includes("CREATE_DOCKET") || me.actionPermissions.includes("PUBLISH_DOCKET") || me.actionPermissions.includes("ADMIN"));
}

function canViewJudicialTools(me: CurrentUserResponse | null): boolean {
  return me?.authenticated === true && (
    canManageDocket(me) ||
    me.permissions.includes("BAR_ACTIVE") ||
    me.permissions.includes("BAR_ASSOCIATION_MEMBER") ||
    me.permissions.includes("DEFENSE_ATTORNEY") ||
    me.permissions.includes("PUBLIC_DEFENDER_CERTIFIED") ||
    me.permissions.includes("JUDGE") ||
    me.permissions.includes("JUSTICE") ||
    me.permissions.includes("CHIEF_JUSTICE") ||
    me.permissions.includes("ADMIN")
  );
}

function canManageResources(me: CurrentUserResponse | null): boolean {
  return me?.authenticated === true && (me.actionPermissions.includes("MANAGE_RESOURCES") || me.actionPermissions.includes("ADMIN"));
}

function canManageFaq(me: CurrentUserResponse | null): boolean {
  return me?.authenticated === true && (me.actionPermissions.includes("MANAGE_FAQ") || me.actionPermissions.includes("ADMIN"));
}

function canUseBarWorkspace(me: CurrentUserResponse | null): boolean {
  return me?.authenticated === true && (me.actionPermissions.includes("REVIEW_BAR_EXAMS") || me.actionPermissions.includes("MANAGE_ATTORNEY_REGISTRY") || me.actionPermissions.includes("ADMIN"));
}

function canReviewBarExam(me: CurrentUserResponse | null): boolean {
  return me?.authenticated === true && (me.actionPermissions.includes("REVIEW_BAR_EXAMS") || me.actionPermissions.includes("ADMIN"));
}

function canManageRequests(me: CurrentUserResponse | null): boolean {
  return me?.authenticated === true && (me.actionPermissions.includes("MANAGE_REQUESTS") || me.actionPermissions.includes("ADMIN"));
}

function canViewTranscripts(me: CurrentUserResponse | null): boolean {
  return me?.authenticated === true && (
    canManageRequests(me) ||
    canManageDocket(me) ||
    me.actionPermissions.includes("REVIEW_BAR_EXAMS") ||
    me.actionPermissions.includes("ADMIN")
  );
}

function canUseDeletionLog(me: CurrentUserResponse | null): boolean {
  return me?.authenticated === true && (me.permissions.includes("CHIEF_JUSTICE") || me.permissions.includes("JUSTICE"));
}
