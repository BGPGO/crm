"use client";

import { useState, useEffect, useRef } from "react";
import { X, Play, Phone, CheckCircle2, XCircle, Clock, Loader2, MessageSquare, SkipForward } from "lucide-react";
import clsx from "clsx";
import { api } from "@/lib/api";
import { formatWhatsAppText } from "@/lib/formatters";

interface StepLog {
  stepId: string;
  order: number;
  actionType: string;
  success: boolean;
  output: any;
  durationMs: number;
}

interface TestResult {
  automationId: string;
  contactId: string;
  conversationId: string | null;
  phone: string;
  stepsExecuted: number;
  totalSteps: number;
  log: StepLog[];
}

interface Message {
  id: string;
  sender: "CLIENT" | "BOT" | "HUMAN";
  text: string;
  createdAt: string;
  senderUser?: { id: string; name: string } | null;
}

interface AutomationTestPanelProps {
  automationId: string;
  automationName: string;
  onClose: () => void;
}

const ACTION_LABELS: Record<string, string> = {
  SEND_WHATSAPP_AI: "WhatsApp IA",
  SEND_WHATSAPP: "WhatsApp Template",
  WAIT: "Aguardar",
  CONDITION: "Condição",
  MOVE_PIPELINE_STAGE: "Mover Etapa",
  ADD_TAG: "Adicionar Tag",
  REMOVE_TAG: "Remover Tag",
  MARK_LOST: "Marcar Perda",
};

