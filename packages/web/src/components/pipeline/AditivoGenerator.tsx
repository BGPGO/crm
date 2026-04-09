"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { FileText, Eye, Download, ArrowLeft, Send, Plus, Calculator, X } from "lucide-react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Textarea from "@/components/ui/Textarea";
import Select from "@/components/ui/Select";
import Badge from "@/components/ui/Badge";
import { api } from "@/lib/api";
import SignerOrderEditor from "@/components/pipeline/SignerOrderEditor";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SavedWitness {
  id: string;
  nome: string;
  cpf: string;
  email: string;
}

interface AditivoGeneratorProps {
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

interface AditivoForm {
  razaoSocial: string;
  cnpj: string;
  endereco: string;
  representante: string;
  cpf: string;
  email: string;
  emailRepresentante: string;
  nomeContrato: string;
  dataAssinatura: string;
  numeroAditivo: string;
  clausulasAlteradas: string;
  metodoPagamento: string;
  testemunha1Nome: string;
  testemunha1Cpf: string;
  testemunha1Email: string;
  testemunha2Nome: string;
  testemunha2Cpf: string;
  testemunha2Email: string;
}

interface ExistingContract {
  id: string;
  client_name: string;
  cnpj: string;
  product_name: string | null;
  valor: number | null;
  assinatura_contrato: string | null;
}

interface AditivoItem {
  motivo: string;
  valor: string;
  tipo: "mensal" | "setup" | "reducao";
  parcelas?: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const RESPONSAVEL_LEGAL = {
  nome: "Josiane Luiza Bertuzzi",
  cpf: "561.936.700-25",
  email: "josi@bertuzzipatrimonial.com.br",
};

const CONTRATADA_INFO = {
  razaoSocial: "BERTUZZI ASSESSORIA E GESTAO DE NEGOCIOS LTDA",
  endereco:
    "Av Carlos Gomes, nº. 75, Sala 603, Bairro Auxiliadora, CEP: 90.480-003, em Porto Alegre, RS",
  cnpj: "12.547.474/0001-37",
};

const METODOS_PAGAMENTO = [
  "Boleto Bancário",
  "PIX",
  "Transferência Bancária",
  "Cartão de Crédito",
];

const initialForm: AditivoForm = {
  razaoSocial: "",
  cnpj: "",
  endereco: "",
  representante: "",
  cpf: "",
  email: "",
  emailRepresentante: "",
  nomeContrato: "",
  dataAssinatura: "",
  numeroAditivo: "1",
  clausulasAlteradas: "",
  metodoPagamento: "",
  testemunha1Nome: "",
  testemunha1Cpf: "",
  testemunha1Email: "",
  testemunha2Nome: "",
  testemunha2Cpf: "",
  testemunha2Email: "",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

const formatCurrency = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const formatCurrencyInput = (v: string) => {
  const digits = v.replace(/\D/g, "");
  if (!digits) return "";
  const num = parseInt(digits, 10) / 100;
  return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

const parseCurrencyInput = (v: string): number => {
  const digits = v.replace(/\D/g, "");
  if (!digits) return 0;
  return parseInt(digits, 10) / 100;
};

const formatDateBR = (dateStr: string): string => {
  if (!dateStr) return "";
  const months = [
    "janeiro",
    "fevereiro",
    "março",
    "abril",
    "maio",
    "junho",
    "julho",
    "agosto",
    "setembro",
    "outubro",
    "novembro",
    "dezembro",
  ];
  const [y, m, d] = dateStr.split("-");
  return `${parseInt(d)} de ${months[parseInt(m) - 1]} de ${y}`;
};

const getDateString = () => {
  const months = [
    "janeiro",
    "fevereiro",
    "março",
    "abril",
    "maio",
    "junho",
    "julho",
    "agosto",
    "setembro",
    "outubro",
    "novembro",
    "dezembro",
  ];
  const d = new Date();
  return `Porto Alegre/RS, ${d.getDate()} de ${months[d.getMonth()]} de ${d.getFullYear()}`;
};

// ─── Document Template ───────────────────────────────────────────────────────

const AditivoContent = ({ form }: { form: AditivoForm }) => {
  return (
    <div>
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <img
          src="/images/logo-bgp-wide.png"
          alt="BGP"
          style={{ height: 40, margin: "0 auto" }}
        />
      </div>

      <h1
        style={{
          fontSize: "14pt",
          fontWeight: "bold",
          textAlign: "center",
          textTransform: "uppercase",
          margin: "24px 0 20px",
        }}
      >
        ADITIVO Nº{form.numeroAditivo} AO CONTRATO DE PRESTAÇÃO DE SERVIÇOS
      </h1>

      <h2
        style={{
          fontSize: "12pt",
          fontWeight: "bold",
          textTransform: "uppercase",
          margin: "18px 0 10px",
        }}
      >
        CONTRATANTE:
      </h2>
      <table
        style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16 }}
      >
        <tbody>
          <tr>
            <td
              style={{
                border: "1px solid #000",
                padding: "6px 8px",
                fontWeight: "bold",
                width: 160,
              }}
            >
              Razão Social:
            </td>
            <td style={{ border: "1px solid #000", padding: "6px 8px" }}>
              <strong>{form.razaoSocial}</strong>
            </td>
          </tr>
          <tr>
            <td
              style={{
                border: "1px solid #000",
                padding: "6px 8px",
                fontWeight: "bold",
              }}
            >
              CNPJ:
            </td>
            <td style={{ border: "1px solid #000", padding: "6px 8px" }}>
              <strong>{form.cnpj}</strong>
            </td>
          </tr>
          <tr>
            <td
              style={{
                border: "1px solid #000",
                padding: "6px 8px",
                fontWeight: "bold",
              }}
            >
              Endereço:
            </td>
            <td style={{ border: "1px solid #000", padding: "6px 8px" }}>
              {form.endereco}
            </td>
          </tr>
          <tr>
            <td
              style={{
                border: "1px solid #000",
                padding: "6px 8px",
                fontWeight: "bold",
              }}
            >
              Representante Legal:
            </td>
            <td style={{ border: "1px solid #000", padding: "6px 8px" }}>
              <strong>{form.representante}</strong>
            </td>
          </tr>
          <tr>
            <td
              style={{
                border: "1px solid #000",
                padding: "6px 8px",
                fontWeight: "bold",
              }}
            >
              CPF:
            </td>
            <td style={{ border: "1px solid #000", padding: "6px 8px" }}>
              <strong>{form.cpf}</strong>
            </td>
          </tr>
          <tr>
            <td
              style={{
                border: "1px solid #000",
                padding: "6px 8px",
                fontWeight: "bold",
              }}
            >
              E-mail:
            </td>
            <td style={{ border: "1px solid #000", padding: "6px 8px" }}>
              <strong>{form.email}</strong>
            </td>
          </tr>
        </tbody>
      </table>

      <h2
        style={{
          fontSize: "12pt",
          fontWeight: "bold",
          textTransform: "uppercase",
          margin: "18px 0 10px",
        }}
      >
        CONTRATADA:
      </h2>
      <p style={{ textAlign: "justify", textIndent: 0, margin: "8px 0" }}>
        {CONTRATADA_INFO.razaoSocial}, pessoa jurídica de direito privado, com
        sede na {CONTRATADA_INFO.endereco}, inscrita no CNPJ sob o n.º{" "}
        {CONTRATADA_INFO.cnpj} neste ato representada na forma prevista em seu
        Contrato Social, doravante denominada simplesmente CONTRATADA.
      </p>

      <h2
        style={{
          fontSize: "12pt",
          fontWeight: "bold",
          textTransform: "uppercase",
          margin: "18px 0 10px",
        }}
      >
        CONTRATO A SER ALTERADO ("CONTRATO"):
      </h2>
      <table
        style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16 }}
      >
        <tbody>
          <tr>
            <td
              style={{
                border: "1px solid #000",
                padding: "6px 8px",
                fontWeight: "bold",
                fontStyle: "italic",
                width: 180,
              }}
            >
              Nome do Contrato:
            </td>
            <td
              style={{
                border: "1px solid #000",
                padding: "6px 8px",
                fontStyle: "italic",
              }}
            >
              {form.nomeContrato}
            </td>
          </tr>
          <tr>
            <td
              style={{
                border: "1px solid #000",
                padding: "6px 8px",
                fontWeight: "bold",
                fontStyle: "italic",
              }}
            >
              Data de assinatura:
            </td>
            <td
              style={{
                border: "1px solid #000",
                padding: "6px 8px",
                fontStyle: "italic",
              }}
            >
              {form.dataAssinatura ? formatDateBR(form.dataAssinatura) : ""}
            </td>
          </tr>
        </tbody>
      </table>

