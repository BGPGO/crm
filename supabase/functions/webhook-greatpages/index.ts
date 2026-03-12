import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── Config ──────────────────────────────────────────────────────────────────

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET") ?? "";

// Default IDs (pipeline Vendas, stage LEAD, admin user)
const DEFAULT_PIPELINE_ID = "64fb7516ea4eb400219457de";
const DEFAULT_STAGE_ID = "64fb7516ea4eb400219457df";
const DEFAULT_USER_ID = "6983561663b1a700264854ef";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ── Helpers ─────────────────────────────────────────────────────────────────

function cuid(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 10);
  const rand2 = Math.random().toString(36).substring(2, 6);
  return `c${ts}${rand}${rand2}`;
}

function resolve(body: Record<string, unknown>, candidates: string[]): string | null {
  for (const key of candidates) {
    const val = body[key];
    if (val !== undefined && val !== null && val !== "") return String(val);
  }
  return null;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ── Handler ─────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  // Validate token if configured
  if (WEBHOOK_SECRET) {
    const headerSecret =
      req.headers.get("x-webhook-secret") ??
      req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    const bodySecret = resolve(body, ["token", "api_key", "secret"]);
    const incoming = headerSecret ?? bodySecret;

    if (incoming !== WEBHOOK_SECRET) {
      return json({ error: "Unauthorized" }, 401);
    }

    delete body["token"];
    delete body["api_key"];
    delete body["secret"];
  }

  return await processLead(body, req);
});

// ── Process lead ────────────────────────────────────────────────────────────

