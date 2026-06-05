import type { Metadata } from "next";
import { Plus_Jakarta_Sans, DM_Mono } from "next/font/google";
import "./globals.css";
import BrandHeader from "./BrandHeader";
import BrandFooter from "./BrandFooter";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  variable: "--font-jakarta",
  display: "swap",
});

const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-dmmono",
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
    <html lang="en" className={`${jakarta.variable} ${dmMono.variable}`}>
      <body className="min-h-screen flex flex-col">
        <BrandHeader />
        <div className="flex-1">{children}</div>
        <BrandFooter />
      </body>
    </html>
  );
}