      <h2
        style={{
          fontSize: "12pt",
          fontWeight: "bold",
          margin: "18px 0 10px",
        }}
      >
        CONSIDERANDO
      </h2>
      <p style={{ textAlign: "justify", textIndent: 0, margin: "8px 0" }}>
        que é de interesse das Partes alterar cláusulas e condições do Contrato;
      </p>

      <h2
        style={{
          fontSize: "12pt",
          fontWeight: "bold",
          margin: "18px 0 10px",
        }}
      >
        DECIDEM
      </h2>
      <p style={{ textAlign: "justify", textIndent: 0, margin: "8px 0" }}>
        as Partes, por livre disposição de suas vontades, firmar o presente
        Adendo nº {form.numeroAditivo} ao Contrato ("Adendo"), com base nas
        cláusulas e condições que seguem.
      </p>

      <h2
        style={{
          fontSize: "12pt",
          fontWeight: "bold",
          margin: "18px 0 10px",
        }}
      >
        1.
      </h2>
      <p style={{ textAlign: "justify", textIndent: "1.25cm" }}>
        Acordam as Partes em alterar as cláusulas do Contrato para que passem a
        viger da seguinte forma:
      </p>
      <div
        style={{ paddingLeft: "1.25cm", marginTop: 10, whiteSpace: "pre-wrap" }}
      >
        <p style={{ textIndent: 0, textAlign: "justify" }}>
          {form.clausulasAlteradas || "XXXXXX"}
        </p>
      </div>

