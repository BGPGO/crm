/**
 * Seed: Importa leads e deals AIMO de um CSV (export do RD Station).
 *
 * CSV: TAB-separated, UTF-8, primeira linha é header.
 * Path padrão: ../../.aimo-migration/aimo.csv (a partir de packages/api)
 * Override via env: AIMO_CSV_PATH=/abs/path/to/file.csv
 *
 * Idempotente:
 *   - Contacts: upsert por email (skip se brand=BGP, merge inteligente se AIMO).
 *   - Deals:    skip se já existe Deal AIMO no mesmo pipeline+stage do contato.
 *   - Tag AIMO: aplica via skipDuplicates.
 *
 * Args CLI:
 *   --limit=5                 (default) importa só 5 linhas válidas
 *   --limit=all               importa tudo
 *   --dry-run                 (default ON) não escreve nada, só conta
 *   --no-dry-run              executa de fato
 *   --include-deals           cria Deals no Pipeline AIMO
 *   --no-deals                (default) só Contacts
 *
 * Defaults seguros: --limit=5 --dry-run --no-deals.
 *
 * Uso:
 *   tsx src/seeds/aimoLeadsImport.ts
 *   tsx src/seeds/aimoLeadsImport.ts --limit=all --no-dry-run --include-deals
 */

import * as fs from 'fs';
import * as path from 'path';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaClient, type Prisma } from '@prisma/client';

const prisma = new PrismaClient();

// ─── Config ─────────────────────────────────────────────────────────────────

const RESPONSIBLE_EMAIL = 'oliver@bertuzzipatrimonial.com.br';
const TAG_NAME = 'AIMO';

// Mapa "Etapa do funil de vendas no CRM" (RD) → stage do Pipeline AIMO
const STAGE_MAP: Record<string, string> = {
  LEAD: 'Lead',
  'CONTATO FEITO': 'Contato Feito',
  'MARCAR REUNIÃO': 'Marcar Reunião',
  'MARCAR REUNIAO': 'Marcar Reunião',
  'REUNIÃO AGENDADA': 'Reunião Agendada',
  'REUNIAO AGENDADA': 'Reunião Agendada',
  'PROPOSTA ENVIADA': 'Proposta Enviada',
  'CLIENTE DESLIGADO': 'Cliente Desligado',
};

// ─── CLI args ───────────────────────────────────────────────────────────────

interface Args {
  limit: number; // Number.POSITIVE_INFINITY = "all"
  dryRun: boolean;
  includeDeals: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { limit: 5, dryRun: true, includeDeals: false };

  for (const a of argv) {
    if (a.startsWith('--limit=')) {
      const v = a.slice('--limit='.length).trim().toLowerCase();
      if (v === 'all') args.limit = Number.POSITIVE_INFINITY;
      else {
        const n = parseInt(v, 10);
        if (!Number.isNaN(n) && n > 0) args.limit = n;
      }
    } else if (a === '--dry-run') {
      args.dryRun = true;
    } else if (a === '--no-dry-run') {
      args.dryRun = false;
    } else if (a === '--include-deals') {
      args.includeDeals = true;
    } else if (a === '--no-deals') {
      args.includeDeals = false;
    }
  }

  return args;
}

// ─── CSV parsing (TAB-separated, com aspas opcionais) ──────────────────────

function parseTsv(text: string): string[][] {
  // CSV é TAB-separated. Aspas duplas envolvem campos com tabs/quebras (raro).
  // Implementação simples e robusta o suficiente para o export do RD.
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === '\t') {
      cur.push(field);
      field = '';
      continue;
    }
    if (ch === '\r') continue;
    if (ch === '\n') {
      cur.push(field);
      rows.push(cur);
      cur = [];
      field = '';
      continue;
    }
    field += ch;
  }

  // último campo / última linha
  if (field.length > 0 || cur.length > 0) {
    cur.push(field);
    rows.push(cur);
  }

  return rows.filter((r) => r.some((c) => c && c.trim().length > 0));
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function clean(v: string | undefined): string | null {
  if (v == null) return null;
  const t = v.trim();
  if (t === '' || t === '""' || t === 'undefined' || t === 'null') return null;
  return t;
}

