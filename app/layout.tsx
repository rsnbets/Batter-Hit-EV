import type { Metadata } from "next";
import { Orbitron } from "next/font/google";
import "./globals.css";
import BrandHeader from "./BrandHeader";
import BrandFooter from "./BrandFooter";

const orbitron = Orbitron({
  subsets: ["latin"],
  weight: ["500", "700"],
  variable: "--font-orbitron",
  display: "swap",
});

export const metadata: Metadata = {
  title: "MLB Batter Hits — Profit Path Sports",
  description:
    "Free +EV finder for MLB batter hits props. Powered by Profit Path Sports.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={orbitron.variable}>
      <body className="bg-neutral-950 text-neutral-100 antialiased min-h-screen flex flex-col">
        <BrandHeader />
        <div className="flex-1">{children}</div>
        <BrandFooter />
      </body>
    </html>
  );
}