      <h2
        style={{
          fontSize: "12pt",
          fontWeight: "bold",
          margin: "18px 0 10px",
        }}
      >
        2.
      </h2>
      <p style={{ textAlign: "justify", textIndent: "1.25cm" }}>
        Demais cláusulas e disposições do Contrato permanecerão inalteradas e em
        pleno vigor, devendo ser interpretadas com base nas modificações
        realizadas por meio do presente Adendo.
      </p>

      <p
        style={{ textAlign: "justify", textIndent: 0, margin: "20px 0 12px" }}
      >
        Por estarem justas e contratadas, as partes acordam firmar o presente
        Adendo de forma eletrônica, aceitando e reconhecendo para todos os fins
        a existência e validade da manifestação de vontade instrumentalizada por
        tais plataformas certificadoras, reconhecendo a autoria e integridade
        documento, sendo desnecessária a validação e certificação no ambiente
        ICP (Infraestrutura de Chaves Públicas) Brasil, conforme artigo 10, §
        2º da Medida Provisória nº 2.200-2/2001.
      </p>

      <p style={{ textAlign: "center", margin: "20px 0" }}>
        {getDateString()}
      </p>

      <table style={{ width: "100%", marginTop: 30 }}>
        <tbody>
          <tr>
            <td
              style={{ width: "50%", padding: "0 10px", verticalAlign: "top" }}
            >
              <div
                style={{
                  borderBottom: "1px solid #000",
                  width: "65%",
                  margin: "40px 0 5px",
                }}
              />
              <p style={{ margin: 0, textIndent: 0 }}>
                <strong>CONTRATANTE</strong>
              </p>
              <p style={{ margin: 0, textIndent: 0 }}>
                {form.representante || "___________________"}
              </p>
              <p style={{ margin: 0, textIndent: 0 }}>
                CPF: {form.cpf || "___________________"}
              </p>
            </td>
            <td
              style={{ width: "50%", padding: "0 10px", verticalAlign: "top" }}
            >
              <div
                style={{
                  borderBottom: "1px solid #000",
                  width: "65%",
                  margin: "40px 0 5px",
                }}
              />
              <p style={{ margin: 0, textIndent: 0 }}>
                <strong>CONTRATADA</strong>
              </p>
              <p style={{ margin: 0, textIndent: 0 }}>
                {RESPONSAVEL_LEGAL.nome}
              </p>
              <p style={{ margin: 0, textIndent: 0 }}>
                CPF: {RESPONSAVEL_LEGAL.cpf}
              </p>
            </td>
          </tr>
        </tbody>
      </table>

      <h3 style={{ fontWeight: "bold", marginTop: 30 }}>Testemunhas:</h3>
      <table style={{ width: "100%", marginTop: 10 }}>
        <tbody>
          <tr>
            <td
              style={{ width: "50%", padding: "0 10px", verticalAlign: "top" }}
            >
              <div
                style={{
                  borderBottom: "1px solid #000",
                  width: "65%",
                  margin: "30px 0 5px",
                }}
              />
              <p style={{ margin: 0, textIndent: 0 }}>
                Nome: {form.testemunha1Nome || "___________________"}
              </p>
              <p style={{ margin: 0, textIndent: 0 }}>
                CPF: {form.testemunha1Cpf || "___________________"}
              </p>
            </td>
            <td
              style={{ width: "50%", padding: "0 10px", verticalAlign: "top" }}
            >
              <div
                style={{
                  borderBottom: "1px solid #000",
                  width: "65%",
                  margin: "30px 0 5px",
                }}
              />
              <p style={{ margin: 0, textIndent: 0 }}>
                Nome: {form.testemunha2Nome || "___________________"}
              </p>
              <p style={{ margin: 0, textIndent: 0 }}>
                CPF: {form.testemunha2Cpf || "___________________"}
              </p>
            </td>
          </tr>
        </tbody>
      </table>

