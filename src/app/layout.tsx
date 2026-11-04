import type { Metadata, Viewport } from "next";
import { Analytics } from '@vercel/analytics/next';
import "./globals.css";

export const metadata: Metadata = {
  title: "Rules Registry — sentence engine demo",
  description: "Answer options and sentence composition driven entirely by rules stored in Postgres.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#f7f6f2" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
