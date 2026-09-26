"use client";

import { Bell, ChevronDown, ChevronRight, CircleHelp, Download, Grip, Search, Settings, Smile } from "lucide-react";

/** Stylised gold column-chart mark used as the product logo. */
export function PbiLogo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <rect x="13" y="2" width="6" height="20" rx="1.5" fill="#F2C811" />
      <rect x="8" y="7" width="6" height="15" rx="1.5" fill="#E8B00F" />
      <rect x="3" y="12" width="6" height="10" rx="1.5" fill="#C99A0E" />
    </svg>
  );
}

/** Dark global header of the Power BI service. */
export function TopBar() {
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 bg-pbi-dark px-2 text-white no-print">
      <button className="grid h-10 w-10 place-items-center rounded-sm hover:bg-white/10" aria-label="App launcher">
        <Grip size={18} />
      </button>
      <div className="flex items-center gap-2 pr-2">
        <PbiLogo />
        <span className="text-[15px] font-semibold tracking-tight">Power BI</span>
      </div>

      <nav className="hidden min-w-0 items-center gap-1 text-[13px] text-white/90 md:flex">
        <span className="truncate hover:underline">Retail Banking Analytics</span>
        <ChevronRight size={14} className="shrink-0 text-white/50" />
        <button className="flex min-w-0 items-center gap-1 rounded-sm px-1.5 py-1 hover:bg-white/10">
          <span className="truncate font-semibold">Customer Churn &amp; LTV Diagnostics</span>
          <ChevronDown size={13} />
        </button>
        <span className="ml-1 hidden rounded-sm border border-white/30 px-1.5 py-[1px] text-[11px] text-white/80 lg:inline">
          Confidential\Internal
        </span>
      </nav>

      <div className="mx-auto hidden w-full max-w-[360px] items-center gap-2 rounded-sm bg-white/95 px-2.5 py-1.5 text-[13px] text-pbi-ink2 xl:flex">
        <Search size={14} />
        <span>Search</span>
      </div>

      <div className="ml-auto flex items-center">
        {[
          { Icon: Bell, label: "Notifications", badge: true },
          { Icon: Settings, label: "Settings" },
          { Icon: Download, label: "Download" },
          { Icon: CircleHelp, label: "Help" },
          { Icon: Smile, label: "Feedback" },
        ].map(({ Icon, label, badge }) => (
          <button key={label} aria-label={label} className="relative hidden h-10 w-10 place-items-center rounded-sm hover:bg-white/10 sm:grid">
            <Icon size={17} strokeWidth={1.6} />
            {badge && <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-pbi-gold" />}
          </button>
        ))}
        <div className="ml-1 grid h-8 w-8 place-items-center rounded-full bg-[#8764B8] text-[12px] font-semibold">DA</div>
      </div>
    </header>
  );
}
