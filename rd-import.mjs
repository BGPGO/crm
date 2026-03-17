/**
 * Importação dos dados extraídos do RD Station CRM → Supabase (via Prisma)
 *
 * REGRA DE OURO:
 *   - Tabelas de CONFIGURAÇÃO (User, Team, Pipeline, Stage, Source, LostReason,
 *     Campaign, Product, CustomField) → UPSERT (adiciona novos, não apaga existentes)
 *   - Tabelas de DADOS (Organization, Contact, Deal e filhas) → TRUNCATE + reimporta
 *   - Tabelas de FEATURES da plataforma (WhatsApp, Email, Automação, Tag, Segment,
 *     Webhook, Calendly, LeadScore, etc.) → NUNCA TOCA
 *
 * Uso:
 *   node rd-import.mjs          → importa tudo
 *   node rd-import.mjs 200      → importa até 200 por entidade (teste)
 */

import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';

const prisma = new PrismaClient();
const LIMIT = parseInt(process.argv[2]) || 0;
const BATCH = 500;

const load = (name) => {
  const data = JSON.parse(readFileSync(`./rd-data/${name}.json`, 'utf-8'));
  return LIMIT ? data.slice(0, LIMIT) : data;
};

// ─── Helpers ────────────────────────────────────────────────────────────────

const safe = (v) => v || null;
const safeDate = (v) => v ? new Date(v) : null;
const safeDec = (v) => v != null ? String(v) : '0';

async function batchCreate(model, records) {
  for (let i = 0; i < records.length; i += BATCH) {
    const chunk = records.slice(i, i + BATCH);
    await model.createMany({ data: chunk, skipDuplicates: true });
  }
}

async function batchUpsert(model, records, idField = 'id') {
  for (const record of records) {
    const id = record[idField];
    await model.upsert({
      where: { [idField]: id },
      create: record,
      update: {}, // não sobrescreve — mantém dados da plataforma
    });
  }
}

/** Parseia uma URL e extrai UTMs + landing page */
function parseUrlTracking(rawUrl) {
  if (!rawUrl) return null;
  try {
    const url = new URL(rawUrl);
    const utmSource = url.searchParams.get('utm_source');
    const utmMedium = url.searchParams.get('utm_medium');
    const utmCampaign = url.searchParams.get('utm_campaign');
    const utmTerm = url.searchParams.get('utm_term');
    const utmContent = url.searchParams.get('utm_content');
    const landingPage = url.origin + url.pathname;
    // Só retorna se tem algo útil
    if (!utmSource && !landingPage) return null;
    return { utmSource, utmMedium, utmCampaign, utmTerm, utmContent, landingPage };
  } catch {
    return null;
  }
}