      <div
        style={{
          textAlign: "center",
          fontSize: "10pt",
          color: "#666",
          borderTop: "1px solid #ccc",
          paddingTop: 5,
          marginTop: 30,
        }}
      >
        Bertuzzi Assessoria e Gestão de Negócios Ltda. — CNPJ:{" "}
        {CONTRATADA_INFO.cnpj}
      </div>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AditivoGenerator({
  dealId,
  deal,
  witnesses,
}: AditivoGeneratorProps) {
  const [form, setForm] = useState<AditivoForm>({
    ...initialForm,
    razaoSocial: deal.organization?.name ?? "",
    cnpj: deal.organization?.cnpj ?? "",
    endereco: deal.organization?.address ?? "",
    representante: deal.contact?.name ?? "",
    email: deal.contact?.email ?? "",
  });
  const [showPreview, setShowPreview] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);
  const [sendingAutentique, setSendingAutentique] = useState(false);
  const [orderedSigners, setOrderedSigners] = useState<Array<{email: string; name: string; action: "SIGN" | "SIGN_AS_A_WITNESS"; role?: string}>>([]);
  const [sortable, setSortable] = useState(true);
  const [existingContracts, setExistingContracts] = useState<
    ExistingContract[]
  >([]);
  const [selectedContractId, setSelectedContractId] = useState<string>("");
  const [useCustomName, setUseCustomName] = useState(false);
  const [toast, setToast] = useState<{
    type: "success" | "error" | "warning";
    message: string;
  } | null>(null);

  // Aditivo helper state
  const [aditivoItems, setAditivoItems] = useState<AditivoItem[]>([]);
  const [newMotivo, setNewMotivo] = useState("");
  const [newValor, setNewValor] = useState("");
  const [newTipo, setNewTipo] = useState<"mensal" | "setup" | "reducao">(
    "mensal"
  );
  const [newParcelas, setNewParcelas] = useState("1");
  const [valorContratoAntigo, setValorContratoAntigo] = useState(
    deal.value != null ? String(deal.value) : ""
  );

  useEffect(() => {
    fetchExistingContracts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealId]);

  const buildSignersList = useCallback(() => {
    const list: typeof orderedSigners = [];
    if (form.testemunha1Email) list.push({ email: form.testemunha1Email, name: form.testemunha1Nome || "Testemunha 1", action: "SIGN_AS_A_WITNESS", role: "testemunha1" });
    if (form.testemunha2Email) list.push({ email: form.testemunha2Email, name: form.testemunha2Nome || "Testemunha 2", action: "SIGN_AS_A_WITNESS", role: "testemunha2" });
    const signerEmail = form.emailRepresentante || form.email;
    if (signerEmail) list.push({ email: signerEmail, name: form.razaoSocial || "Contratante", action: "SIGN", role: "contratante" });
    list.push({ email: "josi@bertuzzipatrimonial.com.br", name: "Josiane Luiza Bertuzzi", action: "SIGN", role: "contratada" });
    setOrderedSigners(list);
  }, [form.testemunha1Email, form.testemunha1Nome, form.testemunha2Email, form.testemunha2Nome, form.emailRepresentante, form.email, form.razaoSocial]);

  useEffect(() => {
    buildSignersList();
  }, [form.testemunha1Email, form.testemunha2Email, form.emailRepresentante, form.email, buildSignersList]);

