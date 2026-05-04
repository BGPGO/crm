import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { BrandProvider } from "@/contexts/BrandContext";
import AuthGate from "@/components/layout/AuthGate";
import { BrandStripe } from "@/components/BrandSwitcher";

const inter = Inter({ subsets: ["latin", "latin-ext"] });

export const metadata: Metadata = {
  title: "CRM BGPGO",
  description: "CRM próprio inspirado no RD Station CRM",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className={`${inter.className} flex flex-col h-screen bg-gray-50 dark:bg-gray-900 overflow-hidden transition-colors`}>
        <ThemeProvider>
          <BrandProvider>
            <AuthProvider>
              <BrandStripe />
              <AuthGate>{children}</AuthGate>
            </AuthProvider>
          </BrandProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
