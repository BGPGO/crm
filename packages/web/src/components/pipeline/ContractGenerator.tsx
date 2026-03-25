"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "@/lib/api";
import {
  FileText,
  Download,
  Send,
  ArrowLeft,
  Eye,
  Loader2,
  Check,
  ChevronDown,
  ChevronUp,
  Users,
  RefreshCw,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ContractFormData {
  razaoSocial: string;
  nomeFantasia: string;
  cnpj: string;
  endereco: string;
  representante: string;
  cpfRepresentante: string;
  emailRepresentante: string;
  emailFinanceiro: string;
  produto: string;
  strategyModules: { crescimento: boolean; redesenho: boolean; recuperacao: boolean };
  biOrigemDados: string;
  biQtdLicencas: string;
  biQtdTelasPersonalizadas: string;
  valorMensal: string;
  diaVencimento: string;
  dataInicio: string;
  formaPagamento: string;
  valorImplementacao: string;
  implementacaoParcelas: string;
  descontoMeses: string;
  descontoPercentual: string;
  observacao: string;
  linkReadAi: string;
  testemunha1Nome: string;
  testemunha1Cpf: string;
  testemunha1Email: string;
  testemunha2Nome: string;
  testemunha2Cpf: string;
  testemunha2Email: string;
}

interface ContractGeneratorProps {
  dealId: string;
  deal: {
    title: string;
    value: number | null;
    contact?: { name: string; email: string; phone: string } | null;
    organization?: { name: string; cnpj: string; address: string; email: string } | null;
    products?: Array<{ product: { name: string } }>;
  };
}

interface SavedWitness {
  id: string;
  nome: string;
  cpf: string;
  email: string;
}

interface ContractRecord {
  id: string;
  dealId: string;
  status: string;
  formData: ContractFormData;
  htmlContent?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const PRODUTOS = [
  "BGP GO I",
  "BGP GO II",
  "BGP GO III",
  "BGP BI",
  "BI Personalizado",
  "BGP Strategy",
  "BGP Valuation",
  "Brand Growth",
];

const FORMAS_PAGAMENTO = [
  { value: "boleto", label: "Boleto Bancário" },
  { value: "cartao", label: "Cartão de Crédito" },
  { value: "pix", label: "PIX" },
  { value: "transferencia", label: "Transferência Bancária" },
];

const DIAS_VENCIMENTO = Array.from({ length: 28 }, (_, i) => i + 1);

const INITIAL_FORM: ContractFormData = {
  razaoSocial: "",
  nomeFantasia: "",
  cnpj: "",
  endereco: "",
  representante: "",
  cpfRepresentante: "",
  emailRepresentante: "",
  emailFinanceiro: "",
  produto: "",
  strategyModules: { crescimento: false, redesenho: false, recuperacao: false },
  biOrigemDados: "",
  biQtdLicencas: "",
  biQtdTelasPersonalizadas: "",
  valorMensal: "",
  diaVencimento: "10",
  dataInicio: "",
  formaPagamento: "boleto",
  valorImplementacao: "",
  implementacaoParcelas: "1",
  descontoMeses: "",
  descontoPercentual: "",
  observacao: "",
  linkReadAi: "",
  testemunha1Nome: "Fernanda Brunisaki Bertuzzi",
  testemunha1Cpf: "85677558087",
  testemunha1Email: "fernanda@bertuzzipatrimonial.com.br",
  testemunha2Nome: "Maria Vitória Dias Neves",
  testemunha2Cpf: "86449168072",
  testemunha2Email: "mariavitoria@bertuzzipatrimonial.com.br",
};

const DEFAULT_WITNESSES = [
  { name: "Fernanda Brunisaki Bertuzzi", cpf: "85677558087", email: "fernanda@bertuzzipatrimonial.com.br" },
  { name: "Maria Vitória Dias Neves", cpf: "86449168072", email: "mariavitoria@bertuzzipatrimonial.com.br" },
];

function validateContractForm(form: ContractFormData): string[] {
  const errors: string[] = [];

  // CNPJ validation (14 digits)
  if (form.cnpj) {
    const cnpjDigits = form.cnpj.replace(/\D/g, '');
    if (cnpjDigits.length !== 14) {
      errors.push('CNPJ deve ter 14 dígitos');
    }
  }

  // CPF validation (11 digits)
  if (form.cpfRepresentante) {
    const cpfDigits = form.cpfRepresentante.replace(/\D/g, '');
    if (cpfDigits.length !== 11) {
      errors.push('CPF do representante deve ter 11 dígitos');
    }
  }

  // Email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (form.emailRepresentante && !emailRegex.test(form.emailRepresentante)) {
    errors.push('Email do representante inválido');
  }
  if (form.emailFinanceiro && !emailRegex.test(form.emailFinanceiro)) {
    errors.push('Email financeiro inválido');
  }

  // Witness CPF validation
  if (form.testemunha1Cpf) {
    const cpf1 = form.testemunha1Cpf.replace(/\D/g, '');
    if (cpf1.length !== 11) errors.push('CPF da testemunha 1 deve ter 11 dígitos');
  }
  if (form.testemunha2Cpf) {
    const cpf2 = form.testemunha2Cpf.replace(/\D/g, '');
    if (cpf2.length !== 11) errors.push('CPF da testemunha 2 deve ter 11 dígitos');
  }
  if (form.testemunha1Email && !emailRegex.test(form.testemunha1Email)) {
    errors.push('Email da testemunha 1 inválido');
  }
  if (form.testemunha2Email && !emailRegex.test(form.testemunha2Email)) {
    errors.push('Email da testemunha 2 inválido');
  }

  // Required fields
  if (!form.razaoSocial?.trim()) errors.push('Razão Social é obrigatória');
  if (!form.cnpj?.trim()) errors.push('CNPJ é obrigatório');
  if (!form.representante?.trim()) errors.push('Nome do representante é obrigatório');
  if (!form.cpfRepresentante?.trim()) errors.push('CPF do representante é obrigatório');
  if (!form.emailRepresentante?.trim()) errors.push('Email do representante é obrigatório');

  return errors;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatCurrencyBR(value: string | number): string {
  const num = typeof value === "string" ? parseFloat(value.replace(/[^\d.,]/g, "").replace(",", ".")) : value;
  if (isNaN(num)) return "R$ 0,00";
  return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDateBR(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}

function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

function isBIProduct(produto: string): boolean {
  return produto === "BGP BI" || produto === "BI Personalizado";
}

function isStrategyProduct(produto: string): boolean {
  return produto === "BGP Strategy";
}

// ─── Section Wrapper ─────────────────────────────────────────────────────────

function FormSection({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
        {open ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
      </button>
      {open && <div className="px-4 py-4">{children}</div>}
    </div>
  );
}

// ─── Field Components ────────────────────────────────────────────────────────

function FormField({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      {children}
    </div>
  );
}

function TextInput({
  value,
  onChange,
  placeholder = "",
  type = "text",
  readOnly = false,
}: {
  value: string;
  onChange?: (val: string) => void;
  placeholder?: string;
  type?: string;
  readOnly?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
      placeholder={placeholder}
      readOnly={readOnly}
      className={`w-full border border-gray-200 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 ${
        readOnly ? "bg-gray-50 text-gray-500 cursor-not-allowed" : "bg-white"
      }`}
    />
  );
}

// ─── Contract Constants (finhub-compatible) ─────────────────────────────────

const RESPONSAVEL_LEGAL = {
  nome: "Josiane Luiza Bertuzzi",
  cpf: "561.936.700-25",
  email: "josi@bertuzzipatrimonial.com.br",
};

const ALL_CONTRACT_PRODUCTS = [
  "BGP GO I", "BGP GO II", "BGP GO III", "BGP BI",
  "BI Personalizado", "BGP Strategy", "BGP Valuation", "Brand Growth",
] as const;

const contractProductLabels: Record<string, string> = {
  "BGP GO I": "BGP GO I",
  "BGP GO II": "BGP GO II",
  "BGP GO III": "BGP GO III",
  "BGP BI": "BGP BI",
  "BI Personalizado": "BGP BI PERSONALIZADO",
  "BGP Strategy": "BGP STRATEGY",
  "BGP Valuation": "BGP VALUATION",
  "Brand Growth": "BRAND GROWTH",
};

function getDateString(): string {
  const months = [
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
  ];
  const d = new Date();
  return `Porto Alegre, ${d.getDate()} de ${months[d.getMonth()]} de ${d.getFullYear()}`;
}

// Replace this with the real base64 string of logo-bgp-wide.png
// To regenerate: base64 -w 0 logo-bgp-wide.png
const LOGO_BASE64 = "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"

// Utility to get the logo src — uses base64 for PDF/Autentique compatibility
function getLogoSrc(): string {
  if (LOGO_BASE64 && (LOGO_BASE64 as string) !== "LOGO_PLACEHOLDER") {
    return `data:image/png;base64,${LOGO_BASE64}`;
  }
  return "/lovable-uploads/logo-bgp-wide.png";
}

// ─── Contract Content (HTML preview — finhub-compatible) ─────────────────────

function ContractContent({ form }: { form: ContractFormData }) {
  const logoSrc = getLogoSrc();

  return (
    <div>
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <img src={logoSrc} alt="BGP Logo" style={{ height: 40 }} />
      </div>

      <h1
        style={{
          fontSize: "14pt",
          fontWeight: "bold",
          textAlign: "center",
          margin: "24px 0 12px",
          textTransform: "uppercase",
          textDecoration: "underline",
        }}
      >
        CONTRATO DE PRESTAÇÃO DE SERVIÇOS
      </h1>

      {/* Contratante */}
      <h2 style={{ fontSize: "12pt", fontWeight: "bold", textTransform: "uppercase" }}>CONTRATANTE:</h2>
      <table style={{ width: "100%", marginBottom: 16, borderCollapse: "collapse" }}>
        <tbody>
          <tr>
            <td style={{ fontWeight: "bold", width: 160, border: "1px solid #000", padding: "6px 8px" }}>Razão Social:</td>
            <td style={{ border: "1px solid #000", padding: "6px 8px" }}>{form.razaoSocial}</td>
          </tr>
          {form.nomeFantasia && (
            <tr>
              <td style={{ fontWeight: "bold", border: "1px solid #000", padding: "6px 8px" }}>Nome Fantasia:</td>
              <td style={{ border: "1px solid #000", padding: "6px 8px" }}>{form.nomeFantasia}</td>
            </tr>
          )}
          <tr>
            <td style={{ fontWeight: "bold", border: "1px solid #000", padding: "6px 8px" }}>CNPJ:</td>
            <td style={{ border: "1px solid #000", padding: "6px 8px" }}>{form.cnpj}</td>
          </tr>
          <tr>
            <td style={{ fontWeight: "bold", border: "1px solid #000", padding: "6px 8px" }}>Endereço:</td>
            <td style={{ border: "1px solid #000", padding: "6px 8px" }}>{form.endereco}</td>
          </tr>
          <tr>
            <td style={{ fontWeight: "bold", border: "1px solid #000", padding: "6px 8px" }}>Representante Legal:</td>
            <td style={{ border: "1px solid #000", padding: "6px 8px" }}>{form.representante}</td>
          </tr>
          <tr>
            <td style={{ fontWeight: "bold", border: "1px solid #000", padding: "6px 8px" }}>CPF:</td>
            <td style={{ border: "1px solid #000", padding: "6px 8px" }}>{form.cpfRepresentante}</td>
          </tr>
          <tr>
            <td style={{ fontWeight: "bold", border: "1px solid #000", padding: "6px 8px" }}>E-mail:</td>
            <td style={{ border: "1px solid #000", padding: "6px 8px" }}>{form.emailRepresentante}</td>
          </tr>
        </tbody>
      </table>

      {/* Contratada */}
      <p style={{ textAlign: "justify", textIndent: "0" }}>
        <strong>CONTRATADA: BERTUZZI ASSESSORIA E GESTAO DE NEGOCIOS LTDA</strong>, pessoa jurídica de direito privado, com sede na Av Carlos Gomes, nº. 75, Sala 603, Bairro Auxiliadora, CEP: 90.480-003, em Porto Alegre, RS, inscrita no CNPJ sob o n.º 12.547.474/0001-37, neste ato representada na forma prevista em seu Contrato Social, doravante denominada simplesmente <strong>CONTRATADA</strong>.
      </p>
      <p style={{ textAlign: "justify", textIndent: "1.25cm" }}>
        Resolvem e concordam as partes firmar o presente Contrato de Prestação de Serviços ("Contrato" ou "Instrumento Contratual"), o qual se regerá pelas cláusulas e condições seguintes:
      </p>

      {/* Cláusula I */}
      <h2 style={{ fontSize: "12pt", fontWeight: "bold", marginTop: 20, textTransform: "uppercase" }}>CLÁUSULA I – DO OBJETO</h2>
      <p style={{ textAlign: "justify", textIndent: "1.25cm" }}>
        1.1. Constitui o objeto do presente Contrato a contratação, por parte da CONTRATANTE da modalidade abaixo:
      </p>

      {/* All Products - selected and unselected */}
      {ALL_CONTRACT_PRODUCTS.map((p) => (
        <ProductBlock
          key={p}
          product={p}
          isSelected={form.produto === p}
          modules={form.strategyModules}
          valorMensal={form.valorMensal}
          diaVencimento={form.diaVencimento}
          dataInicio={form.dataInicio}
          formaPagamento={form.formaPagamento}
          valorImplementacao={form.valorImplementacao}
          implementacaoParcelas={form.implementacaoParcelas}
          descontoMeses={form.descontoMeses}
          descontoPercentual={form.descontoPercentual}
        />
      ))}

      {/* 1.2 Exclusões */}
      <p style={{ textAlign: "justify", textIndent: "1.25cm", marginTop: 16 }}>
        <strong>1.2.</strong> As partes concordam expressamente que o presente Contrato não inclui:
      </p>
      <div style={{ paddingLeft: "1.25cm" }}>
        <p>(a) A transferência de tecnologia e conhecimento pela CONTRATADA à CONTRATANTE;</p>
        <p>(b) O licenciamento direto de softwares ou produtos, ressalvado o licenciamento expressamente contratado acima;</p>
        <p>(c) A realização de serviços contábeis e da contabilidade da CONTRATANTE e todos os serviços a isso inerentes (ex.: declarações fiscais, submissão de SPED contábil, elaboração e assinatura de balanços e DRES etc.);</p>
        <p>(d) A realização de reuniões online e/ou presenciais não previstas na contratação, que poderão ser contratadas de forma avulsa mediante consulta prévia à CONTRATADA;</p>
        <p>(e) Demais serviços que não estejam expressamente previstos neste Contrato;</p>
      </div>

      <p style={{ textAlign: "justify", textIndent: "1.25cm", marginTop: 8 }}>
        <strong>1.2.1.</strong> No caso de dúvidas quanto ao escopo do objeto deste Contrato, comprometem-se as Partes a buscar, em comum acordo, eventual definição faltante sempre com base na boa-fé e na razoabilidade.
      </p>

      {/* Cláusula II */}
      <h2 style={{ fontSize: "12pt", fontWeight: "bold", marginTop: 20, textTransform: "uppercase" }}>CLÁUSULA II – DO PRAZO</h2>
      <p style={{ textAlign: "justify", textIndent: "1.25cm" }}>
        <strong>2.1.</strong> O presente Contrato vigorará por prazo indeterminado, contados a partir da data de assinatura deste instrumento.
      </p>
      <p style={{ textAlign: "justify", textIndent: "1.25cm" }}>
        <strong>2.2.</strong> O presente Contrato poderá ser rescindido por qualquer das partes, sem necessidade de justificativa, mediante comunicação por escrito com antecedência mínima de 30 (trinta) dias ("Aviso Prévio").
      </p>
      <p style={{ textAlign: "justify", textIndent: "1.25cm" }}>
        <strong>2.3.</strong> Na hipótese de rescisão unilateral sem o cumprimento do prazo de aviso prévio de 30 (trinta) dias pela CONTRATANTE, será cobrado o valor correspondente ao período restante do aviso prévio, relativo ao período entre a data do comunicado de rescisão e o termo final do aviso prévio.
      </p>
      <p style={{ textAlign: "justify", textIndent: "1.25cm" }}>
        <strong>2.4.</strong> O valor referido na cláusula 2.3 será calculado proporcionalmente aos dias restantes para completar o prazo de aviso prévio, tendo como base a mensalidade vigente à data da rescisão.
      </p>

      <h2 style={{ fontSize: "12pt", fontWeight: "bold", marginTop: 20, textTransform: "uppercase" }}>CLÁUSULA III – DAS OBRIGAÇÕES DA CONTRATADA</h2>
      <p style={{ textAlign: "justify", textIndent: "1.25cm" }}>
        <strong>3.1.</strong> São obrigações da CONTRATADA:
      </p>
      <div style={{ paddingLeft: "1.25cm" }}>
        <p>(a) Prestar os Serviços contratados com diligência e profissionalismo;</p>
        <p>(b) Manter confidencialidade sobre as informações da CONTRATANTE;</p>
        <p>(c) Disponibilizar os entregáveis nos prazos combinados;</p>
        <p>(d) Informar a CONTRATANTE sobre quaisquer questões que possam impactar a entrega dos serviços;</p>
      </div>

      <h2 style={{ fontSize: "12pt", fontWeight: "bold", marginTop: 20, textTransform: "uppercase" }}>CLÁUSULA IV – DAS OBRIGAÇÕES DA CONTRATANTE</h2>
      <p style={{ textAlign: "justify", textIndent: "1.25cm" }}>
        <strong>4.1.</strong> São obrigações da CONTRATANTE:
      </p>
      <div style={{ paddingLeft: "1.25cm" }}>
        <p>(a) Efetuar os pagamentos nas datas pactuadas;</p>
        <p>(b) Fornecer as informações e documentos necessários à prestação dos Serviços;</p>
        <p>(c) Designar um representante para interlocução com a CONTRATADA;</p>
        <p>(d) Não reproduzir ou compartilhar os materiais ou métodos proprietários da CONTRATADA;</p>
      </div>

      <h2 style={{ fontSize: "12pt", fontWeight: "bold", marginTop: 20, textTransform: "uppercase" }}>CLÁUSULA V – DA REMUNERAÇÃO</h2>
      <p style={{ textAlign: "justify", textIndent: "1.25cm" }}>
        <strong>5.1.</strong> Pelos serviços prestados, a CONTRATANTE pagará à CONTRATADA os valores definidos na descrição do produto contratado.
      </p>
      <p style={{ textAlign: "justify", textIndent: "1.25cm" }}>
        <strong>5.2.</strong> Os valores serão devidos mensalmente, com vencimento no dia {form.diaVencimento} de cada mês, sendo o primeiro pagamento devido no mês de início dos serviços.
      </p>
      <p style={{ textAlign: "justify", textIndent: "1.25cm" }}>
        <strong>5.3.</strong> O atraso no pagamento implicará multa de 2% sobre o valor devido, acrescido de juros de mora de 1% ao mês, calculados pro rata die.
      </p>

      <h2 style={{ fontSize: "12pt", fontWeight: "bold", marginTop: 20, textTransform: "uppercase" }}>CLÁUSULA VI – DO REAJUSTE</h2>
      <p style={{ textAlign: "justify", textIndent: "1.25cm" }}>
        <strong>6.1.</strong> Os valores do presente Contrato poderão ser reajustados anualmente, tendo como base o IGPM/FGV acumulado dos últimos 12 meses ou, na falta deste, pelo IPCA/IBGE.
      </p>

      <h2 style={{ fontSize: "12pt", fontWeight: "bold", marginTop: 20, textTransform: "uppercase" }}>CLÁUSULA VII – DA CONFIDENCIALIDADE</h2>
      <p style={{ textAlign: "justify", textIndent: "1.25cm" }}>
        <strong>7.1.</strong> As partes comprometem-se a manter sigilo sobre todas as informações confidenciais obtidas em razão deste Contrato, por prazo indeterminado, mesmo após sua rescisão.
      </p>
      <p style={{ textAlign: "justify", textIndent: "1.25cm" }}>
        <strong>7.2.</strong> A obrigação de confidencialidade não se aplica a informações que sejam de domínio público, que já estivessem na posse da parte receptora, ou que devam ser divulgadas por força de lei ou ordem judicial.
      </p>

      <h2 style={{ fontSize: "12pt", fontWeight: "bold", marginTop: 20, textTransform: "uppercase" }}>CLÁUSULA VIII – DA PROPRIEDADE INTELECTUAL</h2>
      <p style={{ textAlign: "justify", textIndent: "1.25cm" }}>
        <strong>8.1.</strong> Todos os materiais, métodos, processos e tecnologias utilizados ou desenvolvidos pela CONTRATADA permanecem de sua exclusiva propriedade intelectual.
      </p>

      <h2 style={{ fontSize: "12pt", fontWeight: "bold", marginTop: 20, textTransform: "uppercase" }}>CLÁUSULA IX – DA LIMITAÇÃO DE RESPONSABILIDADE</h2>
      <p style={{ textAlign: "justify", textIndent: "1.25cm" }}>
        <strong>9.1.</strong> A CONTRATADA não será responsável por lucros cessantes, danos indiretos ou consequenciais decorrentes da execução deste Contrato.
      </p>
      <p style={{ textAlign: "justify", textIndent: "1.25cm" }}>
        <strong>9.2.</strong> A responsabilidade total da CONTRATADA estará limitada ao valor dos honorários efetivamente pagos nos últimos 12 (doze) meses.
      </p>

      <h2 style={{ fontSize: "12pt", fontWeight: "bold", marginTop: 20, textTransform: "uppercase" }}>CLÁUSULA X – DA RESCISÃO</h2>
      <p style={{ textAlign: "justify", textIndent: "1.25cm" }}>
        <strong>10.1.</strong> O presente Contrato poderá ser rescindido, além das hipóteses previstas na Cláusula II:
      </p>
      <div style={{ paddingLeft: "1.25cm" }}>
        <p>(a) Por descumprimento de qualquer cláusula contratual, não sanado no prazo de 15 (quinze) dias após notificação;</p>
        <p>(b) Por falência, recuperação judicial ou dissolução de qualquer das partes;</p>
        <p>(c) Por mútuo acordo entre as partes;</p>
      </div>

      <h2 style={{ fontSize: "12pt", fontWeight: "bold", marginTop: 20, textTransform: "uppercase" }}>CLÁUSULA XI – DAS DISPOSIÇÕES GERAIS</h2>
      <p style={{ textAlign: "justify", textIndent: "1.25cm" }}>
        <strong>11.1.</strong> Este Contrato constitui o acordo integral entre as partes com relação ao seu objeto, substituindo todos os acordos anteriores, escritos ou verbais.
      </p>
      <p style={{ textAlign: "justify", textIndent: "1.25cm" }}>
        <strong>11.2.</strong> Nenhuma alteração deste Contrato será válida a menos que feita por escrito e assinada por ambas as partes.
      </p>
      <p style={{ textAlign: "justify", textIndent: "1.25cm" }}>
        <strong>11.3.</strong> A tolerância de qualquer das partes quanto ao descumprimento de qualquer obrigação pela outra parte não constituirá novação ou renúncia de direitos.
      </p>

      <h2 style={{ fontSize: "12pt", fontWeight: "bold", marginTop: 20, textTransform: "uppercase" }}>CLÁUSULA XII – DO FORO</h2>
      <p style={{ textAlign: "justify", textIndent: "1.25cm" }}>
        <strong>12.1.</strong> As partes elegem o Foro da Comarca de Porto Alegre, RS, com renúncia a qualquer outro por mais privilegiado que seja, como competente para decidir quaisquer questões porventura decorrentes deste Contrato.
      </p>
      <p style={{ textAlign: "justify", textIndent: "1.25cm", marginTop: 12 }}>
        Por estarem assim justas e contratadas, as partes assinam o presente contrato em 02 (duas) vias de igual teor e valor, ou em 1 (uma) via eletrônica, na presença das testemunhas abaixo, para os mesmos fins e efeitos de direito.
      </p>

      {/* Assinaturas */}
      <p style={{ marginTop: 30 }}>{getDateString()}</p>
      <div style={{ marginTop: 40 }}>
        <div style={{ borderBottom: "1px solid #000", width: "65%", marginBottom: 5 }} />
        <p style={{ textIndent: 0 }}>
          <strong>CONTRATANTE:</strong> {form.razaoSocial}
        </p>
      </div>
      <div style={{ marginTop: 30 }}>
        <div style={{ borderBottom: "1px solid #000", width: "65%", marginBottom: 5 }} />
        <p style={{ textIndent: 0 }}>
          <strong>CONTRATADA:</strong> BERTUZZI ASSESSORIA E GESTAO DE NEGOCIOS LTDA.
        </p>
        <p style={{ textIndent: 0 }}>Representante Legal: {RESPONSAVEL_LEGAL.nome}</p>
        <p style={{ textIndent: 0 }}>CPF: {RESPONSAVEL_LEGAL.cpf}</p>
      </div>

      <p style={{ marginTop: 30, fontWeight: "bold" }}>Testemunhas:</p>
      <table style={{ width: "100%", marginTop: 20 }}>
        <tbody>
          <tr>
            <td style={{ width: "50%", paddingRight: 20 }}>
              <div style={{ borderBottom: "1px solid #000", marginBottom: 5 }} />
              <p style={{ textIndent: 0 }}>Nome: {form.testemunha1Nome || "________________________"}</p>
              <p style={{ textIndent: 0 }}>CPF: {form.testemunha1Cpf || "________________________"}</p>
            </td>
            <td style={{ width: "50%", paddingLeft: 20 }}>
              <div style={{ borderBottom: "1px solid #000", marginBottom: 5 }} />
              <p style={{ textIndent: 0 }}>Nome: {form.testemunha2Nome || "________________________"}</p>
              <p style={{ textIndent: 0 }}>CPF: {form.testemunha2Cpf || "________________________"}</p>
            </td>
          </tr>
        </tbody>
      </table>

      {/* Anexo BGP BI */}
      {(form.produto === "BGP BI" || form.produto === "BI Personalizado") && (form.biOrigemDados || form.biQtdLicencas || form.biQtdTelasPersonalizadas) && (
        <div style={{ pageBreakBefore: "always", marginTop: 40 }}>
          <div style={{ textAlign: "center", marginBottom: 20 }}>
            <img src={logoSrc} alt="BGP Logo" style={{ height: 40 }} />
          </div>
          <h1 style={{ fontSize: "14pt", fontWeight: "bold", textAlign: "center", margin: "24px 0 20px", textTransform: "uppercase" }}>
            ANEXO I – ESPECIFICAÇÕES {form.produto === "BI Personalizado" ? "BGP BI PERSONALIZADO" : "BGP BI"}
          </h1>
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 20 }}>
            <tbody>
              <tr>
                <td style={{ fontWeight: "bold", border: "1px solid #000", padding: "8px 12px", width: "50%" }}>Origem dos Dados</td>
                <td style={{ border: "1px solid #000", padding: "8px 12px" }}>{form.biOrigemDados || "—"}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: "bold", border: "1px solid #000", padding: "8px 12px" }}>Quantidade de Licenças</td>
                <td style={{ border: "1px solid #000", padding: "8px 12px" }}>{form.biQtdLicencas || "—"}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: "bold", border: "1px solid #000", padding: "8px 12px" }}>Quantidade de Telas Personalizadas</td>
                <td style={{ border: "1px solid #000", padding: "8px 12px" }}>{form.biQtdTelasPersonalizadas || "0"}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: "bold", border: "1px solid #000", padding: "8px 12px" }}>Data de Vencimento</td>
                <td style={{ border: "1px solid #000", padding: "8px 12px" }}>Dia {form.diaVencimento} de cada mês</td>
              </tr>
              <tr>
                <td style={{ fontWeight: "bold", border: "1px solid #000", padding: "8px 12px" }}>Valor Mensal</td>
                <td style={{ border: "1px solid #000", padding: "8px 12px" }}>{form.valorMensal}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Anexo Informações Adicionais */}
      {(form.emailFinanceiro || form.observacao || form.linkReadAi) && (
        <div style={{ pageBreakBefore: "always", marginTop: 40 }}>
          <div style={{ textAlign: "center", marginBottom: 20 }}>
            <img src={logoSrc} alt="BGP Logo" style={{ height: 40 }} />
          </div>
          <h1 style={{ fontSize: "14pt", fontWeight: "bold", textAlign: "center", margin: "24px 0 20px", textTransform: "uppercase" }}>
            ANEXO – INFORMAÇÕES ADICIONAIS
          </h1>
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 20 }}>
            <tbody>
              {form.emailFinanceiro && (
                <tr>
                  <td style={{ fontWeight: "bold", border: "1px solid #000", padding: "8px 12px", width: "40%" }}>E-mail Financeiro</td>
                  <td style={{ border: "1px solid #000", padding: "8px 12px" }}>{form.emailFinanceiro}</td>
                </tr>
              )}
              {form.observacao && (
                <tr>
                  <td style={{ fontWeight: "bold", border: "1px solid #000", padding: "8px 12px" }}>Observações</td>
                  <td style={{ border: "1px solid #000", padding: "8px 12px", whiteSpace: "pre-wrap" }}>{form.observacao}</td>
                </tr>
              )}
              {form.linkReadAi && (
                <tr>
                  <td style={{ fontWeight: "bold", border: "1px solid #000", padding: "8px 12px" }}>Link Read.ai</td>
                  <td style={{ border: "1px solid #000", padding: "8px 12px" }}>{form.linkReadAi}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer */}
      <div style={{ textAlign: "center", fontSize: "10pt", color: "#666", borderTop: "1px solid #ccc", paddingTop: 5, marginTop: 30 }}>
        BERTUZZI ASSESSORIA E GESTAO DE NEGOCIOS LTDA - CNPJ 12.547.474/0001-37
        <br />
        Av. Carlos Gomes, 75 - Sala 603 - Porto Alegre/RS | bertuzzipatrimonial.com.br
      </div>
    </div>
  );
}

