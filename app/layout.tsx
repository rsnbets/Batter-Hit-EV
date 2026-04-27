import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MLB Batter Hits +EV",
  description: "Find +EV plays on MLB batter hits props",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-neutral-950 text-neutral-100 antialiased">
        {children}
      </body>
    </html>
  );
}
