"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { FileText, Eye, Download, ArrowLeft, Send, Loader2 } from "lucide-react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Textarea from "@/components/ui/Textarea";
import { api } from "@/lib/api";
import SignerOrderEditor from "@/components/pipeline/SignerOrderEditor";

/* ===== Types ===== */
export interface SavedWitness {
  id: string;
  nome: string;
  cpf: string;
  email: string;
}

interface DistratoGeneratorProps {
  dealId: string;
  deal: {
    title: string;
    value: number | null;
    contact?: { name: string; email: string; phone: string } | null;
    organization?: { name: string; cnpj: string; address: string; email: string } | null;
    products?: Array<{ product: { name: string } }>;
  };
  witnesses: SavedWitness[];
}

interface DistratoForm {
  razaoSocial: string;
  cnpj: string;
  endereco: string;
  representante: string;
  cpf: string;
  email: string;
  emailRepresentante: string;
  nomeContrato: string;
  dataAssinatura: string;
  dataEncerramento: string;
  valorPendente: string;
  prazoPagamento: string;
  observacoesAdicionais: string;
  testemunha1Nome: string;
  testemunha1Cpf: string;
  testemunha1Email: string;
  testemunha2Nome: string;
  testemunha2Cpf: string;
  testemunha2Email: string;
}

/* ===== Constants ===== */
const RESPONSAVEL_LEGAL = {
  nome: "Josiane Luiza Bertuzzi",
  cpf: "561.936.700-25",
  email: "josi@bertuzzipatrimonial.com.br",
};

const CONTRATADA_INFO = {
  razaoSocial: "BERTUZZI ASSESSORIA E GESTAO DE NEGOCIOS LTDA",
  endereco: "Av Carlos Gomes, nº. 75, Sala 603, Bairro Auxiliadora, CEP: 90.480-003, em Porto Alegre, RS",
  cnpj: "12.547.474/0001-37",
};

/* ===== Helpers ===== */
const formatCNPJ = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
};

const formatCPF = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
};

