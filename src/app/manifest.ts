import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Darkroom Arcade",
    short_name: "Darkroom",
    description: "Session timing, receipts and daily reports for Darkroom Arcade.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["window-controls-overlay", "standalone"],
    orientation: "any",
    background_color: "#050505",
    theme_color: "#050505",
    categories: ["business", "productivity", "games"],
    icons: [
      ...[72, 96, 128, 144, 152, 192, 384, 512].map((s) => ({
        src: `/icons/icon-${s}.png`,
        sizes: `${s}x${s}`,
        type: "image/png",
        purpose: "any" as const,
      })),
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/brand/emblem.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
    shortcuts: [
      { name: "Floor", url: "/", icons: [{ src: "/icons/icon-96.png", sizes: "96x96" }] },
      { name: "Daily report", url: "/reports", icons: [{ src: "/icons/icon-96.png", sizes: "96x96" }] },
      { name: "Receipts", url: "/sessions", icons: [{ src: "/icons/icon-96.png", sizes: "96x96" }] },
    ],
  };
}