// ─── Product Block Component ────────────────────────────────────────────────

function ProductBlock({
  product,
  isSelected,
  modules,
  valorMensal,
  diaVencimento,
  dataInicio,
  formaPagamento,
  valorImplementacao,
  implementacaoParcelas,
  descontoMeses,
  descontoPercentual,
}: {
  product: string;
  isSelected: boolean;
  modules: ContractFormData["strategyModules"];
  valorMensal: string;
  diaVencimento: string;
  dataInicio: string;
  formaPagamento: string;
  valorImplementacao: string;
  implementacaoParcelas: string;
  descontoMeses: string;
  descontoPercentual: string;
}) {
  const marker = isSelected ? "( X )" : "(\u00A0\u00A0\u00A0)";
  const label = contractProductLabels[product] || product;

  // If not selected, render only the title with unchecked marker
  if (!isSelected) {
    return (
      <div style={{ marginTop: 4 }}>
        <div style={{ border: "1px solid #000", padding: "8px 12px", margin: "4px 0", fontWeight: "bold", fontSize: "12pt" }}>{marker} {label}</div>
      </div>
    );
  }

  const dataInicioFormatted = dataInicio ? new Date(dataInicio + "T12:00:00").toLocaleDateString("pt-BR") : "";
  const formaPagLabel = FORMAS_PAGAMENTO.find((f) => f.value === formaPagamento)?.label || formaPagamento;
  let valoresText = `Valor mensal: ${valorMensal}\nInício: ${dataInicioFormatted}\nVencimento: dia ${diaVencimento} de cada mês\nForma de pagamento: ${formaPagLabel}`;
  if (valorImplementacao) {
    const parcelas = implementacaoParcelas && parseInt(implementacaoParcelas) > 0 ? ` em ${implementacaoParcelas}x` : " à vista";
    valoresText += `\nImplementação: ${valorImplementacao}${parcelas}`;
  }
  if (descontoPercentual && descontoMeses && parseInt(descontoPercentual) > 0 && parseInt(descontoMeses) > 0) {
    valoresText += `\nDesconto: ${descontoPercentual}% nos primeiros ${descontoMeses} meses`;
  }

  switch (product) {
    case "BGP GO I":
      return (
        <div style={{ marginTop: 12 }}>
          <div style={{ border: "1px solid #000", padding: "8px 12px", margin: "10px 0", fontWeight: "bold", fontSize: "12pt" }}>{marker} BGP GO I</div>
          <p style={{ textAlign: "justify", textIndent: "1.25cm" }}>
            <strong>1.1.1.</strong> Os serviços "BGP GO I" englobam a prestação pela CONTRATADA em favor da CONTRATANTE de serviços de controladoria, que possuem o intuito de desenvolver e aplicar técnicas de controle e padrões de qualidade ao modelo de negócio da CONTRATANTE, com base no seu planejamento estratégico e financeiro, o que contempla:
          </p>
          <div style={{ paddingLeft: "1.25cm" }}>
            <p>(a) Estruturação e disponibilização de Business Intelligence (BI) para acompanhamento de dados e indicadores financeiros da CONTRATANTE;</p>
            <p>(b) Disponibilização e parametrização de planilha de controladoria para organização e acompanhamento das informações financeiras da CONTRATANTE;</p>
            <p>(c) Estruturação de orçamento financeiro, com base nas informações disponibilizadas pela CONTRATANTE;</p>
            <p>(d) Elaboração de projeções financeiras, com o objetivo de apoiar o planejamento e acompanhamento financeiro da CONTRATANTE;</p>
            <p>(e) Elaboração de entregáveis gerenciais relacionados à controladoria financeira, conforme metodologia e modelo de trabalho adotados pela CONTRATADA.</p>
          </div>
          <p style={{ textAlign: "justify", textIndent: "1.25cm", marginTop: 8 }}>
            <strong>1.1.2.</strong> Os serviços BGP GO I serão fornecidos mensalmente e de modo contínuo durante toda a vigência do Contrato.
          </p>
          <h3 style={{ fontWeight: "bold", marginTop: 12 }}>VALORES BGP GO I E DADOS DE PAGAMENTO:</h3>
          <div style={{ border: "1px solid #999", padding: 10, margin: "10px 0", whiteSpace: "pre-wrap", fontSize: "12pt" }}>{valoresText}</div>
        </div>
      );
    case "BGP GO II":
      return (
        <div style={{ marginTop: 12 }}>
          <div style={{ border: "1px solid #000", padding: "8px 12px", margin: "10px 0", fontWeight: "bold", fontSize: "12pt" }}>{marker} BGP GO II</div>
          <p style={{ textAlign: "justify", textIndent: "1.25cm" }}>
            <strong>1.1.1.</strong> Os serviços "BGP GO II" englobam a prestação pela CONTRATADA em favor da CONTRATANTE de serviços de controladoria, que possuem o intuito de desenvolver e aplicar técnicas de controle e padrões de qualidade ao modelo de negócio da CONTRATANTE, com base no seu planejamento estratégico e financeiro, o que contempla:
          </p>
          <div style={{ paddingLeft: "1.25cm" }}>
            <p>(a) Estruturação e disponibilização de Business Intelligence (BI) para acompanhamento de dados e indicadores financeiros da CONTRATANTE;</p>
            <p>(b) Disponibilização e parametrização de planilha de controladoria para organização e acompanhamento das informações financeiras da CONTRATANTE;</p>
            <p>(c) Estruturação de orçamento financeiro, com base nas informações disponibilizadas pela CONTRATANTE;</p>
            <p>(d) Elaboração de projeções financeiras, com o objetivo de apoiar o planejamento e acompanhamento financeiro da CONTRATANTE;</p>
            <p>(e) Elaboração de entregáveis gerenciais relacionados à controladoria financeira, conforme metodologia e modelo de trabalho adotados pela CONTRATADA;</p>
            <p>(f) Apoio na estruturação de estratégias financeiras voltadas ao acompanhamento do desempenho do negócio da CONTRATANTE;</p>
            <p>(g) Realização de reuniões periódicas para fechamento de resultados e análise de inteligência financeira, com base nos dados financeiros da CONTRATANTE.</p>
          </div>
          <p style={{ textAlign: "justify", textIndent: "1.25cm", marginTop: 8 }}>
            <strong>1.1.2.</strong> Os serviços BGP GO II serão fornecidos mensalmente e de modo contínuo durante toda a vigência do Contrato.
          </p>
          <h3 style={{ fontWeight: "bold", marginTop: 12 }}>VALORES BGP GO II E DADOS DE PAGAMENTO:</h3>
          <div style={{ border: "1px solid #999", padding: 10, margin: "10px 0", whiteSpace: "pre-wrap", fontSize: "12pt" }}>{valoresText}</div>
        </div>
      );
    case "BGP GO III":
      return (
        <div style={{ marginTop: 12 }}>
          <div style={{ border: "1px solid #000", padding: "8px 12px", margin: "10px 0", fontWeight: "bold", fontSize: "12pt" }}>{marker} BGP GO III</div>
          <p style={{ textAlign: "justify", textIndent: "1.25cm" }}>
            <strong>1.1.1.</strong> Os serviços "BGP GO III" englobam a prestação pela CONTRATADA em favor da CONTRATANTE de serviços de controladoria, que possuem o intuito de desenvolver e aplicar técnicas de controle e padrões de qualidade ao modelo de negócio da CONTRATANTE, com base no seu planejamento estratégico e financeiro, o que contempla:
          </p>
          <div style={{ paddingLeft: "1.25cm" }}>
            <p>(a) Estruturação e disponibilização de Business Intelligence (BI) para acompanhamento de dados e indicadores financeiros da CONTRATANTE;</p>
            <p>(b) Disponibilização e parametrização de planilha de controladoria para organização e acompanhamento das informações financeiras da CONTRATANTE;</p>
            <p>(c) Estruturação de orçamento financeiro, com base nas informações disponibilizadas pela CONTRATANTE;</p>
            <p>(d) Elaboração de projeções financeiras, com o objetivo de apoiar o planejamento e acompanhamento financeiro da CONTRATANTE;</p>
            <p>(e) Elaboração de entregáveis gerenciais relacionados à controladoria financeira, conforme metodologia e modelo de trabalho adotados pela CONTRATADA;</p>
            <p>(f) Apoio na estruturação de estratégias financeiras voltadas ao acompanhamento do desempenho do negócio da CONTRATANTE;</p>
            <p>(g) Realização de reuniões periódicas para fechamento de resultados e análise de inteligência financeira, com base nos dados financeiros da CONTRATANTE;</p>
            <p>(h) Realização de reuniões periódicas voltadas à discussão estratégica do negócio da CONTRATANTE;</p>
            <p>(i) Apoio na análise de viabilidade financeira de novos projetos ou iniciativas do negócio da CONTRATANTE;</p>
            <p>(j) Suporte consultivo ao time financeiro da CONTRATANTE, no que se refere à organização, análise e acompanhamento das informações financeiras do negócio.</p>
          </div>
          <p style={{ textAlign: "justify", textIndent: "1.25cm", marginTop: 8 }}>
            <strong>1.1.2.</strong> Os serviços BGP GO III serão fornecidos mensalmente e de modo contínuo durante toda a vigência do Contrato.
          </p>
          <h3 style={{ fontWeight: "bold", marginTop: 12 }}>VALORES BGP GO III E DADOS DE PAGAMENTO:</h3>
          <div style={{ border: "1px solid #999", padding: 10, margin: "10px 0", whiteSpace: "pre-wrap", fontSize: "12pt" }}>{valoresText}</div>
        </div>
      );
    case "BGP BI":
      return (
        <div style={{ marginTop: 12 }}>
          <div style={{ border: "1px solid #000", padding: "8px 12px", margin: "10px 0", fontWeight: "bold", fontSize: "12pt" }}>{marker} BGP BI</div>
          <p style={{ textAlign: "justify", textIndent: "1.25cm" }}>
            <strong>1.1.1.</strong> A contratação do "BGP BI" contempla a outorga de uma licença não-exclusiva, temporária, revogável e condicionada ao devido cumprimento do presente Contrato para uso da plataforma de Business Intelligence (BI) ("Plataforma de BI") explorada pela CONTRATADA para os exclusivos fins de acesso e visualização dos dados e indicadores relacionados aos aspectos financeiros da CONTRATANTE nos termos ora contratados.
          </p>
          <p style={{ textAlign: "justify", textIndent: "1.25cm" }}>
            <strong>1.1.2.</strong> Também faz parte do presente Contrato:
          </p>
          <div style={{ paddingLeft: "1.25cm" }}>
            <p>(a) Os serviços para implantação da Plataforma BI junto à CONTRATANTE;</p>
            <p>(b) A integração da Plataforma BI com os sistemas/planilhas utilizadas pela CONTRATANTE, caso compatíveis;</p>
            <p>(c) O serviço de suporte, via e-mail ou tickets abertos dentro da própria Plataforma, para fins de suporte técnico no caso de mal funcionamento da Plataforma de BI e orientação da CONTRATANTE.</p>
          </div>
          <p style={{ textAlign: "justify", textIndent: "1.25cm", marginTop: 8 }}>
            Será fornecido um login de acesso à CONTRATANTE, a qual assume total e exclusiva responsabilidade pelas pessoas por ela designadas para terem acesso à Plataforma de BI, não possuindo a CONTRATADA qualquer ingerência em tal definição e tampouco responsabilidade por eventual mal uso dos dados acessados pela equipe da CONTRATANTE.
          </p>
          <p style={{ textAlign: "justify", textIndent: "1.25cm" }}>
            <strong>1.1.3.</strong> A CONTRATADA poderá, a seu exclusivo critério e sempre com o propósito de melhora da Plataforma BI, atualizar, adequar ou de qualquer forma alterar a Plataforma de BI utilizada e/ou suas funcionalidades.
          </p>
          <p style={{ textAlign: "justify", textIndent: "1.25cm" }}>
            <strong>1.1.4.</strong> A CONTRATADA oferece à CONTRATANTE a opção de personalização/customização de análises/telas da Plataforma de BI, conforme disponibilidade da Plataforma de BI e das informações disponíveis para tal fim.
          </p>
          <p style={{ textAlign: "justify", textIndent: "1.25cm" }}>
            <strong>1.1.4.1.</strong> Com a confirmação da CONTRATADA de que a personalização desejada pela CONTRATANTE é possível e a aprovação da CONTRATANTE para seguir com tal personalização, concordam as Partes que será devido um valor adicional mensal de R$ 99,00 (noventa e nove reais) por cada análise/tela personalizada criada, a ser paga juntamente com a remuneração pactuada neste Contrato e nas condições aqui definidas.
          </p>
          <p style={{ textAlign: "justify", textIndent: "1.25cm" }}>
            <strong>1.1.5.</strong> A licença da Plataforma de BI e os serviços a ele inerentes serão fornecidos mensalmente e de modo contínuo durante toda a vigência do Contrato.
          </p>
          <h3 style={{ fontWeight: "bold", marginTop: 12 }}>VALORES BGP BI E DADOS DE PAGAMENTO:</h3>
          <div style={{ border: "1px solid #999", padding: 10, margin: "10px 0", whiteSpace: "pre-wrap", fontSize: "12pt" }}>{valoresText}</div>
        </div>
      );
    case "BGP Strategy":
      return (
        <div style={{ marginTop: 12 }}>
          <div style={{ border: "1px solid #000", padding: "8px 12px", margin: "10px 0", fontWeight: "bold", fontSize: "12pt" }}>{marker} BGP STRATEGY</div>
          <p style={{ textAlign: "justify", textIndent: "1.25cm" }}>
            <strong>1.1.1.</strong> Os serviços "BGP STRATEGY" englobam a prestação pela CONTRATADA em favor da CONTRATANTE de serviços de consultoria/assessoria, com o principal objetivo de analisar o negócio da CONTRATANTE, desenhar um plano estratégico conforme objetivos traçados em conjunto e acompanhar e monitorar a implantação do plano, o qual pode incluir os seguintes módulos:
          </p>
          <div style={{ paddingLeft: "1.25cm" }}>
            {modules.crescimento && <p>( X ) CRESCIMENTO EMPRESARIAL: focado em auxiliar a CONTRATANTE no crescimento econômico mediante a identificação de oportunidades de negócio.</p>}
            {!modules.crescimento && <p>({"\u00A0\u00A0\u00A0"}) CRESCIMENTO EMPRESARIAL: focado em auxiliar a CONTRATANTE no crescimento econômico mediante a identificação de oportunidades de negócio.</p>}
            {modules.redesenho && <p>( X ) REDESENHO ORGANIZACIONAL E OTIMIZAÇÃO DE ESTRUTURA: focado em auxiliar a CONTRATANTE a identificar e melhor definir a sua estrutura organizacional em termos de pessoal e de processos.</p>}
            {!modules.redesenho && <p>({"\u00A0\u00A0\u00A0"}) REDESENHO ORGANIZACIONAL E OTIMIZAÇÃO DE ESTRUTURA: focado em auxiliar a CONTRATANTE a identificar e melhor definir a sua estrutura organizacional em termos de pessoal e de processos.</p>}
            {modules.recuperacao && <p>( X ) RECUPERAÇÃO FINANCEIRA: focado em auxiliar a CONTRATANTE no desenvolvimento de um plano financeiro robusto, incluindo a identificação e renegociação de passivos, redução e otimização de custos e aumento da previsibilidade financeira do negócio.</p>}
            {!modules.recuperacao && <p>({"\u00A0\u00A0\u00A0"}) RECUPERAÇÃO FINANCEIRA: focado em auxiliar a CONTRATANTE no desenvolvimento de um plano financeiro robusto, incluindo a identificação e renegociação de passivos, redução e otimização de custos e aumento da previsibilidade financeira do negócio.</p>}
          </div>
          <p style={{ textAlign: "justify", textIndent: "1.25cm", marginTop: 8 }}>
            <strong>1.1.2.</strong> Os serviços BGP STRATEGY, conforme os propósitos dos módulos selecionados, englobam:
          </p>
          <div style={{ paddingLeft: "1.25cm" }}>
            <p>(a) Reuniões e encontros para o desenvolvimento dos serviços BGP STRATEGY e extração de informações pertinentes;</p>
            <p>(b) Análise de documentos e informações pertinentes da CONTRATANTE para a compreensão do seu negócio e para o desenvolvimento dos serviços BGP STRATEGY;</p>
            <p>(c) Elaboração de Planos de Ação conforme objetivos definidos em comum acordo;</p>
            <p>(d) Acompanhamento e monitoramento da implantação das ações estratégicas;</p>
          </div>
          <p style={{ textAlign: "justify", textIndent: "1.25cm", marginTop: 8 }}>
            <strong>1.1.2.1.</strong> Os serviços BGP STRATEGY incluem a realização de até 02 (duas) reuniões mensais com a CONTRATADA.
          </p>
          <p style={{ textAlign: "justify", textIndent: "1.25cm" }}>
            <strong>1.1.3.</strong> Os Serviços BGP STRATEGY serão fornecidos mensalmente e de modo contínuo durante toda a vigência do Contrato.
          </p>
          <h3 style={{ fontWeight: "bold", marginTop: 12 }}>VALORES BGP STRATEGY E DADOS DE PAGAMENTO:</h3>
          <div style={{ border: "1px solid #999", padding: 10, margin: "10px 0", whiteSpace: "pre-wrap", fontSize: "12pt" }}>{valoresText}</div>
        </div>
      );
    case "BGP Valuation":
      return (
        <div style={{ marginTop: 12 }}>
          <div style={{ border: "1px solid #000", padding: "8px 12px", margin: "10px 0", fontWeight: "bold", fontSize: "12pt" }}>{marker} BGP VALUATION</div>
          <p style={{ textAlign: "justify", textIndent: "1.25cm" }}>
            <strong>1.1.1.</strong> Os Serviços "BGP VALUATION" englobam a prestação pela CONTRATADA em favor da CONTRATANTE de serviços de consultoria/assessoria, com o principal objetivo de realizar a avaliação financeira do negócio da CONTRATANTE, o que contempla:
          </p>
          <div style={{ paddingLeft: "1.25cm" }}>
            <p>(a) Reunião para levantamento dos requisitos e pontos importantes para os serviços BGP VALUATION;</p>
            <p>(b) Análise de documentos e informações pertinentes da CONTRATANTE para a compreensão do seu negócio e para a confecção do estudo de avaliação financeira do negócio;</p>
            <p>(c) Apresentação de sugestão de modelagem financeira para o negócio, com base nos objetivos da CONTRATANTE, visando à avaliação financeira a ser confeccionada;</p>
            <p>(d) Entrega de estudo de avaliação financeira do negócio da CONTRATANTE;</p>
          </div>
          <p style={{ textAlign: "justify", textIndent: "1.25cm", marginTop: 8 }}>
            <strong>1.1.1.1.</strong> Os serviços BGP VALUATION incluem a realização de até 03 (três) reuniões com a CONTRATADA, bem como a realização de 01 (uma) etapa de ajustes no estudo de avaliação financeira.
          </p>
          <h3 style={{ fontWeight: "bold", marginTop: 12 }}>VALORES BGP VALUATION E DADOS DE PAGAMENTO:</h3>
          <div style={{ border: "1px solid #999", padding: 10, margin: "10px 0", whiteSpace: "pre-wrap", fontSize: "12pt" }}>{valoresText}</div>
        </div>
      );
    case "Brand Growth":
      return (
        <div style={{ marginTop: 12 }}>
          <div style={{ border: "1px solid #000", padding: "8px 12px", margin: "10px 0", fontWeight: "bold", fontSize: "12pt" }}>{marker} BRAND GROWTH</div>
          <p style={{ textAlign: "justify", textIndent: "1.25cm" }}>
            <strong>1.1.1.</strong> Os serviços "BRAND GROWTH" englobam a prestação pela CONTRATADA em favor da CONTRATANTE de serviços de consultoria e assessoria em branding e crescimento de marca, com o objetivo de desenvolver e fortalecer a identidade da marca da CONTRATANTE no mercado. Os termos específicos desta modalidade serão definidos em comum acordo entre as Partes.
          </p>
          <h3 style={{ fontWeight: "bold", marginTop: 12 }}>VALORES BRAND GROWTH E DADOS DE PAGAMENTO:</h3>
          <div style={{ border: "1px solid #999", padding: 10, margin: "10px 0", whiteSpace: "pre-wrap", fontSize: "12pt" }}>{valoresText}</div>
        </div>
      );
    case "BI Personalizado":
      return (
        <div style={{ marginTop: 12 }}>
          <div style={{ border: "1px solid #000", padding: "8px 12px", margin: "10px 0", fontWeight: "bold", fontSize: "12pt" }}>{marker} BGP BI PERSONALIZADO</div>
          <p style={{ textAlign: "justify", textIndent: "1.25cm" }}>
            <strong>1.1.1.</strong> A contratação do "BGP BI Personalizado" contempla a outorga de uma licença não exclusiva, temporária, revogável e condicionada ao devido cumprimento do presente Contrato para uso da plataforma de Business Intelligence (BI) explorada pela CONTRATADA, destinada ao acesso, visualização e análise de dados e indicadores da CONTRATANTE, estruturados conforme as necessidades específicas do seu negócio.
          </p>
          <p style={{ textAlign: "justify", textIndent: "1.25cm" }}>
            <strong>1.1.1.</strong> No âmbito da presente contratação, a CONTRATADA realizará a estruturação e desenvolvimento de dashboards personalizados, considerando:
          </p>
          <div style={{ paddingLeft: "1.25cm" }}>
            <p>(a) a identidade visual da CONTRATANTE, incluindo cores, organização visual, layout e estrutura de navegação dos painéis;</p>
            <p>(b) a definição e organização de indicadores, métricas e análises gerenciais conforme as preferências e necessidades informacionais da CONTRATANTE;</p>
            <p>(c) a construção de dashboards e painéis analíticos personalizados, estruturados para facilitar a interpretação dos dados e apoiar a tomada de decisão da CONTRATANTE;</p>
            <p>(d) a integração da Plataforma BI com sistemas, ERPs, bancos de dados ou planilhas utilizadas pela CONTRATANTE, quando tecnicamente compatíveis;</p>
            <p>(e) a disponibilização de acesso à Plataforma BI para visualização dos dashboards desenvolvidos.</p>
          </div>
          <p style={{ textAlign: "justify", textIndent: "1.25cm" }}>
            <strong>1.1.2.</strong> Também fazem parte do presente Contrato:
          </p>
          <div style={{ paddingLeft: "1.25cm" }}>
            <p>(a) os serviços de implantação e configuração da Plataforma BI junto à CONTRATANTE;</p>
            <p>(b) o suporte técnico por meio de e-mail, tickets ou canais disponibilizados pela CONTRATADA, exclusivamente para questões relacionadas ao funcionamento da Plataforma BI;</p>
            <p>(c) orientações gerais para utilização da Plataforma BI pela CONTRATANTE.</p>
          </div>
          <p style={{ textAlign: "justify", textIndent: "1.25cm" }}>
            <strong>1.1.3.</strong> Será fornecido login de acesso à CONTRATANTE, a qual assume total e exclusiva responsabilidade pelas pessoas por ela designadas para acesso à Plataforma BI, não possuindo a CONTRATADA qualquer ingerência em tal definição, tampouco responsabilidade por eventual uso indevido das informações acessadas.
          </p>
          <p style={{ textAlign: "justify", textIndent: "1.25cm" }}>
            <strong>1.1.4.</strong> A CONTRATADA poderá, a seu exclusivo critério e sempre com o propósito de melhoria da Plataforma BI, atualizar, adequar ou alterar funcionalidades da Plataforma, desde que tais alterações não prejudiquem a utilização regular do serviço contratado.
          </p>
          <p style={{ textAlign: "justify", textIndent: "1.25cm" }}>
            Eventuais novas análises, dashboards adicionais ou alterações estruturais relevantes solicitadas pela CONTRATANTE, que não estejam contempladas no escopo inicialmente definido, poderão ser tratadas como serviços adicionais, sujeitos à análise de viabilidade técnica e eventual cobrança adicional.
          </p>
          <p style={{ textAlign: "justify", textIndent: "1.25cm" }}>
            A licença da Plataforma BI e os serviços a ela inerentes serão fornecidos mensalmente e de forma contínua durante toda a vigência do Contrato.
          </p>
          <h3 style={{ fontWeight: "bold", marginTop: 12 }}>VALORES BGP BI PERSONALIZADO E DADOS DE PAGAMENTO:</h3>
          <div style={{ border: "1px solid #999", padding: 10, margin: "10px 0", whiteSpace: "pre-wrap", fontSize: "12pt" }}>{valoresText}</div>
        </div>
      );
    default:
      return null;
  }
}