let stats = {};
const track = (name, n) => { stats[name] = n; };

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const label = LIMIT ? `LIMIT=${LIMIT}` : 'COMPLETA';
  console.log(`\n═══ RD Station → Supabase (${label}) ═══\n`);

  // ════════════════════════════════════════════════════════════════════════════
  // FASE 1: UPSERT — Tabelas de configuração (adiciona novos, não apaga)
  // ════════════════════════════════════════════════════════════════════════════
  console.log('── FASE 1: Configuração (upsert) ──\n');

  // ── 1. Users ──
  const users = load('users');
  const existingUsers = await prisma.user.findMany({ select: { id: true } });
  const existingUserIds = new Set(existingUsers.map(u => u.id));
  const newUsers = users.filter(u => !existingUserIds.has(u._id));
  if (newUsers.length > 0) {
    await batchCreate(prisma.user, newUsers.map(u => ({
      id: u._id,
      email: u.email,
      name: u.name,
      password: 'rd-import-placeholder',
      role: 'SELLER',
      isActive: u.active !== false,
      createdAt: safeDate(u.created_at) || new Date(),
      updatedAt: safeDate(u.updated_at) || new Date(),
    })));
  }
  track('users', `${newUsers.length} novos / ${existingUserIds.size} existentes`);
  console.log(`[1/14] Users: +${newUsers.length} novos (${existingUserIds.size} já existiam)`);

  // ── 2. Pipelines + Stages ──
  const pipelines = load('pipelines');
  for (const p of pipelines) {
    await prisma.pipeline.upsert({
      where: { id: p.id },
      create: { id: p.id, name: p.name, isDefault: p.order === 1 },
      update: {}, // não sobrescreve
    });
  }

  const stages = pipelines.flatMap(p =>
    (p.deal_stages || []).map(s => ({
      id: s._id,
      name: s.name,
      order: s.order || 0,
      pipelineId: p.id,
    }))
  );
  for (const s of stages) {
    await prisma.pipelineStage.upsert({
      where: { id: s.id },
      create: s,
      update: {},
    });
  }
  track('pipelines', pipelines.length);
  track('stages', stages.length);
  console.log(`[2/14] Pipelines: ${pipelines.length}, Stages: ${stages.length} (upsert)`);

  // ── 3. Sources (dedup por nome) ──
  const sources = load('sources');
  const seenSrc = new Set();
  const srcData = sources.filter(s => {
    if (seenSrc.has(s.name)) return false;
    seenSrc.add(s.name);
    return true;
  }).map(s => ({ id: s._id, name: s.name }));
  // Source tem unique no name, precisa checar ambos
  for (const s of srcData) {
    const exists = await prisma.source.findFirst({
      where: { OR: [{ id: s.id }, { name: s.name }] },
    });
    if (!exists) {
      await prisma.source.create({ data: s });
    }
  }
  track('sources', srcData.length);
  console.log(`[3/14] Sources: ${srcData.length} (upsert)`);

  // ── 4. Lost Reasons (dedup por nome) ──
  const reasons = load('lost_reasons');
  const seenLR = new Set();
  const lrData = reasons.filter(r => {
    if (seenLR.has(r.name)) return false;
    seenLR.add(r.name);
    return true;
  }).map(r => ({ id: r._id, name: r.name }));
  for (const r of lrData) {
    const exists = await prisma.lostReason.findFirst({
      where: { OR: [{ id: r.id }, { name: r.name }] },
    });
    if (!exists) {
      await prisma.lostReason.create({ data: r });
    }
  }
  track('lostReasons', lrData.length);
  console.log(`[4/14] Lost Reasons: ${lrData.length} (upsert)`);

  // ── 5. Campaigns ──
  const campaigns = load('campaigns');
  for (const c of campaigns) {
    await prisma.campaign.upsert({
      where: { id: c._id },
      create: { id: c._id, name: c.name, description: safe(c.description) },
      update: {},
    });
  }
  track('campaigns', campaigns.length);
  console.log(`[5/14] Campaigns: ${campaigns.length} (upsert)`);

  // ── 6. Products ──
  const products = load('products');
  for (const p of products) {
    await prisma.product.upsert({
      where: { id: p._id },
      create: {
        id: p._id,
        name: p.name,
        description: safe(p.description),
        price: safeDec(p.base_price),
        isActive: p.visible !== false,
      },
      update: {},
    });
  }
  track('products', products.length);
  console.log(`[6/14] Products: ${products.length} (upsert)`);

  // ── 7. Custom Fields ──
  const cf = JSON.parse(readFileSync('./rd-data/custom_fields.json', 'utf-8'));
  const typeMap = { text: 'TEXT', number: 'NUMBER', date: 'DATE', option: 'SELECT', multiple_choice: 'MULTISELECT' };
  const entityMap = { deal: 'DEAL', contact: 'CONTACT', organization: 'ORGANIZATION' };

  // Dedup por ID (o JSON do RD repete campos entre seções deal/contact/organization)
  const cfSeen = new Set();
  const cfData = [];
  for (const [entity, fields] of Object.entries(cf)) {
    for (const f of fields) {
      if (cfSeen.has(f._id)) continue;
      cfSeen.add(f._id);
      cfData.push({
        id: f._id,
        name: f.label,
        fieldType: typeMap[f.type] || 'TEXT',
        entity: entityMap[f.for] || entityMap[entity] || 'DEAL',
        isRequired: f.required || false,
      });
    }
  }
  for (const field of cfData) {
    await prisma.customField.upsert({
      where: { id: field.id },
      create: field,
      update: {},
    });
  }
  track('customFields', cfData.length);
  console.log(`[7/14] Custom Fields: ${cfData.length} (upsert)`);

  // ════════════════════════════════════════════════════════════════════════════
  // FASE 2: TRUNCATE + REIMPORTA — Apenas tabelas de dados operacionais
  // ════════════════════════════════════════════════════════════════════════════
  console.log('\n── FASE 2: Dados operacionais (limpa e reimporta) ──\n');

  console.log('Limpando tabelas de dados...');
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "Activity", "CustomFieldValue", "DealProduct", "DealContact",
      "Task", "Deal", "LeadTracking", "Contact", "Organization"
    CASCADE
  `);
  console.log('  OK\n');

  // ── 8. Organizations ──
  const orgs = load('organizations');
  await batchCreate(prisma.organization, orgs.map(o => ({
    id: o._id,
    name: o.name || 'Sem nome',
    website: safe(o.url),
    address: safe(o.address),
    notes: safe(o.resume),
    segment: o.organization_segments?.[0]?.name || null,
    createdAt: safeDate(o.created_at) || new Date(),
    updatedAt: safeDate(o.updated_at) || new Date(),
  })));
  track('organizations', orgs.length);
  console.log(`[8/14] Organizations: ${orgs.length}`);

  // ── 9. Contacts ──
  const orgSet = new Set(orgs.map(o => o._id));
  const contacts = load('contacts');
  await batchCreate(prisma.contact, contacts.map(c => ({
    id: c._id,
    name: (c.name || 'Sem nome').trim(),
    email: c.emails?.[0]?.email || null,
    phone: c.phones?.[0]?.phone || null,
    position: safe(c.title),
    birthday: safeDate(c.birthday),
    notes: safe(c.notes),
    organizationId: c.organization_id && orgSet.has(c.organization_id) ? c.organization_id : null,
    createdAt: safeDate(c.created_at) || new Date(),
    updatedAt: safeDate(c.updated_at) || new Date(),
  })));
  track('contacts', contacts.length);
  console.log(`[9/14] Contacts: ${contacts.length}`);

  // ── 10. Deals ──
  const deals = load('deals');

  // Mapa deal → contatos (via contacts.json)
  const allContacts = JSON.parse(readFileSync('./rd-data/contacts.json', 'utf-8'));
  const contactSet = new Set(contacts.map(c => c._id));
  const dealContactMap = new Map();
  for (const c of allContacts) {
    if (!contactSet.has(c._id)) continue;
    for (const d of (c.deals || [])) {
      const did = d._id || d.id;
      if (!dealContactMap.has(did)) dealContactMap.set(did, []);
      dealContactMap.get(did).push(c._id);
    }
  }

  // Buscar IDs existentes nas tabelas de config para validar FKs
  const allUsers = await prisma.user.findMany({ select: { id: true } });
  const userSet = new Set(allUsers.map(u => u.id));
  const allStages = await prisma.pipelineStage.findMany({ select: { id: true, pipelineId: true } });
  const stageSet = new Set(allStages.map(s => s.id));
  const stageToPipeline = new Map(allStages.map(s => [s.id, s.pipelineId]));
  const allSources = await prisma.source.findMany({ select: { id: true } });
  const sourceSet = new Set(allSources.map(s => s.id));
  const allReasons = await prisma.lostReason.findMany({ select: { id: true } });
  const reasonSet = new Set(allReasons.map(r => r.id));
  const allCampaigns = await prisma.campaign.findMany({ select: { id: true } });
  const campaignSet = new Set(allCampaigns.map(c => c.id));
  const allProducts = await prisma.product.findMany({ select: { id: true } });
  const productSet = new Set(allProducts.map(p => p.id));
  const allPipelines = await prisma.pipeline.findMany({ select: { id: true } });

  const fallbackUser = allUsers[0]?.id;
  const fallbackStage = allStages[0]?.id;
  const fallbackPipeline = allPipelines[0]?.id;

  if (!fallbackUser || !fallbackStage || !fallbackPipeline) {
    throw new Error('Faltam dados de config (User/Stage/Pipeline). Rode o import ao menos uma vez com as tabelas de config.');
  }

  const dealRows = deals.map(d => {
    const userId = d.user?._id && userSet.has(d.user._id) ? d.user._id : fallbackUser;
    const stageId = d.deal_stage?._id && stageSet.has(d.deal_stage._id) ? d.deal_stage._id : fallbackStage;
    const pipelineId = stageToPipeline.get(stageId) || fallbackPipeline;
    const dContacts = dealContactMap.get(d._id) || [];

    // Extrair contaAzulCode dos custom fields
    let contaAzulCode = null;
    if (d.deal_custom_fields) {
      const caField = d.deal_custom_fields.find(f =>
        f.custom_field?.label === 'Código Conta Azul' && f.value
      );
      if (caField) contaAzulCode = String(caField.value);
    }

    return {
      id: d._id,
      title: d.name || 'Sem título',
      value: safeDec(d.amount_total),
      expectedCloseDate: safeDate(d.prediction_date),
      closedAt: safeDate(d.closed_at),
      status: d.win === true ? 'WON' : d.win === false ? 'LOST' : 'OPEN',
      contaAzulCode,
      pipelineId,
      stageId,
      userId,
      contactId: dContacts[0] || null,
      organizationId: d.organization?._id && orgSet.has(d.organization._id) ? d.organization._id : null,
      sourceId: d.deal_source?._id && sourceSet.has(d.deal_source._id) ? d.deal_source._id : null,
      lostReasonId: d.deal_lost_reason?._id && reasonSet.has(d.deal_lost_reason._id) ? d.deal_lost_reason._id : null,
      campaignId: d.campaign?._id && campaignSet.has(d.campaign._id) ? d.campaign._id : null,
      createdAt: safeDate(d.created_at) || new Date(),
      updatedAt: safeDate(d.updated_at) || new Date(),
    };
  });
  await batchCreate(prisma.deal, dealRows);
  track('deals', deals.length);
  console.log(`[10/14] Deals: ${deals.length}`);

  // DealContacts
  const dealSet = new Set(deals.map(d => d._id));
  const dcRows = [];
  for (const [dealId, cIds] of dealContactMap) {
    if (!dealSet.has(dealId)) continue;
    cIds.forEach((cId, i) => {
      dcRows.push({ dealId, contactId: cId, isPrimary: i === 0 });
    });
  }
  await batchCreate(prisma.dealContact, dcRows);
  track('dealContacts', dcRows.length);

  // DealProducts
  const dpRows = deals.flatMap(d =>
    (d.deal_products || [])
      .filter(dp => productSet.has(dp.product_id))
      .map(dp => ({
        dealId: d._id,
        productId: dp.product_id,
        quantity: dp.amount || 1,
        unitPrice: safeDec(dp.price),
        discount: safeDec(dp.discount),
      }))
  );
  await batchCreate(prisma.dealProduct, dpRows);
  track('dealProducts', dpRows.length);

  // CustomFieldValues (deals)
  const cfSet = new Set(cfData.map(f => f.id));
  const cfvRows = deals.flatMap(d =>
    (d.deal_custom_fields || [])
      .filter(f => f.value && cfSet.has(f.custom_field_id))
      .map(f => ({
        entityId: d._id,
        entityType: 'DEAL',
        value: String(f.value).slice(0, 2000),
        customFieldId: f.custom_field_id,
      }))
  );
  await batchCreate(prisma.customFieldValue, cfvRows);
  track('dealCustomFields', cfvRows.length);
  console.log(`  DealContacts: ${dcRows.length}, DealProducts: ${dpRows.length}, CustomFields: ${cfvRows.length}`);

  // ── 11. LeadTracking — Parseia UTMs das URLs + custom fields de tráfego ──
  const URL_FIELD_ID = '65dcf5d05e25cc000ff48df5'; // custom field "URL" (deal)
  const CF_SOURCE = '65cf61ff025af9000d1beeee';     // Source Tráfego
  const CF_SOURCE1 = '65d90d9104c3c80012ec16c4';    // Source tráfego1
  const CF_CAMPAIGN = '65cf621d56b1e40014b44121';    // Campanha Tráfego
  const CF_MEDIUM = '65cf622f938d93000de637be';      // Medium Tráfego
  const CF_GCLID = '66266134156ef9000e4d9f65';       // gclid
  const CF_FORM_GCLID = '66266156ad3a03001212650e';  // form_gclid
  const CF_FONTE_ADS = '65085690b9ad242c06eed80b';   // Fonte: Ads

  function getCfVal(cfs, id) {
    const f = (cfs || []).find(x => x.custom_field_id === id);
    return f?.value || null;
  }

  const leadTrackingRows = [];
  const contactsTracked = new Set(); // evita duplicar por contato

  for (const d of deals) {
    const dContacts = dealContactMap.get(d._id) || [];
    const contactId = dContacts[0];
    if (!contactId || contactsTracked.has(contactId)) continue;

    const cfs = d.deal_custom_fields || [];

    // 1. Tentar URL primeiro
    const urlField = cfs.find(f => f.custom_field_id === URL_FIELD_ID && f.value);
    const fromUrl = urlField ? parseUrlTracking(urlField.value) : null;

    // 2. Custom fields de tráfego como fallback
    const sourceTrafego = getCfVal(cfs, CF_SOURCE) || getCfVal(cfs, CF_SOURCE1);
    const campanhaTrafego = getCfVal(cfs, CF_CAMPAIGN);
    const mediumTrafego = getCfVal(cfs, CF_MEDIUM);
    const gclid = getCfVal(cfs, CF_GCLID) || getCfVal(cfs, CF_FORM_GCLID);
    const fonteAds = getCfVal(cfs, CF_FONTE_ADS);
    const dealSource = d.deal_source?.name !== 'Desconhecido' ? d.deal_source?.name : null;
    const dealCampaign = d.campaign?.name || null;

    // 3. Merge: URL tem prioridade, depois CFs, depois deal nativo
    const row = {
      contactId,
      utmSource: fromUrl?.utmSource || sourceTrafego || fonteAds || dealSource || null,
      utmMedium: fromUrl?.utmMedium || mediumTrafego || null,
      utmCampaign: fromUrl?.utmCampaign || campanhaTrafego || dealCampaign || null,
      utmTerm: fromUrl?.utmTerm || null,
      utmContent: fromUrl?.utmContent || null,
      landingPage: fromUrl?.landingPage || (urlField?.value || null),
      referrer: gclid ? `gclid:${gclid}` : null,
      ip: null,
      userAgent: null,
      createdAt: safeDate(d.created_at) || new Date(),
    };

    // Só cria se tem algum dado útil
    if (!row.utmSource && !row.utmMedium && !row.utmCampaign && !row.landingPage) continue;

    contactsTracked.add(contactId);
    leadTrackingRows.push(row);
  }

  // Também parseia URLs das organizations (muitas têm a LP como "url")
  for (const o of orgs) {
    if (!o.url) continue;
    const tracking = parseUrlTracking(o.url);
    if (!tracking) continue;

    // Buscar contatos vinculados a esta org
    const orgContacts = contacts.filter(c => c.organization_id === o._id);
    for (const c of orgContacts) {
      if (contactsTracked.has(c._id)) continue;
      contactsTracked.add(c._id);

      leadTrackingRows.push({
        contactId: c._id,
        landingPage: tracking.landingPage,
        utmSource: tracking.utmSource,
        utmMedium: tracking.utmMedium,
        utmCampaign: tracking.utmCampaign,
        utmTerm: tracking.utmTerm,
        utmContent: tracking.utmContent,
        referrer: null,
        ip: null,
        userAgent: null,
        createdAt: safeDate(o.created_at) || new Date(),
      });
    }
  }

  await batchCreate(prisma.leadTracking, leadTrackingRows);
  track('leadTracking', leadTrackingRows.length);
  console.log(`[11/14] LeadTracking: ${leadTrackingRows.length} (UTMs parseados de URLs)`);

  // ── 12. CustomFieldValues (contacts) — Source/Campanha/Medium Tráfego ──
  // Extrai custom fields de contato que vêm dentro dos deals no RD
  const CONTACT_CF_IDS = {
    '65cf61ff025af9000d1beeee': true, // Source Tráfego
    '65cf621d56b1e40014b44121': true, // Campanha Tráfego
    '65cf622f938d93000de637be': true, // Medium Tráfego
    '65d90d9104c3c80012ec16c4': true, // Source tráfego1
    '65dcbb02ed2a80001652eb8a': true, // URL (contact)
    '68642cd9659d410014a71311': true, // Faturamento mensal
    '68658fe90de0ec0021eedb26': true, // Nome da empresa
  };

  const contactCfvRows = [];
  const contactCfSeen = new Set(); // evita duplicar entityId+customFieldId

  for (const d of deals) {
    if (!d.deal_custom_fields) continue;
    const dContacts = dealContactMap.get(d._id) || [];
    const contactId = dContacts[0];
    if (!contactId) continue;

    for (const f of d.deal_custom_fields) {
      if (!f.value || !CONTACT_CF_IDS[f.custom_field_id]) continue;
      if (!cfSet.has(f.custom_field_id)) continue;
      const key = `${contactId}:${f.custom_field_id}`;
      if (contactCfSeen.has(key)) continue;
      contactCfSeen.add(key);

      contactCfvRows.push({
        entityId: contactId,
        entityType: 'CONTACT',
        value: String(f.value).slice(0, 2000),
        customFieldId: f.custom_field_id,
        contactId,
      });
    }
  }

  await batchCreate(prisma.customFieldValue, contactCfvRows);
  track('contactCustomFields', contactCfvRows.length);
  console.log(`[12/14] Contact CustomFields: ${contactCfvRows.length}`);

  // ── 13. Tasks ──
  const tasks = load('tasks');
  const taskTypeMap = { call: 'CALL', email: 'EMAIL', meeting: 'MEETING', visit: 'VISIT' };
  const taskRows = tasks.map(t => ({
    id: t._id,
    title: t.subject || 'Tarefa',
    description: safe(t.notes),
    type: taskTypeMap[t.type] || 'OTHER',
    dueDate: safeDate(t.date),
    completedAt: safeDate(t.done_date),
    status: t.done ? 'COMPLETED' : t.status === 'expired' ? 'OVERDUE' : 'PENDING',
    userId: t.user_ids?.[0] && userSet.has(t.user_ids[0]) ? t.user_ids[0] : fallbackUser,
    dealId: t.deal_id && dealSet.has(t.deal_id) ? t.deal_id : null,
    createdAt: safeDate(t.created_at) || new Date(),
    updatedAt: safeDate(t.updated_at) || new Date(),
  }));
  await batchCreate(prisma.task, taskRows);
  track('tasks', taskRows.length);
  console.log(`[13/14] Tasks: ${taskRows.length}`);

  // ── 14. Activities ──
  const actRows = deals
    .filter(d => d.win !== null || d.closed_at)
    .map(d => {
      const userId = d.user?._id && userSet.has(d.user._id) ? d.user._id : fallbackUser;
      if (d.win === true) return { type: 'STATUS_CHANGE', content: `Deal GANHO em ${d.closed_at}`, userId, dealId: d._id, createdAt: safeDate(d.closed_at) || new Date() };
      if (d.win === false) return { type: 'STATUS_CHANGE', content: `Deal PERDIDO (${d.deal_lost_reason?.name || '?'}) em ${d.closed_at}`, userId, dealId: d._id, createdAt: safeDate(d.closed_at) || new Date() };
      return { type: 'DEAL_CREATED', content: 'Importado do RD Station', userId, dealId: d._id, createdAt: safeDate(d.created_at) || new Date() };
    });
  await batchCreate(prisma.activity, actRows);
  track('activities', actRows.length);
  console.log(`[14/14] Activities: ${actRows.length}`);

  // ── Resumo ──
  console.log(`\n═══ IMPORTAÇÃO ${label} CONCLUÍDA ═══\n`);
  console.log('  CONFIGURAÇÃO (upsert — preservou dados da plataforma):');
  for (const k of ['users', 'pipelines', 'stages', 'sources', 'lostReasons', 'campaigns', 'products', 'customFields']) {
    if (stats[k] != null) console.log(`    ${k}: ${stats[k]}`);
  }
  console.log('\n  DADOS (truncate + reimportação):');
  for (const k of ['organizations', 'contacts', 'deals', 'dealContacts', 'dealProducts', 'dealCustomFields', 'contactCustomFields', 'leadTracking', 'tasks', 'activities']) {
    if (stats[k] != null) console.log(`    ${k}: ${stats[k]}`);
  }
  console.log('\n  INTOCADO: WhatsApp, Email Marketing, Automações, Tags, Segmentos,');
  console.log('           Webhooks, Calendly, LeadScore, Templates, Unsubscribes');

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('\n❌ ERRO:', err.message);
  if (err.code) console.error('  Código:', err.code);
  if (err.meta) console.error('  Meta:', JSON.stringify(err.meta));
  await prisma.$disconnect();
  process.exit(1);
});
