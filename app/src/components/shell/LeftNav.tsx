"use client";

import {
  Activity,
  ChartColumnBig,
  CirclePlus,
  Database,
  FolderOpen,
  GraduationCap,
  House,
  LayoutGrid,
  Layers,
  Menu as MenuIcon,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { PbiLogo } from "./TopBar";

const NAV: { label: string; icon: LucideIcon }[] = [
  { label: "Home", icon: House },
  { label: "Create", icon: CirclePlus },
  { label: "Browse", icon: FolderOpen },
  { label: "OneLake", icon: Database },
  { label: "Apps", icon: LayoutGrid },
  { label: "Metrics", icon: Trophy },
  { label: "Monitor", icon: Activity },
  { label: "Learn", icon: GraduationCap },
  { label: "Workspaces", icon: Layers },
];

interface NavItemProps {
  label: string;
  icon: LucideIcon;
  accent?: boolean;
  expanded: boolean;
  isActive: boolean;
  onSelect: (label: string) => void;
}

function NavItem({ label, icon: Icon, accent, expanded, isActive, onSelect }: NavItemProps) {
  return (
    <button
      onClick={() => onSelect(label)}
      title={label}
      className={`relative flex w-full items-center rounded-sm hover:bg-pbi-hover ${
        expanded ? "h-9 gap-3 px-3" : "h-[54px] flex-col justify-center gap-1 px-1"
      } ${isActive ? "bg-pbi-hover font-semibold" : ""}`}
    >
      {isActive && <span className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r bg-pbi-gold" />}
      {accent ? (
        <span className="grid h-5 w-5 place-items-center rounded-[3px] bg-[#117865] text-white">
          <Icon size={12} strokeWidth={2} />
        </span>
      ) : (
        <Icon size={19} strokeWidth={1.5} className="text-pbi-ink" />
      )}
      <span className={`${expanded ? "text-[13px]" : "max-w-full truncate text-[10px] leading-tight"} text-pbi-ink`}>{label}</span>
    </button>
  );
}

/** Power BI service left navigation rail. */
export function LeftNav() {
  const [expanded, setExpanded] = useState(false);
  const [active, setActive] = useState("Retail Analytics");

  return (
    <aside
      className={`hidden shrink-0 flex-col border-r border-pbi-line bg-[#FAF9F8] py-1 md:flex no-print ${expanded ? "w-[220px]" : "w-[76px]"} transition-[width] duration-150`}
    >
      <button
        aria-label="Expand navigation"
        onClick={() => setExpanded((e) => !e)}
        className={`mb-1 flex h-9 items-center rounded-sm hover:bg-pbi-hover ${expanded ? "px-3" : "justify-center"}`}
      >
        <MenuIcon size={18} strokeWidth={1.5} />
      </button>
      <div className="flex flex-col gap-0.5 px-1">
        {NAV.map((n) => (
          <NavItem key={n.label} {...n} expanded={expanded} isActive={active === n.label} onSelect={setActive} />
        ))}
        <div className="mx-2 my-1.5 border-t border-pbi-line" />
        <NavItem label="Retail Analytics" icon={ChartColumnBig} accent expanded={expanded} isActive={active === "Retail Analytics"} onSelect={setActive} />
      </div>
      <div className="mt-auto flex flex-col items-center gap-1 pb-2 pt-3">
        <PbiLogo size={26} />
        {!expanded ? null : <span className="text-[12px] font-semibold">Power BI</span>}
      </div>
    </aside>
  );
}