// ─── Main Component ──────────────────────────────────────────────────────────

export default function ContractGenerator({ dealId, deal }: ContractGeneratorProps) {
  const [mode, setMode] = useState<"form" | "preview">("form");
  const [form, setForm] = useState<ContractFormData>(INITIAL_FORM);
  const [contractId, setContractId] = useState<string | null>(null);
  const [contractStatus, setContractStatus] = useState<string>("draft");
  const [savedWitnesses, setSavedWitnesses] = useState<SavedWitness[]>([]);
  const [showWitnessPicker, setShowWitnessPicker] = useState<1 | 2 | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendingAutentique, setSendingAutentique] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error" | "warning"; message: string } | null>(null);

  const contractRef = useRef<HTMLDivElement>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Show toast helper ──
  const showToast = (type: "success" | "error" | "warning", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), type === "warning" ? 8000 : 4000);
  };

  // ── Update form field ──
  const updateField = useCallback((field: keyof ContractFormData, value: string | boolean | ContractFormData["strategyModules"]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  // ── Pre-fill from deal data ──
  const prefillFromDeal = useCallback(() => {
    const updates: Partial<ContractFormData> = {};
    if (deal.organization) {
      updates.razaoSocial = deal.organization.name || "";
      updates.nomeFantasia = deal.organization.name || "";
      updates.cnpj = deal.organization.cnpj || "";
      updates.endereco = deal.organization.address || "";
      updates.emailRepresentante = deal.organization.email || "";
    }
    if (deal.contact) {
      updates.representante = deal.contact.name || "";
      updates.emailRepresentante = updates.emailRepresentante || deal.contact.email || "";
    }
    if (deal.value) {
      updates.valorMensal = String(deal.value);
    }
    if (deal.products && deal.products.length > 0) {
      const productName = deal.products[0].product.name;
      if (PRODUTOS.includes(productName)) {
        updates.produto = productName;
      }
    }
    updates.dataInicio = todayISO();
    setForm((prev) => ({ ...prev, ...updates }));
  }, [deal]);

  // ── Load existing contract + witnesses on mount ──
  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      setLoading(true);
      try {
        // Load existing contract
        const contractRes = await api.get<{ data: ContractRecord[] }>(`/contracts?dealId=${dealId}`);
        const contracts = contractRes.data ?? [];
        if (!cancelled && contracts.length > 0) {
          const existing = contracts[0];
          setContractId(existing.id);
          const s = existing.status || "draft";
          setContractStatus(s === "PENDING_SIGNATURE" ? "sent" : s === "SIGNED" || s === "COMPLETED" ? "signed" : "draft");
          // Rebuild form from contract fields
          const restored: Partial<ContractFormData> = {};
          const fieldKeys: (keyof ContractFormData)[] = [
            'razaoSocial', 'nomeFantasia', 'cnpj', 'endereco', 'representante',
            'cpfRepresentante', 'emailRepresentante', 'emailFinanceiro',
            'produto', 'biOrigemDados', 'biQtdLicencas', 'biQtdTelasPersonalizadas',
            'valorMensal', 'diaVencimento', 'dataInicio', 'formaPagamento',
            'valorImplementacao', 'implementacaoParcelas', 'descontoMeses', 'descontoPercentual',
            'observacao', 'linkReadAi',
            'testemunha1Nome', 'testemunha1Cpf', 'testemunha1Email',
            'testemunha2Nome', 'testemunha2Cpf', 'testemunha2Email',
          ];
          for (const key of fieldKeys) {
            if ((existing as any)[key] != null) {
              (restored as any)[key] = String((existing as any)[key]);
            }
          }
          if ((existing as any).strategyModules) {
            restored.strategyModules = (existing as any).strategyModules as any;
          }
          const hasData = Object.keys(restored).some(k => (restored as any)[k]);
          if (hasData) {
            setForm({ ...INITIAL_FORM, ...restored });
          } else {
            prefillFromDeal();
          }
        } else if (!cancelled) {
          prefillFromDeal();
        }
      } catch {
        // No existing contract, pre-fill from deal
        if (!cancelled) prefillFromDeal();
      }

      try {
        const witnessRes = await api.get<{ data: SavedWitness[] }>("/contract-witnesses");
        if (!cancelled) setSavedWitnesses(witnessRes.data ?? []);
      } catch {
        // Witnesses are optional
      }

      if (!cancelled) setLoading(false);
    }

    loadData();
    return () => { cancelled = true; };
  }, [dealId, prefillFromDeal]);

  // ── Auto-save on form change (debounced) ──
  useEffect(() => {
    if (loading) return;
    if (contractStatus === "sent") return; // Don't auto-save sent contracts

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      setSaving(true);
      try {
        if (contractId) {
          await api.put(`/contracts/${contractId}`, { ...form });
        } else {
          const res = await api.post<{ data: ContractRecord }>("/contracts", {
            dealId,
            ...form,
          });
          setContractId(res.data.id);
        }
      } catch {
        // Silent fail for auto-save
      } finally {
        setSaving(false);
      }
    }, 1500);

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [form, contractId, dealId, loading, contractStatus]);

  // ── Generate full HTML for contract ──
  const generateContractHTML = (): string => {
    const el = contractRef.current;
    if (!el) return "";
    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Contrato - ${form.razaoSocial}</title>
  <style>
    @page { size: A4; margin: 30mm 20mm 20mm 30mm; }
    body { font-family: Arial, 'Times New Roman', serif; font-size: 12pt; line-height: 1.5; color: #000; margin: 0; padding: 0; }
    .contract-page { page-break-after: always; }
    .contract-page:last-child { page-break-after: auto; }
    h1 { font-size: 14pt; font-weight: bold; text-align: center; text-transform: uppercase; margin: 24px 0 12px; }
    h2 { font-size: 12pt; font-weight: bold; text-transform: uppercase; margin: 18px 0 10px; }
    h3 { font-size: 12pt; font-weight: bold; margin: 14px 0 8px; }
    p { margin: 8px 0; text-align: justify; text-indent: 1.25cm; }
    td p, .indent p, .valores-box p { text-indent: 0; }
    table p { text-indent: 0; }
    .header-table { width: 100%; margin-bottom: 20px; border-collapse: collapse; }
    .header-table td { padding: 6px 8px; vertical-align: top; font-size: 12pt; border: 1px solid #000; }
    .header-label { font-weight: bold; width: 160px; }
    .clausula { margin-top: 16px; }
    .indent { padding-left: 1.25cm; }
    .footer { text-align: center; font-size: 10pt; color: #666; border-top: 1px solid #ccc; padding-top: 5px; margin-top: 30px; }
    .signature-line { border-bottom: 1px solid #000; width: 65%; margin: 40px 0 5px; }
    .signature-table { width: 100%; margin-top: 30px; }
    .signature-table td { width: 50%; padding: 0 10px; vertical-align: top; }
    .product-box { border: 1px solid #000; padding: 8px 12px; margin: 10px 0; font-weight: bold; font-size: 12pt; }
    .logo { text-align: center; margin-bottom: 20px; }
    .logo img { height: 40px; }
    .valores-box { border: 1px solid #999; padding: 10px; margin: 10px 0; white-space: pre-wrap; font-size: 12pt; }
  </style>
</head>
<body>
  ${el.innerHTML}
</body>
</html>`;
  };

  // ── Download PDF ──
  const handleDownloadPDF = () => {
    const html = generateContractHTML();
    if (!html) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      showToast("error", "Não foi possível abrir a janela de impressão. Verifique o bloqueador de pop-ups.");
      return;
    }
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.print();
  };

  // ── Revise contract (cancel Autentique & reopen form) ──
  const [revising, setRevising] = useState(false);
  const handleRevise = async () => {
    if (!contractId) return;
    const confirmed = window.confirm(
      "Tem certeza que deseja alterar o contrato?\n\nO contrato atual no Autentique será cancelado e você poderá editar as informações e enviar um novo."
    );
    if (!confirmed) return;

    setRevising(true);
    try {
      const res = await api.post<{ data: any; autentiqueCancelled: boolean; autentiqueCancelError: string | null }>(`/contracts/${contractId}/revise`, {});
      setContractStatus("draft");
      setMode("form");
      if (res.autentiqueCancelled) {
        showToast("success", "Contrato cancelado no Autentique. Edite as informações e envie novamente.");
      } else {
        showToast("warning", `Contrato reaberto para edição, mas o cancelamento no Autentique falhou: ${res.autentiqueCancelError || "erro desconhecido"}. Cancele manualmente no painel do Autentique.`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao cancelar contrato";
      showToast("error", msg);
    } finally {
      setRevising(false);
    }
  };

  // ── Send to Autentique ──
  const handleSendAutentique = async () => {
    const validationErrors = validateContractForm(form);
    if (validationErrors.length > 0) {
      alert('Corrija os seguintes erros:\n\n' + validationErrors.join('\n'));
      return;
    }

    setSendingAutentique(true);
    try {
      // Ensure contract exists
      let cId = contractId;
      if (!cId) {
        const res = await api.post<{ data: { id: string } }>("/contracts", { dealId, ...form });
        cId = res.data.id;
        setContractId(cId);
      }

      // Save HTML content first
      const html = generateContractHTML();
      await api.put(`/contracts/${cId}`, { ...form, htmlContent: html });

      // Send to Autentique
      await api.post(`/contracts/${cId}/send-autentique`, {});

      setContractStatus("sent");
      showToast("success", "Contrato enviado para assinatura via Autentique com sucesso!");
    } catch (err: unknown) {
      const e = err as { message?: string };
      showToast("error", `Erro ao enviar para Autentique: ${e?.message ?? "Tente novamente."}`);
    } finally {
      setSendingAutentique(false);
    }
  };

  // ── Select saved witness ──
  const selectWitness = (witness: SavedWitness, slot: 1 | 2) => {
    if (slot === 1) {
      setForm((prev) => ({
        ...prev,
        testemunha1Nome: witness.nome,
        testemunha1Cpf: witness.cpf,
        testemunha1Email: witness.email,
      }));
    } else {
      setForm((prev) => ({
        ...prev,
        testemunha2Nome: witness.nome,
        testemunha2Cpf: witness.cpf,
        testemunha2Email: witness.email,
      }));
    }
    setShowWitnessPicker(null);
  };

  // ── Loading state ──
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={24} className="text-blue-500 animate-spin" />
        <span className="ml-2 text-sm text-gray-500">Carregando contrato...</span>
      </div>
    );
  }

  // ── Sent / Signed status ──
  if (contractStatus === "sent" || contractStatus === "signed") {
    const isSigned = contractStatus === "signed";
    return (
      <div className="space-y-6">
        {/* Status banner */}
        <div className={`rounded-xl border p-6 ${isSigned ? "bg-green-50 border-green-200" : "bg-blue-50 border-blue-200"}`}>
          <div className="flex items-center gap-4">
            <div className={`w-14 h-14 rounded-full flex items-center justify-center ${isSigned ? "bg-green-100" : "bg-blue-100"}`}>
              {isSigned ? <Check size={28} className="text-green-600" /> : <Send size={28} className="text-blue-600" />}
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-800">
                {isSigned ? "Contrato Assinado" : "Contrato Enviado para Assinatura"}
              </h2>
              <p className="text-sm text-gray-500">
                {isSigned
                  ? "Todas as partes assinaram o contrato via Autentique."
                  : "Aguardando assinaturas via Autentique. Os assinantes receberam o link por email."}
              </p>
            </div>
          </div>

          {/* Signers info */}
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-white rounded-lg border border-gray-200 p-3">
              <p className="text-[10px] font-semibold text-gray-400 uppercase mb-1">Contratada</p>
              <p className="text-sm font-medium text-gray-800">Josiane Luiza Bertuzzi</p>
              <p className="text-xs text-gray-500">josi@bertuzzipatrimonial.com.br</p>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-3">
              <p className="text-[10px] font-semibold text-gray-400 uppercase mb-1">Contratante</p>
              <p className="text-sm font-medium text-gray-800">{form.representante || form.razaoSocial}</p>
              <p className="text-xs text-gray-500">{form.emailRepresentante}</p>
            </div>
            {form.testemunha1Nome && (
              <div className="bg-white rounded-lg border border-gray-200 p-3">
                <p className="text-[10px] font-semibold text-gray-400 uppercase mb-1">Testemunha 1</p>
                <p className="text-sm font-medium text-gray-800">{form.testemunha1Nome}</p>
                <p className="text-xs text-gray-500">{form.testemunha1Email}</p>
              </div>
            )}
            {form.testemunha2Nome && (
              <div className="bg-white rounded-lg border border-gray-200 p-3">
                <p className="text-[10px] font-semibold text-gray-400 uppercase mb-1">Testemunha 2</p>
                <p className="text-sm font-medium text-gray-800">{form.testemunha2Nome}</p>
                <p className="text-xs text-gray-500">{form.testemunha2Email}</p>
              </div>
            )}
          </div>

          {/* Quick info */}
          <div className="mt-4 flex flex-wrap gap-4 text-xs text-gray-500">
            <span><strong>Produto:</strong> {form.produto || "—"}</span>
            <span><strong>Valor:</strong> {form.valorMensal ? `R$ ${form.valorMensal}` : "—"}</span>
            <span><strong>Vencimento:</strong> Dia {form.diaVencimento || "—"}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => setMode("preview")}
            className="flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700 border border-blue-200 rounded-lg px-4 py-2 transition-colors"
          >
            <Eye size={16} />
            Visualizar Contrato
          </button>
          <button
            onClick={handleDownloadPDF}
            className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-700 border border-gray-200 rounded-lg px-4 py-2 transition-colors"
          >
            <Download size={16} />
            Baixar PDF
          </button>
          {!isSigned && (
            <button
              onClick={handleRevise}
              disabled={revising}
              className="flex items-center gap-2 text-sm font-medium text-amber-600 hover:text-amber-700 border border-amber-200 rounded-lg px-4 py-2 transition-colors disabled:opacity-50"
            >
              {revising ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              Alterar Contrato
            </button>
          )}
        </div>

        {/* Contract preview inline */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-8 overflow-auto max-h-[600px]" style={{ fontFamily: "'Georgia', 'Times New Roman', serif", fontSize: "12pt", lineHeight: "1.6" }}>
          <ContractContent form={form} />
        </div>
      </div>
    );
  }

  // ── Preview mode ──
  if (mode === "preview") {
    return (
      <div className="space-y-4">
        {/* Toast */}
        {toast && (
          <div
            className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${
              toast.type === "success" ? "bg-green-50 text-green-700 border border-green-200" : toast.type === "warning" ? "bg-amber-50 text-amber-700 border border-amber-200" : "bg-red-50 text-red-700 border border-red-200"
            }`}
          >
            {toast.message}
          </div>
        )}

        {/* Actions bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white border border-gray-200 rounded-lg px-4 py-3">
          <button
            onClick={() => setMode("form")}
            className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors"
          >
            <ArrowLeft size={16} />
            Voltar ao Formulário
          </button>
          <div className="flex gap-2">
            <button
              onClick={handleDownloadPDF}
              className="flex items-center gap-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg px-4 py-2 hover:bg-gray-50 transition-colors"
            >
              <Download size={16} />
              Baixar PDF
            </button>
            <button
              onClick={handleSendAutentique}
              disabled={sendingAutentique}
              className="flex items-center gap-2 text-sm font-medium text-white bg-blue-600 rounded-lg px-4 py-2 hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {sendingAutentique ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              Enviar para Autentique
            </button>
          </div>
        </div>

        {/* Contract preview */}
        <div
          className="bg-white dark:bg-gray-100 rounded-lg shadow-lg max-w-4xl mx-auto text-black"
          style={{ fontFamily: "Arial, 'Times New Roman', serif", fontSize: "12pt", lineHeight: "1.5", padding: "30mm 20mm 20mm 30mm" }}
        >
          <div ref={contractRef}>
            <ContractContent form={form} />
          </div>
        </div>
      </div>
    );
  }

  // ── Form mode ──
  return (
    <div className="space-y-4">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${
            toast.type === "success" ? "bg-green-50 text-green-700 border border-green-200" : toast.type === "warning" ? "bg-amber-50 text-amber-700 border border-amber-200" : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
            <FileText size={20} className="text-blue-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-800">Gerador de Contrato</h2>
            <p className="text-xs text-gray-500">
              {saving ? (
                <span className="flex items-center gap-1">
                  <Loader2 size={10} className="animate-spin" />
                  Salvando...
                </span>
              ) : contractId ? (
                <span className="flex items-center gap-1 text-green-600">
                  <Check size={10} />
                  Rascunho salvo
                </span>
              ) : (
                "Preencha os dados para gerar o contrato"
              )}
            </p>
          </div>
        </div>
      </div>

      {/* 1. Dados do Contratante */}
      <FormSection title="Dados do Contratante">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Razão Social">
            <TextInput
              value={form.razaoSocial}
              onChange={(v) => updateField("razaoSocial", v)}
              placeholder="Razão social da empresa"
            />
          </FormField>
          <FormField label="Nome Fantasia">
            <TextInput
              value={form.nomeFantasia}
              onChange={(v) => updateField("nomeFantasia", v)}
              placeholder="Nome fantasia"
            />
          </FormField>
          <FormField label="CNPJ">
            <TextInput
              value={form.cnpj}
              onChange={(v) => updateField("cnpj", v)}
              placeholder="00.000.000/0000-00"
            />
          </FormField>
          <FormField label="Endereço Completo">
            <TextInput
              value={form.endereco}
              onChange={(v) => updateField("endereco", v)}
              placeholder="Rua, número, bairro, cidade/UF, CEP"
            />
          </FormField>
          <FormField label="Representante Legal">
            <TextInput
              value={form.representante}
              onChange={(v) => updateField("representante", v)}
              placeholder="Nome completo do representante"
            />
          </FormField>
          <FormField label="CPF do Representante">
            <TextInput
              value={form.cpfRepresentante}
              onChange={(v) => updateField("cpfRepresentante", v)}
              placeholder="000.000.000-00"
            />
          </FormField>
          <FormField label="E-mail do Representante">
            <TextInput
              value={form.emailRepresentante}
              onChange={(v) => updateField("emailRepresentante", v)}
              placeholder="email@empresa.com.br"
              type="email"
            />
          </FormField>
          <FormField label="E-mail Financeiro">
            <TextInput
              value={form.emailFinanceiro}
              onChange={(v) => updateField("emailFinanceiro", v)}
              placeholder="financeiro@empresa.com.br"
              type="email"
            />
          </FormField>
        </div>
      </FormSection>

      {/* 2. Produto */}
      <FormSection title="Produto">
        <div className="space-y-4">
          <FormField label="Produto Contratado">
            <select
              value={form.produto}
              onChange={(e) => updateField("produto", e.target.value)}
              className="w-full border border-gray-200 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
            >
              <option value="">Selecione o produto...</option>
              {PRODUTOS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </FormField>

          {/* BI-specific fields */}
          {isBIProduct(form.produto) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3 bg-blue-50 border border-blue-100 rounded-lg">
              <FormField label="Origem dos Dados">
                <TextInput
                  value={form.biOrigemDados}
                  onChange={(v) => updateField("biOrigemDados", v)}
                  placeholder="Ex: ERP, planilhas, banco de dados..."
                />
              </FormField>
              <FormField label="Quantidade de Licenças">
                <TextInput
                  value={form.biQtdLicencas}
                  onChange={(v) => updateField("biQtdLicencas", v)}
                  placeholder="Ex: 5"
                  type="number"
                />
              </FormField>
              {form.produto === "BI Personalizado" && (
                <FormField label="Qtd. Telas Personalizadas">
                  <TextInput
                    value={form.biQtdTelasPersonalizadas}
                    onChange={(v) => updateField("biQtdTelasPersonalizadas", v)}
                    placeholder="Ex: 3"
                    type="number"
                  />
                </FormField>
              )}
            </div>
          )}

          {/* Strategy-specific fields */}
          {isStrategyProduct(form.produto) && (
            <div className="p-3 bg-purple-50 border border-purple-100 rounded-lg">
              <p className="text-xs font-medium text-purple-700 mb-3">Módulos de Estratégia</p>
              <div className="flex flex-col sm:flex-row gap-3">
                {[
                  { key: "crescimento" as const, label: "Estratégia de Crescimento" },
                  { key: "redesenho" as const, label: "Redesenho de Processos" },
                  { key: "recuperacao" as const, label: "Recuperação Empresarial" },
                ].map(({ key, label }) => (
                  <label
                    key={key}
                    className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={form.strategyModules[key]}
                      onChange={(e) =>
                        updateField("strategyModules", {
                          ...form.strategyModules,
                          [key]: e.target.checked,
                        })
                      }
                      className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      </FormSection>

      {/* 3. Valores e Pagamento */}
      <FormSection title="Valores e Pagamento">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Valor Mensal (R$)">
            <TextInput
              value={form.valorMensal}
              onChange={(v) => updateField("valorMensal", v)}
              placeholder="0,00"
            />
          </FormField>
          <FormField label="Dia de Vencimento">
            <select
              value={form.diaVencimento}
              onChange={(e) => updateField("diaVencimento", e.target.value)}
              className="w-full border border-gray-200 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
            >
              {DIAS_VENCIMENTO.map((d) => (
                <option key={d} value={String(d)}>Dia {d}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Data de Início">
            <TextInput
              value={form.dataInicio}
              onChange={(v) => updateField("dataInicio", v)}
              type="date"
            />
          </FormField>
          <FormField label="Forma de Pagamento">
            <select
              value={form.formaPagamento}
              onChange={(e) => updateField("formaPagamento", e.target.value)}
              className="w-full border border-gray-200 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
            >
              {FORMAS_PAGAMENTO.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Valor de Implementação (R$)">
            <TextInput
              value={form.valorImplementacao}
              onChange={(v) => updateField("valorImplementacao", v)}
              placeholder="0,00 (opcional)"
            />
          </FormField>
          <FormField label="Parcelas da Implementação">
            <TextInput
              value={form.implementacaoParcelas}
              onChange={(v) => updateField("implementacaoParcelas", v)}
              placeholder="1"
              type="number"
            />
          </FormField>
          <FormField label="Meses com Desconto">
            <TextInput
              value={form.descontoMeses}
              onChange={(v) => updateField("descontoMeses", v)}
              placeholder="Ex: 3 (opcional)"
              type="number"
            />
          </FormField>
          <FormField label="Percentual de Desconto (%)">
            <TextInput
              value={form.descontoPercentual}
              onChange={(v) => updateField("descontoPercentual", v)}
              placeholder="Ex: 10 (opcional)"
              type="number"
            />
          </FormField>
        </div>
      </FormSection>

      {/* 4. Responsável Legal (Contratada) */}
      <FormSection title="Responsável Legal (Contratada)">
        <div className="bg-gray-50 border border-gray-100 rounded-lg p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Razão Social">
              <TextInput value="BERTUZZI ASSESSORIA E GESTAO DE NEGOCIOS LTDA" readOnly />
            </FormField>
            <FormField label="CNPJ">
              <TextInput value="12.547.474/0001-37" readOnly />
            </FormField>
            <FormField label="Representante Legal">
              <TextInput value="Josiane Luiza Bertuzzi" readOnly />
            </FormField>
            <FormField label="CPF">
              <TextInput value="561.936.700-25" readOnly />
            </FormField>
            <FormField label="E-mail" className="sm:col-span-2">
              <TextInput value="josi@bertuzzipatrimonial.com.br" readOnly />
            </FormField>
          </div>
        </div>
      </FormSection>

      {/* 5. Testemunhas */}
      <FormSection title="Testemunhas">
        <div className="space-y-4">
          {/* Testemunha 1 */}
          <div className="p-3 border border-gray-100 rounded-lg">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-gray-600">Testemunha 1</p>
              {savedWitnesses.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowWitnessPicker(showWitnessPicker === 1 ? null : 1)}
                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium transition-colors"
                >
                  <Users size={12} />
                  Carregar salva
                </button>
              )}
            </div>
            <div className="mb-3">
              <label className="block text-xs font-medium text-gray-600 mb-1">Selecionar testemunha</label>
              <select
                value=""
                onChange={(e) => {
                  const witness = DEFAULT_WITNESSES[parseInt(e.target.value)];
                  if (witness) {
                    setForm(prev => ({
                      ...prev,
                      testemunha1Nome: witness.name,
                      testemunha1Cpf: witness.cpf,
                      testemunha1Email: witness.email,
                    }));
                  }
                }}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Preencher manualmente...</option>
                {DEFAULT_WITNESSES.map((w, i) => (
                  <option key={i} value={i}>{w.name}</option>
                ))}
              </select>
            </div>
            {showWitnessPicker === 1 && (
              <div className="mb-3 border border-blue-100 rounded-md bg-blue-50 p-2 space-y-1">
                {savedWitnesses.map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => selectWitness(w, 1)}
                    className="w-full text-left px-2 py-1.5 text-sm hover:bg-blue-100 rounded transition-colors"
                  >
                    <span className="font-medium">{w.nome}</span>
                    <span className="text-xs text-gray-500 ml-2">{w.cpf}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <FormField label="Nome">
                <TextInput
                  value={form.testemunha1Nome}
                  onChange={(v) => updateField("testemunha1Nome", v)}
                  placeholder="Nome completo"
                />
              </FormField>
              <FormField label="CPF">
                <TextInput
                  value={form.testemunha1Cpf}
                  onChange={(v) => updateField("testemunha1Cpf", v)}
                  placeholder="000.000.000-00"
                />
              </FormField>
              <FormField label="E-mail">
                <TextInput
                  value={form.testemunha1Email}
                  onChange={(v) => updateField("testemunha1Email", v)}
                  placeholder="email@exemplo.com"
                  type="email"
                />
              </FormField>
            </div>
          </div>

          {/* Testemunha 2 */}
          <div className="p-3 border border-gray-100 rounded-lg">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-gray-600">Testemunha 2</p>
              {savedWitnesses.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowWitnessPicker(showWitnessPicker === 2 ? null : 2)}
                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium transition-colors"
                >
                  <Users size={12} />
                  Carregar salva
                </button>
              )}
            </div>
            <div className="mb-3">
              <label className="block text-xs font-medium text-gray-600 mb-1">Selecionar testemunha</label>
              <select
                value=""
                onChange={(e) => {
                  const witness = DEFAULT_WITNESSES[parseInt(e.target.value)];
                  if (witness) {
                    setForm(prev => ({
                      ...prev,
                      testemunha2Nome: witness.name,
                      testemunha2Cpf: witness.cpf,
                      testemunha2Email: witness.email,
                    }));
                  }
                }}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Preencher manualmente...</option>
                {DEFAULT_WITNESSES.map((w, i) => (
                  <option key={i} value={i}>{w.name}</option>
                ))}
              </select>
            </div>
            {showWitnessPicker === 2 && (
              <div className="mb-3 border border-blue-100 rounded-md bg-blue-50 p-2 space-y-1">
                {savedWitnesses.map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => selectWitness(w, 2)}
                    className="w-full text-left px-2 py-1.5 text-sm hover:bg-blue-100 rounded transition-colors"
                  >
                    <span className="font-medium">{w.nome}</span>
                    <span className="text-xs text-gray-500 ml-2">{w.cpf}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <FormField label="Nome">
                <TextInput
                  value={form.testemunha2Nome}
                  onChange={(v) => updateField("testemunha2Nome", v)}
                  placeholder="Nome completo"
                />
              </FormField>
              <FormField label="CPF">
                <TextInput
                  value={form.testemunha2Cpf}
                  onChange={(v) => updateField("testemunha2Cpf", v)}
                  placeholder="000.000.000-00"
                />
              </FormField>
              <FormField label="E-mail">
                <TextInput
                  value={form.testemunha2Email}
                  onChange={(v) => updateField("testemunha2Email", v)}
                  placeholder="email@exemplo.com"
                  type="email"
                />
              </FormField>
            </div>
          </div>
        </div>
      </FormSection>

      {/* 6. Informações Adicionais */}
      <FormSection title="Informações Adicionais" defaultOpen={false}>
        <div className="space-y-4">
          <FormField label="Observações">
            <textarea
              value={form.observacao}
              onChange={(e) => updateField("observacao", e.target.value)}
              placeholder="Informações adicionais que serão incluídas como anexo no contrato..."
              rows={4}
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 resize-y"
            />
          </FormField>
          <FormField label="Link Read.ai (ata de reunião)">
            <TextInput
              value={form.linkReadAi}
              onChange={(v) => updateField("linkReadAi", v)}
              placeholder="https://app.read.ai/..."
              type="url"
            />
          </FormField>
        </div>
      </FormSection>

      {/* Action button */}
      <div className="flex justify-end pt-2 pb-4">
        <button
          onClick={() => setMode("preview")}
          className="flex items-center gap-2 text-sm font-medium text-white bg-blue-600 rounded-lg px-6 py-2.5 hover:bg-blue-700 transition-colors shadow-sm"
        >
          <Eye size={16} />
          Visualizar Contrato
        </button>
      </div>

      {/* Hidden contract ref for HTML generation */}
      <div className="hidden">
        <div ref={contractRef}>
          <ContractContent form={form} />
        </div>
      </div>
    </div>
  );
}
