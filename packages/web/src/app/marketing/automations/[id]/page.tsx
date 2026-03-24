"use client";
import { useEffect } from "react";
import { useRouter, useParams } from "next/navigation";

export default function MarketingAutomationDetailRedirect() {
  const router = useRouter();
  const params = useParams();
  useEffect(() => { router.replace(`/conversas/automacoes/${params.id}`); }, [router, params.id]);
  return (
    <div className="flex items-center justify-center h-64 text-gray-400">
      Redirecionando...
    </div>
  );
}
