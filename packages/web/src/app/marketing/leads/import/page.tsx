"use client";

import { useState, useRef, useEffect, useMemo } from "react";
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
  Building2,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { api, getAuthHeaders } from "@/lib/api";

type Step = "upload" | "mapping" | "preview" | "confirm" | "done";
type Brand = "BGP" | "AIMO";
type Separator = "tab" | "comma";

interface FieldMapping {
  csvHeader: string;
  contactField: string;
}

interface Tag {
  id: string;
  name: string;
  color?: string | null;
}

interface ImportResult {
  imported: number;
  errors: number;
  errorDetails: string[];
  skipped?: Array<{ reason: string; identifier?: string; existingBrand?: Brand }>;
}

const contactFields = [
  { value: "", label: "-- Ignorar --" },
  { value: "name", label: "Nome" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Telefone" },
  { value: "position", label: "Cargo" },
  { value: "organization.name", label: "Empresa" },
  { value: "city", label: "Cidade" },
  { value: "state", label: "Estado" },
  { value: "source.name", label: "Origem" },
  { value: "tags", label: "Tags (CSV)" },
  { value: "notes", label: "Observações" },
];

// ── Encoding detection (UTF-16 LE vs UTF-8) ─────────────────────────────────
function decodeFileBuffer(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  // BOM check
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(buf);
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(buf);
  }
  // Heuristic: if more than half of bytes at odd positions are 0x00 → UTF-16 LE
  const sample = Math.min(bytes.length, 2048);
  if (sample >= 4) {
    let evenZeros = 0;
    let oddZeros = 0;
    let evenCount = 0;
    let oddCount = 0;
    for (let i = 0; i < sample; i++) {
      if (i % 2 === 0) {
        evenCount++;
        if (bytes[i] === 0) evenZeros++;
      } else {
        oddCount++;
        if (bytes[i] === 0) oddZeros++;
      }
    }
    if (oddCount > 0 && oddZeros / oddCount > 0.5 && evenZeros / evenCount < 0.2) {
      return new TextDecoder("utf-16le").decode(buf);
    }
    if (evenCount > 0 && evenZeros / evenCount > 0.5 && oddZeros / oddCount < 0.2) {
      return new TextDecoder("utf-16be").decode(buf);
    }
  }
  // Strip leading UTF-8 BOM if present
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(buf.slice(3));
  }
  return new TextDecoder("utf-8").decode(buf);
}

// ── Separator detection ─────────────────────────────────────────────────────
function detectSeparator(text: string): Separator {
  const firstLine = text.split(/\r?\n/, 1)[0] || "";
  const tabs = (firstLine.match(/\t/g) || []).length;
  const commas = (firstLine.match(/,/g) || []).length;
  if (tabs > 0 && tabs > commas) return "tab";
  return "comma";
}

// ── CSV/TSV parser ──────────────────────────────────────────────────────────
function parseDelimited(
  text: string,
  separator: Separator
): { headers: string[]; rows: string[][] } {
  // Strip BOM character if it survived the decode (UTF-8 BOM remnant)
  const cleaned = text.replace(/^﻿/, "");
  const lines = cleaned.trim().split(/\r?\n/);
  if (lines.length === 0) return { headers: [], rows: [] };

  const sep = separator === "tab" ? "\t" : ",";

  const splitLine = (line: string): string[] => {
    if (separator === "tab") {
      return line.split("\t").map((c) => c.trim().replace(/^"|"$/g, ""));
    }
    // basic CSV split (no embedded commas in quoted fields handled — same as before)
    return line.split(sep).map((c) => c.trim().replace(/^"|"$/g, ""));
  };

  const headers = splitLine(lines[0]);
  const rows = lines.slice(1).map(splitLine);
  return { headers, rows };
}

// ── RD Station preset ───────────────────────────────────────────────────────
function isRdStationFormat(headers: string[]): boolean {
  const set = new Set(headers.map((h) => h.toLowerCase().trim()));
  return set.has("email") && set.has("nome") && set.has("estágio no funil");
}