function parseValue(v: string | undefined): Decimal {
  const c = clean(v);
  if (!c) return new Decimal(0);
  // Aceita "1.234,56" (BR) ou "1234.56" (en)
  const norm = c.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(norm);
  if (Number.isNaN(n)) {
    const n2 = parseFloat(c);
    if (Number.isNaN(n2)) return new Decimal(0);
    return new Decimal(n2);
  }
  return new Decimal(n);
}

function mapStage(rdStage: string | null): string | null {
  if (!rdStage) return null;
  const upper = rdStage.trim().toUpperCase();
  return STAGE_MAP[upper] ?? null;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const startedAt = Date.now();
  const args = parseArgs(process.argv.slice(2));

  console.log('=== Import AIMO ===');
  console.log(
    `args: limit=${args.limit === Number.POSITIVE_INFINITY ? 'all' : args.limit} dryRun=${args.dryRun} includeDeals=${args.includeDeals}`,
  );

  // 1. Localizar CSV
  const csvPath =
    process.env.AIMO_CSV_PATH ??
    path.resolve(process.cwd(), '../../.aimo-migration/aimo.csv');

  if (!fs.existsSync(csvPath)) {
    console.error(`[aimoLeadsImport] CSV não encontrado: ${csvPath}`);
    console.error('Defina AIMO_CSV_PATH ou rode a partir de packages/api/.');
    process.exit(1);
  }
  console.log(`CSV: ${csvPath}`);

  // 2. Pré-requisitos
  const [aimoTag, aimoPipeline, responsibleUser] = await Promise.all([
    prisma.tag.findUnique({ where: { name: TAG_NAME } }),
    prisma.pipeline.findFirst({
      where: { brand: 'AIMO' },
      include: { stages: true },
    }),
    prisma.user.findUnique({ where: { email: RESPONSIBLE_EMAIL } }),
  ]);

  if (!aimoTag) {
    console.error(
      `[aimoLeadsImport] FALTA pré-requisito: Tag "${TAG_NAME}" não existe. Rode "npm run seed:aimo" antes.`,
    );
    process.exit(1);
  }
  if (!aimoPipeline) {
    console.error(
      `[aimoLeadsImport] FALTA pré-requisito: Pipeline brand=AIMO não existe. Rode "npm run seed:aimo" antes.`,
    );
    process.exit(1);
  }
  if (!responsibleUser) {
    console.error(
      `[aimoLeadsImport] FALTA pré-requisito: User com email "${RESPONSIBLE_EMAIL}" não existe.`,
    );
    process.exit(1);
  }

  const stageByName = new Map<string, string>();
  for (const s of aimoPipeline.stages) stageByName.set(s.name, s.id);

  // valida que todas as stages do mapa existem no pipeline
  const requiredStages = new Set([...Object.values(STAGE_MAP), 'Ganho Fechado']);
  const missing = [...requiredStages].filter((n) => !stageByName.has(n));
  if (missing.length > 0) {
    console.error(
      `[aimoLeadsImport] Pipeline AIMO está faltando stages: ${missing.join(', ')}`,
    );
    process.exit(1);
  }

  // 3. Parsear CSV
  const raw = fs.readFileSync(csvPath, 'utf8');
  const rows = parseTsv(raw);
  if (rows.length < 2) {
    console.error('[aimoLeadsImport] CSV vazio ou só com header.');
    process.exit(1);
  }

  const header = rows[0].map((h) => h.trim());
  const dataRows = rows.slice(1);

  const idx = (name: string): number => {
    const i = header.findIndex((h) => h === name);
    if (i < 0) {
      console.warn(`[aimoLeadsImport] coluna ausente no header: "${name}"`);
    }
    return i;
  };

  const COL = {
    email: idx('Email'),
    nome: idx('Nome'),
    telefone: idx('Telefone'),
    celular: idx('Celular'),
    cargo: idx('Cargo'),
    empresa: idx('Empresa'),
    cidade: idx('Cidade'),
    estagioFunilLead: idx('Estágio no funil'),
    origemPrimeira: idx('Origem da primeira conversão'),
    etapaCrm: idx('Etapa do funil de vendas no CRM (última atualização)'),
    motivoPerda: idx('Motivo de Perda no RD Station CRM'),
    valorTotal: idx('Valor total da Oportunidade no CRM (última atualização)'),
  };

  // 4. Stats
  let csvLines = dataRows.length;
  let skippedNoEmail = 0;
  let skippedBertuzzi = 0;
  let skippedCrossBrand = 0;
  let contactsCreated = 0;
  let contactsUpdated = 0;
  let dealsCreated = 0;
  let dealsSkipped = 0;
  const dealsByStage: Record<string, number> = {};

  // caches simples (sessão única)
  const orgCache = new Map<string, string>(); // name → id
  const sourceCache = new Map<string, string>();
  const lostReasonCache = new Map<string, string>();

  let processed = 0;
  for (let r = 0; r < dataRows.length; r++) {
    if (processed >= args.limit) break;

    const row = dataRows[r];
    const email = clean(row[COL.email])?.toLowerCase();
    const nome = clean(row[COL.nome]) ?? clean(row[COL.email]) ?? 'Sem nome';
    const empresa = clean(row[COL.empresa]);

    if (!email) {
      skippedNoEmail++;
      continue;
    }

    if (empresa && empresa.toLowerCase().includes('bertuzzi')) {
      console.log(`Pulado: ${email} (Empresa contém bertuzzi)`);
      skippedBertuzzi++;
      continue;
    }

    processed++;

    const phone =
      clean(row[COL.celular]) ?? clean(row[COL.telefone]) ?? null;
    const position = clean(row[COL.cargo]);
    const origem = clean(row[COL.origemPrimeira]);
    const etapaCrm = clean(row[COL.etapaCrm]);
    const motivoPerda = clean(row[COL.motivoPerda]);
    const valorRaw = row[COL.valorTotal];
    const lifecycle = clean(row[COL.estagioFunilLead]);

    // 4a. Organization (find/create)
    let organizationId: string | null = null;
    if (empresa) {
      if (orgCache.has(empresa)) {
        organizationId = orgCache.get(empresa)!;
      } else if (args.dryRun) {
        organizationId = '__dry__';
      } else {
        const existing = await prisma.organization.findFirst({
          where: { name: empresa },
          select: { id: true },
        });
        const org =
          existing ??
          (await prisma.organization.create({
            data: { name: empresa },
            select: { id: true },
          }));
        organizationId = org.id;
        orgCache.set(empresa, organizationId);
      }
    }

    // 4b. Source (find/create) — usado nos Deals
    let sourceId: string | null = null;
    if (origem) {
      if (sourceCache.has(origem)) {
        sourceId = sourceCache.get(origem)!;
      } else if (args.dryRun) {
        sourceId = '__dry__';
      } else {
        const src = await prisma.source.upsert({
          where: { name: origem },
          create: { name: origem },
          update: {},
          select: { id: true },
        });
        sourceId = src.id;
        sourceCache.set(origem, sourceId);
      }
    }

    // 4c. Contact upsert por email
    let contactId: string | null = null;
    let contactBrand: 'BGP' | 'AIMO' = 'AIMO';

    const existingContact = args.dryRun
      ? null
      : await prisma.contact.findFirst({
          where: { email },
          select: {
            id: true,
            brand: true,
            name: true,
            phone: true,
            position: true,
            organizationId: true,
          },
        });

    if (existingContact) {
      contactBrand = existingContact.brand as 'BGP' | 'AIMO';

      if (existingContact.brand === 'BGP') {
        console.warn(
          `Pulado (cross-brand): ${email} já existe como BGP — não tocando.`,
        );
        skippedCrossBrand++;
        continue;
      }

      // brand=AIMO → merge inteligente (só preenche null)
      const updateData: Prisma.ContactUpdateInput = {};
      if (!existingContact.name && nome) updateData.name = nome;
      if (!existingContact.phone && phone) updateData.phone = phone;
      if (!existingContact.position && position) updateData.position = position;
      if (!existingContact.organizationId && organizationId && organizationId !== '__dry__') {
        updateData.organization = { connect: { id: organizationId } };
      }

      if (Object.keys(updateData).length > 0) {
        await prisma.contact.update({
          where: { id: existingContact.id },
          data: updateData,
        });
      }
      contactId = existingContact.id;
      contactsUpdated++;
    } else if (args.dryRun) {
      contactId = '__dry__';
      contactsCreated++;
    } else {
      const created = await prisma.contact.create({
        data: {
          name: nome,
          email,
          phone,
          position,
          brand: 'AIMO',
          organizationId: organizationId,
        },
        select: { id: true },
      });
      contactId = created.id;
      contactsCreated++;
    }

    // 4d. Tag AIMO (skipDuplicates via @@unique([contactId, tagId]))
    if (!args.dryRun && contactId && contactId !== '__dry__') {
      try {
        await prisma.contactTag.create({
          data: { contactId, tagId: aimoTag.id },
        });
      } catch (err: any) {
        // P2002 unique violation — já tem a tag, ok
        if (err?.code !== 'P2002') throw err;
      }
    }

    // 4e. Deal (opcional)
    if (args.includeDeals) {
      const stageName = mapStage(etapaCrm);
      const lifecycleNorm = (lifecycle ?? '').toLowerCase();
      const finalStageName =
        lifecycleNorm === 'cliente' ? 'Ganho Fechado' : stageName;

      if (!finalStageName) {
        // não cria Deal se não tem stage mapeada
      } else {
        const stageId = stageByName.get(finalStageName);
        if (!stageId) {
          console.warn(
            `[deal] stage "${finalStageName}" não encontrada no pipeline AIMO — pulando deal de ${email}`,
          );
        } else {
          // status
          let status: 'OPEN' | 'WON' | 'LOST' = 'OPEN';
          if (lifecycleNorm === 'cliente') status = 'WON';
          else if (motivoPerda) status = 'LOST';

          // idempotência: se já tem Deal AIMO neste pipeline+stage pra este contact, skip
          let alreadyExists = false;
          if (!args.dryRun && contactId !== '__dry__') {
            const existingDeal = await prisma.deal.findFirst({
              where: {
                contactId,
                pipelineId: aimoPipeline.id,
                stageId,
                brand: 'AIMO',
              },
              select: { id: true },
            });
            alreadyExists = !!existingDeal;
          }

          if (alreadyExists) {
            dealsSkipped++;
          } else {
            // LostReason
            let lostReasonId: string | null = null;
            if (motivoPerda) {
              if (lostReasonCache.has(motivoPerda)) {
                lostReasonId = lostReasonCache.get(motivoPerda)!;
              } else if (!args.dryRun) {
                const lr = await prisma.lostReason.upsert({
                  where: { name: motivoPerda },
                  create: { name: motivoPerda },
                  update: {},
                  select: { id: true },
                });
                lostReasonId = lr.id;
                lostReasonCache.set(motivoPerda, lostReasonId);
              }
            }

            if (!args.dryRun && contactId && contactId !== '__dry__') {
              await prisma.deal.create({
                data: {
                  title: nome,
                  value: parseValue(valorRaw),
                  brand: 'AIMO',
                  status,
                  pipelineId: aimoPipeline.id,
                  stageId,
                  contactId,
                  organizationId:
                    organizationId && organizationId !== '__dry__'
                      ? organizationId
                      : null,
                  userId: responsibleUser.id,
                  sourceId:
                    sourceId && sourceId !== '__dry__' ? sourceId : null,
                  lostReasonId,
                },
              });
            }
            dealsCreated++;
            dealsByStage[finalStageName] = (dealsByStage[finalStageName] ?? 0) + 1;
          }
        }
      }
    }

    if (processed % 50 === 0) {
      console.log(
        `[progress] ${processed} processados — created=${contactsCreated} updated=${contactsUpdated}`,
      );
    }
  }

  // 5. Relatório
  const elapsed = Date.now() - startedAt;
  console.log('');
  console.log('=== Import AIMO ===');
  console.log(`CSV: ${csvLines} linhas`);
  console.log(`Pulados (sem email): ${skippedNoEmail}`);
  console.log(`Pulados (bertuzzi): ${skippedBertuzzi}`);
  console.log(`Pulados (cross-brand BGP): ${skippedCrossBrand}`);
  console.log(`Contacts criados: ${contactsCreated}`);
  console.log(`Contacts atualizados: ${contactsUpdated}`);
  console.log(`Deals criados: ${dealsCreated}`);
  if (Object.keys(dealsByStage).length > 0) {
    const parts = Object.entries(dealsByStage)
      .map(([s, n]) => `${s}: ${n}`)
      .join(', ');
    console.log(`  └─ por stage: ${parts}`);
  }
  console.log(`Deals pulados (já existiam): ${dealsSkipped}`);
  console.log(`Tempo: ${elapsed}ms`);
  if (args.dryRun) {
    console.log('');
    console.log('** DRY-RUN — nenhuma alteração foi escrita no DB. **');
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('[aimoLeadsImport] FALHOU:', err);
    await prisma.$disconnect();
    process.exit(1);
  });
