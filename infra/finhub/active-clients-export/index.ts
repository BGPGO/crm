// ⚠️ EDGE FUNCTION DO FINHUB — não faz parte do build do CRM (Deno runtime).
// Mora aqui só pra versionamento; o lar definitivo é o repo finhub-insight em
// supabase/functions/active-clients-export/. Deployada em pbtheffdoebfryttkyge.
//
// Deploy (via Supabase CLI, com SUPABASE_ACCESS_TOKEN):
//   supabase functions deploy active-clients-export \
//     --project-ref pbtheffdoebfryttkyge --no-verify-jwt
//   supabase secrets set CRM_ACTIVE_CLIENTS_SECRET=<segredo> \
//     --project-ref pbtheffdoebfryttkyge
//
// active-clients-export — devolve a lista autoritativa de clientes ATIVOS do
// FinHub para o CRM montar o segmento "Clientes Ativos". Modelo PULL: o CRM
// chama este endpoint diariamente com o header `x-crm-secret`.
//
// - Fonte da verdade: unified_clients (status='ativo'), camada curada/dedup.
// - Exclui internos/teste (lista abaixo) e clientes sem identidade real.
// - Junta emails candidatos do FinHub (clients.email + login real do portal),
//   filtrando os logins gerados pelo sistema (@bgpgo, *.temp, client_NNNN, etc).
// - O matching final (Contract/Organization do CRM) acontece no lado do CRM.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SHARED_SECRET = Deno.env.get("CRM_ACTIVE_CLIENTS_SECRET") ?? "";

// Nomes (canonical_name normalizado) que NÃO são clientes reais — time/teste.
const INTERNAL_NAMES = new Set([
  "aimo",
  "bgp",
  "josi bertuzzi",
  "eduardo luzardo",
  "eduardo lasacoski",
  "gabriela hardman parente",
  "fernando goldstein",
  "mavi neves",
  "oliver wittmann wilsmann",
  "henrique kovalezyk",
]);

// Padrões de email gerados pelo sistema / internos — NÃO são contatos reais.
const JUNK_EMAIL =
  /(@bgpgo\.com\.br|@bgp\.com\.br|@bgp\.com$|@temp\.bgp|@bgp\.temp|\.temp$|^client_[0-9]|^cliente-|preencha\.meuemail|@bertuzzipatrimonial\.com\.br|@aimocorp\.com\.br)/i;

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
const isRealEmail = (e: string | null | undefined): e is string =>
  !!e && e.includes("@") && !JUNK_EMAIL.test(e.trim().toLowerCase());

Deno.serve(async (req: Request) => {
  if (req.method !== "GET" && req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  if (!SHARED_SECRET || req.headers.get("x-crm-secret") !== SHARED_SECRET) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  const { data: uc, error: ucErr } = await supabase
    .from("unified_clients")
    .select("finhub_client_id, canonical_name, cnpj")
    .eq("status", "ativo");
  if (ucErr) {
    return new Response(JSON.stringify({ error: ucErr.message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  type Row = { finhub_client_id: string | null; canonical_name: string | null; cnpj: string | null };
  const rows = (uc ?? []) as Row[];
  const ids = rows.map((r) => r.finhub_client_id).filter((x): x is string => !!x);

  const candidates = new Map<string, string[]>();
  const push = (cid: string, email: string | null | undefined) => {
    if (!isRealEmail(email)) return;
    const e = email.trim().toLowerCase();
    const arr = candidates.get(cid) ?? [];
    if (!arr.includes(e)) arr.push(e);
    candidates.set(cid, arr);
  };

  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const { data } = await supabase.from("clients").select("id, email").in("id", chunk);
    for (const c of (data ?? []) as { id: string; email: string | null }[]) push(c.id, c.email);
  }
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const { data } = await supabase.from("client_auth").select("client_id, email").in("client_id", chunk);
    for (const c of (data ?? []) as { client_id: string; email: string | null }[]) push(c.client_id, c.email);
  }

  const clients = [];
  let excluded = 0;
  for (const r of rows) {
    const name = (r.canonical_name ?? "").trim();
    if (!name || INTERNAL_NAMES.has(norm(name))) {
      excluded++;
      continue;
    }
    const cid = r.finhub_client_id ?? "";
    clients.push({
      finhubClientId: cid,
      name,
      cnpj: (r.cnpj ?? "").replace(/[^0-9]/g, "") || null,
      emails: cid ? candidates.get(cid) ?? [] : [],
    });
  }

  return new Response(
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      total: clients.length,
      excludedInternal: excluded,
      withFinhubEmail: clients.filter((c) => c.emails.length > 0).length,
      clients,
    }),
    { headers: { "content-type": "application/json" } },
  );
});