function rdStationMapping(headers: string[]): FieldMapping[] {
  const hasCelular = headers.some((h) => h.toLowerCase().trim() === "celular");
  return headers.map((header) => {
    const key = header.toLowerCase().trim();
    let field = "";
    if (key === "email") field = "email";
    else if (key === "nome") field = "name";
    else if (key === "celular") field = "phone";
    else if (key === "telefone" && !hasCelular) field = "phone";
    else if (key === "empresa") field = "organization.name";
    else if (key === "cargo") field = "position";
    else if (key === "cidade") field = "city";
    else if (key === "estado") field = "state";
    else if (key === "origem da primeira conversão") field = "source.name";
    else if (key === "tags") field = "tags";
    return { csvHeader: header, contactField: field };
  });
}

// ── Generic auto-mapping fallback ───────────────────────────────────────────
function genericAutoMapping(headers: string[]): FieldMapping[] {
  return headers.map((header) => {
    const lower = header.toLowerCase();
    let field = "";
    if (lower.includes("nome") || lower.includes("name")) field = "name";
    else if (lower.includes("email") || lower.includes("e-mail")) field = "email";
    else if (
      lower.includes("celular") ||
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
    else if (lower.includes("empresa")) field = "organization.name";
    else if (lower.includes("cidade")) field = "city";
    else if (lower.includes("estado")) field = "state";
    else if (lower.includes("origem")) field = "source.name";
    else if (lower === "tags" || lower.includes("etiqueta")) field = "tags";
    else if (
      lower.includes("nota") ||
      lower.includes("obs") ||
      lower.includes("notes")
    )
      field = "notes";
    return { csvHeader: header, contactField: field };
  });
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
  const [separator, setSeparator] = useState<Separator>("comma");
  const [isRdPreset, setIsRdPreset] = useState(false);

  // multi-brand state
  const [selectedBrand, setSelectedBrand] = useState<Brand>("BGP");
  const [tags, setTags] = useState<Tag[]>([]);
  const [tagsLoading, setTagsLoading] = useState(false);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [skippedExpanded, setSkippedExpanded] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load tags filtered by brand
  useEffect(() => {
    let cancelled = false;
    setTagsLoading(true);
    // reset selection when brand changes (tags list will differ)
    setSelectedTagIds([]);
    api
      .get<{ data: Tag[] } | Tag[]>("/tags?limit=200", {
        "X-Brand": selectedBrand,
      })
      .then((res) => {
        if (cancelled) return;
        const list = Array.isArray(res) ? res : res?.data ?? [];
        setTags(list);
      })
      .catch((err) => {
        console.error("Erro ao carregar tags:", err);
        if (!cancelled) setTags([]);
      })
      .finally(() => {
        if (!cancelled) setTagsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedBrand]);

  const processFile = (file: File) => {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const buf = event.target?.result;
      if (!(buf instanceof ArrayBuffer)) return;
      const text = decodeFileBuffer(buf);
      setCsvContent(text);
      const sep = detectSeparator(text);
      setSeparator(sep);
      const parsed = parseDelimited(text, sep);
      setHeaders(parsed.headers);
      setRows(parsed.rows);

      // RD Station auto-preset (TAB + signature headers)
      if (sep === "tab" && isRdStationFormat(parsed.headers)) {
        setMappings(rdStationMapping(parsed.headers));
        setIsRdPreset(true);
      } else {
        setMappings(genericAutoMapping(parsed.headers));
        setIsRdPreset(false);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processFile(file);
  };

  const updateMapping = (index: number, field: string) => {
    setMappings((prev) =>
      prev.map((m, i) => (i === index ? { ...m, contactField: field } : m))
    );
  };

  const previewRows = rows.slice(0, 5);

  const visibleMappedFields = useMemo(
    () =>
      contactFields.filter(
        (f) => f.value && mappings.some((m) => m.contactField === f.value)
      ),
    [mappings]
  );

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

  const toggleTag = (id: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
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

      // Use raw fetch so we can attach X-Brand header explicitly. The api
      // client only takes a body for POST; fallback ensures header is sent
      // regardless of whether a global interceptor is in place.
      const authHeaders = await getAuthHeaders();
      const response = await fetch("/api/contact-imports", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Brand": selectedBrand,
          ...authHeaders,
        },
        body: JSON.stringify({
          fileName,
          csvContent,
          mapping: mappingObj,
          brand: selectedBrand,
          tagIds: selectedTagIds,
        }),
      });

      if (!response.ok) {
        let msg = `HTTP ${response.status}`;
        try {
          const data = await response.json();
          msg = data?.message || msg;
        } catch {
          // ignore
        }
        throw new Error(msg);
      }

      const json = (await response.json()) as { data: ImportResult };
      setResult(json.data);
      setStep("done");
    } catch (err) {
      console.error("Erro na importação:", err);
      const message =
        err instanceof Error ? err.message : "Erro ao processar importação. Tente novamente.";
      setResult({
        imported: 0,
        errors: 1,
        errorDetails: [message],
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

      <main className="flex-1 p-4 sm:p-6 space-y-6">
        {/* Back link */}
        <Link
          href="/marketing/leads"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft size={14} />
          Voltar para Leads
        </Link>

        {/* Step indicator */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2">
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
            <div className="space-y-6">
              {/* Brand selector */}
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-2">
                  Marca
                </h3>
                <p className="text-xs text-gray-500 mb-3">
                  Defina em qual marca os contatos serão criados.
                </p>
                <div className="grid grid-cols-2 gap-3 max-w-md">
                  {(["BGP", "AIMO"] as Brand[]).map((brand) => {
                    const active = selectedBrand === brand;
                    return (
                      <button
                        key={brand}
                        type="button"
                        onClick={() => setSelectedBrand(brand)}
                        className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-colors text-left ${
                          active
                            ? "border-blue-600 bg-blue-50 text-blue-700"
                            : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
                        }`}
                      >
                        <div
                          className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                            active
                              ? "bg-blue-600 text-white"
                              : "bg-gray-100 text-gray-500"
                          }`}
                        >
                          <Building2 size={18} />
                        </div>
                        <div>
                          <p className="text-sm font-semibold">{brand}</p>
                          <p className="text-xs opacity-75">
                            {brand === "BGP"
                              ? "Bertuzzi Patrimonial"
                              : "AIMO"}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Tag multi-select */}
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-2">
                  Tags a aplicar
                </h3>
                <p className="text-xs text-gray-500 mb-3">
                  Estas tags serão aplicadas a todos os contatos importados.
                </p>
                {tagsLoading ? (
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Loader2 size={14} className="animate-spin" />
                    Carregando tags da marca {selectedBrand}…
                  </div>
                ) : tags.length === 0 ? (
                  <p className="text-sm text-gray-400">
                    Nenhuma tag cadastrada para {selectedBrand}.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {tags.map((tag) => {
                      const active = selectedTagIds.includes(tag.id);
                      return (
                        <button
                          key={tag.id}
                          type="button"
                          onClick={() => toggleTag(tag.id)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                            active
                              ? "border-blue-600 bg-blue-600 text-white"
                              : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                          }`}
                          style={
                            active && tag.color
                              ? { backgroundColor: tag.color, borderColor: tag.color }
                              : undefined
                          }
                        >
                          {active && <CheckCircle2 size={12} />}
                          {tag.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="border-t border-gray-100 pt-6 text-center space-y-4">
                <div className="mx-auto w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center">
                  <Upload size={28} />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">
                    Selecione um arquivo CSV
                  </h2>
                  <p className="text-sm text-gray-500 mt-1">
                    O arquivo deve conter uma linha de cabeçalho com os nomes das
                    colunas. Suporta UTF-8 e UTF-16 (RD Station).
                  </p>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.tsv,.txt"
                  onChange={handleFileSelect}
                  className="hidden"
                />

                {!fileName ? (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      e.currentTarget.classList.add("border-blue-400", "bg-blue-50/50");
                    }}
                    onDragLeave={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      e.currentTarget.classList.remove("border-blue-400", "bg-blue-50/50");
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      e.currentTarget.classList.remove("border-blue-400", "bg-blue-50/50");
                      const file = e.dataTransfer.files?.[0];
                      if (file) processFile(file);
                    }}
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
                      Formatos aceitos: .csv, .tsv
                    </p>
                  </div>
                ) : (
                  <div className="mx-auto max-w-md border border-green-200 bg-green-50 rounded-xl p-4 space-y-2">
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
                    <div className="flex items-center justify-center gap-2 text-xs">
                      <span className="px-2 py-0.5 rounded-full bg-white border border-gray-200 text-gray-600">
                        {separator === "tab"
                          ? "Detectado: TAB (RD Station export)"
                          : "Detectado: CSV (vírgula)"}
                      </span>
                      {isRdPreset && (
                        <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                          Preset RD Station aplicado
                        </span>
                      )}
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
              Associe cada coluna do arquivo a um campo do contato.
              {isRdPreset && (
                <span className="ml-1 text-blue-700">
                  Preset RD Station aplicado automaticamente.
                </span>
              )}
            </p>

            <div className="space-y-3">
              {mappings.map((mapping, i) => (
                <div
                  key={i}
                  className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 py-2 border-b border-gray-100 last:border-0"
                >
                  <div className="sm:w-1/3">
                    <span className="text-sm font-medium text-gray-700">
                      {mapping.csvHeader}
                    </span>
                    {rows[0] && rows[0][i] && (
                      <p className="text-xs text-gray-400 mt-0.5 truncate">
                        Ex: {rows[0][i]}
                      </p>
                    )}
                  </div>
                  <ArrowRight size={14} className="text-gray-400 flex-shrink-0 hidden sm:block" />
                  <div className="sm:w-1/3">
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

            <div className="overflow-x-auto">
            <Table>
              <TableHead>
                <TableRow>
                  {visibleMappedFields.map((f) => (
                    <TableHeader key={f.value}>{f.label}</TableHeader>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {getMappedData().map((row, i) => (
                  <TableRow key={i}>
                    {visibleMappedFields.map((f) => (
                      <TableCell key={f.value} className="text-gray-600">
                        {row[f.value] || "—"}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>

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
                    <span className="font-semibold text-gray-900">{fileName}</span>{" "}
                    para a marca{" "}
                    <span className="font-semibold text-blue-700">
                      {selectedBrand}
                    </span>
                    {selectedTagIds.length > 0 && (
                      <>
                        {" "}com{" "}
                        <span className="font-semibold text-gray-900">
                          {selectedTagIds.length}
                        </span>{" "}
                        tag{selectedTagIds.length > 1 ? "s" : ""} aplicada
                        {selectedTagIds.length > 1 ? "s" : ""}
                      </>
                    )}
                    .
                  </p>
                  <div className="flex justify-center gap-3 pt-2 flex-wrap">
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
              {result.errors === 0 && (!result.skipped || result.skipped.length === 0) ? (
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

              <div className="flex justify-center gap-6 flex-wrap">
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
                {result.skipped && result.skipped.length > 0 && (
                  <div className="text-center">
                    <p className="text-2xl font-semibold text-yellow-600">
                      {result.skipped.length}
                    </p>
                    <p className="text-xs text-gray-500">Pulados</p>
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

              {result.skipped && result.skipped.length > 0 && (
                <div className="mx-auto max-w-md text-left bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                  <button
                    type="button"
                    onClick={() => setSkippedExpanded((v) => !v)}
                    className="w-full flex items-center justify-between text-sm font-medium text-yellow-800"
                  >
                    <span>
                      {result.skipped.length} contato
                      {result.skipped.length > 1 ? "s pulados" : " pulado"} (já
                      existem em outra marca)
                    </span>
                    {skippedExpanded ? (
                      <ChevronDown size={16} />
                    ) : (
                      <ChevronRight size={16} />
                    )}
                  </button>
                  {skippedExpanded && (
                    <ul className="text-xs text-yellow-700 space-y-1 mt-2 max-h-48 overflow-auto">
                      {result.skipped.slice(0, 100).map((s, i) => (
                        <li key={i}>
                          {s.identifier ?? "(sem identificador)"} —{" "}
                          {s.reason}
                          {s.existingBrand
                            ? ` (existente: ${s.existingBrand})`
                            : ""}
                        </li>
                      ))}
                      {result.skipped.length > 100 && (
                        <li>...e mais {result.skipped.length - 100}</li>
                      )}
                    </ul>
                  )}
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
                    setSelectedTagIds([]);
                    setIsRdPreset(false);
                    setSeparator("comma");
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
