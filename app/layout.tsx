import type { Metadata, Viewport } from "next";
import { Fredoka, Geist_Mono, Nunito } from "next/font/google";
import type { ReactNode } from "react";

import { OfflineBanner } from "@/components/pwa/offline-banner";
import { ServiceWorkerRegistration } from "@/components/pwa/service-worker-registration";

import "./globals.css";

// Rounded, friendly body face with Cyrillic for names and notes.
const nunito = Nunito({
  variable: "--font-sans",
  subsets: ["latin", "cyrillic"],
});

// Soft display face for headings (Latin only — see --font-heading fallback).
const fredoka = Fredoka({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Purrfect Home",
  description:
    "Уютный домашний органайзер для пар: деньги, дела, расписание, привычки и питание.",
  applicationName: "Purrfect Home",
  appleWebApp: {
    capable: true,
    title: "Purrfect",
    statusBarStyle: "default",
  },
  icons: {
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fff7f9" },
    { media: "(prefers-color-scheme: dark)", color: "#2a1f28" },
  ],
  width: "device-width",
  initialScale: 1,
  // Accidental pinch/double-tap zoom fights the UI on phones (forms, taps).
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="ru"
      className={`${nunito.variable} ${fredoka.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col font-sans">
        <OfflineBanner />
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