async function processLead(
  body: Record<string, unknown>,
  req: Request
): Promise<Response> {
  const now = new Date().toISOString();

  // ── Extract fields ──────────────────────────────────────────────────

  const contactName = resolve(body, ["name", "nome", "Nome", "full_name", "fullName", "lead_name"]) ?? "Contato sem nome";
  const contactEmail = resolve(body, ["email", "e_mail", "E_mail", "email_address", "lead_email"]);
  const contactPhone = resolve(body, ["phone", "telefone", "Telefone", "celular", "whatsapp", "phone_number", "lead_phone"]);
  const contactPosition = resolve(body, ["position", "cargo", "Cargo", "job_title"]);
  const contactInstagram = resolve(body, ["instagram", "Instagram", "ig"]);

  const orgName = resolve(body, ["company", "empresa", "Empresa", "organization", "company_name"]);
  const orgCnpj = resolve(body, ["cnpj", "CNPJ", "document"]);
  const orgWebsite = resolve(body, ["website", "site", "company_website"]);
  const orgSegment = resolve(body, ["segment", "segmento", "Segmento", "industry"]);

  const dealTitle = resolve(body, ["deal_title", "titulo", "title"]);
  const dealValue = resolve(body, ["value", "valor", "deal_value"]);

  const sourceName = resolve(body, ["source", "fonte", "lead_source", "origem", "Referral_Source"]);
  const campaignName = resolve(body, ["campaign", "campanha", "campaign_name"]);

  const utmSource = resolve(body, ["utm_source", "UTM_Source"]);
  const utmMedium = resolve(body, ["utm_medium", "UTM_Medium"]);
  const utmCampaign = resolve(body, ["utm_campaign", "UTM_Campaign"]);
  const utmTerm = resolve(body, ["utm_term", "UTM_Term"]);
  const utmContent = resolve(body, ["utm_content", "UTM_Content"]);
  const referrer = resolve(body, ["referrer", "ref", "Referral_Source"]);
  const landingPage = resolve(body, ["landing_page", "page_url", "pageUrl", "page", "URL"]);
  const ip = resolve(body, ["IP_do_usuario"]) ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = req.headers.get("user-agent") ?? null;

  // ── Source (find or create) ───────────────────────────────────────

  let sourceId: string | null = null;
  if (sourceName) {
    const { data: existing } = await supabase
      .from("Source")
      .select("id")
      .ilike("name", sourceName)
      .limit(1)
      .single();

    if (existing) {
      sourceId = existing.id;
    } else {
      const id = cuid();
      await supabase.from("Source").insert({ id, name: sourceName, createdAt: now, updatedAt: now });
      sourceId = id;
    }
  }

  // ── Campaign (find or create) ─────────────────────────────────────

  let campaignId: string | null = null;
  const campaignRef = campaignName ?? utmCampaign;
  if (campaignRef) {
    const { data: existing } = await supabase
      .from("Campaign")
      .select("id")
      .ilike("name", campaignRef)
      .limit(1)
      .single();

    if (existing) {
      campaignId = existing.id;
    } else {
      const id = cuid();
      await supabase.from("Campaign").insert({ id, name: campaignRef, createdAt: now, updatedAt: now });
      campaignId = id;
    }
  }

  // ── Organization (find or create) ─────────────────────────────────

  let organizationId: string | null = null;
  if (orgName) {
    let existing = null;
    if (orgCnpj) {
      const { data } = await supabase.from("Organization").select("id").eq("cnpj", orgCnpj).limit(1).single();
      existing = data;
    }
    if (!existing) {
      const { data } = await supabase.from("Organization").select("id").ilike("name", orgName).limit(1).single();
      existing = data;
    }

    if (existing) {
      organizationId = existing.id;
    } else {
      const id = cuid();
      await supabase.from("Organization").insert({
        id,
        name: orgName,
        cnpj: orgCnpj,
        website: orgWebsite,
        segment: orgSegment,
        createdAt: now,
        updatedAt: now,
      });
      organizationId = id;
    }
  }

  // ── Contact (upsert by email) ─────────────────────────────────────

  let contactId: string;
  if (contactEmail) {
    const { data: existing } = await supabase
      .from("Contact")
      .select("id, phone, position, instagram, organizationId")
      .ilike("email", contactEmail)
      .limit(1)
      .single();

    if (existing) {
      contactId = existing.id;
      const updates: Record<string, string> = {};
      if (contactPhone && !existing.phone) updates.phone = contactPhone;
      if (contactPosition && !existing.position) updates.position = contactPosition;
      if (contactInstagram && !existing.instagram) updates.instagram = contactInstagram;
      if (organizationId && !existing.organizationId) updates.organizationId = organizationId;
      if (Object.keys(updates).length > 0) {
        updates.updatedAt = now;
        await supabase.from("Contact").update(updates).eq("id", contactId);
      }
    } else {
      contactId = cuid();
      await supabase.from("Contact").insert({
        id: contactId,
        name: contactName,
        email: contactEmail,
        phone: contactPhone,
        position: contactPosition,
        instagram: contactInstagram,
        organizationId,
        createdAt: now,
        updatedAt: now,
      });
    }
  } else {
    contactId = cuid();
    await supabase.from("Contact").insert({
      id: contactId,
      name: contactName,
      phone: contactPhone,
      position: contactPosition,
      instagram: contactInstagram,
      organizationId,
      createdAt: now,
      updatedAt: now,
    });
  }

  // ── LeadTracking ──────────────────────────────────────────────────

  await supabase.from("LeadTracking").insert({
    id: cuid(),
    contactId,
    utmSource,
    utmMedium,
    utmCampaign,
    utmTerm,
    utmContent,
    referrer,
    landingPage,
    ip,
    userAgent,
    createdAt: now,
  });

  // ── Deal ──────────────────────────────────────────────────────────

  const dealId = cuid();
  await supabase.from("Deal").insert({
    id: dealId,
    title: dealTitle ?? `Lead - ${contactName}`,
    value: dealValue ? parseFloat(dealValue) : null,
    status: "OPEN",
    pipelineId: DEFAULT_PIPELINE_ID,
    stageId: DEFAULT_STAGE_ID,
    contactId,
    organizationId,
    userId: DEFAULT_USER_ID,
    sourceId,
    campaignId,
    createdAt: now,
    updatedAt: now,
  });

  // ── Activities ────────────────────────────────────────────────────

  await supabase.from("Activity").insert([
    {
      id: cuid(),
      type: "WEBHOOK_RECEIVED",
      content: "Lead recebido via webhook GreatPages",
      userId: DEFAULT_USER_ID,
      contactId,
      dealId,
      metadata: { source: "greatpages", payload: body },
      createdAt: now,
      updatedAt: now,
    },
    {
      id: cuid(),
      type: "DEAL_CREATED",
      content: "Negociação criada automaticamente via webhook",
      userId: DEFAULT_USER_ID,
      contactId,
      dealId,
      metadata: { pipelineName: "Vendas", stageName: "LEAD", source: sourceName, campaign: campaignRef },
      createdAt: now,
      updatedAt: now,
    },
  ]);

  return json({ success: true, contactId, dealId });
}
