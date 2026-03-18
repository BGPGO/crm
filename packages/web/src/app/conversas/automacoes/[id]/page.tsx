"use client";

import { useParams } from "next/navigation";
import Header from "@/components/layout/Header";
import ConversasNav from "@/components/conversas/ConversasNav";
import FlowBuilder from "@/components/automations/FlowBuilder";

export default function AutomacaoFlowPage() {
  const params = useParams();
  const automationId = params.id as string;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header
        title="Editor de Automação"
        breadcrumb={["Conversas", "Automações", "Editor"]}
      />
      <ConversasNav />
      <FlowBuilder automationId={automationId} />
    </div>
  );
}
