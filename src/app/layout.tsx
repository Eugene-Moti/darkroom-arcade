import type { Metadata, Viewport } from "next";
import { Chakra_Petch, Inter, JetBrains_Mono } from "next/font/google";
import { ToastProvider } from "@/components/toast";
import { ServiceWorker } from "@/components/service-worker";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const chakra = Chakra_Petch({ variable: "--font-chakra", subsets: ["latin"], weight: ["500", "600", "700"] });
const mono = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"], weight: ["500", "700"] });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: { default: "Darkroom Arcade", template: "%s · Darkroom Arcade" },
  description: "Session timing, receipts and daily reports for Darkroom Arcade — PS5 gaming lounge.",
  applicationName: "Darkroom Arcade",
  appleWebApp: { capable: true, title: "Darkroom", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#050505",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${chakra.variable} ${mono.variable}`}>
      <body>
        <div id="app">
          <ToastProvider>{children}</ToastProvider>
        </div>
        <div id="print-root" />
        <ServiceWorker />
      </body>
    </html>
  );
}
