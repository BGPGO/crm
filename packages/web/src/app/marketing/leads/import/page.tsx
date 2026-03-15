"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import Header from "@/components/layout/Header";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import MarketingNav from "@/components/marketing/MarketingNav";
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeader,
  TableCell,
} from "@/components/ui/Table";
import {
  Upload,
  ArrowLeft,
  ArrowRight,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { api } from "@/lib/api";

type Step = "upload" | "mapping" | "preview" | "confirm" | "done";

interface FieldMapping {
  csvHeader: string;
  contactField: string;
}

interface ImportResult {
  imported: number;
  errors: number;
  errorDetails: string[];
}

const contactFields = [
  { value: "", label: "-- Ignorar --" },
  { value: "name", label: "Nome" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Telefone" },
  { value: "position", label: "Cargo" },
  { value: "notes", label: "Observações" },
];

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length === 0) return { headers: [], rows: [] };

  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  const rows = lines.slice(1).map((line) =>
    line.split(",").map((cell) => cell.trim().replace(/^"|"$/g, ""))
  );

  return { headers, rows };
}

export default function ImportLeadsPage() {
  const [step, setStep] = useState<Step>("upload");
  const [csvContent, setCsvContent] = useState("");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mappings, setMappings] = useState<FieldMapping[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setCsvContent(text);
      const parsed = parseCSV(text);
      setHeaders(parsed.headers);
      setRows(parsed.rows);

      // Auto-map headers to fields
      const autoMappings = parsed.headers.map((header) => {
        const lower = header.toLowerCase();
        let field = "";
        if (lower.includes("nome") || lower.includes("name")) field = "name";
        else if (lower.includes("email") || lower.includes("e-mail"))
          field = "email";
        else if (
          lower.includes("telefone") ||
          lower.includes("phone") ||
          lower.includes("tel")
        )
          field = "phone";
        else if (
          lower.includes("cargo") ||
          lower.includes("position") ||
          lower.includes("título")
        )
          field = "position";
        else if (
          lower.includes("nota") ||
          lower.includes("obs") ||
          lower.includes("notes")
        )
          field = "notes";

        return { csvHeader: header, contactField: field };
      });
      setMappings(autoMappings);
    };
    reader.readAsText(file, "UTF-8");
  };

  const updateMapping = (index: number, field: string) => {
    setMappings((prev) =>
      prev.map((m, i) => (i === index ? { ...m, contactField: field } : m))
    );
  };

  const previewRows = rows.slice(0, 5);

  const getMappedData = () => {
    return previewRows.map((row) => {
      const obj: Record<string, string> = {};
      mappings.forEach((mapping, i) => {
        if (mapping.contactField && row[i]) {
          obj[mapping.contactField] = row[i];
        }
      });
      return obj;
    });
  };

  const handleImport = async () => {
    setImporting(true);
    try {
      const mappingObj: Record<string, string> = {};
      mappings.forEach((m) => {
        if (m.contactField) {
          mappingObj[m.csvHeader] = m.contactField;
        }
      });

      const res = await api.post<{ data: ImportResult }>("/contact-imports", {
        csvContent,
        mapping: mappingObj,
      });
      setResult(res.data);
      setStep("done");
    } catch (err) {
      console.error("Erro na importação:", err);
      setResult({
        imported: 0,
        errors: 1,
        errorDetails: ["Erro ao processar importação. Tente novamente."],
      });
      setStep("done");
    } finally {
      setImporting(false);
    }
  };

  const hasMappedName = mappings.some((m) => m.contactField === "name");

  return (
    <div className="flex flex-col h-full overflow-auto">
      <Header
        title="Importar Leads"
        breadcrumb={["Marketing", "Leads", "Importar"]}
      />
      <MarketingNav />

      <main className="flex-1 p-6 space-y-6">
        {/* Back link */}
        <Link
          href="/marketing/leads"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft size={14} />
          Voltar para Leads
        </Link>

        {/* Step indicator */}
        <div className="flex items-center gap-2">
          {(["upload", "mapping", "preview", "confirm", "done"] as Step[]).map(
            (s, i) => {
              const labels = [
                "Upload",
                "Mapeamento",
                "Preview",
                "Confirmar",
                "Resultado",
              ];
              const isActive = s === step;
              const stepIndex = [
                "upload",
                "mapping",
                "preview",
                "confirm",
                "done",
              ].indexOf(step);
              const isPast = i < stepIndex;

              return (
                <div key={s} className="flex items-center gap-2">
                  {i > 0 && (
                    <div
                      className={`w-8 h-0.5 ${
                        isPast ? "bg-blue-600" : "bg-gray-200"
                      }`}
                    />
                  )}
                  <div
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${
                      isActive
                        ? "bg-blue-600 text-white"
                        : isPast
                        ? "bg-blue-100 text-blue-700"
                        : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    <span>{i + 1}</span>
                    <span>{labels[i]}</span>
                  </div>
                </div>
              );
            }
          )}
        </div>

        {/* Step: Upload */}
        {step === "upload" && (
          <Card padding="lg">
            <div className="text-center space-y-4">
              <div className="mx-auto w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center">
                <Upload size={28} />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  Selecione um arquivo CSV
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  O arquivo deve conter uma linha de cabeçalho com os nomes das
                  colunas.
                </p>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileSelect}
                className="hidden"
              />

              {!fileName ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="mx-auto max-w-md border-2 border-dashed border-gray-300 rounded-xl p-8 hover:border-blue-400 hover:bg-blue-50/50 cursor-pointer transition-colors"
                >
                  <FileSpreadsheet
                    size={32}
                    className="mx-auto text-gray-400 mb-2"
                  />
                  <p className="text-sm text-gray-500">
                    Clique para selecionar ou arraste o arquivo aqui
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    Formatos aceitos: .csv
                  </p>
                </div>
              ) : (
                <div className="mx-auto max-w-md border border-green-200 bg-green-50 rounded-xl p-4">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 size={20} className="text-green-600" />
                    <div className="text-left">
                      <p className="text-sm font-medium text-gray-900">
                        {fileName}
                      </p>
                      <p className="text-xs text-gray-500">
                        {rows.length} linhas, {headers.length} colunas
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-end">
                <Button
                  variant="primary"
                  size="sm"
                  disabled={!csvContent}
                  onClick={() => setStep("mapping")}
                >
                  Próximo
                  <ArrowRight size={14} />
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* Step: Mapping */}
        {step === "mapping" && (
          <Card padding="lg">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">
              Mapeamento de Colunas
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              Associe cada coluna do CSV a um campo do contato.
            </p>

            <div className="space-y-3">
              {mappings.map((mapping, i) => (
                <div
                  key={i}
                  className="flex items-center gap-4 py-2 border-b border-gray-100 last:border-0"
                >
                  <div className="w-1/3">
                    <span className="text-sm font-medium text-gray-700">
                      {mapping.csvHeader}
                    </span>
                    {rows[0] && rows[0][i] && (
                      <p className="text-xs text-gray-400 mt-0.5 truncate">
                        Ex: {rows[0][i]}
                      </p>
                    )}
                  </div>
                  <ArrowRight size={14} className="text-gray-400 flex-shrink-0" />
                  <div className="w-1/3">
                    <select
                      value={mapping.contactField}
                      onChange={(e) => updateMapping(i, e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      {contactFields.map((f) => (
                        <option key={f.value} value={f.value}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
            </div>

            {!hasMappedName && (
              <div className="flex items-center gap-2 mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-700">
                <AlertCircle size={16} />
                O campo &quot;Nome&quot; precisa estar mapeado para continuar.
              </div>
            )}

            <div className="flex justify-between mt-6">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setStep("upload")}
              >
                <ArrowLeft size={14} />
                Voltar
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={!hasMappedName}
                onClick={() => setStep("preview")}
              >
                Próximo
                <ArrowRight size={14} />
              </Button>
            </div>
          </Card>
        )}

        {/* Step: Preview */}
        {step === "preview" && (
          <Card padding="lg">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">
              Preview dos Dados
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              Confira as primeiras 5 linhas com o mapeamento aplicado.
            </p>

            <Table>
              <TableHead>
                <TableRow>
                  {contactFields
                    .filter((f) => f.value && mappings.some((m) => m.contactField === f.value))
                    .map((f) => (
                      <TableHeader key={f.value}>{f.label}</TableHeader>
                    ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {getMappedData().map((row, i) => (
                  <TableRow key={i}>
                    {contactFields
                      .filter(
                        (f) =>
                          f.value && mappings.some((m) => m.contactField === f.value)
                      )
                      .map((f) => (
                        <TableCell key={f.value} className="text-gray-600">
                          {row[f.value] || "\u2014"}
                        </TableCell>
                      ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <p className="text-xs text-gray-400 mt-3">
              Mostrando {previewRows.length} de {rows.length} linhas.
            </p>

            <div className="flex justify-between mt-6">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setStep("mapping")}
              >
                <ArrowLeft size={14} />
                Voltar
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setStep("confirm")}
              >
                Próximo
                <ArrowRight size={14} />
              </Button>
            </div>
          </Card>
        )}

        {/* Step: Confirm */}
        {step === "confirm" && (
          <Card padding="lg">
            <div className="text-center space-y-4">
              {importing ? (
                <>
                  <Loader2 size={32} className="mx-auto text-blue-600 animate-spin" />
                  <h2 className="text-lg font-semibold text-gray-900">
                    Importando...
                  </h2>
                  <p className="text-sm text-gray-500">
                    Processando {rows.length} contatos. Isso pode levar alguns
                    instantes.
                  </p>
                </>
              ) : (
                <>
                  <div className="mx-auto w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center">
                    <FileSpreadsheet size={28} />
                  </div>
                  <h2 className="text-lg font-semibold text-gray-900">
                    Confirmar Importação
                  </h2>
                  <p className="text-sm text-gray-500">
                    Você está prestes a importar{" "}
                    <span className="font-semibold text-gray-900">
                      {rows.length}
                    </span>{" "}
                    contatos do arquivo{" "}
                    <span className="font-semibold text-gray-900">{fileName}</span>.
                  </p>
                  <div className="flex justify-center gap-3 pt-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setStep("preview")}
                    >
                      <ArrowLeft size={14} />
                      Voltar
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleImport}
                    >
                      <Upload size={14} />
                      Importar Agora
                    </Button>
                  </div>
                </>
              )}
            </div>
          </Card>
        )}

        {/* Step: Done */}
        {step === "done" && result && (
          <Card padding="lg">
            <div className="text-center space-y-4">
              {result.errors === 0 ? (
                <div className="mx-auto w-16 h-16 bg-green-50 text-green-600 rounded-2xl flex items-center justify-center">
                  <CheckCircle2 size={28} />
                </div>
              ) : (
                <div className="mx-auto w-16 h-16 bg-yellow-50 text-yellow-600 rounded-2xl flex items-center justify-center">
                  <AlertCircle size={28} />
                </div>
              )}

              <h2 className="text-lg font-semibold text-gray-900">
                Importação Concluída
              </h2>

              <div className="flex justify-center gap-6">
                <div className="text-center">
                  <p className="text-2xl font-semibold text-green-600">
                    {result.imported}
                  </p>
                  <p className="text-xs text-gray-500">Importados</p>
                </div>
                {result.errors > 0 && (
                  <div className="text-center">
                    <p className="text-2xl font-semibold text-red-600">
                      {result.errors}
                    </p>
                    <p className="text-xs text-gray-500">Erros</p>
                  </div>
                )}
              </div>

              {result.errorDetails && result.errorDetails.length > 0 && (
                <div className="mx-auto max-w-md text-left bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-sm font-medium text-red-700 mb-1">
                    Detalhes dos erros:
                  </p>
                  <ul className="text-xs text-red-600 space-y-1">
                    {result.errorDetails.slice(0, 10).map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                    {result.errorDetails.length > 10 && (
                      <li>
                        ...e mais {result.errorDetails.length - 10} erros
                      </li>
                    )}
                  </ul>
                </div>
              )}

              <div className="flex justify-center gap-3 pt-2">
                <Link href="/marketing/leads">
                  <Button variant="primary" size="sm">
                    Ver Leads
                  </Button>
                </Link>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setStep("upload");
                    setCsvContent("");
                    setFileName("");
                    setHeaders([]);
                    setRows([]);
                    setMappings([]);
                    setResult(null);
                  }}
                >
                  Nova Importação
                </Button>
              </div>
            </div>
          </Card>
        )}
      </main>
    </div>
  );
}