const formatCurrency = (v: string) => {
  const digits = v.replace(/\D/g, "");
  if (!digits) return "";
  const num = parseInt(digits, 10) / 100;
  return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

const formatDateBR = (dateStr: string): string => {
  if (!dateStr) return "";
  const months = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const [y, m, d] = dateStr.split("-");
  return `${parseInt(d)} de ${months[parseInt(m) - 1]} de ${y}`;
};

const getDateString = () => {
  const months = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const d = new Date();
  return `Porto Alegre/RS, ${d.getDate()} de ${months[d.getMonth()]} de ${d.getFullYear()}`;
};

/* ===== Distrato Content ===== */
const DistratoContent = ({ form }: { form: DistratoForm }) => {
  const valorFormatado = form.valorPendente ? formatCurrency(form.valorPendente) : "R$ 0,00";
  const prazoExtenso = form.prazoPagamento === "5" ? "cinco" : form.prazoPagamento;

  return (
    <div>
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <img src="/images/logo-bgp-wide.png" alt="BGP" style={{ height: 40, margin: "0 auto" }} />
      </div>

      <h1 style={{ fontSize: "14pt", fontWeight: "bold", textAlign: "center", textTransform: "uppercase", margin: "24px 0 20px" }}>
        DISTRATO
      </h1>

      {/* DISTRATANTE */}
      <h2 style={{ fontSize: "12pt", fontWeight: "bold", textTransform: "uppercase", margin: "18px 0 10px" }}>DISTRATANTE:</h2>
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16 }}>
        <tbody>
          <tr><td style={{ border: "1px solid #000", padding: "6px 8px", fontWeight: "bold", width: 160 }}>Razão Social:</td><td style={{ border: "1px solid #000", padding: "6px 8px" }}><strong>{form.razaoSocial}</strong></td></tr>
          <tr><td style={{ border: "1px solid #000", padding: "6px 8px", fontWeight: "bold" }}>CNPJ:</td><td style={{ border: "1px solid #000", padding: "6px 8px" }}><strong>{form.cnpj}</strong></td></tr>
          <tr><td style={{ border: "1px solid #000", padding: "6px 8px", fontWeight: "bold" }}>Endereço:</td><td style={{ border: "1px solid #000", padding: "6px 8px" }}>{form.endereco}</td></tr>
          <tr><td style={{ border: "1px solid #000", padding: "6px 8px", fontWeight: "bold" }}>Representante Legal:</td><td style={{ border: "1px solid #000", padding: "6px 8px" }}><strong>{form.representante}</strong></td></tr>
          <tr><td style={{ border: "1px solid #000", padding: "6px 8px", fontWeight: "bold" }}>CPF:</td><td style={{ border: "1px solid #000", padding: "6px 8px" }}><strong>{form.cpf}</strong></td></tr>
          <tr><td style={{ border: "1px solid #000", padding: "6px 8px", fontWeight: "bold" }}>E-mail:</td><td style={{ border: "1px solid #000", padding: "6px 8px" }}><strong>{form.email}</strong></td></tr>
        </tbody>
      </table>

      {/* CONTRATADA */}
      <h2 style={{ fontSize: "12pt", fontWeight: "bold", textTransform: "uppercase", margin: "18px 0 10px" }}>CONTRATADA:</h2>
      <p style={{ textAlign: "justify", textIndent: 0, margin: "8px 0" }}>
        {CONTRATADA_INFO.razaoSocial}, pessoa jurídica de direito privado, com sede na {CONTRATADA_INFO.endereco}, inscrita no CNPJ sob o n.º {CONTRATADA_INFO.cnpj} neste ato representada na forma prevista em seu Contrato Social;
      </p>

      {/* CONTRATO DISTRATADO */}
      <h2 style={{ fontSize: "12pt", fontWeight: "bold", textTransform: "uppercase", margin: "18px 0 10px" }}>CONTRATO DISTRATADO (&quot;CONTRATO&quot;):</h2>
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16 }}>
        <tbody>
          <tr><td style={{ border: "1px solid #000", padding: "6px 8px", fontWeight: "bold", fontStyle: "italic", width: 180 }}>Nome do Contrato:</td><td style={{ border: "1px solid #000", padding: "6px 8px", fontStyle: "italic" }}>{form.nomeContrato}</td></tr>
          <tr><td style={{ border: "1px solid #000", padding: "6px 8px", fontWeight: "bold", fontStyle: "italic" }}>Data de assinatura:</td><td style={{ border: "1px solid #000", padding: "6px 8px", fontStyle: "italic" }}>{form.dataAssinatura ? formatDateBR(form.dataAssinatura) : ""}</td></tr>
        </tbody>
      </table>

      <p style={{ textAlign: "justify", textIndent: 0, margin: "12px 0" }}>
        Decidem as Partes, por livre disposição de suas vontades, firmar o presente Distrato (&quot;Distrato&quot;) com base nas cláusulas que seguem.
      </p>

      {/* Cláusula 1 */}
      <h2 style={{ fontSize: "12pt", fontWeight: "bold", margin: "18px 0 10px" }}>1.</h2>
      <p style={{ textAlign: "justify", textIndent: "1.25cm" }}>
        As Partes, decidem, por mútuo acordo, encerrar o Contrato na data de {form.dataEncerramento ? formatDateBR(form.dataEncerramento) : "___________"}.
      </p>

      <h3 style={{ fontSize: "12pt", fontWeight: "bold", margin: "14px 0 8px" }}>1.1.</h3>
      <p style={{ textAlign: "justify", textIndent: "1.25cm" }}>
        A CONTRATADA permanecerá prestando serviços até referida data, conforme termos do Contrato, quando então operar-se-á o acordado neste Distrato e o devido encerramento do Contrato e da relação mantida entre as Partes.
      </p>

      {/* Cláusula 2 */}
      <h2 style={{ fontSize: "12pt", fontWeight: "bold", margin: "18px 0 10px" }}>2.</h2>
      <p style={{ textAlign: "justify", textIndent: "1.25cm" }}>
        Em face ao término do Contrato e dos serviços prestados pela CONTRATADA até a presente data, concordam as Partes que a CONTRATANTE deverá realizar o pagamento do valor pendente de {valorFormatado} à CONTRATADA, o qual contempla os honorários devidos proporcionais até a data de encerramento e toda e qualquer compensação que por ventura seja devida à CONTRATADA até a data do efetivo encerramento.
      </p>

      <h3 style={{ fontSize: "12pt", fontWeight: "bold", margin: "14px 0 8px" }}>2.1.</h3>
      <p style={{ textAlign: "justify", textIndent: "1.25cm" }}>
        O pagamento será realizado em até {form.prazoPagamento ? `${form.prazoPagamento.toString().padStart(2, "0")} (${prazoExtenso})` : "05 (cinco)"} dias, na conta bancária indicada pela CONTRATADA no Contrato ora encerrado.
      </p>

      {/* Observações adicionais como cláusula 2.2 se houver */}
      {form.observacoesAdicionais && (
        <>
          <h3 style={{ fontSize: "12pt", fontWeight: "bold", margin: "14px 0 8px" }}>2.2.</h3>
          <p style={{ textAlign: "justify", textIndent: "1.25cm" }}>
            {form.observacoesAdicionais}
          </p>
        </>
      )}

      {/* Cláusula 3 - Quitação */}
      <h2 style={{ fontSize: "12pt", fontWeight: "bold", margin: "18px 0 10px" }}>3.</h2>
      <p style={{ textAlign: "justify", textIndent: "1.25cm" }}>
        As Partes, bem como seus respectivos sócios, administradores, diretores, conselheiros, representantes, empregados, prepostos, sucessores e cessionários, atuais ou passados, além das controladoras, controladas, coligadas, afiliadas e quaisquer empresas pertencentes ao mesmo grupo econômico de cada uma delas (doravante, em conjunto e separadamente, os &quot;Quitados&quot;) — outorgam entre si quitação plena, geral, irrevogável e irretratável, para nada mais reclamar uma da outra, a qualquer modo, ocasião, título ou natureza (civil, contratual, empresarial, societária, trabalhista, previdenciária, fiscal etc.), relativamente à relação jurídica ora encerrada e ao Contrato mencionado, abrangendo todas e quaisquer obrigações, direitos, valores, reivindicações ou pretensões, conhecidas ou desconhecidas, pecuniárias ou não, renunciando, de forma expressa e definitiva, a qualquer direito de ação ou reclamação contra a outra Parte e/ou quaisquer dos Quitados, em qualquer esfera de jurisdição.
      </p>

      <h3 style={{ fontSize: "12pt", fontWeight: "bold", margin: "14px 0 8px" }}>3.1.</h3>
      <p style={{ textAlign: "justify", textIndent: "1.25cm" }}>
        A CONTRATADA declara, neste ato, salvo pelo exposto na cláusula 2 acima, que recebeu todos os valores a que fazia jus no âmbito da relação contratual mantida com a CONTRATANTE, não restando qualquer saldo, verba, reembolso, despesa incorrida, valor ou obrigação pendente de pagamento.
      </p>

      <h3 style={{ fontSize: "12pt", fontWeight: "bold", margin: "14px 0 8px" }}>3.2.</h3>
      <p style={{ textAlign: "justify", textIndent: "1.25cm" }}>
        A CONTRATANTE declara, neste ato, que todos os serviços assumidos e prestados pela CONTRATADA foram devidamente realizados, não havendo qualquer pendência de entrega, obrigação ou responsabilidade remanescente a ser exigida da CONTRATADA.
      </p>

      {/* Cláusula 4 - Sigilo */}
      <h2 style={{ fontSize: "12pt", fontWeight: "bold", margin: "18px 0 10px" }}>4.</h2>
      <p style={{ textAlign: "justify", textIndent: "1.25cm" }}>
        As Partes reconhecem, outrossim, que eventuais obrigações de sigilo e confidencialidade previstas no Contrato encerrado permanecerão em vigor pelo prazo definido naquele instrumento.
      </p>

      <p style={{ textAlign: "justify", textIndent: 0, margin: "20px 0 12px" }}>
        E por estarem justos e distratados, firmam o presente instrumento de distrato, na presença de duas testemunhas instrumentárias.
      </p>

      <p style={{ textAlign: "center", margin: "20px 0" }}>{getDateString()}</p>

      {/* Assinaturas */}
      <table style={{ width: "100%", marginTop: 30 }}>
        <tbody>
          <tr>
            <td style={{ width: "50%", padding: "0 10px", verticalAlign: "top" }}>
              <div style={{ borderBottom: "1px solid #000", width: "65%", margin: "40px 0 5px" }} />
              <p style={{ margin: 0, textIndent: 0 }}><strong>CONTRATADA</strong></p>
              <p style={{ margin: 0, textIndent: 0 }}>{RESPONSAVEL_LEGAL.nome}</p>
              <p style={{ margin: 0, textIndent: 0 }}>CPF: {RESPONSAVEL_LEGAL.cpf}</p>
            </td>
            <td style={{ width: "50%", padding: "0 10px", verticalAlign: "top" }}>
              <div style={{ borderBottom: "1px solid #000", width: "65%", margin: "40px 0 5px" }} />
              <p style={{ margin: 0, textIndent: 0 }}><strong>CONTRATANTE (DISTRATANTE)</strong></p>
              <p style={{ margin: 0, textIndent: 0 }}>{form.representante || "___________________"}</p>
              <p style={{ margin: 0, textIndent: 0 }}>CPF: {form.cpf || "___________________"}</p>
            </td>
          </tr>
        </tbody>
      </table>

      {/* Testemunhas */}
      <h3 style={{ fontWeight: "bold", marginTop: 30 }}>Testemunhas:</h3>
      <table style={{ width: "100%", marginTop: 10 }}>
        <tbody>
          <tr>
            <td style={{ width: "50%", padding: "0 10px", verticalAlign: "top" }}>
              <div style={{ borderBottom: "1px solid #000", width: "65%", margin: "30px 0 5px" }} />
              <p style={{ margin: 0, textIndent: 0 }}>Nome: {form.testemunha1Nome || "___________________"}</p>
              <p style={{ margin: 0, textIndent: 0 }}>CPF: {form.testemunha1Cpf || "___________________"}</p>
            </td>
            <td style={{ width: "50%", padding: "0 10px", verticalAlign: "top" }}>
              <div style={{ borderBottom: "1px solid #000", width: "65%", margin: "30px 0 5px" }} />
              <p style={{ margin: 0, textIndent: 0 }}>Nome: {form.testemunha2Nome || "___________________"}</p>
              <p style={{ margin: 0, textIndent: 0 }}>CPF: {form.testemunha2Cpf || "___________________"}</p>
            </td>
          </tr>
        </tbody>
      </table>

      <div style={{ textAlign: "center", fontSize: "10pt", color: "#666", borderTop: "1px solid #ccc", paddingTop: 5, marginTop: 30 }}>
        Bertuzzi Assessoria e Gestão de Negócios Ltda. — CNPJ: {CONTRATADA_INFO.cnpj}
      </div>
    </div>
  );
};

