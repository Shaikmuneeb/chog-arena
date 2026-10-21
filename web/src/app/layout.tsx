import type { Metadata } from "next";
import localFont from "next/font/local";
import { Providers } from "./providers";
import { FighterProfileProvider } from "@/context/FighterProfileContext";
import { Toaster } from "@/components/Toast";
import "./globals.css";

/**
 * Typography is self-hosted (public/fonts) so builds never depend on a
 * font CDN. Chakra Petch carries every headline and label — angular and
 * engineered. JetBrains Mono carries every number, address and stat.
 */
const chakra = localFont({
  src: [
    { path: "../../public/fonts/ChakraPetch-500.woff2", weight: "500" },
    { path: "../../public/fonts/ChakraPetch-600.woff2", weight: "600" },
    { path: "../../public/fonts/ChakraPetch-700.woff2", weight: "700" },
  ],
  variable: "--font-chakra",
  display: "swap",
  fallback: ["ui-sans-serif", "system-ui", "sans-serif"],
});

const jetbrains = localFont({
  src: [
    {
      path: "../../public/fonts/JetBrainsMono-var.woff2",
      weight: "100 800",
    },
  ],
  variable: "--font-jetbrains",
  display: "swap",
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
});

export const metadata: Metadata = {
  title: "Chog Arena",
  description:
    "1v1 Deathmatch with Second Wind resurrection on Monad — stake MON, fight instantly.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${chakra.variable} ${jetbrains.variable}`}>
      <body className="font-display antialiased">
        <Providers>
          <FighterProfileProvider>{children}</FighterProfileProvider>
        </Providers>
        <Toaster />
      </body>
    </html>
  );
}
