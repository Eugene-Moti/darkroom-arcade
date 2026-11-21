import { ArcadeProvider } from "@/components/arcade-provider";
import { AppShell } from "@/components/app-shell";
import { PrintProvider } from "@/components/print";
import { MemberPrintProvider } from "@/components/member-print";

// The signed-in area is a live, client-driven dashboard: pages render once the
// staff member's data (realtime sessions, settings) has loaded in the browser,
// behind the app shell + splash. Opt it out of instant-navigation validation,
// which otherwise reports these pages as "dropped" from the server render.
export const instant = false;

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ArcadeProvider>
      <PrintProvider>
        <MemberPrintProvider>
          <AppShell>{children}</AppShell>
        </MemberPrintProvider>
      </PrintProvider>
    </ArcadeProvider>
  );
}
