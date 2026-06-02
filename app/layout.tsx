import type { Metadata } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import "./globals.css";

import { AppShell } from "@/components/layout/AppShell";
import { Toaster } from "@/components/ui/sonner";
import { WalletProvider } from "@/components/wallet/WalletProvider";
import { XmtpProvider } from "@/components/xmtp/XmtpProvider";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Dappcon Chat",
  description:
    "A graph-filtered wall and DMs for Circles users at DappCon 2026.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <WalletProvider>
          <XmtpProvider>
            <AppShell>{children}</AppShell>
          </XmtpProvider>
        </WalletProvider>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
