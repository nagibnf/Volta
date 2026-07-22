import type { Metadata, Viewport } from "next";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "VOLTA Core",
  description: "Descubra, compare e valide pontos de recarga para veículos elétricos."
};
export const viewport: Viewport = { themeColor: "#0a0e0c", width: "device-width", initialScale: 1 };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
