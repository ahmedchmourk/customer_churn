"use client";

import { ChevronDown, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

export interface MenuItem {
  label: string;
  icon?: LucideIcon;
  onClick?: () => void;
  disabled?: boolean;
  divider?: boolean;
}

/** Fluent-style dropdown used by the action bar ("File", "Export", "View"). */
export function Menu({ label, icon: Icon, items, align = "left" }: { label: ReactNode; icon?: LucideIcon; items: MenuItem[]; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex h-8 items-center gap-1.5 rounded-sm px-2 text-[13px] text-pbi-ink hover:bg-pbi-hover ${open ? "bg-pbi-hover" : ""}`}
      >
        {Icon && <Icon size={15} strokeWidth={1.6} />}
        {label}
        <ChevronDown size={13} strokeWidth={1.6} />
      </button>
      {open && (
        <div
          className={`absolute top-9 z-50 min-w-[220px] rounded-sm border border-pbi-line bg-white py-1 shadow-[0_6px_16px_rgba(0,0,0,0.14)] ${align === "right" ? "right-0" : "left-0"}`}
        >
          {items.map((item, i) =>
            item.divider ? (
              <div key={i} className="my-1 border-t border-pbi-line" />
            ) : (
              <button
                key={i}
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  item.onClick?.();
                }}
                className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] text-pbi-ink hover:bg-pbi-hover disabled:cursor-not-allowed disabled:text-pbi-muted"
              >
                {item.icon ? <item.icon size={15} strokeWidth={1.5} /> : <span className="w-[15px]" />}
                {item.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
