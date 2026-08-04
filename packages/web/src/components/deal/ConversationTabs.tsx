"use client";

import { useState, useEffect } from "react";
import { X, Bot, Phone, Loader2 } from "lucide-react";
import clsx from "clsx";
import WabaSidebar from "./WabaSidebar";
import ComercialChat from "./ComercialChat";
import { api } from "@/lib/api";

// Painel único de conversa com abas de canal:
//   🤖 BIA (WABA / API Oficial)  ·  💬 Comercial (número humano, via Messenger)
// Substitui os botões separados WABA/Z-API em todo lugar que abre conversa.

type Channel = "bia" | "comercial";

interface ConversationTabsProps {
  wabaConversationId?: string | null;
  contactName: string;
  contactPhone: string;
  dealId?: string;
  initialChannel?: Channel;
  onClose: () => void;
}

export default function ConversationTabs({
  wabaConversationId,
  contactName,
  contactPhone,
  dealId,
  initialChannel,
  onClose,
}: ConversationTabsProps) {
  const [channel, setChannel] = useState<Channel>(
    initialChannel || (wabaConversationId ? "bia" : "comercial")
  );
  const [wabaId, setWabaId] = useState<string | null>(wabaConversationId ?? null);
  const [resolvingWaba, setResolvingWaba] = useState(!wabaConversationId && !!dealId);

  // Quem abre pelo canal Comercial não traz o id da conversa WABA (e a conversa
  // pode estar WA_CLOSED, fora das listas) — resolve pelo deal pra aba BIA
  // mostrar o histórico mesmo assim.
  useEffect(() => {
    if (wabaId || !dealId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get<{ waba?: { conversationId: string } | null }>(
          `/deals/${dealId}/whatsapp-conversation`
        );
        if (!cancelled && res.waba) setWabaId(res.waba.conversationId);
      } catch {
        /* segue sem conversa WABA */
      } finally {
        if (!cancelled) setResolvingWaba(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [wabaId, dealId]);

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />

      <div className="fixed right-0 top-0 h-full w-[400px] bg-white shadow-2xl z-50 flex flex-col">
        {/* Barra de abas de canal */}
        <div className="flex items-center border-b border-gray-200 bg-white flex-shrink-0">
          <button
            onClick={() => setChannel("bia")}
            className={clsx(
              "flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-semibold border-b-2 transition-colors",
              channel === "bia"
                ? "border-emerald-600 text-emerald-700 bg-emerald-50"
                : "border-transparent text-gray-500 hover:bg-gray-50"
            )}
          >
            <Bot size={14} />
            BIA
          </button>
          <button
            onClick={() => setChannel("comercial")}
            className={clsx(
              "flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-semibold border-b-2 transition-colors",
              channel === "comercial"
                ? "border-petrol-600 text-petrol-700 bg-petrol-50"
                : "border-transparent text-gray-500 hover:bg-gray-50"
            )}
          >
            <Phone size={14} />
            Comercial
          </button>
          <button
            onClick={onClose}
            className="p-2 mx-1 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors flex-shrink-0"
            title="Fechar"
          >
            <X size={16} />
          </button>
        </div>

        {channel === "bia" ? (
          wabaId ? (
            <WabaSidebar
              conversationId={wabaId}
              contactName={contactName}
              contactPhone={contactPhone}
              dealId={dealId}
              embedded
              onClose={onClose}
            />
          ) : resolvingWaba ? (
            <div className="flex-1 flex items-center justify-center bg-gray-50">
              <Loader2 size={22} className="animate-spin text-gray-400" />
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 bg-gray-50">
              <Bot size={36} className="text-gray-300" />
              <p className="text-sm text-gray-400 text-center">
                Esse lead ainda não tem conversa com a BIA (WABA).
              </p>
              <p className="text-xs text-gray-400 text-center">
                Pra falar agora, usa a aba <span className="font-semibold">Comercial</span> — o número humano.
              </p>
            </div>
          )
        ) : (
          <ComercialChat
            contactName={contactName}
            contactPhone={contactPhone}
            embedded
            onClose={onClose}
          />
        )}
      </div>
    </>
  );
}
