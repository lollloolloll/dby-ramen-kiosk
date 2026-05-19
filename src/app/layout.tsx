import type { Metadata } from "next";
import { Geist, Geist_Mono, Bricolage_Grotesque } from "next/font/google";
import type { CSSProperties } from "react";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { NextAuthProvider } from "@/components/NextAuthProvider";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { getSiteConfig } from "@/lib/actions/siteConfig";
import { toThemeCssVars } from "@/lib/theme/theme-utils";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Display: 변형 가능한 grotesque, optical sizing. Space Grotesk 같은 진부한 선택 회피.
const bricolage = Bricolage_Grotesque({
  variable: "--font-display",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Item Kiosk",
  description: "A self-service item ordering kiosk.",
  manifest: "/manifest.json",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const config = await getSiteConfig();

  return (
    <html
      lang="ko"
      style={toThemeCssVars(config) as CSSProperties}
    >
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#000000" />
        {/* Pretendard Variable — 한글 친화 본문 폰트 */}
        <link
          rel="stylesheet"
          as="style"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${bricolage.variable} antialiased`}
      >
        <NextAuthProvider>
          <ThemeProvider initial={config}>{children}</ThemeProvider>
        </NextAuthProvider>
        <Toaster />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
