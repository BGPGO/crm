import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import TopNavbar from "@/components/layout/Sidebar";

const inter = Inter({ subsets: ["latin"] });

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
    <html lang="pt-BR">
      <body className={`${inter.className} flex flex-col h-screen bg-gray-50 overflow-hidden`}>
        <TopNavbar />
        <div className="flex-1 flex flex-col overflow-hidden">
          {children}
        </div>
      </body>
    </html>
  );
}
