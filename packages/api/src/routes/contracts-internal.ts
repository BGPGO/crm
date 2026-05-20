/**
 * Rotas internas de Contract — chamadas server-to-server (ex.: FinHub).
 *
 * Auth: Bearer token simples (header `Authorization: Bearer <token>`),
 *       comparado a `process.env.CRM_INTERNAL_API_TOKEN`. Sem JWT, sem sessão.
 *       Pensado pra ser registrado ANTES do `requireAuth` em `routes/index.ts`.
 *
 * Princípio: payload puramente leitura, formato estável (contrato com FinHub).
 *            Todos os campos podem ser null, mas as CHAVES devem existir.
 */
import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';

const router = Router();

/**
 * Valida o header Authorization contra CRM_INTERNAL_API_TOKEN.
 * Retorna 401 se header ausente ou token diferente.
 */
function requireInternalToken(req: Request, res: Response, next: NextFunction) {
  const expected = process.env.CRM_INTERNAL_API_TOKEN;
  if (!expected) {
    console.error('[contracts-internal] CRM_INTERNAL_API_TOKEN não configurado no ambiente');
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const header = req.headers.authorization;
  if (!header || typeof header !== 'string') {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const match = /^Bearer\s+(.+)$/.exec(header.trim());
  const provided = match?.[1]?.trim();
  if (!provided || provided !== expected) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  return next();
}

function decimalToNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return v;
  // Prisma Decimal expõe toString(); Number() lida com string numérica.
  const n = Number(v as { toString(): string });
  return Number.isFinite(n) ? n : null;
}

/**
 * GET /api/contracts-internal/by-autentique-id/:documentId
 * Busca um Contract pelo `autentiqueDocumentId` e devolve payload rico
 * (contract + deal + organization + contact) para o FinHub criar cliente.
 */
router.get(
  '/by-autentique-id/:documentId',
  requireInternalToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { documentId } = req.params;
      const contract = await prisma.contract.findFirst({
        where: { autentiqueDocumentId: documentId },
        include: {
          deal: {
            include: {
              organization: true,
              contact: true,
              user: true,
              stage: true,
              products: { include: { product: true } },
            },
          },
        },
      });

      if (!contract) {
        return res.status(404).json({ error: 'Contract not found for autentiqueDocumentId' });
      }

      const deal = contract.deal;
      const org = deal?.organization ?? null;
      const contact = deal?.contact ?? null;

      const payload = {
        contract: {
          id: contract.id,
          isTest: contract.isTest,
          status: contract.status,
          autentiqueDocumentId: contract.autentiqueDocumentId,
          autentiqueSentAt: contract.autentiqueSentAt ? contract.autentiqueSentAt.toISOString() : null,
          autentiqueSignedAt: contract.autentiqueSignedAt ? contract.autentiqueSignedAt.toISOString() : null,
          razaoSocial: contract.razaoSocial,
          nomeFantasia: contract.nomeFantasia,
          cnpj: contract.cnpj,
          endereco: contract.endereco,
          representante: contract.representante,
          cpfRepresentante: contract.cpfRepresentante,
          emailRepresentante: contract.emailRepresentante,
          emailFinanceiro: contract.emailFinanceiro,
          produto: contract.produto,
          valorMensal: decimalToNumber(contract.valorMensal),
          diaVencimento: contract.diaVencimento,
          dataInicio: contract.dataInicio ? contract.dataInicio.toISOString() : null,
          formaPagamento: contract.formaPagamento,
          valorImplementacao: decimalToNumber(contract.valorImplementacao),
          implementacaoParcelas: contract.implementacaoParcelas,
          descontoMeses: contract.descontoMeses,
          descontoPercentual: decimalToNumber(contract.descontoPercentual),
          linkReadAi: contract.linkReadAi,
          observacao: contract.observacao,
          erpCliente: contract.erpCliente,
          createdAt: contract.createdAt.toISOString(),
          updatedAt: contract.updatedAt.toISOString(),
        },
        deal: deal
          ? {
              id: deal.id,
              title: deal.title,
              value: decimalToNumber(deal.value),
              recurrence: deal.recurrence ?? null,
              contaAzulCode: deal.contaAzulCode ?? null,
              stage: deal.stage ? { name: deal.stage.name } : null,
              user: deal.user ? { name: deal.user.name, email: deal.user.email } : null,
              products: Array.isArray(deal.products)
                ? deal.products.map((dp) => ({
                    name: dp.product?.name ?? null,
                    quantity: dp.quantity ?? null,
                    unitPrice: decimalToNumber(dp.unitPrice),
                    recurrenceValue: decimalToNumber(dp.recurrenceValue),
                  }))
                : [],
            }
          : null,
        organization: org
          ? {
              id: org.id,
              name: org.name,
              cnpj: org.cnpj ?? null,
              website: org.website ?? null,
              phone: org.phone ?? null,
              email: org.email ?? null,
              address: org.address ?? null,
            }
          : null,
        contact: contact
          ? {
              id: contact.id,
              name: contact.name,
              email: contact.email ?? null,
              phone: contact.phone ?? null,
              position: contact.position ?? null,
            }
          : null,
      };

      return res.json(payload);
    } catch (err) {
      return next(err);
    }
  }
);

export default router;
