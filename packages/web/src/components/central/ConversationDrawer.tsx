"use client";

import { useState, useEffect } from "react";
import Drawer from "@/components/ui/Drawer";
import WabaSidebar from "@/components/deal/WabaSidebar";
import { MessageCircle, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { openWhatsAppChat } from "@/lib/whatsapp";

interface ConversationDrawerProps {
  dealId: string;
  contactName: string;
  contactPhone: string;
  onClose: () => void;
}

interface ConvResponse {
  data: { conversationId: string; phone: string } | null;
  waba?: { conversationId: string; phone: string } | null;
}

/**
 * Resolve a conversa WABA da negociação e abre o chat num painel lateral.
 * Sem conversa WABA → fallback com atalho pro WhatsApp direto.
 */
export default function ConversationDrawer({
  dealId,
  contactName,
  contactPhone,
  onClose,
}: ConversationDrawerProps) {
  const [loading, setLoading] = useState(true);
  const [waba, setWaba] = useState<{ conversationId: string; phone: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get<ConvResponse>(`/deals/${dealId}/whatsapp-conversation`);
        if (!cancelled) setWaba(res.waba || null);
      } catch {
        /* silent */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dealId]);

  if (!loading && waba) {
    return (
      <WabaSidebar
        conversationId={waba.conversationId}
        contactName={contactName}
        contactPhone={contactPhone || waba.phone}
        dealId={dealId}
        onClose={onClose}
      />
    );
  }

  return (
    <Drawer title={contactName} subtitle="Conversa" onClose={onClose} widthClass="w-full sm:w-[400px]">
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={22} className="animate-spin text-gray-400" />
        </div>
      ) : (
        <div className="p-8 text-center">
          <MessageCircle size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-sm text-gray-600 font-medium">Nenhuma conversa WABA encontrada</p>
          <p className="text-xs text-gray-400 mt-1">
            Esse contato ainda não tem conversa no WhatsApp oficial do CRM.
          </p>
          {contactPhone && (
            <button
              onClick={() => openWhatsAppChat(contactPhone)}
              className="mt-4 inline-flex items-center gap-2 text-sm font-medium bg-green-50 text-green-700 hover:bg-green-100 px-4 py-2 rounded-lg transition-colors"
            >
              <MessageCircle size={16} /> Abrir no WhatsApp
            </button>
          )}
        </div>
      )}
    </Drawer>
  );
}
