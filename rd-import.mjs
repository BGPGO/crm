/**
 * Importação dos dados extraídos do RD Station CRM → Supabase (via Prisma)
 *
 * Usa createMany em lotes para velocidade máxima.
 * Limpa o banco antes de importar (idempotente).
 *
 * Uso:
 *   node rd-import.mjs          → importa tudo
 *   node rd-import.mjs 200      → importa até 200 por entidade
 */

import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';

const prisma = new PrismaClient();
const LIMIT = parseInt(process.argv[2]) || 0; // 0 = sem limite
const BATCH = 500; // registros por createMany

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

let stats = {};
const track = (name, n) => { stats[name] = n; };

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const label = LIMIT ? `LIMIT=${LIMIT}` : 'COMPLETA';
  console.log(`\n═══ RD Station → Supabase (${label}) ═══\n`);

  // ── Limpar banco ──
  console.log('Limpando banco...');
  // Limpa apenas tabelas de dados do RD — NÃO limpa configs e features do CRM
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "Activity", "CustomFieldValue", "DealProduct", "DealContact",
      "Task", "Deal", "Contact", "Organization", "LeadTracking",
      "CustomField", "Product", "Campaign", "LostReason", "Source",
      "PipelineStage", "Pipeline", "User", "Team"
    CASCADE
  `);
  console.log('  OK\n');

  // ── 1. Users (todos, são poucos) ──
  const users = load('users');
  await batchCreate(prisma.user, users.map(u => ({
    id: u._id,
    email: u.email,
    name: u.name,
    password: 'rd-import-placeholder',
    role: 'SELLER',
    isActive: u.active !== false,
    createdAt: safeDate(u.created_at) || new Date(),
    updatedAt: safeDate(u.updated_at) || new Date(),
  })));
  track('users', users.length);
  console.log(`[1/12] Users: ${users.length}`);

  // ── 2. Pipelines + Stages ──
  const pipelines = load('pipelines');
  await batchCreate(prisma.pipeline, pipelines.map(p => ({
    id: p.id,
    name: p.name,
    isDefault: p.order === 1,
  })));

  const stages = pipelines.flatMap(p =>
    (p.deal_stages || []).map(s => ({
      id: s._id,
      name: s.name,
      order: s.order || 0,
      pipelineId: p.id,
    }))
  );
  await batchCreate(prisma.pipelineStage, stages);
  track('pipelines', pipelines.length);
  track('stages', stages.length);
  console.log(`[2/12] Pipelines: ${pipelines.length}, Stages: ${stages.length}`);

  // ── 3. Sources (dedup por nome) ──
  const sources = load('sources');
  const seenSrc = new Set();
  const srcData = sources.filter(s => {
    if (seenSrc.has(s.name)) return false;
    seenSrc.add(s.name);
    return true;
  }).map(s => ({ id: s._id, name: s.name }));
  await batchCreate(prisma.source, srcData);
  track('sources', srcData.length);
  console.log(`[3/12] Sources: ${srcData.length}`);

  // ── 4. Lost Reasons (dedup por nome) ──
  const reasons = load('lost_reasons');
  const seenLR = new Set();
  const lrData = reasons.filter(r => {
    if (seenLR.has(r.name)) return false;
    seenLR.add(r.name);
    return true;
  }).map(r => ({ id: r._id, name: r.name }));
  await batchCreate(prisma.lostReason, lrData);
  track('lostReasons', lrData.length);
  console.log(`[4/12] Lost Reasons: ${lrData.length}`);

  // ── 5. Campaigns ──
  const campaigns = load('campaigns');
  await batchCreate(prisma.campaign, campaigns.map(c => ({
    id: c._id,
    name: c.name,
    description: safe(c.description),
  })));
  track('campaigns', campaigns.length);
  console.log(`[5/12] Campaigns: ${campaigns.length}`);

  // ── 6. Products ──
  const products = load('products');
  await batchCreate(prisma.product, products.map(p => ({
    id: p._id,
    name: p.name,
    description: safe(p.description),
    price: safeDec(p.base_price),
    isActive: p.visible !== false,
  })));
  track('products', products.length);
  console.log(`[6/12] Products: ${products.length}`);

  // ── 7. Custom Fields ──
  const cf = JSON.parse(readFileSync('./rd-data/custom_fields.json', 'utf-8'));
  const typeMap = { text: 'TEXT', number: 'NUMBER', date: 'DATE', select: 'SELECT', multiselect: 'MULTISELECT' };
  const entityMap = { deal: 'DEAL', contact: 'CONTACT', organization: 'ORGANIZATION' };
  const cfData = Object.entries(cf).flatMap(([entity, fields]) =>
    fields.map(f => ({
      id: f._id,
      name: f.label,
      fieldType: typeMap[f.type] || 'TEXT',
      entity: entityMap[entity] || 'DEAL',
      isRequired: f.required || false,
    }))
  );
  await batchCreate(prisma.customField, cfData);
  track('customFields', cfData.length);
  console.log(`[7/12] Custom Fields: ${cfData.length}`);

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
  console.log(`[8/12] Organizations: ${orgs.length}`);

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
  console.log(`[9/12] Contacts: ${contacts.length}`);

  // ── 10. Deals ──
  const deals = load('deals');

  // Mapa deal → contatos (via contacts.json com lista completa)
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

  const userSet = new Set(users.map(u => u._id));
  const stageSet = new Set(stages.map(s => s.id));
  const stageToPipeline = new Map(stages.map(s => [s.id, s.pipelineId]));
  const sourceSet = new Set(srcData.map(s => s.id));
  const reasonSet = new Set(lrData.map(r => r.id));
  const campaignSet = new Set(campaigns.map(c => c._id));
  const fallbackUser = users[0]?._id;
  const fallbackStage = stages[0]?.id;
  const fallbackPipeline = pipelines[0]?.id;

  const dealRows = deals.map(d => {
    const userId = d.user?._id && userSet.has(d.user._id) ? d.user._id : fallbackUser;
    const stageId = d.deal_stage?._id && stageSet.has(d.deal_stage._id) ? d.deal_stage._id : fallbackStage;
    const pipelineId = stageToPipeline.get(stageId) || fallbackPipeline;
    const dContacts = dealContactMap.get(d._id) || [];

    return {
      id: d._id,
      title: d.name || 'Sem título',
      value: safeDec(d.amount_total),
      expectedCloseDate: safeDate(d.prediction_date),
      closedAt: safeDate(d.closed_at),
      status: d.win === true ? 'WON' : d.win === false ? 'LOST' : 'OPEN',
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
  console.log(`[10/12] Deals: ${deals.length}`);

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
  const productSet = new Set(products.map(p => p._id));
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

  // ── 11. Tasks ──
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
  console.log(`[11/12] Tasks: ${taskRows.length}`);

  // ── 12. Activities ──
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
  console.log(`[12/12] Activities: ${actRows.length}`);

  // ── Resumo ──
  console.log(`\n═══ IMPORTAÇÃO ${label} CONCLUÍDA ═══\n`);
  for (const [k, v] of Object.entries(stats)) {
    console.log(`  ${k}: ${v}`);
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('\n❌ ERRO:', err.message);
  await prisma.$disconnect();
  process.exit(1);
});