/* ===== Main Component ===== */
export default function DistratoGenerator({ dealId, deal, witnesses }: DistratoGeneratorProps) {
  const [form, setForm] = useState<DistratoForm>({
    razaoSocial: deal.organization?.name ?? "",
    cnpj: deal.organization?.cnpj ?? "",
    endereco: deal.organization?.address ?? "",
    representante: deal.contact?.name ?? "",
    cpf: "",
    email: deal.contact?.email ?? "",
    emailRepresentante: "",
    nomeContrato: "",
    dataAssinatura: "",
    dataEncerramento: "",
    valorPendente: "",
    prazoPagamento: "5",
    observacoesAdicionais: "",
    testemunha1Nome: "",
    testemunha1Cpf: "",
    testemunha1Email: "",
    testemunha2Nome: "",
    testemunha2Cpf: "",
    testemunha2Email: "",
  });

  const [showPreview, setShowPreview] = useState(false);
  const [sendingAutentique, setSendingAutentique] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error" | "warning"; message: string } | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const [orderedSigners, setOrderedSigners] = useState<Array<{ email: string; name: string; action: "SIGN" | "SIGN_AS_A_WITNESS"; role?: string }>>([]);
  const [sortable, setSortable] = useState(true);

  const showToast = (type: "success" | "error" | "warning", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 5000);
  };

  const updateField = (field: keyof DistratoForm, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const selectWitness = (witnessId: string, num: 1 | 2) => {
    const w = witnesses.find((w) => w.id === witnessId);
    if (!w) return;
    if (num === 1) {
      setForm((prev) => ({ ...prev, testemunha1Nome: w.nome, testemunha1Cpf: w.cpf, testemunha1Email: w.email }));
    } else {
      setForm((prev) => ({ ...prev, testemunha2Nome: w.nome, testemunha2Cpf: w.cpf, testemunha2Email: w.email }));
    }
  };

  const buildSignersList = useCallback(() => {
    const list: Array<{ email: string; name: string; action: "SIGN" | "SIGN_AS_A_WITNESS"; role?: string }> = [];

    if (form.testemunha1Email) {
      list.push({ email: form.testemunha1Email, name: form.testemunha1Nome || "Testemunha 1", action: "SIGN_AS_A_WITNESS", role: "testemunha1" });
    }
    if (form.testemunha2Email) {
      list.push({ email: form.testemunha2Email, name: form.testemunha2Nome || "Testemunha 2", action: "SIGN_AS_A_WITNESS", role: "testemunha2" });
    }

    const clientEmail = form.emailRepresentante || form.email;
    if (clientEmail) {
      list.push({ email: clientEmail, name: form.razaoSocial || form.representante || "Contratante", action: "SIGN", role: "contratante" });
    }

    list.push({ email: RESPONSAVEL_LEGAL.email, name: RESPONSAVEL_LEGAL.nome, action: "SIGN", role: "contratada" });

    setOrderedSigners(list);
  }, [
    form.testemunha1Email, form.testemunha1Nome,
    form.testemunha2Email, form.testemunha2Nome,
    form.emailRepresentante, form.email,
    form.razaoSocial, form.representante,
  ]);

  useEffect(() => {
    buildSignersList();
  }, [buildSignersList]);

  const canGenerate =
    form.razaoSocial &&
    form.cnpj &&
    form.endereco &&
    form.representante &&
    form.cpf &&
    form.email &&
    form.nomeContrato &&
    form.dataEncerramento;

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(
      `<!DOCTYPE html><html><head><title>Distrato - ${form.razaoSocial}</title><style>
      @page { size: A4; margin: 30mm 20mm 20mm 30mm; }
      body { font-family: Arial, serif; font-size: 12pt; line-height: 1.5; color: #000; margin: 0; padding: 0; }
      h1 { font-size: 14pt; font-weight: bold; text-align: center; text-transform: uppercase; margin: 24px 0 12px; }
      h2 { font-size: 12pt; font-weight: bold; text-transform: uppercase; margin: 18px 0 10px; }
      h3 { font-size: 12pt; font-weight: bold; margin: 14px 0 8px; }
      p { margin: 8px 0; text-align: justify; text-indent: 1.25cm; }
      td p { text-indent: 0; }
      table { border-collapse: collapse; }
      .footer { text-align: center; font-size: 10pt; color: #666; border-top: 1px solid #ccc; padding-top: 5px; margin-top: 30px; }
    </style></head><body>${content.innerHTML}</body></html>`
    );
    w.document.close();
    setTimeout(() => w.print(), 500);
  };

  const handleSendAutentique = async () => {
    if (!form.testemunha1Email && !form.testemunha2Email) {
      showToast("warning", "É necessário informar pelo menos o e-mail de uma testemunha.");
      return;
    }

    const clientEmail = form.emailRepresentante || form.email;
    if (!clientEmail) {
      showToast("error", "E-mail do representante legal ou e-mail geral é obrigatório.");
      return;
    }

    setSendingAutentique(true);
    try {
      const content = printRef.current;
      if (!content) throw new Error("Conteúdo do distrato não encontrado");

      let logoBase64 = "";
      try {
        const logoResponse = await fetch("/images/logo-bgp-wide.png");
        const logoBlob = await logoResponse.blob();
        logoBase64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(logoBlob);
        });
      } catch (e) {
        console.warn("Failed to convert logo:", e);
      }

      let rawHtml = content.innerHTML;
      if (logoBase64) {
        rawHtml = rawHtml.replace(/src="[^"]*logo-bgp-wide\.png"/g, `src="${logoBase64}"`);
      }

      const htmlContent = `<!DOCTYPE html><html><head><style>
        @page { size: A4; margin: 30mm 20mm 20mm 30mm; }
        body { font-family: Arial, serif; font-size: 12pt; line-height: 1.5; color: #000; }
        h1 { font-size: 14pt; font-weight: bold; text-align: center; text-transform: uppercase; }
        h2 { font-size: 12pt; font-weight: bold; text-transform: uppercase; }
        h3 { font-size: 12pt; font-weight: bold; }
        p { margin: 8px 0; text-align: justify; text-indent: 1.25cm; }
        td p { text-indent: 0; }
      </style></head><body>${rawHtml}</body></html>`;

      const signers = orderedSigners.map((s, i) => ({
        email: s.email,
        name: s.name,
        action: s.action,
        delivery_order: sortable ? i + 1 : undefined,
      }));

      await api.post("/sent-documents/send", {
        htmlContent,
        fileName: `Distrato_${form.razaoSocial.replace(/\s+/g, "_")}.html`,
        signers,
        sortable,
        emailTemplateId: 303131,
        dealId,
      });

      showToast("success", `Distrato enviado para ${signers.length} assinante(s) via Autentique.`);
    } catch (err: unknown) {
      console.error("Autentique error:", err);
      const message = err instanceof Error ? err.message : "Falha ao enviar distrato.";
      showToast("error", message);
    } finally {
      setSendingAutentique(false);
    }
  };

  const renderWitnessSelector = (num: 1 | 2) => {
    const prefix = num === 1 ? "testemunha1" : "testemunha2";
    const witnessOptions = witnesses.map((w) => ({ value: w.id, label: w.nome }));

    return (
      <div className="space-y-3 p-4 border border-gray-200 rounded-lg">
        <p className="text-sm font-semibold text-gray-800">Testemunha {num}</p>

        {witnesses.length > 0 && (
          <Select
            label="Selecionar cadastrada"
            options={witnessOptions}
            placeholder="Selecione uma testemunha..."
            value=""
            onChange={(e) => selectWitness(e.target.value, num)}
          />
        )}

        <Input
          label="Nome"
          value={form[`${prefix}Nome` as keyof DistratoForm]}
          onChange={(e) => updateField(`${prefix}Nome` as keyof DistratoForm, e.target.value)}
          placeholder="Nome completo"
        />
        <Input
          label="CPF"
          value={form[`${prefix}Cpf` as keyof DistratoForm]}
          onChange={(e) => updateField(`${prefix}Cpf` as keyof DistratoForm, formatCPF(e.target.value))}
          placeholder="000.000.000-00"
        />
        <Input
          label="E-mail (para assinatura)"
          type="email"
          value={form[`${prefix}Email` as keyof DistratoForm]}
          onChange={(e) => updateField(`${prefix}Email` as keyof DistratoForm, e.target.value)}
          placeholder="email@exemplo.com"
        />
      </div>
    );
  };

  /* ===== Preview mode ===== */
  if (showPreview) {
    return (
      <div className="space-y-4">
        {/* Toast */}
        {toast && (
          <div
            className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-white text-sm max-w-sm ${
              toast.type === "success" ? "bg-green-600" : toast.type === "error" ? "bg-red-600" : "bg-yellow-500"
            }`}
          >
            {toast.message}
          </div>
        )}

        <div className="flex items-center gap-3 flex-wrap">
          <Button variant="secondary" onClick={() => setShowPreview(false)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar ao Formulário
          </Button>
          <Button variant="secondary" onClick={handlePrint}>
            <Download className="h-4 w-4 mr-2" />
            Baixar PDF
          </Button>
          <Button
            variant="primary"
            onClick={handleSendAutentique}
            disabled={sendingAutentique}
          >
            {sendingAutentique ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            Enviar para Assinatura via Autentique
          </Button>
        </div>

        <SignerOrderEditor
          signers={orderedSigners}
          onSignersChange={setOrderedSigners}
          sortable={sortable}
          onSortableChange={setSortable}
        />

        <div
          className="bg-white rounded-lg shadow-lg max-w-4xl mx-auto text-black"
          style={{ fontFamily: "Arial, 'Times New Roman', serif", fontSize: "12pt", lineHeight: "1.5", padding: "30mm 20mm 20mm 30mm" }}
        >
          <div ref={printRef}>
            <DistratoContent form={form} />
          </div>
        </div>
      </div>
    );
  }

  /* ===== Form mode ===== */
  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-white text-sm max-w-sm ${
            toast.type === "success" ? "bg-green-600" : toast.type === "error" ? "bg-red-600" : "bg-yellow-500"
          }`}
        >
          {toast.message}
        </div>
      )}

      <div className="bg-white rounded-lg border p-6">
        <div className="flex items-center gap-2 mb-6">
          <FileText className="h-5 w-5 text-gray-600" />
          <h2 className="text-lg font-semibold text-gray-900">Gerador de Distrato</h2>
        </div>

        <div className="space-y-8">
          {/* Dados do Distratante */}
          <div>
            <h3 className="text-base font-semibold text-gray-800 mb-4">Dados do Distratante</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Razão Social *"
                value={form.razaoSocial}
                onChange={(e) => updateField("razaoSocial", e.target.value)}
                placeholder="Razão Social da empresa"
              />
              <Input
                label="CNPJ *"
                value={form.cnpj}
                onChange={(e) => updateField("cnpj", formatCNPJ(e.target.value))}
                placeholder="00.000.000/0000-00"
              />
              <div className="md:col-span-2">
                <Input
                  label="Endereço *"
                  value={form.endereco}
                  onChange={(e) => updateField("endereco", e.target.value)}
                  placeholder="Endereço completo"
                />
              </div>
              <Input
                label="Representante Legal *"
                value={form.representante}
                onChange={(e) => updateField("representante", e.target.value)}
                placeholder="Nome do representante legal"
              />
              <Input
                label="CPF *"
                value={form.cpf}
                onChange={(e) => updateField("cpf", formatCPF(e.target.value))}
                placeholder="000.000.000-00"
              />
              <Input
                label="E-mail *"
                type="email"
                value={form.email}
                onChange={(e) => updateField("email", e.target.value)}
                placeholder="email@empresa.com"
              />
              <Input
                label="E-mail Representante Legal (quem assina)"
                type="email"
                value={form.emailRepresentante}
                onChange={(e) => updateField("emailRepresentante", e.target.value)}
                placeholder="email do representante legal"
              />
            </div>
          </div>

          {/* Dados do Contrato */}
          <div>
            <h3 className="text-base font-semibold text-gray-800 mb-4">Contrato Distratado</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Nome do Contrato *"
                value={form.nomeContrato}
                onChange={(e) => updateField("nomeContrato", e.target.value)}
                placeholder="Ex: Contrato de Prestação de Serviços – GO BI"
              />
              <Input
                label="Data de Assinatura Original"
                type="date"
                value={form.dataAssinatura}
                onChange={(e) => updateField("dataAssinatura", e.target.value)}
              />
            </div>
          </div>

          {/* Termos do Distrato */}
          <div>
            <h3 className="text-base font-semibold text-gray-800 mb-4">Termos do Distrato</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Data de Encerramento *"
                type="date"
                value={form.dataEncerramento}
                onChange={(e) => updateField("dataEncerramento", e.target.value)}
              />
              <Input
                label="Valor Pendente"
                value={form.valorPendente}
                onChange={(e) => updateField("valorPendente", formatCurrency(e.target.value))}
                placeholder="R$ 0,00"
              />
              <Input
                label="Prazo de Pagamento (dias)"
                type="number"
                value={form.prazoPagamento}
                onChange={(e) => updateField("prazoPagamento", e.target.value)}
                placeholder="5"
              />
            </div>
            <div className="mt-4">
              <Textarea
                label="Observações Adicionais (cláusula extra)"
                value={form.observacoesAdicionais}
                onChange={(e) => updateField("observacoesAdicionais", e.target.value)}
                placeholder="Ex: Os valores cobrados na cláusula 2 se referem exclusivamente à prestação de serviços de..."
                rows={3}
              />
            </div>
          </div>

          {/* Testemunhas */}
          <div>
            <h3 className="text-base font-semibold text-gray-800 mb-4">Testemunhas</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {renderWitnessSelector(1)}
              {renderWitnessSelector(2)}
            </div>
          </div>

          <Button
            variant="primary"
            onClick={() => setShowPreview(true)}
            disabled={!canGenerate}
          >
            <Eye className="h-4 w-4 mr-2" />
            Visualizar Distrato
          </Button>
        </div>
      </div>
    </div>
  );
}
