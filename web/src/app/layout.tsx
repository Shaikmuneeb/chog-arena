import type { Metadata } from "next";
import { Providers } from "./providers";
import { FighterProfileProvider } from "@/context/FighterProfileContext";
import { Toaster } from "@/components/Toast";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chog Arena",
  description:
    "1v1 Deathmatch with Second Wind resurrection on Monad — stake MON, fight instantly.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <FighterProfileProvider>{children}</FighterProfileProvider>
        </Providers>
        <Toaster />
      </body>
    </html>
  );
}
