/**
 * Tests for routes/contracts-internal.ts and the erpCliente gate
 * in routes/contracts.ts (send-autentique).
 *
 * Estratégia:
 *  - mock do `lib/prisma` via vi.mock (sem DB real)
 *  - sobe Express com errorHandler num servidor http efêmero
 *  - usa fetch global (Node 18+) — evita dep extra (supertest)
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'net';
import http from 'http';

// ── Prisma mock ────────────────────────────────────────────────────────────
const prismaMock = {
  contract: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  contractSignatureRecord: {
    createMany: vi.fn(),
  },
  pipelineStage: {
    findFirst: vi.fn(),
  },
  deal: {
    update: vi.fn(),
  },
  activity: {
    create: vi.fn(),
  },
};

vi.mock('../../lib/prisma', () => ({
  default: prismaMock,
  prisma: prismaMock,
}));

// Importar APÓS o mock pra garantir que os routers usem o stub
import contractsInternalRouter from '../contracts-internal';
import contractsRouter from '../contracts';
import { errorHandler } from '../../middleware/errorHandler';

// ── Helpers ────────────────────────────────────────────────────────────────
const TEST_TOKEN = 'test-token-abc';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/contracts-internal', contractsInternalRouter);
  app.use('/api/contracts', contractsRouter);
  app.use(errorHandler);
  return app;
}

let server: http.Server;
let baseUrl: string;

beforeAll(async () => {
  process.env.CRM_INTERNAL_API_TOKEN = TEST_TOKEN;
  const app = buildApp();
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Fixtures ───────────────────────────────────────────────────────────────
function makeContractWithFullDeal() {
  return {
    id: 'ctr_1',
    isTest: false,
    status: 'SIGNED',
    autentiqueDocumentId: 'doc_abc',
    autentiqueSentAt: new Date('2026-05-01T10:00:00Z'),
    autentiqueSignedAt: new Date('2026-05-02T10:00:00Z'),
    razaoSocial: 'ACME LTDA',
    nomeFantasia: 'ACME',
    cnpj: '00.000.000/0001-00',
    endereco: 'Rua X, 1',
    representante: 'Fulano',
    cpfRepresentante: '11111111111',
    emailRepresentante: 'fulano@acme.com',
    emailFinanceiro: 'fin@acme.com',
    produto: 'bgp-go-i',
    valorMensal: 1997.0,
    diaVencimento: 10,
    dataInicio: new Date('2026-05-15T00:00:00Z'),
    formaPagamento: 'boleto',
    valorImplementacao: null,
    implementacaoParcelas: null,
    descontoMeses: null,
    descontoPercentual: null,
    linkReadAi: null,
    observacao: null,
    erpCliente: 'omie',
    createdAt: new Date('2026-04-01T00:00:00Z'),
    updatedAt: new Date('2026-05-02T10:00:00Z'),
    deal: {
      id: 'deal_1',
      title: 'ACME — BGP GO I',
      value: 1997.0,
      recurrence: 'mensal',
      contaAzulCode: null,
      stage: { name: 'Ganho Fechado' },
      user: { name: 'Vendedor', email: 'v@bgp.com' },
      products: [
        {
          quantity: 1,
          unitPrice: 1997.0,
          recurrenceValue: 1997.0,
          product: { name: 'BGP GO I' },
        },
      ],
      organization: {
        id: 'org_1',
        name: 'ACME LTDA',
        cnpj: '00.000.000/0001-00',
        website: 'acme.com',
        phone: '5511...',
        email: 'contato@acme.com',
        address: 'Rua X, 1',
      },
      contact: {
        id: 'c_1',
        name: 'Fulano',
        email: 'fulano@acme.com',
        phone: '5511...',
        position: 'CFO',
      },
    },
  };
}

// ── Tests: GET /by-autentique-id/:documentId ───────────────────────────────
describe('GET /api/contracts-internal/by-autentique-id/:documentId', () => {
  it('returns 401 without Authorization header', async () => {
    const res = await fetch(`${baseUrl}/api/contracts-internal/by-autentique-id/doc_abc`);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
    expect(prismaMock.contract.findFirst).not.toHaveBeenCalled();
  });

  it('returns 401 with wrong token', async () => {
    const res = await fetch(`${baseUrl}/api/contracts-internal/by-autentique-id/doc_abc`, {
      headers: { Authorization: 'Bearer wrong-token' },
    });
    expect(res.status).toBe(401);
    expect(prismaMock.contract.findFirst).not.toHaveBeenCalled();
  });

  it('returns 404 when documentId not found', async () => {
    prismaMock.contract.findFirst.mockResolvedValue(null);
    const res = await fetch(`${baseUrl}/api/contracts-internal/by-autentique-id/missing`, {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Contract not found for autentiqueDocumentId');
  });

  it('returns 200 with full payload when contract exists', async () => {
    prismaMock.contract.findFirst.mockResolvedValue(makeContractWithFullDeal());
    const res = await fetch(`${baseUrl}/api/contracts-internal/by-autentique-id/doc_abc`, {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.contract.id).toBe('ctr_1');
    expect(body.contract.erpCliente).toBe('omie');
    expect(body.contract.isTest).toBe(false);
    expect(body.contract.valorMensal).toBe(1997);
    expect(typeof body.contract.autentiqueSentAt).toBe('string');
    expect(body.deal.id).toBe('deal_1');
    expect(body.deal.products).toHaveLength(1);
    expect(body.deal.products[0].name).toBe('BGP GO I');
    expect(body.organization.cnpj).toBe('00.000.000/0001-00');
    expect(body.contact.email).toBe('fulano@acme.com');
    // Sanity: chaves obrigatórias presentes mesmo quando null
    expect(body.contract).toHaveProperty('observacao');
    expect(body.contract).toHaveProperty('linkReadAi');
  });

  it('returns 200 with organization=null when deal has no organization', async () => {
    const c = makeContractWithFullDeal();
    c.deal.organization = null;
    prismaMock.contract.findFirst.mockResolvedValue(c);
    const res = await fetch(`${baseUrl}/api/contracts-internal/by-autentique-id/doc_abc`, {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.organization).toBeNull();
    expect(body.contact).not.toBeNull();
    expect(body.deal).not.toBeNull();
  });
});

// ── Tests: POST /api/contracts/:id/send-autentique gate ────────────────────
describe('POST /api/contracts/:id/send-autentique — erpCliente gate', () => {
  it('returns 400 when erpCliente is empty', async () => {
    prismaMock.contract.findUnique.mockResolvedValue({
      id: 'ctr_1',
      status: 'DRAFT',
      htmlContent: '<html></html>',
      emailRepresentante: 'a@b.com',
      representante: 'Fulano',
      erpCliente: null, // <-- vazio: deve bloquear
      razaoSocial: 'ACME',
    });
    // Garantir que o token Autentique exista pra não cair na validação anterior
    process.env.AUTENTIQUE_API_TOKEN = 'fake';

    const res = await fetch(`${baseUrl}/api/contracts/ctr_1/send-autentique`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('erpCliente obrigatório antes de enviar para Autentique');
  });
});
