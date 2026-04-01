"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import clsx from "clsx";
import {
  Loader2,
  Save,
  Bot,
  User,
  Building2,
  Link2,
  MessageSquare,
  GitBranch,
  ShieldAlert,
  Package,
  Eye,
  Terminal,
  RotateCcw,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  Info,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WhatsAppConfig {
  botName: string | null;
  botCompany: string | null;
  conversationRules: string | null;
  funnelInstructions: string | null;
  meetingLink: string | null;
  coldContactMaxMessages: number | null;
  botSystemPrompt: string | null;
}

interface BotProduct {
  id: string;
  name: string;
  description: string | null;
  priceRange: string | null;
  targetAudience: string | null;
  differentials: string[] | null;
  isActive: boolean;
}

interface BotObjection {
  id: string;
  objection: string;
  response: string;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_CONVERSATION_RULES = `COMO CONVERSAR:
- Converse como uma pessoa real no WhatsApp. Seja natural, simpatica, direta.
- Leia o que o lead disse e responda de acordo. Se ele fez uma pergunta, responda primeiro.
- Nao force o agendamento logo. Primeiro entenda o que ele precisa, depois conecte com a reuniao.
- Mensagens curtas e naturais (1-3 linhas). Uma mensagem por vez.
- Use emojis com moderacao (1 por mensagem, no maximo).
- NUNCA mande textao. Se tem mais de 3 linhas, quebre em paragrafos separados (pule uma linha entre eles).
- Adapte o tom ao lead: se ele e formal, seja formal. Se e descontraido, seja leve.
- Nunca invente informacoes.`;

const DEFAULT_FUNNEL = `FLUXO DA CONVERSA:
1. Lead mandou mensagem -> Leia o contexto, responda naturalmente
2. Se e a primeira interacao -> Se apresente brevemente e pergunte como pode ajudar
3. Entendeu a necessidade -> Conecte com o produto certo
4. Lead demonstra interesse -> Sugira a reuniao de Diagnostico Financeiro
5. Lead quer agendar -> Responda "Vou te mandar o link pra agendar!" (SEM enviar URL no texto)

SOBRE O AGENDAMENTO:
- NAO envie link de URL no texto da mensagem. O sistema vai enviar um botao clicavel automaticamente.
- Quando sugerir agendar, use frases como "Posso te mandar o link?", "Vou te enviar pra agendar"
- O link e enviado NO MAXIMO 1 VEZ automaticamente pelo sistema. Nao se preocupe em enviar.
- Se o lead pedir link de novo, diga "Vou te mandar!" que o sistema cuida.

IMPORTANTE:
- Se o lead diz algo pessoal/off-topic, responda brevemente e volte pro assunto com naturalidade
- Se o lead diz "nao quero" ou demonstra desinteresse -> agradeca e encerre. NAO insista.
- Se o lead tem duvidas sobre preco -> de o range e diga que na reuniao definem certinho`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function Spinner({ className }: { className?: string }) {
  return <Loader2 size={16} className={clsx("animate-spin text-gray-400", className)} />;
}

function SectionHeader({
  icon: Icon,
  title,
  badge,
  action,
}: {
  icon: React.ElementType;
  title: string;
  badge?: string | number;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        <Icon size={18} className="text-blue-500" />
        <h2 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{title}</h2>
        {badge !== undefined && (
          <span className="text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full font-medium">
            {badge}
          </span>
        )}
      </div>
      {action}
    </div>
  );
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={clsx(
        "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5 shadow-sm",
        className
      )}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Prompt builder (mirrors backend logic)
// ---------------------------------------------------------------------------

function buildPromptPreview(
  config: Partial<WhatsAppConfig>,
  products: BotProduct[],
  objections: BotObjection[]
): string {
  if (config.botSystemPrompt?.trim()) {
    return config.botSystemPrompt;
  }

  const parts: string[] = [];

  // 1. Identidade
  parts.push(
    `Voce e a ${config.botName || "Bia"}, SDR da ${config.botCompany || "Bertuzzi Patrimonial"}. SEMPRE se apresente como ${config.botName || "Bia"} na primeira mensagem. Atende pelo WhatsApp como pessoa real — sua META e agendar uma reuniao de Diagnostico Financeiro.`
  );

  // 2. Formato
  parts.push(
    "FORMATO: Responda em 1-3 frases curtas e naturais. Se precisar separar em mais de uma mensagem, pule uma linha entre elas (linha em branco). NAO envie URLs no texto — o sistema envia botoes clicaveis automaticamente."
  );

  // 3. Regras
  parts.push(config.conversationRules || DEFAULT_CONVERSATION_RULES);

  // 4. Funil
  parts.push(config.funnelInstructions || DEFAULT_FUNNEL);

  // 5. Objeções
  if (objections.length > 0) {
    parts.push(
      "OBJECOES (respostas curtas):\n" +
        objections.map((o) => `- "${o.objection}" -> "${o.response}"`).join("\n")
    );
  }

  // 6. Produtos
  if (products.length > 0) {
    let prodBlock = `EMPRESA:\n- ${config.botCompany || "Bertuzzi Patrimonial"} — solucoes financeiras para empresas\n`;
    products
      .filter((p) => p.isActive)
      .forEach((p) => {
        prodBlock += `- ${p.name}${p.priceRange ? " — " + p.priceRange : ""}\n`;
        if (p.description) prodBlock += `  ${p.description}\n`;
      });
    parts.push(prodBlock);
  }

  // 7. KPI
  parts.push("KPI: reuniao agendada. Seja pratica, rapida e humana.");

  // 8. Contexto injetado
  const now = new Date();
  const dias = [
    "domingo",
    "segunda-feira",
    "terca-feira",
    "quarta-feira",
    "quinta-feira",
    "sexta-feira",
    "sabado",
  ];
  parts.push(
    `\nCONTEXTO ATUAL:\n- Data: ${now.toLocaleDateString("pt-BR")} (${dias[now.getDay()]})\n- Hora atual: ${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}\n- Para agendamento: NAO sugira horarios especificos. NAO envie URLs no texto.`
  );

  if (config.meetingLink) {
    parts.push(
      'AGENDAMENTO: Existe um link de agendamento configurado. Quando o lead quiser agendar, diga algo como "Vou te mandar o link pra agendar!" — NAO inclua a URL no texto.'
    );
  }

  return parts.join("\n\n");
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function BiaPage() {
  const [config, setConfig] = useState<Partial<WhatsAppConfig>>({});
  const [products, setProducts] = useState<BotProduct[]>([]);
  const [objections, setObjections] = useState<BotObjection[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const showToast = useCallback((type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(() => {
    async function fetchAll() {
      try {
        const [configRes, productsRes, objectionsRes] = await Promise.all([
          api.get<{ data: WhatsAppConfig }>("/whatsapp/config"),
          api.get<{ data: BotProduct[] }>("/whatsapp/bot-products"),
          api.get<{ data: BotObjection[] }>("/whatsapp/bot-objections"),
        ]);
        setConfig(configRes.data || {});
        setProducts(productsRes.data || []);
        setObjections(objectionsRes.data || []);
      } catch (err) {
        console.error("Erro ao carregar configs da BIA:", err);
        showToast("error", "Erro ao carregar configurações");
      } finally {
        setLoading(false);
      }
    }
    fetchAll();
  }, [showToast]);

  async function handleSave() {
    setSaving(true);
    try {
      await api.put("/whatsapp/config", {
        botName: config.botName,
        botCompany: config.botCompany,
        conversationRules: config.conversationRules,
        funnelInstructions: config.funnelInstructions,
        meetingLink: config.meetingLink,
        coldContactMaxMessages: config.coldContactMaxMessages,
        botSystemPrompt: config.botSystemPrompt,
      });
      showToast("success", "Configurações salvas com sucesso!");
    } catch (err) {
      console.error("Erro ao salvar:", err);
      showToast("error", "Erro ao salvar configurações");
    } finally {
      setSaving(false);
    }
  }

  const promptPreview = buildPromptPreview(config, products, objections);
  const activeProducts = products.filter((p) => p.isActive);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={32} className="animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 md:px-6 py-6 space-y-5">
        {/* Page header */}
        <div className="mb-2">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
              <Bot size={20} className="text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                BIA — Configuração do Bot IA
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Gerencie o comportamento da assistente virtual no WhatsApp
              </p>
            </div>
          </div>
        </div>

        {/* Toast */}
        {toast && (
          <div
            className={clsx(
              "flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium",
              toast.type === "success"
                ? "bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800"
                : "bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800"
            )}
          >
            {toast.type === "success" ? (
              <CheckCircle2 size={16} />
            ) : (
              <AlertCircle size={16} />
            )}
            {toast.message}
          </div>
        )}

        {/* 1. Identidade */}
        <Card>
          <SectionHeader icon={User} title="Identidade" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                Nome da BIA
              </label>
              <input
                type="text"
                value={config.botName || ""}
                onChange={(e) => setConfig((c) => ({ ...c, botName: e.target.value }))}
                placeholder="Bia"
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                Empresa
              </label>
              <input
                type="text"
                value={config.botCompany || ""}
                onChange={(e) => setConfig((c) => ({ ...c, botCompany: e.target.value }))}
                placeholder="Bertuzzi Patrimonial"
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                <span className="flex items-center gap-1">
                  <Link2 size={12} />
                  Link de Agendamento
                </span>
              </label>
              <input
                type="url"
                value={config.meetingLink || ""}
                onChange={(e) => setConfig((c) => ({ ...c, meetingLink: e.target.value }))}
                placeholder="https://calendly.com/..."
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                Máx. mensagens para contatos frios
              </label>
              <input
                type="number"
                min={1}
                max={10}
                value={config.coldContactMaxMessages ?? 2}
                onChange={(e) =>
                  setConfig((c) => ({ ...c, coldContactMaxMessages: parseInt(e.target.value) || 2 }))
                }
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
        </Card>

        {/* 2. Regras de Conversa */}
        <Card>
          <SectionHeader
            icon={MessageSquare}
            title="Regras de Conversa"
            action={
              <button
                onClick={() => setConfig((c) => ({ ...c, conversationRules: DEFAULT_CONVERSATION_RULES }))}
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 transition-colors"
              >
                <RotateCcw size={12} />
                Restaurar padrão
              </button>
            }
          />
          <textarea
            rows={8}
            value={config.conversationRules || ""}
            onChange={(e) => setConfig((c) => ({ ...c, conversationRules: e.target.value }))}
            placeholder={DEFAULT_CONVERSATION_RULES}
            className="w-full px-3 py-2.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none font-mono leading-relaxed"
          />
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-2 flex items-center gap-1">
            <Info size={11} />
            Vazio = usa o texto padrão mostrado no placeholder
          </p>
        </Card>

        {/* 3. Fluxo do Funil */}
        <Card>
          <SectionHeader
            icon={GitBranch}
            title="Fluxo do Funil"
            action={
              <button
                onClick={() => setConfig((c) => ({ ...c, funnelInstructions: DEFAULT_FUNNEL }))}
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 transition-colors"
              >
                <RotateCcw size={12} />
                Restaurar padrão
              </button>
            }
          />
          <textarea
            rows={10}
            value={config.funnelInstructions || ""}
            onChange={(e) => setConfig((c) => ({ ...c, funnelInstructions: e.target.value }))}
            placeholder={DEFAULT_FUNNEL}
            className="w-full px-3 py-2.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none font-mono leading-relaxed"
          />
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-2 flex items-center gap-1">
            <Info size={11} />
            Vazio = usa o fluxo padrão mostrado no placeholder
          </p>
        </Card>

        {/* 4. Objeções (resumo) */}
        <Card>
          <SectionHeader
            icon={ShieldAlert}
            title="Objeções"
            badge={objections.length}
            action={
              <a
                href="/conversas/configuracao"
                className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                Ver tudo
                <ChevronRight size={12} />
              </a>
            }
          />
          {objections.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">
              Nenhuma objeção configurada.{" "}
              <a href="/conversas/configuracao" className="text-blue-500 hover:underline">
                Adicionar
              </a>
            </p>
          ) : (
            <div className="space-y-2">
              {objections.slice(0, 4).map((obj) => (
                <div
                  key={obj.id}
                  className="flex items-start gap-2 text-sm py-2 border-b border-gray-100 dark:border-gray-700 last:border-0"
                >
                  <span className="text-gray-500 dark:text-gray-400 shrink-0 mt-0.5">&ldquo;</span>
                  <div className="min-w-0 flex-1">
                    <span className="font-medium text-gray-800 dark:text-gray-200 truncate block">
                      {obj.objection}
                    </span>
                    <span className="text-gray-500 dark:text-gray-400 truncate block text-xs mt-0.5">
                      → {obj.response}
                    </span>
                  </div>
                </div>
              ))}
              {objections.length > 4 && (
                <p className="text-xs text-gray-400 dark:text-gray-500 text-center pt-1">
                  +{objections.length - 4} outras objeções —{" "}
                  <a href="/conversas/configuracao" className="text-blue-500 hover:underline">
                    editar em Configuracao
                  </a>
                </p>
              )}
            </div>
          )}
        </Card>

        {/* 5. Produtos (resumo) */}
        <Card>
          <SectionHeader
            icon={Package}
            title="Produtos"
            badge={activeProducts.length}
            action={
              <a
                href="/conversas/configuracao"
                className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                Ver tudo
                <ChevronRight size={12} />
              </a>
            }
          />
          {activeProducts.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">
              Nenhum produto ativo.{" "}
              <a href="/conversas/configuracao" className="text-blue-500 hover:underline">
                Adicionar
              </a>
            </p>
          ) : (
            <div className="space-y-2">
              {activeProducts.slice(0, 4).map((prod) => (
                <div
                  key={prod.id}
                  className="flex items-start gap-3 py-2 border-b border-gray-100 dark:border-gray-700 last:border-0"
                >
                  <div className="w-7 h-7 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center shrink-0 mt-0.5">
                    <Building2 size={13} className="text-purple-600 dark:text-purple-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="font-medium text-sm text-gray-800 dark:text-gray-200">
                        {prod.name}
                      </span>
                      {prod.priceRange && (
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {prod.priceRange}
                        </span>
                      )}
                    </div>
                    {prod.description && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                        {prod.description}
                      </p>
                    )}
                  </div>
                </div>
              ))}
              {activeProducts.length > 4 && (
                <p className="text-xs text-gray-400 dark:text-gray-500 text-center pt-1">
                  +{activeProducts.length - 4} outros produtos —{" "}
                  <a href="/conversas/configuracao" className="text-blue-500 hover:underline">
                    editar em Configuracao
                  </a>
                </p>
              )}
            </div>
          )}
        </Card>

        {/* 6. Preview do Prompt */}
        <Card>
          <SectionHeader
            icon={Terminal}
            title="Preview do Prompt Completo"
            action={
              <button
                onClick={() => setShowPreview((v) => !v)}
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 transition-colors"
              >
                <Eye size={13} />
                {showPreview ? "Ocultar" : "Mostrar"}
              </button>
            }
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
            Exatamente o que a IA vai receber. Atualiza em tempo real conforme você edita os blocos
            acima.
          </p>
          {showPreview ? (
            <pre className="bg-gray-900 text-green-400 text-xs p-4 rounded-xl overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed border border-gray-700 max-h-96 overflow-y-auto">
              {promptPreview}
            </pre>
          ) : (
            <div
              className="bg-gray-900 text-gray-500 text-xs p-4 rounded-xl font-mono flex items-center justify-center gap-2 cursor-pointer hover:bg-gray-800 transition-colors border border-gray-700"
              onClick={() => setShowPreview(true)}
            >
              <Terminal size={14} />
              <span>Clique em &ldquo;Mostrar&rdquo; para ver o prompt completo</span>
            </div>
          )}
          {config.botSystemPrompt?.trim() && (
            <div className="mt-3 flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 rounded-lg border border-amber-200 dark:border-amber-800">
              <AlertCircle size={13} />
              Modo avançado ativo — o prompt abaixo substitui todos os blocos
            </div>
          )}
        </Card>

        {/* 7. Modo Avançado */}
        <Card className="border-amber-200 dark:border-amber-800/50">
          <SectionHeader icon={ShieldAlert} title="Modo Avançado (override)" />
          <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg px-3 py-2.5 mb-4">
            <AlertCircle size={14} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700 dark:text-amber-300">
              Se preenchido, este campo <strong>substitui completamente</strong> todos os blocos
              acima. Deixe vazio para usar a configuração modular.
            </p>
          </div>
          <textarea
            rows={8}
            value={config.botSystemPrompt || ""}
            onChange={(e) => setConfig((c) => ({ ...c, botSystemPrompt: e.target.value }))}
            placeholder="Deixe vazio para usar os blocos acima. Preencha para sobrescrever com um prompt customizado completo..."
            className="w-full px-3 py-2.5 text-sm rounded-lg border border-amber-300 dark:border-amber-700/60 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent resize-none font-mono leading-relaxed"
          />
        </Card>

        {/* Save button */}
        <div className="flex justify-end pb-8">
          <button
            onClick={handleSave}
            disabled={saving}
            className={clsx(
              "flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold transition-all",
              saving
                ? "bg-blue-400 dark:bg-blue-700 text-white cursor-not-allowed opacity-70"
                : "bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500 text-white shadow-sm hover:shadow-md"
            )}
          >
            {saving ? <Spinner className="text-white" /> : <Save size={15} />}
            {saving ? "Salvando..." : "Salvar Configurações"}
          </button>
        </div>
      </div>
    </div>
  );
}
