/**
 * Extração COMPLETA do RD Station CRM → arquivos JSON
 *
 * SOMENTE LEITURA — apenas GET requests, zero escrita no RD.
 *
 * Uso: node rd-extract.mjs
 */

import { writeFileSync, mkdirSync } from 'fs';

const TOKEN = '69b2bc03765e3600164ba953';
const BASE_URL = 'https://crm.rdstation.com/api/v1';
const OUTPUT_DIR = './rd-data';
const LIMIT = 200; // máximo permitido pela API

mkdirSync(OUTPUT_DIR, { recursive: true });

// ─── Rate limit handling ────────────────────────────────────────────────────

async function safeFetch(url) {
  const maxRetries = 5;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const res = await fetch(url);

    if (res.status === 429) {
      const waitSec = attempt * 30; // backoff crescente: 30s, 60s, 90s...
      console.warn(`  ⏳ Rate limit atingido, aguardando ${waitSec}s (tentativa ${attempt}/${maxRetries})...`);
      await new Promise(r => setTimeout(r, waitSec * 1000));
      continue;
    }

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`HTTP ${res.status} em ${url}: ${body}`);
    }

    return res.json();
  }
  throw new Error(`Rate limit persistente após ${maxRetries} tentativas: ${url}`);
}

// ─── Paginação genérica ─────────────────────────────────────────────────────

async function fetchAll(endpoint, params = {}) {
  const items = [];
  let page = 1;

  while (true) {
    const qs = new URLSearchParams({
      token: TOKEN,
      page: String(page),
      limit: String(LIMIT),
      ...params,
    });

    const url = `${BASE_URL}/${endpoint}?${qs}`;
    console.log(`  GET ${endpoint} page=${page}...`);

    const data = await safeFetch(url);

    // A API retorna formatos diferentes dependendo do endpoint
    if (Array.isArray(data)) {
      items.push(...data);
      break; // endpoints que retornam array direto não paginam
    }

    // Formato paginado: { deals: [...], has_more: true, total: N }
    // O nome da chave varia por endpoint
    const keys = Object.keys(data).filter(k => Array.isArray(data[k]));
    if (keys.length > 0) {
      const records = data[keys[0]];
      items.push(...records);

      if (!data.has_more || records.length < LIMIT) {
        break;
      }
    } else {
      // Resposta sem array — provavelmente objeto único
      items.push(data);
      break;
    }

    page++;
  }

  return items;
}

// ─── Extração simples (sem paginação) ───────────────────────────────────────

async function fetchSimple(endpoint, params = {}) {
  const qs = new URLSearchParams({ token: TOKEN, ...params });
  const url = `${BASE_URL}/${endpoint}?${qs}`;
  console.log(`  GET ${endpoint}...`);
  return safeFetch(url);
}

// ─── Salvar JSON ────────────────────────────────────────────────────────────

function save(name, data) {
  const path = `${OUTPUT_DIR}/${name}.json`;
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8');
  const count = Array.isArray(data) ? data.length : 1;
  console.log(`  ✅ ${name}.json — ${count} registros\n`);
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log(' RD Station CRM → Extração (SOMENTE GET)');
  console.log('═══════════════════════════════════════════\n');

  // 1. Verificar token
  console.log('[1/14] Verificando token...');
  const tokenCheck = await fetchSimple('token/check');
  console.log(`  Token válido! Usuário: ${tokenCheck.name || tokenCheck.email || 'OK'}\n`);

  // 2. Usuários
  console.log('[2/14] Extraindo usuários...');
  const users = await fetchAll('users');
  save('users', users);

  // 3. Teams
  console.log('[3/14] Extraindo equipes...');
  const teams = await fetchAll('teams');
  save('teams', teams);

  // 4. Pipelines
  console.log('[4/14] Extraindo pipelines...');
  const pipelines = await fetchAll('deal_pipelines');
  save('pipelines', pipelines);

  // 5. Stages
  console.log('[5/14] Extraindo etapas do funil...');
  const stages = await fetchAll('deal_stages');
  save('stages', stages);

  // 6. Sources
  console.log('[6/14] Extraindo fontes...');
  const sources = await fetchAll('deal_sources');
  save('sources', sources);

  // 7. Lost reasons
  console.log('[7/14] Extraindo motivos de perda...');
  const lostReasons = await fetchAll('deal_lost_reasons');
  save('lost_reasons', lostReasons);

  // 8. Campaigns
  console.log('[8/14] Extraindo campanhas...');
  const campaigns = await fetchAll('campaigns');
  save('campaigns', campaigns);

  // 9. Products
  console.log('[9/14] Extraindo produtos...');
  const products = await fetchAll('products');
  save('products', products);

  // 10. Custom fields (deal, contact, organization)
  console.log('[10/14] Extraindo campos personalizados...');
  const cfDeal = await fetchSimple('custom_fields', { option: 'deal' });
  const cfContact = await fetchSimple('custom_fields', { option: 'contact' });
  const cfOrg = await fetchSimple('custom_fields', { option: 'organization' });
  const customFields = {
    deal: Array.isArray(cfDeal) ? cfDeal : cfDeal.custom_fields || [],
    contact: Array.isArray(cfContact) ? cfContact : cfContact.custom_fields || [],
    organization: Array.isArray(cfOrg) ? cfOrg : cfOrg.custom_fields || [],
  };
  save('custom_fields', customFields);

  // 11. Organizations
  console.log('[11/14] Extraindo empresas...');
  const organizations = await fetchAll('organizations');
  save('organizations', organizations);

  // 12. Contacts
  console.log('[12/14] Extraindo contatos...');
  const contacts = await fetchAll('contacts');
  save('contacts', contacts);

  // 13. Deals (o mais importante)
  console.log('[13/14] Extraindo negociações...');
  const deals = await fetchAll('deals');
  save('deals', deals);

  // 14. Tasks
  console.log('[14/14] Extraindo tarefas...');
  const tasks = await fetchAll('tasks');
  save('tasks', tasks);

  // Resumo
  console.log('═══════════════════════════════════════════');
  console.log(' EXTRAÇÃO COMPLETA!');
  console.log('═══════════════════════════════════════════');
  console.log(`\n Dados salvos em: ${OUTPUT_DIR}/`);
  console.log(`\n Arquivos:`);
  console.log(`   - users.json          (${users.length})`);
  console.log(`   - teams.json          (${teams.length})`);
  console.log(`   - pipelines.json      (${pipelines.length})`);
  console.log(`   - stages.json         (${stages.length})`);
  console.log(`   - sources.json        (${sources.length})`);
  console.log(`   - lost_reasons.json   (${lostReasons.length})`);
  console.log(`   - campaigns.json      (${campaigns.length})`);
  console.log(`   - products.json       (${products.length})`);
  console.log(`   - custom_fields.json  (deal: ${customFields.deal.length}, contact: ${customFields.contact.length}, org: ${customFields.organization.length})`);
  console.log(`   - organizations.json  (${organizations.length})`);
  console.log(`   - contacts.json       (${contacts.length})`);
  console.log(`   - deals.json          (${deals.length})`);
  console.log(`   - tasks.json          (${tasks.length})`);
}

main().catch(err => {
  console.error('\n❌ ERRO:', err.message);
  process.exit(1);
});
