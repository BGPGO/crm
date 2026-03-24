"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function MarketingAutomationsRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/conversas/automacoes"); }, [router]);
  return (
    <div className="flex items-center justify-center h-64 text-gray-400">
      Redirecionando para Automações...
    </div>
  );
}
