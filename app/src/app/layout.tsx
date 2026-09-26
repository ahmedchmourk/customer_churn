import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Customer Churn & LTV Diagnostics - Power BI",
  description:
    "Retail Bank Customer Churn & Lifetime Value (LTV) Diagnostic Analytics Dashboard - Power BI Web Simulator",
  icons: { icon: "/favicon.svg" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
