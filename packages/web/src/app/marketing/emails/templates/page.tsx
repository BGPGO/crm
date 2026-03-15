"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Header from "@/components/layout/Header";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import MarketingNav from "@/components/marketing/MarketingNav";
import { Plus, Copy, Trash2, FileText } from "lucide-react";
import { api } from "@/lib/api";

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  htmlContent: string;
  campaignCount?: number;
  createdAt: string;
}

interface TemplatesResponse {
  data: EmailTemplate[];
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.get<TemplatesResponse>("/email-templates");
      setTemplates(result.data);
    } catch (err) {
      console.error("Erro ao buscar templates:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const handleDuplicate = async (template: EmailTemplate) => {
    try {
      await api.post("/email-templates", {
        name: `${template.name} (cópia)`,
        subject: template.subject,
        htmlContent: template.htmlContent,
      });
      fetchTemplates();
    } catch (err) {
      console.error("Erro ao duplicar template:", err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir este template?")) return;
    try {
      await api.delete(`/email-templates/${id}`);
      setTemplates((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      console.error("Erro ao excluir template:", err);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-auto">
      <Header
        title="Templates de Email"
        breadcrumb={["Marketing", "Emails", "Templates"]}
      />
      <MarketingNav />

      <main className="flex-1 p-6 space-y-4">
        {/* Toolbar */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Gerencie os templates de email para suas campanhas.
          </p>
          <Link href="/marketing/emails/templates/new">
            <Button variant="primary" size="sm">
              <Plus size={14} />
              Novo Template
            </Button>
          </Link>
        </div>

        {/* Grid */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-56 bg-gray-100 rounded-xl animate-pulse"
              />
            ))}
          </div>
        ) : templates.length === 0 ? (
          <Card padding="lg">
            <div className="text-center py-12">
              <FileText
                size={40}
                className="mx-auto text-gray-300 mb-3"
              />
              <p className="text-sm text-gray-400">
                Nenhum template criado ainda.
              </p>
              <Link href="/marketing/emails/templates/new">
                <Button variant="primary" size="sm" className="mt-4">
                  <Plus size={14} />
                  Criar Primeiro Template
                </Button>
              </Link>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map((template) => (
              <Card key={template.id} padding="none" className="overflow-hidden">
                {/* Thumbnail */}
                <div className="h-36 bg-gray-50 border-b border-gray-200 relative overflow-hidden">
                  {template.htmlContent ? (
                    <iframe
                      srcDoc={template.htmlContent}
                      sandbox=""
                      className="w-full h-full pointer-events-none"
                      title={template.name}
                      tabIndex={-1}
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full text-gray-300">
                      <FileText size={32} />
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="p-4">
                  <Link
                    href={`/marketing/emails/templates/${template.id}`}
                    className="text-sm font-medium text-gray-900 hover:text-blue-600 truncate block"
                  >
                    {template.name}
                  </Link>
                  <p className="text-xs text-gray-500 truncate mt-0.5">
                    {template.subject}
                  </p>
                  {template.campaignCount !== undefined && (
                    <p className="text-xs text-gray-400 mt-1">
                      Usado em {template.campaignCount} campanha
                      {template.campaignCount !== 1 ? "s" : ""}
                    </p>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-1 mt-3 pt-3 border-t border-gray-100">
                    <Link href={`/marketing/emails/templates/${template.id}`}>
                      <Button variant="ghost" size="sm">
                        Editar
                      </Button>
                    </Link>
                    <button
                      onClick={() => handleDuplicate(template)}
                      className="p-1.5 rounded-md text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                      title="Duplicar"
                    >
                      <Copy size={14} />
                    </button>
                    <button
                      onClick={() => handleDelete(template.id)}
                      className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                      title="Excluir"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
