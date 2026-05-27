import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { BrandProvider } from "@/contexts/BrandContext";
import AuthGate from "@/components/layout/AuthGate";
import { BrandStripe } from "@/components/BrandSwitcher";

// Fonte da UI — Inter (Almarena fica só para peças de marca, não para a interface)
const inter = Inter({ subsets: ["latin", "latin-ext"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "CRM Bertuzzi",
  description: "Plataforma de gestão de vendas e marketing da Bertuzzi Patrimonial",
  icons: { icon: "/bertuzzi-icon.png" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" suppressHydrationWarning className={inter.variable}>
      <body className={`${inter.variable} font-sans flex flex-col h-screen bg-gray-50 dark:bg-gray-900 overflow-hidden transition-colors`}>
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
