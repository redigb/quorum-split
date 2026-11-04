import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Caveat, IBM_Plex_Mono, Inter } from "next/font/google";
import "./globals.css";

// Display: condensada y pesada para los titulares gigantes (eje wdth 75).
const display = Bricolage_Grotesque({
  variable: "--font-display",
  subsets: ["latin"],
  axes: ["opsz", "wdth"],
});

const sans = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

// Mono: la voz del recibo térmico (etiquetas, montos, libro mayor).
const mono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

// Manuscrita: solo para anotaciones "pegadas" sobre el recibo.
const hand = Caveat({
  variable: "--font-hand",
  subsets: ["latin"],
  weight: ["500", "700"],
});

export const metadata: Metadata = {
  title: "Quorum — Nobody pays until everybody pays",
  description:
    "Split payments for groups that cross borders. Snap the bill, split it fairly, and charge everyone only when the whole group has confirmed.",
};

export const viewport: Viewport = {
  themeColor: "#fbf9ef",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${sans.variable} ${mono.variable} ${hand.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
