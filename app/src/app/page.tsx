import { ReportShell } from "@/components/shell/ReportShell";
import { ReportProvider } from "@/context/ReportContext";

export default function Home() {
  return (
    <ReportProvider>
      <ReportShell />
    </ReportProvider>
  );
}
