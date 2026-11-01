import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./parents.css";

export const metadata: Metadata = {
  title: "KidsDaily365 · Ein Schritt nach dem anderen",
  description: "Ein übersichtlicher Tagesplan für deine Familie.",
  manifest: "/manifest.webmanifest",
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#f5f6f2" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="de"><body>{children}</body></html>;
}