export default function AutomationTestPanel({ automationId, automationName, onClose }: AutomationTestPanelProps) {
  const [phone, setPhone] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [showChat, setShowChat] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [result]);

  // Load messages when we have a conversationId
  useEffect(() => {
    if (!result?.conversationId || !showChat) return;
    const load = async () => {
      try {
        const res = await api.get<{ data: Message[] }>(`/whatsapp/conversations/${result.conversationId}/messages?limit=50`);
        setMessages(res.data || []);
      } catch {}
    };
    load();
    const interval = setInterval(load, 3000);
    return () => clearInterval(interval);
  }, [result?.conversationId, showChat]);

  const handleRun = async () => {
    if (!phone.trim()) return;
    setRunning(true);
    setResult(null);
    setError(null);
    setMessages([]);
    setShowChat(false);

    try {
      const res = await api.post<{ data: TestResult }>(`/automations/${automationId}/test`, { phone: phone.replace(/\D/g, "") });
      setResult(res.data);
      if (res.data.conversationId) {
        setShowChat(true);
      }
    } catch (err: any) {
      setError(err?.message || "Erro ao executar teste");
    } finally {
      setRunning(false);
    }
  };

  const formatTime = (d: string) => new Date(d).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />

      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-[480px] max-w-full bg-white shadow-2xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-purple-600 text-white flex-shrink-0">
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">Testar Automacao</p>
            <p className="text-xs opacity-80 truncate">{automationName}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-purple-700 transition-colors flex-shrink-0 ml-2">
            <X size={16} />
          </button>
        </div>

        {/* Phone input + Run button */}
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex-shrink-0">
          <label className="text-xs font-medium text-gray-600 mb-1.5 block">Numero para teste</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="5551999999999"
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                onKeyDown={(e) => { if (e.key === "Enter") handleRun(); }}
              />
            </div>
            <button
              onClick={handleRun}
              disabled={running || !phone.trim()}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
              {running ? "Executando..." : "Executar"}
            </button>
          </div>
          <p className="text-[10px] text-gray-400 mt-1.5">Timers de espera serao pulados automaticamente no modo de teste</p>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto">
          {/* Error */}
          {error && (
            <div className="m-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
          )}

          {/* Running animation */}
          {running && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 size={32} className="animate-spin text-purple-500" />
              <p className="text-sm text-gray-500">Executando etapas do fluxo...</p>
            </div>
          )}

          {/* No result yet */}
          {!running && !result && !error && (
            <div className="flex flex-col items-center justify-center py-16 gap-3 px-6">
              <div className="w-16 h-16 rounded-full bg-purple-50 flex items-center justify-center">
                <Play size={24} className="text-purple-400" />
              </div>
              <p className="text-sm text-gray-500 text-center">Insira um numero de telefone e clique em Executar para testar o fluxo da automacao</p>
              <p className="text-xs text-gray-400 text-center">As mensagens serao enviadas de verdade para o numero informado</p>
            </div>
          )}

          {/* Results */}
          {result && (
            <div className="p-4 space-y-3">
              {/* Summary */}
              <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
                <span className={clsx(
                  "inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full",
                  result.log.every(l => l.success) ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
                )}>
                  {result.log.every(l => l.success) ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                  {result.log.every(l => l.success) ? "Sucesso" : "Parcial"}
                </span>
                <span className="text-xs text-gray-500">
                  {result.stepsExecuted}/{result.totalSteps} etapas executadas
                </span>
                {result.conversationId && (
                  <button
                    onClick={() => setShowChat(!showChat)}
                    className="ml-auto flex items-center gap-1 text-xs text-green-600 hover:text-green-700 font-medium"
                  >
                    <MessageSquare size={12} />
                    {showChat ? "Ocultar chat" : "Ver chat"}
                  </button>
                )}
              </div>

              {/* Step log */}
              <div className="space-y-2">
                {result.log.map((step, idx) => (
                  <div key={idx} className={clsx(
                    "border rounded-lg p-3",
                    step.success ? "border-green-200 bg-green-50/50" : "border-red-200 bg-red-50/50"
                  )}>
                    <div className="flex items-center gap-2">
                      {step.success ? (
                        step.actionType === 'WAIT' ? <SkipForward size={14} className="text-blue-500" /> : <CheckCircle2 size={14} className="text-green-600" />
                      ) : (
                        <XCircle size={14} className="text-red-500" />
                      )}
                      <span className="text-sm font-medium text-gray-800">
                        {idx + 1}. {ACTION_LABELS[step.actionType] || step.actionType}
                      </span>
                      <span className="text-[10px] text-gray-400 ml-auto">
                        {step.durationMs}ms
                      </span>
                    </div>
                    {step.output && (
                      <div className="mt-1.5 pl-6">
                        {typeof step.output === 'string' ? (
                          <p className="text-xs text-gray-600">{step.output}</p>
                        ) : (
                          <div className="text-xs text-gray-500 space-y-0.5">
                            {step.output.testMode && <p className="text-blue-600 font-medium">{step.output.testMode}</p>}
                            {step.output.originalDuration && <p>Original: {step.output.originalDuration} {step.output.originalUnit}</p>}
                            {step.output.phone && <p>Telefone: {step.output.phone}</p>}
                            {step.output.messageLength && <p>Mensagem: {step.output.messageLength} caracteres</p>}
                            {step.output.branchTaken && <p>Resultado: <strong>{step.output.branchTaken}</strong></p>}
                            {step.output.dealsMarkedLost && <p>Negociacoes marcadas como perda: {step.output.dealsMarkedLost}</p>}
                            {step.output.dealsUpdated && <p>Negociacoes movidas: {step.output.dealsUpdated}</p>}
                            {step.output.stageId && <p>Etapa: {step.output.stageName || step.output.stageId}</p>}
                            {step.output.tagId && <p>Tag: {step.output.action || step.output.tagId}</p>}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Chat preview */}
              {showChat && messages.length > 0 && (
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="bg-green-600 text-white px-3 py-2 text-xs font-semibold flex items-center gap-1.5">
                    <MessageSquare size={12} />
                    Conversa com {phone}
                  </div>
                  <div className="max-h-64 overflow-y-auto p-3 space-y-2 bg-gray-50">
                    {messages.map((msg) => {
                      const isClient = msg.sender === "CLIENT";
                      const isBot = msg.sender === "BOT";
                      return (
                        <div key={msg.id} className={clsx("flex", isClient ? "justify-start" : "justify-end")}>
                          <div className={clsx(
                            "max-w-[75%] rounded-xl px-3 py-2 shadow-sm",
                            isClient ? "bg-gray-200 text-gray-900"
                              : isBot ? "bg-green-100 border border-green-200 text-gray-900"
                              : "bg-blue-100 border border-blue-200 text-gray-900"
                          )}>
                            {!isClient && (
                              <p className={clsx("text-[10px] font-semibold mb-0.5", isBot ? "text-green-700" : "text-blue-700")}>
                                {isBot ? "Bot IA" : (msg.senderUser?.name || "Equipe")}
                              </p>
                            )}
                            <p className="text-sm whitespace-pre-wrap break-words" dangerouslySetInnerHTML={{ __html: formatWhatsAppText(msg.text || "") }} />
                            <p className="text-[10px] text-gray-400 text-right mt-0.5">{formatTime(msg.createdAt)}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div ref={logEndRef} />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
