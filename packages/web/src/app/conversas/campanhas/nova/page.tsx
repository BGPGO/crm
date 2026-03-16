"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/layout/Header";
import ConversasNav from "@/components/conversas/ConversasNav";
import Card from "@/components/ui/Card";
import { api } from "@/lib/api";

export default function NovaCampanhaPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [contacts, setContacts] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const contactList = contacts
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !message.trim() || contactList.length === 0) return;

    setSaving(true);
    setError(null);
    try {
      await api.post("/whatsapp/campaigns", {
        name: name.trim(),
        message: message.trim(),
        contacts: contactList,
      });
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

      <main className="flex-1 p-6">
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
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Contatos (um telefone por linha)
                </label>
                <textarea
                  value={contacts}
                  onChange={(e) => setContacts(e.target.value)}
                  placeholder={"5511999990001\n5511999990002\n5511999990003"}
                  rows={6}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none font-mono"
                  required
                />
                <p className="text-xs text-gray-400 mt-1">
                  {contactList.length} contato{contactList.length !== 1 ? "s" : ""}
                </p>
              </div>

              <button
                type="submit"
                disabled={saving || !name.trim() || !message.trim() || contactList.length === 0}
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

            {contactList.length > 0 && (
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
          </Card>
        </form>
      </main>
    </div>
  );
}
