import type { Metadata, Viewport } from "next";
import { Instrument_Sans, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const sans = Instrument_Sans({ subsets: ["latin"], variable: "--font-instrument", display: "swap" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Habitat — Your home, organised and understood", template: "%s · Habitat" },
  description:
    "Habitat is a digital twin for your home: appliances, warranties, maintenance, documents and expenses, organised around an interactive floor plan.",
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#f6f4ef",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-SG" className={`${sans.variable} ${mono.variable}`}>
      <body className="min-h-dvh">
        <TooltipProvider delayDuration={350}>{children}</TooltipProvider>
        <Toaster
          position="bottom-right"
          toastOptions={{
            classNames: {
              toast: "!rounded-md !border !border-line !bg-surface !text-fg !shadow-md !font-sans",
              description: "!text-fg-muted",
              actionButton: "!bg-accent !text-accent-fg",
            },
          }}
        />
      </body>
    </html>
  );
}
