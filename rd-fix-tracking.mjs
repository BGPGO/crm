/**
 * Fix: Preenche LeadTracking faltante para leads importados do RD
 *
 * SEGURO: Apenas ADICIONA LeadTracking para contatos que NÃO têm.
 * NÃO modifica nenhuma outra tabela. NÃO toca em leads criados via webhook.
 *
 * Fontes de dados (em ordem de prioridade):
 * 1. URL do deal custom field (parseia UTMs)
 * 2. "Source Tráfego" custom field
 * 3. "Campanha Tráfego" custom field
 * 4. "Medium Tráfego" custom field
 * 5. deal_source (fonte do deal)
 * 6. campaign (campanha do deal)
 *
 * Uso: DATABASE_URL="postgresql://..." node rd-fix-tracking.mjs [--dry-run]
 */

import { readFileSync } from 'fs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');

// Custom field IDs no RD
const CF = {
  URL_DEAL: '65dcf5d05e25cc000ff48df5',
  URL_CONTACT: '65dcbb02ed2a80001652eb8a',
  SOURCE_TRAFEGO: '65cf61ff025af9000d1beeee',
  CAMPANHA_TRAFEGO: '65cf621d56b1e40014b44121',
  MEDIUM_TRAFEGO: '65cf622f938d93000de637be',
  SOURCE_TRAFEGO1: '65d90d9104c3c80012ec16c4',
  GCLID: '66266134156ef9000e4d9f65',
  FORM_GCLID: '66266156ad3a03001212650e',
  FONTE_ADS: '65085690b9ad242c06eed80b',
};

function parseUrlTracking(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return {
      utmSource: url.searchParams.get('utm_source'),
      utmMedium: url.searchParams.get('utm_medium'),
      utmCampaign: url.searchParams.get('utm_campaign'),
      utmTerm: url.searchParams.get('utm_term'),
      utmContent: url.searchParams.get('utm_content'),
      landingPage: url.origin + url.pathname,
    };
  } catch {
    return null;
  }
}