  const fetchExistingContracts = async () => {
    try {
      const res = await api.get<{ data: ExistingContract[] }>(
        `/contracts?dealId=${dealId}`
      );
      const data: ExistingContract[] = res.data ?? (res as any);
      if (Array.isArray(data)) {
        const seen = new Set<string>();
        const unique = data.filter((c) => {
          const key = `${c.cnpj}-${c.client_name}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        setExistingContracts(unique);
      }
    } catch {
      // silently ignore — contracts section is optional
    }
  };

  const handleSelectContract = (contractId: string) => {
    if (contractId === "__custom__") {
      setUseCustomName(true);
      setSelectedContractId("");
      return;
    }
    setUseCustomName(false);
    setSelectedContractId(contractId);
    const contract = existingContracts.find((c) => c.id === contractId);
    if (!contract) return;

    const productLabel = contract.product_name || "Prestação de Serviços";
    const nomeContrato = `Contrato de Prestação de Serviços – ${productLabel}`;

    setForm((prev) => ({
      ...prev,
      nomeContrato,
      razaoSocial: contract.client_name || prev.razaoSocial,
      cnpj: contract.cnpj || prev.cnpj,
      dataAssinatura: contract.assinatura_contrato || prev.dataAssinatura,
    }));

    if (contract.valor) {
      setValorContratoAntigo(String(contract.valor));
    }
  };

  const updateField = (field: keyof AditivoForm, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const selectWitness = (witnessId: string, num: 1 | 2) => {
    const w = witnesses.find((w) => w.id === witnessId);
    if (!w) return;
    if (num === 1) {
      setForm((prev) => ({
        ...prev,
        testemunha1Nome: w.nome,
        testemunha1Cpf: w.cpf,
        testemunha1Email: w.email,
      }));
    } else {
      setForm((prev) => ({
        ...prev,
        testemunha2Nome: w.nome,
        testemunha2Cpf: w.cpf,
        testemunha2Email: w.email,
      }));
    }
  };

  // ── Aditivo helpers ──────────────────────────────────────────────────────

  const generateClausulaText = (
    items: AditivoItem[],
    oldValue: string,
    metodo: string
  ) => {
    if (items.length === 0) {
      updateField("clausulasAlteradas", "");
      return;
    }

    const oldVal = parseFloat(oldValue) || 0;
    const mensalItems = items.filter((i) => i.tipo === "mensal");
    const setupItems = items.filter((i) => i.tipo === "setup");
    const reducaoItems = items.filter((i) => i.tipo === "reducao");
    const totalMensal = mensalItems.reduce(
      (sum, item) => sum + parseCurrencyInput(item.valor),
      0
    );
    const totalReducao = reducaoItems.reduce(
      (sum, item) => sum + parseCurrencyInput(item.valor),
      0
    );
    const novoValor = oldVal + totalMensal - totalReducao;

    const lines: string[] = [];
    let idx = 1;

    mensalItems.forEach((item) => {
      lines.push(
        `${idx}. ${item.motivo}: acréscimo de ${formatCurrency(parseCurrencyInput(item.valor))} ao valor mensal.`
      );
      idx++;
    });

    reducaoItems.forEach((item) => {
      lines.push(
        `${idx}. ${item.motivo}: redução de ${formatCurrency(parseCurrencyInput(item.valor))} no valor mensal.`
      );
      idx++;
    });

    setupItems.forEach((item) => {
      const val = parseCurrencyInput(item.valor);
      const parcelas = item.parcelas || 1;
      if (parcelas > 1) {
        const valorParcela = val / parcelas;
        lines.push(
          `${idx}. ${item.motivo}: taxa de setup no valor de ${formatCurrency(val)} (em ${parcelas}x de ${formatCurrency(valorParcela)}), não incorporada ao valor mensal.`
        );
      } else {
        lines.push(
          `${idx}. ${item.motivo}: taxa de setup no valor de ${formatCurrency(val)} (pagamento único), não incorporada ao valor mensal.`
        );
      }
      idx++;
    });

    lines.push("");
    if (oldVal > 0 && (mensalItems.length > 0 || reducaoItems.length > 0)) {
      lines.push(`Valor mensal anterior: ${formatCurrency(oldVal)}`);
      if (totalMensal > 0)
        lines.push(`Acréscimo mensal total: ${formatCurrency(totalMensal)}`);
      if (totalReducao > 0)
        lines.push(`Redução mensal total: ${formatCurrency(totalReducao)}`);
      lines.push(`Novo valor mensal do contrato: ${formatCurrency(novoValor)}`);
    } else if (mensalItems.length > 0 || reducaoItems.length > 0) {
      lines.push(`Novo valor mensal do contrato: ${formatCurrency(novoValor)}`);
    }

    if (setupItems.length > 0) {
      const totalSetup = setupItems.reduce(
        (sum, item) => sum + parseCurrencyInput(item.valor),
        0
      );
      lines.push(`Valor total de setup: ${formatCurrency(totalSetup)}`);
    }

    if (metodo) {
      lines.push(`\nMétodo de pagamento: ${metodo}`);
    }

    updateField("clausulasAlteradas", lines.join("\n"));
  };

  const addAditivoItem = () => {
    if (!newMotivo || !newValor) {
      setToast({ type: "warning", message: "Preencha o motivo e o valor." });
      return;
    }
    const item: AditivoItem = {
      motivo: newMotivo,
      valor: newValor,
      tipo: newTipo,
      ...(newTipo === "setup"
        ? { parcelas: Math.max(1, parseInt(newParcelas) || 1) }
        : {}),
    };
    const updated = [...aditivoItems, item];
    setAditivoItems(updated);
    setNewMotivo("");
    setNewValor("");
    setNewTipo("mensal");
    setNewParcelas("1");
    generateClausulaText(updated, valorContratoAntigo, form.metodoPagamento);
  };

  const removeAditivoItem = (index: number) => {
    const updated = aditivoItems.filter((_, i) => i !== index);
    setAditivoItems(updated);
    generateClausulaText(updated, valorContratoAntigo, form.metodoPagamento);
  };

  const handleValorAntigoChange = (val: string) => {
    setValorContratoAntigo(val);
    if (aditivoItems.length > 0) {
      generateClausulaText(aditivoItems, val, form.metodoPagamento);
    }
  };

  const handleMetodoPagamentoChange = (val: string) => {
    updateField("metodoPagamento", val);
    if (aditivoItems.length > 0) {
      generateClausulaText(aditivoItems, valorContratoAntigo, val);
    }
  };

  // ── Print ────────────────────────────────────────────────────────────────

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(
      `<!DOCTYPE html><html><head><title>Aditivo - ${form.razaoSocial}</title><style>
      @page { size: A4; margin: 30mm 20mm 20mm 30mm; }
      body { font-family: Arial, serif; font-size: 12pt; line-height: 1.5; color: #000; margin: 0; padding: 0; }
      h1 { font-size: 14pt; font-weight: bold; text-align: center; text-transform: uppercase; margin: 24px 0 12px; }
      h2 { font-size: 12pt; font-weight: bold; text-transform: uppercase; margin: 18px 0 10px; }
      h3 { font-size: 12pt; font-weight: bold; margin: 14px 0 8px; }
      p { margin: 8px 0; text-align: justify; text-indent: 1.25cm; }
      td p { text-indent: 0; }
      table { border-collapse: collapse; }
    </style></head><body>${content.innerHTML}</body></html>`
    );
    w.document.close();
    setTimeout(() => w.print(), 500);
  };

  // ── Send to Autentique ───────────────────────────────────────────────────

  const handleSendAutentique = async () => {
    if (!form.testemunha1Email && !form.testemunha2Email) {
      setToast({
        type: "error",
        message:
          "É necessário informar pelo menos o e-mail de uma testemunha.",
      });
      return;
    }

    const signerEmail = form.emailRepresentante || form.email;
    if (!signerEmail) {
      setToast({
        type: "error",
        message: "Email do representante legal ou email geral é obrigatório.",
      });
      return;
    }

    setSendingAutentique(true);
    setToast(null);
    try {
      const content = printRef.current;
      if (!content) throw new Error("Conteúdo do aditivo não encontrado");

      // Try to embed logo as base64
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
        rawHtml = rawHtml.replace(
          /src="[^"]*logo-bgp-wide\.png"/g,
          `src="${logoBase64}"`
        );
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
        fileName: `Aditivo_${form.numeroAditivo}_${form.razaoSocial.replace(/\s+/g, "_")}.html`,
        signers,
        emailTemplateId: 303131,
        sortable,
        dealId,
      });

      setToast({
        type: "success",
        message: `Aditivo enviado para ${signers.length} assinante(s) via Autentique.`,
      });
    } catch (err: any) {
      console.error("Autentique error:", err);
      setToast({
        type: "error",
        message: err.message || "Falha ao enviar aditivo.",
      });
    } finally {
      setSendingAutentique(false);
    }
  };

  // ── Derived values ───────────────────────────────────────────────────────

  const totalMensalAdicional = aditivoItems
    .filter((i) => i.tipo === "mensal")
    .reduce((sum, item) => sum + parseCurrencyInput(item.valor), 0);
  const totalReducao = aditivoItems
    .filter((i) => i.tipo === "reducao")
    .reduce((sum, item) => sum + parseCurrencyInput(item.valor), 0);
  const totalSetup = aditivoItems
    .filter((i) => i.tipo === "setup")
    .reduce((sum, item) => sum + parseCurrencyInput(item.valor), 0);
  const oldVal = parseFloat(valorContratoAntigo) || 0;
  const novoValorTotal = oldVal + totalMensalAdicional - totalReducao;

  const canGenerate =
    form.razaoSocial &&
    form.cnpj &&
    form.endereco &&
    form.representante &&
    form.cpf &&
    form.email &&
    form.nomeContrato &&
    form.clausulasAlteradas;

  // ── Witness selector ─────────────────────────────────────────────────────

  const renderWitnessSelector = (num: 1 | 2) => {
    const prefix = num === 1 ? "testemunha1" : "testemunha2";
    return (
      <div className="space-y-3 p-4 border border-gray-200 rounded-lg">
        <p className="text-sm font-semibold text-gray-700">
          Testemunha {num}
        </p>
        {witnesses.length > 0 && (
          <Select
            label="Selecionar cadastrada"
            options={[
              { value: "", label: "Selecione uma testemunha..." },
              ...witnesses.map((w) => ({ value: w.id, label: w.nome })),
            ]}
            value=""
            onChange={(e) => {
              if (e.target.value) selectWitness(e.target.value, num);
            }}
          />
        )}
        <Input
          label="Nome"
          value={form[`${prefix}Nome` as keyof AditivoForm]}
          onChange={(e) =>
            updateField(`${prefix}Nome` as keyof AditivoForm, e.target.value)
          }
          placeholder="Nome completo"
        />
        <Input
          label="CPF"
          value={form[`${prefix}Cpf` as keyof AditivoForm]}
          onChange={(e) =>
            updateField(
              `${prefix}Cpf` as keyof AditivoForm,
              formatCPF(e.target.value)
            )
          }
          placeholder="000.000.000-00"
        />
        <Input
          label="E-mail (para assinatura)"
          type="email"
          value={form[`${prefix}Email` as keyof AditivoForm]}
          onChange={(e) =>
            updateField(`${prefix}Email` as keyof AditivoForm, e.target.value)
          }
          placeholder="email@exemplo.com"
        />
      </div>
    );
  };

  // ── Preview mode ─────────────────────────────────────────────────────────

  if (showPreview) {
    return (
      <div className="space-y-4">
        {toast && (
          <div
            className={`mb-4 p-3 rounded text-sm ${
              toast.type === "success"
                ? "bg-green-50 text-green-700"
                : toast.type === "error"
                  ? "bg-red-50 text-red-700"
                  : "bg-yellow-50 text-yellow-700"
            }`}
          >
            {toast.message}
          </div>
        )}

        <div className="flex items-center gap-3 flex-wrap">
          <Button
            variant="secondary"
            onClick={() => setShowPreview(false)}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar ao Formulário
          </Button>
          <Button variant="secondary" onClick={handlePrint}>
            <Download className="h-4 w-4 mr-2" />
            Baixar PDF
          </Button>
        </div>

        <SignerOrderEditor
          signers={orderedSigners}
          onSignersChange={setOrderedSigners}
          sortable={sortable}
          onSortableChange={setSortable}
        />

        <div className="flex items-center gap-3 flex-wrap">
          <Button
            onClick={handleSendAutentique}
            disabled={sendingAutentique}
            loading={sendingAutentique}
          >
            {!sendingAutentique && <Send className="h-4 w-4 mr-2" />}
            Enviar para Assinatura via Autentique
          </Button>
        </div>

        <div
          className="bg-white rounded-lg shadow-lg max-w-4xl mx-auto text-black"
          style={{
            fontFamily: "Arial, 'Times New Roman', serif",
            fontSize: "12pt",
            lineHeight: "1.5",
            padding: "30mm 20mm 20mm 30mm",
          }}
        >
          <div ref={printRef}>
            <AditivoContent form={form} />
          </div>
        </div>
      </div>
    );
  }

  // ── Form mode ────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {toast && (
        <div
          className={`p-3 rounded text-sm ${
            toast.type === "success"
              ? "bg-green-50 text-green-700"
              : toast.type === "error"
                ? "bg-red-50 text-red-700"
                : "bg-yellow-50 text-yellow-700"
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* Contrato a ser Alterado */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <FileText className="h-5 w-5 text-gray-500" />
          <h3 className="text-base font-semibold text-gray-800">
            Gerador de Aditivo Contratual
          </h3>
        </div>

        <h4 className="text-sm font-semibold text-gray-700 mb-3">
          Contrato a ser Alterado
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <Select
              label="Selecionar contrato existente ou digitar manualmente"
              options={[
                { value: "", label: "Selecione um contrato existente..." },
                { value: "__custom__", label: "✏️ Digitar nome manualmente" },
                ...existingContracts.map((c) => ({
                  value: c.id,
                  label: `${c.client_name} — ${c.cnpj}${c.valor ? ` (${formatCurrency(c.valor)})` : ""}`,
                })),
              ]}
              value={useCustomName ? "__custom__" : selectedContractId}
              onChange={(e) => handleSelectContract(e.target.value)}
            />
          </div>

          <div>
            <Input
              label="Nome do Contrato *"
              value={form.nomeContrato}
              onChange={(e) => updateField("nomeContrato", e.target.value)}
              placeholder="Ex: Contrato de Prestação de Serviços – GO BI"
              disabled={!useCustomName && !!selectedContractId}
            />
            {!useCustomName && selectedContractId && (
              <p className="text-xs text-gray-400 mt-1">
                Preenchido pelo contrato selecionado. Selecione "Digitar nome
                manualmente" para editar.
              </p>
            )}
          </div>

          <Input
            label="Data de Assinatura Original"
            type="date"
            value={form.dataAssinatura}
            onChange={(e) => updateField("dataAssinatura", e.target.value)}
          />

          <Input
            label="Número do Aditivo *"
            type="number"
            min="1"
            value={form.numeroAditivo}
            onChange={(e) => updateField("numeroAditivo", e.target.value)}
            placeholder="1"
          />
        </div>
      </div>

      {/* Dados do Contratante */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h4 className="text-sm font-semibold text-gray-700 mb-3">
          Dados do Contratante
        </h4>
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
            onChange={(e) =>
              updateField("emailRepresentante", e.target.value)
            }
            placeholder="email do representante legal"
          />
        </div>
      </div>

      {/* Assistente de Cláusulas */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-1">
          <Calculator className="h-5 w-5 text-gray-500" />
          <h4 className="text-sm font-semibold text-gray-700">
            Assistente de Cláusulas
          </h4>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          Adicione os itens do aditivo (ex: tela extra, novo serviço) e o
          assistente gera automaticamente o texto das cláusulas com os valores
          calculados.
        </p>

        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Valor do contrato atual (R$)"
              type="number"
              step="0.01"
              value={valorContratoAntigo}
              onChange={(e) => handleValorAntigoChange(e.target.value)}
              placeholder="Ex: 598"
            />
            <Select
              label="Método de Pagamento"
              options={[
                { value: "", label: "Selecione o método..." },
                ...METODOS_PAGAMENTO.map((m) => ({ value: m, label: m })),
              ]}
              value={form.metodoPagamento}
              onChange={(e) => handleMetodoPagamentoChange(e.target.value)}
            />
          </div>

          {/* Add item */}
          <div className="p-4 border border-gray-200 rounded-lg bg-gray-50 space-y-3">
            <p className="text-sm font-semibold text-gray-700">
              Adicionar item ao aditivo
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
              <Input
                label="Motivo / Descrição"
                value={newMotivo}
                onChange={(e) => setNewMotivo(e.target.value)}
                placeholder="Ex: Tela extra"
              />
              <Select
                label="Tipo"
                options={[
                  { value: "mensal", label: "Acréscimo mensal" },
                  { value: "reducao", label: "Redução mensal" },
                  { value: "setup", label: "Valor de Setup" },
                ]}
                value={newTipo}
                onChange={(e) =>
                  setNewTipo(e.target.value as "mensal" | "setup" | "reducao")
                }
              />
              <Input
                label={
                  newTipo === "setup"
                    ? "Valor total do setup"
                    : newTipo === "reducao"
                      ? "Valor da redução"
                      : "Valor adicional"
                }
                value={newValor}
                onChange={(e) =>
                  setNewValor(formatCurrencyInput(e.target.value))
                }
                placeholder="R$ 0,00"
              />
              {newTipo === "setup" && (
                <Input
                  label="Parcelas"
                  type="number"
                  min="1"
                  value={newParcelas}
                  onChange={(e) => setNewParcelas(e.target.value)}
                  placeholder="1 = à vista"
                />
              )}
            </div>
            <Button variant="secondary" size="sm" onClick={addAditivoItem}>
              <Plus className="h-4 w-4 mr-1" />
              Adicionar
            </Button>
          </div>

          {/* Items table */}
          {aditivoItems.length > 0 && (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left p-2 font-medium text-gray-600">
                      Motivo
                    </th>
                    <th className="text-left p-2 font-medium text-gray-600">
                      Tipo
                    </th>
                    <th className="text-right p-2 font-medium text-gray-600">
                      Valor
                    </th>
                    <th className="text-center p-2 font-medium text-gray-600 w-16">
                      Ação
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {aditivoItems.map((item, i) => (
                    <tr key={i} className="border-t border-gray-100">
                      <td className="p-2 text-gray-700">{item.motivo}</td>
                      <td className="p-2">
                        <Badge
                          variant={
                            item.tipo === "setup"
                              ? "purple"
                              : item.tipo === "reducao"
                                ? "red"
                                : "blue"
                          }
                        >
                          {item.tipo === "setup"
                            ? `Setup${item.parcelas && item.parcelas > 1 ? ` (${item.parcelas}x)` : ""}`
                            : item.tipo === "reducao"
                              ? "Redução"
                              : "Mensal"}
                        </Badge>
                      </td>
                      <td className="p-2 text-right text-gray-700">
                        {formatCurrency(parseCurrencyInput(item.valor))}
                        {item.tipo === "setup" &&
                          item.parcelas &&
                          item.parcelas > 1 && (
                            <span className="block text-xs text-gray-400">
                              {item.parcelas}x de{" "}
                              {formatCurrency(
                                parseCurrencyInput(item.valor) / item.parcelas
                              )}
                            </span>
                          )}
                      </td>
                      <td className="p-2 text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeAditivoItem(i)}
                          className="h-7 w-7 p-0 text-red-500 hover:text-red-700"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t border-gray-200 bg-gray-50 font-semibold">
                    <td className="p-2 text-gray-700" colSpan={2}>
                      Contrato anterior
                    </td>
                    <td className="p-2 text-right text-gray-700">
                      {formatCurrency(oldVal)}
                    </td>
                    <td />
                  </tr>
                  <tr className="border-t border-gray-200 bg-blue-50 font-bold">
                    <td className="p-2 text-blue-800" colSpan={2}>
                      Novo valor mensal do contrato
                    </td>
                    <td className="p-2 text-right text-blue-800">
                      {formatCurrency(novoValorTotal)}
                    </td>
                    <td />
                  </tr>
                  {totalSetup > 0 && (
                    <tr className="border-t border-gray-200 bg-purple-50 font-semibold">
                      <td className="p-2 text-purple-800" colSpan={2}>
                        Valor total de setup (à parte)
                      </td>
                      <td className="p-2 text-right text-purple-800">
                        {formatCurrency(totalSetup)}
                      </td>
                      <td />
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Cláusulas Alteradas */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h4 className="text-sm font-semibold text-gray-700 mb-3">
          Cláusulas Alteradas
        </h4>
        <Textarea
          label={
            aditivoItems.length > 0
              ? "Texto das alterações nas cláusulas * (gerado pelo assistente — pode ser editado)"
              : "Texto das alterações nas cláusulas *"
          }
          value={form.clausulasAlteradas}
          onChange={(e) => updateField("clausulasAlteradas", e.target.value)}
          placeholder="Descreva aqui as cláusulas que serão alteradas e seus novos termos..."
          rows={8}
        />
      </div>

      {/* Testemunhas */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h4 className="text-sm font-semibold text-gray-700 mb-3">
          Testemunhas
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {renderWitnessSelector(1)}
          {renderWitnessSelector(2)}
        </div>
      </div>

      <Button
        onClick={() => setShowPreview(true)}
        disabled={!canGenerate}
        className="w-full md:w-auto"
      >
        <Eye className="h-4 w-4 mr-2" />
        Visualizar Aditivo
      </Button>
    </div>
  );
}
