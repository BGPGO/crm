"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/layout/Header";
import ConversasNav from "@/components/conversas/ConversasNav";
import Card from "@/components/ui/Card";
import { api } from "@/lib/api";
import { Users, Copy, Check, Link as LinkIcon } from "lucide-react";

interface PipelineStage {
  id: string;
  name: string;
  order: number;
  pipeline: { name: string };
  _count: { deals: number };
}

interface Segment {
  id: string;
  name: string;
  contactCount: number;
}

interface CalendlyConfig {
  id: string;
  isActive: boolean;
}

const INPUT_CLASS =
  "w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500";

export default function NovaCampanhaPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [contacts, setContacts] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Stage selector state
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [selectedStageId, setSelectedStageId] = useState("");
  const [contactSource, setContactSource] = useState<"manual" | "stage" | "segment">("manual");
  const [loadingStages, setLoadingStages] = useState(false);

  // Segment selector state
  const [segments, setSegments] = useState<Segment[]>([]);
  const [selectedSegmentId, setSelectedSegmentId] = useState("");
  const [loadingSegments, setLoadingSegments] = useState(false);

  // Stage filters
  const [dealStatus, setDealStatus] = useState<string>("");
  const [valueMin, setValueMin] = useState("");
  const [valueMax, setValueMax] = useState("");
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");

  // Calendly link
  const [calendlyLink, setCalendlyLink] = useState<string>("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const fetchStages = async () => {
      setLoadingStages(true);
      try {
        const res = await api.get<{ data: PipelineStage[] }>("/whatsapp/campaigns/stages");
        setStages(res.data || []);
      } catch {
        // Silently fail
      } finally {
        setLoadingStages(false);
      }
    };

    const fetchSegments = async () => {
      setLoadingSegments(true);
      try {
        const res = await api.get<{ data: Segment[] }>("/whatsapp/campaigns/segments");
        setSegments(res.data || []);
      } catch {
        // Silently fail
      } finally {
        setLoadingSegments(false);
      }
    };

    const fetchCalendly = async () => {
      try {
        const res = await api.get<{ data: CalendlyConfig & { organizationUri?: string } }>("/calendly/config");
        // Extract calendly scheduling link from config or use default
        if (res.data?.organizationUri) {
          setCalendlyLink(res.data.organizationUri);
        }
      } catch {
        // No calendly config
      }
    };

    fetchStages();
    fetchSegments();
    fetchCalendly();
  }, []);

  // Hardcoded fallback if no config — common BGP link
  const displayCalendlyLink = calendlyLink || "https://calendly.com/d/cybr-crz-ttw/diagnostico-financeiro-bgp";

  const handleCopyCalendly = () => {
    navigator.clipboard.writeText(displayCalendlyLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const contactList = contacts
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const selectedStage = stages.find((s) => s.id === selectedStageId);
  const selectedSegment = segments.find((s) => s.id === selectedSegmentId);

  const canSubmit =
    name.trim() &&
    message.trim() &&
    (contactSource === "stage"
      ? !!selectedStageId
      : contactSource === "segment"
      ? !!selectedSegmentId
      : contactList.length > 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setSaving(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        message: message.trim(),
      };

      if (contactSource === "stage") {
        payload.stageId = selectedStageId;
        if (dealStatus) payload.dealStatus = dealStatus;
        if (valueMin) payload.valueMin = valueMin;
        if (valueMax) payload.valueMax = valueMax;
        if (createdFrom) payload.createdFrom = createdFrom;
        if (createdTo) payload.createdTo = createdTo;
      } else if (contactSource === "segment") {
        payload.segmentId = selectedSegmentId;
      } else {
        payload.contacts = contactList;
      }

      await api.post("/whatsapp/campaigns", payload);
      router.push("/conversas/campanhas");
    } catch {
      setError("Erro ao criar campanha. Tente novamente.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-auto">
      <Header title="Nova Campanha" breadcrumb={["Conversas", "Campanhas", "Nova"]} />
      <ConversasNav />

      {error && (
        <div className="mx-4 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <span className="text-sm text-red-700">{error}</span>
        </div>
      )}

      <main className="flex-1 px-4 sm:px-6 py-6">
        <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Form */}
          <Card padding="lg">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">Dados da Campanha</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Campanha Black Friday"
                  className={INPUT_CLASS}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mensagem</label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Escreva a mensagem que será enviada..."
                  rows={6}
                  className={`${INPUT_CLASS} resize-none`}
                  required
                />
              </div>

              {/* Calendly link quick copy */}
              <div className="flex items-center gap-2 p-2.5 bg-gray-50 border border-gray-200 rounded-lg">
                <LinkIcon size={14} className="text-gray-400 flex-shrink-0" />
                <span className="text-xs text-gray-500 truncate flex-1" title={displayCalendlyLink}>
                  {displayCalendlyLink}
                </span>
                <button
                  type="button"
                  onClick={handleCopyCalendly}
                  className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded bg-white border border-gray-200 hover:bg-gray-50 transition-colors flex-shrink-0"
                >
                  {copied ? <Check size={12} className="text-green-500" /> : <Copy size={12} className="text-gray-400" />}
                  {copied ? "Copiado" : "Copiar Calendly"}
                </button>
              </div>

              {/* Contact source selector */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Origem dos Contatos</label>
                <div className="flex flex-wrap gap-2">
                  {([
                    { value: "manual", label: "Manual" },
                    { value: "stage", label: "Etapa do Pipeline" },
                    { value: "segment", label: "Segmento" },
                  ] as const).map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setContactSource(opt.value)}
                      className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
                        contactSource === opt.value
                          ? "bg-blue-50 border-blue-300 text-blue-700"
                          : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {contactSource === "stage" ? (
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Etapa do Pipeline
                    </label>
                    {loadingStages ? (
                      <div className="h-10 bg-gray-100 rounded-lg animate-pulse" />
                    ) : (
                      <select
                        value={selectedStageId}
                        onChange={(e) => setSelectedStageId(e.target.value)}
                        className={`${INPUT_CLASS} bg-white`}
                      >
                        <option value="">Selecione uma etapa...</option>
                        {stages.map((stage) => (
                          <option key={stage.id} value={stage.id}>
                            {stage.pipeline.name} &rarr; {stage.name} ({stage._count.deals} negociações)
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  {/* Status filter */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
                    <div className="flex gap-1.5">
                      {[
                        { value: "", label: "Todos" },
                        { value: "OPEN", label: "Em andamento" },
                        { value: "WON", label: "Ganhos" },
                        { value: "LOST", label: "Perdidos" },
                      ].map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setDealStatus(opt.value)}
                          className={`px-2.5 py-1 text-xs rounded-full font-medium transition-colors ${
                            dealStatus === opt.value
                              ? "bg-blue-600 text-white"
                              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Value range */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Range de Valor (R$)</label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        value={valueMin}
                        onChange={(e) => setValueMin(e.target.value)}
                        placeholder="Mínimo"
                        className={`${INPUT_CLASS} flex-1`}
                        min="0"
                        step="0.01"
                      />
                      <input
                        type="number"
                        value={valueMax}
                        onChange={(e) => setValueMax(e.target.value)}
                        placeholder="Máximo"
                        className={`${INPUT_CLASS} flex-1`}
                        min="0"
                        step="0.01"
                      />
                    </div>
                  </div>

                  {/* Created date range */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Data de Criação</label>
                    <div className="flex gap-2">
                      <input
                        type="date"
                        value={createdFrom}
                        onChange={(e) => setCreatedFrom(e.target.value)}
                        className={`${INPUT_CLASS} flex-1`}
                      />
                      <input
                        type="date"
                        value={createdTo}
                        onChange={(e) => setCreatedTo(e.target.value)}
                        className={`${INPUT_CLASS} flex-1`}
                      />
                    </div>
                  </div>

                  {selectedStage && (
                    <div className="flex items-center gap-2 p-2 bg-blue-50 border border-blue-200 rounded-lg">
                      <Users size={14} className="text-blue-600" />
                      <p className="text-xs text-blue-700">
                        Contatos serão extraídos das negociações
                        {dealStatus === "WON" ? " ganhas" : dealStatus === "LOST" ? " perdidas" : dealStatus === "OPEN" ? " em andamento" : ""} na etapa &quot;{selectedStage.name}&quot;
                        {(valueMin || valueMax) && (
                          <> com valor {valueMin ? `a partir de R$ ${valueMin}` : ""}{valueMin && valueMax ? " " : ""}{valueMax ? `até R$ ${valueMax}` : ""}</>
                        )}
                      </p>
                    </div>
                  )}
                </div>
              ) : contactSource === "segment" ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Segmento de Marketing
                  </label>
                  {loadingSegments ? (
                    <div className="h-10 bg-gray-100 rounded-lg animate-pulse" />
                  ) : (
                    <select
                      value={selectedSegmentId}
                      onChange={(e) => setSelectedSegmentId(e.target.value)}
                      className={`${INPUT_CLASS} bg-white`}
                    >
                      <option value="">Selecione um segmento...</option>
                      {segments.map((segment) => (
                        <option key={segment.id} value={segment.id}>
                          {segment.name} ({segment.contactCount} contatos)
                        </option>
                      ))}
                    </select>
                  )}
                  {selectedSegment && (
                    <div className="mt-2 flex items-center gap-2 p-2 bg-purple-50 border border-purple-200 rounded-lg">
                      <Users size={14} className="text-purple-600" />
                      <p className="text-xs text-purple-700">
                        Contatos serão extraídos do segmento &quot;{selectedSegment.name}&quot; (<strong>{selectedSegment.contactCount}</strong> contatos)
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Contatos (um telefone por linha)
                  </label>
                  <textarea
                    value={contacts}
                    onChange={(e) => setContacts(e.target.value)}
                    placeholder={"5511999990001\n5511999990002\n5511999990003"}
                    rows={6}
                    className={`${INPUT_CLASS} resize-none font-mono`}
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    {contactList.length} contato{contactList.length !== 1 ? "s" : ""}
                  </p>
                </div>
              )}

              <button
                type="submit"
                disabled={saving || !canSubmit}
                className="w-full px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? "Criando..." : "Criar Campanha"}
              </button>
            </div>
          </Card>

          {/* Preview */}
          <Card padding="lg">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">Preview</h2>

            <div className="bg-gray-50 rounded-lg p-4 min-h-[200px]">
              {message ? (
                <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 max-w-[80%] shadow-sm">
                  <p className="text-sm whitespace-pre-wrap break-words text-gray-900">{message}</p>
                </div>
              ) : (
                <p className="text-sm text-gray-400 text-center mt-10">
                  A mensagem aparecerá aqui...
                </p>
              )}
            </div>

            {contactSource === "manual" && contactList.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-medium text-gray-600 mb-2">
                  Será enviada para {contactList.length} contato{contactList.length !== 1 ? "s" : ""}:
                </p>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {contactList.slice(0, 20).map((phone, i) => (
                    <p key={i} className="text-xs text-gray-500 font-mono">{phone}</p>
                  ))}
                  {contactList.length > 20 && (
                    <p className="text-xs text-gray-400">
                      ... e mais {contactList.length - 20}
                    </p>
                  )}
                </div>
              </div>
            )}

            {contactSource === "stage" && selectedStage && (
              <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-xs font-medium text-blue-700">
                  Contatos da etapa &quot;{selectedStage.name}&quot;
                </p>
                <p className="text-xs text-blue-600 mt-1">
                  Os telefones serão extraídos automaticamente das negociações
                  {dealStatus ? ` (${dealStatus === "OPEN" ? "em andamento" : dealStatus === "WON" ? "ganhas" : "perdidas"})` : ""} nesta etapa ao criar a campanha.
                </p>
              </div>
            )}

            {contactSource === "segment" && selectedSegment && (
              <div className="mt-4 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                <p className="text-xs font-medium text-purple-700">
                  Segmento &quot;{selectedSegment.name}&quot;
                </p>
                <p className="text-xs text-purple-600 mt-1">
                  Os telefones serão extraídos automaticamente dos {selectedSegment.contactCount} contatos deste segmento ao criar a campanha.
                </p>
              </div>
            )}
          </Card>
        </form>
      </main>
    </div>
  );
}