function getCfValue(customFields, cfId) {
  if (!customFields) return null;
  const field = customFields.find(f => f.custom_field_id === cfId);
  return field?.value || null;
}

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log(' Fix LeadTracking — Preenche dados faltantes');
  console.log(DRY_RUN ? ' MODO: DRY RUN (não grava nada)' : ' MODO: GRAVAÇÃO REAL');
  console.log('═══════════════════════════════════════════\n');

  // 1. Carregar dados do RD (JSONs já extraídos)
  let deals, contacts;
  try {
    deals = JSON.parse(readFileSync('./rd-data/deals.json', 'utf-8'));
    contacts = JSON.parse(readFileSync('./rd-data/contacts.json', 'utf-8'));
    console.log(`Dados carregados: ${deals.length} deals, ${contacts.length} contacts\n`);
  } catch {
    console.error('❌ Erro: rd-data/ não encontrado. Rode "node rd-extract.mjs" primeiro.');
    process.exit(1);
  }

  // 2. Buscar contatos que JÁ têm LeadTracking (para não duplicar)
  const existingTracking = await prisma.leadTracking.findMany({
    select: { contactId: true },
  });
  const hasTracking = new Set(existingTracking.map(t => t.contactId));
  console.log(`Contatos que já têm LeadTracking: ${hasTracking.size}`);

  // 3. Buscar contatos que existem no CRM (para não criar tracking órfão)
  const existingContacts = await prisma.contact.findMany({
    select: { id: true },
  });
  const contactExists = new Set(existingContacts.map(c => c.id));
  console.log(`Contatos no CRM: ${contactExists.size}\n`);

  // 4. Montar mapa email -> contactId no CRM (para linkar deals a contatos)
  const allCrmContacts = await prisma.contact.findMany({
    select: { id: true, email: true, phone: true, name: true },
  });
  const emailToContactId = new Map();
  const phoneToContactId = new Map();
  for (const c of allCrmContacts) {
    if (c.email) emailToContactId.set(c.email.toLowerCase(), c.id);
    if (c.phone) phoneToContactId.set(c.phone.replace(/\D/g, ''), c.id);
  }
  console.log(`Mapa de match: ${emailToContactId.size} emails, ${phoneToContactId.size} phones\n`);

  // Montar mapa deal -> contato CRM (match por email ou telefone)
  const dealContactMap = new Map();
  for (const d of deals) {
    if (!d.contacts?.length) continue;
    const rdContact = d.contacts[0];
    const email = rdContact.emails?.[0]?.email;
    const phone = rdContact.phones?.[0]?.phone?.replace(/\D/g, '');

    let contactId = null;
    if (email) contactId = emailToContactId.get(email.toLowerCase());
    if (!contactId && phone) contactId = phoneToContactId.get(phone);

    if (contactId) dealContactMap.set(d._id || d.id, contactId);
  }
  console.log(`Deals linkados a contatos CRM: ${dealContactMap.size}\n`);

  // 5. Para cada deal, tentar construir LeadTracking
  const toCreate = [];
  const processed = new Set();
  let skippedHasTracking = 0;
  let skippedNoContact = 0;
  let skippedNoData = 0;

  for (const d of deals) {
    const contactId = dealContactMap.get(d._id || d.id);
    if (!contactId) continue;
    if (!contactExists.has(contactId)) { skippedNoContact++; continue; }
    if (hasTracking.has(contactId)) { skippedHasTracking++; continue; }
    if (processed.has(contactId)) continue;
    processed.add(contactId);

    const cfs = d.deal_custom_fields || [];

    // Tentar extrair da URL primeiro
    const urlValue = getCfValue(cfs, CF.URL_DEAL) || getCfValue(cfs, CF.URL_CONTACT);
    const fromUrl = urlValue ? parseUrlTracking(urlValue) : null;

    // Custom fields de tráfego
    const sourceTrafego = getCfValue(cfs, CF.SOURCE_TRAFEGO) || getCfValue(cfs, CF.SOURCE_TRAFEGO1);
    const campanhaTrafego = getCfValue(cfs, CF.CAMPANHA_TRAFEGO);
    const mediumTrafego = getCfValue(cfs, CF.MEDIUM_TRAFEGO);
    const gclid = getCfValue(cfs, CF.GCLID) || getCfValue(cfs, CF.FORM_GCLID);
    const fonteAds = getCfValue(cfs, CF.FONTE_ADS);

    // Deal source e campaign nativos
    const dealSource = d.deal_source?.name !== 'Desconhecido' ? d.deal_source?.name : null;
    const dealCampaign = d.campaign?.name || null;

    // Monta o tracking com fallbacks
    const tracking = {
      contactId,
      utmSource: fromUrl?.utmSource || sourceTrafego || fonteAds || dealSource || null,
      utmMedium: fromUrl?.utmMedium || mediumTrafego || null,
      utmCampaign: fromUrl?.utmCampaign || campanhaTrafego || dealCampaign || null,
      utmTerm: fromUrl?.utmTerm || null,
      utmContent: fromUrl?.utmContent || null,
      landingPage: fromUrl?.landingPage || urlValue || null,
      referrer: gclid ? `gclid:${gclid}` : null,
      ip: null,
      userAgent: null,
    };

    // Só cria se tem pelo menos algum dado útil
    const hasData = tracking.utmSource || tracking.utmMedium || tracking.utmCampaign || tracking.landingPage;
    if (!hasData) { skippedNoData++; continue; }

    toCreate.push(tracking);
  }

  console.log('═══════════════════════════════════════════');
  console.log(` Resultado da análise:`);
  console.log(`   LeadTracking a criar: ${toCreate.length}`);
  console.log(`   Já tinham tracking:   ${skippedHasTracking}`);
  console.log(`   Contato não existe:   ${skippedNoContact}`);
  console.log(`   Sem dados de tráfego: ${skippedNoData}`);
  console.log('═══════════════════════════════════════════\n');

  if (toCreate.length === 0) {
    console.log('✅ Nada a fazer — todos os contatos já estão atualizados.');
    await prisma.$disconnect();
    return;
  }

  // Amostra do que vai criar
  console.log('Amostra (primeiros 5):');
  toCreate.slice(0, 5).forEach((t, i) => {
    console.log(`  ${i + 1}. contact=${t.contactId.slice(0, 12)}... | source=${t.utmSource || '—'} | medium=${t.utmMedium || '—'} | campaign=${t.utmCampaign || '—'} | lp=${(t.landingPage || '—').slice(0, 60)}`);
  });
  console.log('');

  if (DRY_RUN) {
    console.log('🏁 DRY RUN — nada foi gravado. Rode sem --dry-run para aplicar.');
  } else {
    // Criar em lotes de 100
    let created = 0;
    for (let i = 0; i < toCreate.length; i += 100) {
      const batch = toCreate.slice(i, i + 100);
      await prisma.leadTracking.createMany({ data: batch, skipDuplicates: true });
      created += batch.length;
      console.log(`  Criados: ${created}/${toCreate.length}`);
    }
    console.log(`\n✅ ${created} LeadTracking criados com sucesso!`);
  }

  await prisma.$disconnect();
}

main().catch(err => {
  console.error('\n❌ ERRO:', err.message);
  process.exit(1);
});
