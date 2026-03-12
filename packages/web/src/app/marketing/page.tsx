import Header from "@/components/layout/Header";
import Card from "@/components/ui/Card";
import { Megaphone, Mail, Zap } from "lucide-react";

export default function MarketingPage() {
  return (
    <div className="flex flex-col h-full overflow-auto">
      <Header title="Marketing" breadcrumb={["Marketing"]} />

      <main className="flex-1 p-6 space-y-6">
        {/* Hero card */}
        <Card padding="md">
          <div className="flex items-start gap-4">
            <div className="bg-orange-50 text-orange-600 p-3 rounded-xl flex-shrink-0">
              <Megaphone size={26} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-1">
                <h2 className="text-lg font-semibold text-gray-900">Marketing</h2>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700 border border-yellow-200">
                  Em desenvolvimento
                </span>
              </div>
              <p className="text-sm text-gray-500">
                Campanhas e automações de marketing
              </p>
              <p className="text-sm text-gray-600 mt-2">
                Gerencie campanhas, automações e acompanhe métricas de marketing.
                Funcionalidade em desenvolvimento.
              </p>
            </div>
          </div>
        </Card>

        {/* Placeholder feature cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Campanhas */}
          <Card padding="md">
            <div className="flex items-start gap-4 mb-4">
              <div className="bg-orange-50 text-orange-600 p-2.5 rounded-xl">
                <Megaphone size={22} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Campanhas</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Crie e gerencie campanhas de marketing
                </p>
              </div>
            </div>
            <div className="flex items-center justify-center h-40 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
              <div className="text-center">
                <Megaphone size={28} className="text-gray-300 mx-auto mb-1.5" />
                <p className="text-xs text-gray-400">Em breve</p>
              </div>
            </div>
          </Card>

          {/* Automações */}
          <Card padding="md">
            <div className="flex items-start gap-4 mb-4">
              <div className="bg-purple-50 text-purple-600 p-2.5 rounded-xl">
                <Zap size={22} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Automações</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Configure fluxos automáticos de comunicação
                </p>
              </div>
            </div>
            <div className="flex items-center justify-center h-40 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
              <div className="text-center">
                <Zap size={28} className="text-gray-300 mx-auto mb-1.5" />
                <p className="text-xs text-gray-400">Em breve</p>
              </div>
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
}
