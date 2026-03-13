import Header from "@/components/layout/Header";
import Card from "@/components/ui/Card";
import { Bot, MessageSquare, BarChart3 } from "lucide-react";

export default function SdrPage() {
  return (
    <div className="flex flex-col h-full overflow-auto">
      <Header title="SDR IA" breadcrumb={["SDR IA"]} />

      <main className="flex-1 p-6 space-y-6">
        <Card padding="md">
          <div className="flex items-start gap-4">
            <div className="bg-blue-50 text-blue-600 p-3 rounded-xl flex-shrink-0">
              <Bot size={26} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-1">
                <h2 className="text-lg font-semibold text-gray-900">SDR IA</h2>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 border border-blue-200">
                  Em desenvolvimento
                </span>
              </div>
              <p className="text-sm text-gray-500">
                Assistente de vendas com inteligência artificial
              </p>
              <p className="text-sm text-gray-600 mt-2">
                O SDR IA conversa automaticamente com leads, qualifica oportunidades
                e agenda reuniões para o time de vendas.
              </p>
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <Card padding="md">
            <div className="flex items-start gap-4 mb-4">
              <div className="bg-blue-50 text-blue-600 p-2.5 rounded-xl">
                <MessageSquare size={22} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Conversas</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Histórico de conversas com leads
                </p>
              </div>
            </div>
            <div className="flex items-center justify-center h-40 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
              <div className="text-center">
                <MessageSquare size={28} className="text-gray-300 mx-auto mb-1.5" />
                <p className="text-xs text-gray-400">Em breve</p>
              </div>
            </div>
          </Card>

          <Card padding="md">
            <div className="flex items-start gap-4 mb-4">
              <div className="bg-green-50 text-green-600 p-2.5 rounded-xl">
                <Bot size={22} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Sequências</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Fluxos automáticos de contato
                </p>
              </div>
            </div>
            <div className="flex items-center justify-center h-40 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
              <div className="text-center">
                <Bot size={28} className="text-gray-300 mx-auto mb-1.5" />
                <p className="text-xs text-gray-400">Em breve</p>
              </div>
            </div>
          </Card>

          <Card padding="md">
            <div className="flex items-start gap-4 mb-4">
              <div className="bg-purple-50 text-purple-600 p-2.5 rounded-xl">
                <BarChart3 size={22} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Lead Scoring</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Pontuação automática de leads
                </p>
              </div>
            </div>
            <div className="flex items-center justify-center h-40 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
              <div className="text-center">
                <BarChart3 size={28} className="text-gray-300 mx-auto mb-1.5" />
                <p className="text-xs text-gray-400">Em breve</p>
              </div>
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
}
