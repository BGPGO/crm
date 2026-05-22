import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { createError } from '../middleware/errorHandler';

const router = Router();

// GET /api/contracts?dealId=xxx — List contracts (optionally filtered by deal)
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { dealId } = req.query;
    const where: Record<string, unknown> = {};
    if (dealId) where.dealId = dealId as string;

    const data = await prisma.contract.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        deal: { select: { id: true, title: true } },
        signatures: true,
      },
    });

    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// GET /api/contracts/:id — Single contract
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const contract = await prisma.contract.findUnique({
      where: { id: req.params.id },
      include: { signatures: true, deal: { select: { id: true, title: true } } },
    });
    if (!contract) return next(createError('Contract not found', 404));
    res.json({ data: contract });
  } catch (err) {
    next(err);
  }
});

// POST /api/contracts — Create contract (pre-fill from deal)
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { dealId, ...overrides } = req.body;
    if (!dealId) return next(createError('dealId is required', 400));

    const deal = await prisma.deal.findUnique({
      where: { id: dealId },
      include: {
        contact: true,
        organization: true,
        products: { include: { product: true } },
      },
    });
    if (!deal) return next(createError('Deal not found', 404));

    // Build contract data from deal + overrides
    const contractData = {
      dealId,
      razaoSocial: overrides.razaoSocial || deal.organization?.name || deal.contact?.name || '',
      nomeFantasia: overrides.nomeFantasia || '',
      cnpj: overrides.cnpj || deal.organization?.cnpj || '',
      endereco: overrides.endereco || deal.organization?.address || '',
      representante: overrides.representante || deal.contact?.name || '',
      cpfRepresentante: overrides.cpfRepresentante || '',
      emailRepresentante: overrides.emailRepresentante || deal.contact?.email || '',
      emailFinanceiro: overrides.emailFinanceiro || '',
      produto: overrides.produto || (deal.products[0]?.product?.name ? mapProductName(deal.products[0].product.name) : ''),
      strategyModules: overrides.strategyModules || null,
      biOrigemDados: overrides.biOrigemDados || null,
      biQtdLicencas: overrides.biQtdLicencas || null,
      biQtdTelasPersonalizadas: overrides.biQtdTelasPersonalizadas || null,
      valorMensal: parseFloat(overrides.valorMensal) || deal.value || 0,
      diaVencimento: parseInt(overrides.diaVencimento) || 10,
      dataInicio: overrides.dataInicio ? new Date(overrides.dataInicio) : new Date(),
      formaPagamento: overrides.formaPagamento || 'boleto',
      valorImplementacao: overrides.valorImplementacao ? parseFloat(overrides.valorImplementacao) : null,
      implementacaoParcelas: overrides.implementacaoParcelas ? parseInt(overrides.implementacaoParcelas) : null,
      descontoMeses: overrides.descontoMeses ? parseInt(overrides.descontoMeses) : null,
      descontoPercentual: overrides.descontoPercentual ? parseFloat(overrides.descontoPercentual) : null,
      observacao: overrides.observacao || null,
      linkReadAi: overrides.linkReadAi || null,
      testemunha1Nome: overrides.testemunha1Nome || null,
      testemunha1Cpf: overrides.testemunha1Cpf || null,
      testemunha1Email: overrides.testemunha1Email || null,
      testemunha2Nome: overrides.testemunha2Nome || null,
      testemunha2Cpf: overrides.testemunha2Cpf || null,
      testemunha2Email: overrides.testemunha2Email || null,
    };

    const contract = await prisma.contract.create({
      data: contractData,
      include: { signatures: true },
    });

    res.status(201).json({ data: contract });
  } catch (err) {
    next(err);
  }
});

// Helper to map product display names to contract product keys
function mapProductName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('go iii') || lower.includes('go3')) return 'bgp-go-iii';
  if (lower.includes('go ii') || lower.includes('go2')) return 'bgp-go-ii';
  if (lower.includes('go i') || lower.includes('go1') || lower.includes('gobi')) return 'bgp-go-i';
  if (lower.includes('bi personalizado') || lower.includes('bi custom')) return 'bi-personalizado';
  if (lower.includes('bi')) return 'bgp-bi';
  if (lower.includes('strategy') || lower.includes('estrateg')) return 'bgp-strategy';
  if (lower.includes('valuation')) return 'bgp-valuation';
  if (lower.includes('brand') || lower.includes('growth')) return 'brand-growth';
  return '';
}

// PUT /api/contracts/:id — Update contract
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.contract.findUnique({ where: { id: req.params.id } });
    if (!existing) return next(createError('Contract not found', 404));
    if (existing.status !== 'DRAFT') return next(createError('Only draft contracts can be edited', 400));

    const allowedFields = [
      'razaoSocial', 'nomeFantasia', 'cnpj', 'endereco', 'representante',
      'cpfRepresentante', 'emailRepresentante', 'emailFinanceiro',
      'produto', 'strategyModules', 'biOrigemDados', 'biQtdLicencas', 'biQtdTelasPersonalizadas',
      'valorMensal', 'diaVencimento', 'dataInicio', 'formaPagamento',
      'valorImplementacao', 'implementacaoParcelas', 'descontoMeses', 'descontoPercentual',
      'observacao', 'linkReadAi',
      'testemunha1Nome', 'testemunha1Cpf', 'testemunha1Email',
      'testemunha2Nome', 'testemunha2Cpf', 'testemunha2Email',
      'htmlContent',
    ];

    const intFields = new Set(['diaVencimento', 'implementacaoParcelas', 'descontoMeses']);
    const decimalFields = new Set(['valorMensal', 'valorImplementacao', 'descontoPercentual']);
    // Required numeric fields cannot be null — default to 0 instead
    const requiredNumeric = new Set(['valorMensal', 'diaVencimento']);

    const data: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        const val = req.body[field];
        if (field === 'dataInicio') {
          data[field] = new Date(val);
        } else if (intFields.has(field)) {
          const parsed = val !== null && val !== '' ? parseInt(val) : NaN;
          data[field] = Number.isNaN(parsed) || parsed === null ? (requiredNumeric.has(field) ? 0 : null) : parsed;
        } else if (decimalFields.has(field)) {
          const parsed = val !== null && val !== '' ? parseFloat(val) : NaN;
          data[field] = Number.isNaN(parsed) || parsed === null ? (requiredNumeric.has(field) ? 0 : null) : parsed;
        } else {
          data[field] = val;
        }
      }
    }

    const contract = await prisma.contract.update({
      where: { id: req.params.id },
      data,
      include: { signatures: true },
    });

    res.json({ data: contract });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/contracts/:id — Delete draft contract
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.contract.findUnique({ where: { id: req.params.id } });
    if (!existing) return next(createError('Contract not found', 404));
    if (existing.status !== 'DRAFT') return next(createError('Only draft contracts can be deleted', 400));

    await prisma.contract.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// POST /api/contracts/:id/send-autentique — Send to Autentique for signing
router.post('/:id/send-autentique', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const contract = await prisma.contract.findUnique({ where: { id: req.params.id } });
    if (!contract) return next(createError('Contract not found', 404));
    if (!contract.htmlContent) return next(createError('Contract has no HTML content. Generate preview first.', 400));
    if (contract.status !== 'DRAFT') return next(createError('Contract already sent', 400));

    const AUTENTIQUE_TOKEN = process.env.AUTENTIQUE_API_TOKEN;
    if (!AUTENTIQUE_TOKEN) {
      console.error('[contracts] AUTENTIQUE_API_TOKEN not set in .env');
      return next(createError('AUTENTIQUE_API_TOKEN não configurado. Adicione o token no .env da API.', 400));
    }

    // Validate required fields for signing
    if (!contract.emailRepresentante || !contract.emailRepresentante.includes('@')) {
      return next(createError('Email do representante é obrigatório para enviar para assinatura.', 400));
    }
    if (!contract.representante) {
      return next(createError('Nome do representante é obrigatório para enviar para assinatura.', 400));
    }

    // Build signers — prefer signers sent from frontend (respects UI order + witness actions);
    // fall back to DB-based construction when body is missing (backward compat)
    type SignerInput = { email: string; name: string; action: string };
    const CONTRATADA = {
      name: 'Josiane Luiza Bertuzzi',
      email: 'josi@bertuzzipatrimonial.com.br',
    };

    const VALID_ACTIONS = new Set(['SIGN', 'SIGN_AS_A_WITNESS', 'APPROVE', 'ACKNOWLEDGE', 'RECOGNIZE']);
    const bodySigners: unknown = (req.body && (req.body as { signers?: unknown }).signers);
    let signers: SignerInput[];

    if (Array.isArray(bodySigners) && bodySigners.length > 0) {
      signers = [];
      for (const raw of bodySigners) {
        if (!raw || typeof raw !== 'object') continue;
        const s = raw as { email?: unknown; name?: unknown; action?: unknown };
        const email = typeof s.email === 'string' ? s.email.trim() : '';
        const name = typeof s.name === 'string' ? s.name.trim() : '';
        const action = typeof s.action === 'string' ? s.action : 'SIGN';
        if (!email || !email.includes('@')) {
          return next(createError(`Signatário com email inválido: "${email}"`, 400));
        }
        if (!name) {
          return next(createError(`Signatário sem nome (${email})`, 400));
        }
        if (!VALID_ACTIONS.has(action)) {
          return next(createError(`Signatário com action inválido: "${action}" (${email})`, 400));
        }
        signers.push({ email, name, action });
      }
      if (signers.length === 0) {
        return next(createError('Nenhum signatário válido no request.', 400));
      }
    } else {
      // Fallback: build from contract DB fields
      signers = [
        { email: CONTRATADA.email, name: CONTRATADA.name, action: 'SIGN' },
        { email: contract.emailRepresentante, name: contract.representante, action: 'SIGN' },
      ];
      if (contract.testemunha1Email && contract.testemunha1Nome) {
        signers.push({ email: contract.testemunha1Email, name: contract.testemunha1Nome, action: 'SIGN_AS_A_WITNESS' });
      }
      if (contract.testemunha2Email && contract.testemunha2Nome) {
        signers.push({ email: contract.testemunha2Email, name: contract.testemunha2Nome, action: 'SIGN_AS_A_WITNESS' });
      }
    }

    const fileName = `Contrato_${contract.razaoSocial.replace(/[^a-zA-Z0-9]/g, '_')}.html`;

    // GraphQL mutation for Autentique — use regular string to avoid $ interpolation
    // Ordem dos signatários segue a ordem do array quando sortable=true.
    // NÃO enviar `delivery_order` — esse campo não existe em SignerInput (V2).
    const query = 'mutation CreateDocumentMutation($document: DocumentInput!, $signers: [SignerInput!]!, $file: Upload!) { createDocument(sandbox: false, document: $document, signers: $signers, file: $file) { id name created_at signatures { public_id name email created_at action { name } link { short_link } } } }';

    const variables = {
      document: { name: fileName, sortable: true },
      signers: signers.map(s => ({
        email: s.email,
        action: s.action,
        name: s.name,
      })),
      file: null,
    };

    // Build multipart form
    const FormData = (await import('form-data')).default;
    const form = new FormData();
    form.append('operations', JSON.stringify({ query, variables }));
    form.append('map', JSON.stringify({ '0': ['variables.file'] }));
    form.append('0', Buffer.from(contract.htmlContent, 'utf-8'), {
      filename: fileName,
      contentType: 'text/html',
    });

    const axios = (await import('axios')).default;
    const response = await axios.post('https://api.autentique.com.br/v2/graphql', form, {
      headers: {
        ...form.getHeaders(),
        Authorization: `Bearer ${AUTENTIQUE_TOKEN}`,
      },
    });

    const autentiqueData = response.data?.data?.createDocument;
    if (!autentiqueData?.id) {
      console.error('[contracts] Autentique error:', JSON.stringify(response.data));
      const errs = response.data?.errors as Array<{ message?: string }> | undefined;
      const firstMsg = Array.isArray(errs) && errs[0]?.message
        ? errs[0].message
        : 'Resposta inesperada da Autentique';
      return next(createError(`Autentique: ${firstMsg}`, 400));
    }

    // Update contract status
    await prisma.contract.update({
      where: { id: contract.id },
      data: {
        status: 'PENDING_SIGNATURE',
        autentiqueDocumentId: autentiqueData.id,
        autentiqueSentAt: new Date(),
      },
    });

    // Create signature records — derive role from action/email (not array position,
    // since frontend may send signers in any order).
    let testemunhaCount = 0;
    const signatureRecords = signers.map(s => {
      let role: string;
      if (s.action === 'SIGN_AS_A_WITNESS') {
        testemunhaCount += 1;
        role = `testemunha${testemunhaCount}`;
      } else if (s.email.toLowerCase() === CONTRATADA.email.toLowerCase()) {
        role = 'contratada';
      } else {
        role = 'contratante';
      }
      return {
        contractId: contract.id,
        signerName: s.name,
        signerEmail: s.email,
        signerRole: role,
        status: 'pending',
      };
    });

    await prisma.contractSignatureRecord.createMany({ data: signatureRecords });

    // Move deal to "Aguardando assinatura" stage
    const aguardandoStage = await prisma.pipelineStage.findFirst({
      where: { name: { contains: 'Aguardando assinatura', mode: 'insensitive' } },
    });
    if (aguardandoStage) {
      await prisma.deal.update({
        where: { id: contract.dealId },
        data: { stageId: aguardandoStage.id },
      });
      console.log(`[contracts] Deal ${contract.dealId} moved to "Aguardando assinatura"`);
    }

    // Log activity on deal
    const currentUserId = (req as any).user?.id;
    if (currentUserId) {
      await prisma.activity.create({
        data: {
          type: 'NOTE',
          content: `Contrato enviado para assinatura via Autentique (${signers.length} assinantes).`,
          dealId: contract.dealId,
          userId: currentUserId,
          metadata: {
            source: 'contract',
            autentiqueId: autentiqueData.id,
            signers: signers.map(s => s.email),
          },
        },
      });
    }

    res.json({
      data: {
        autentiqueDocumentId: autentiqueData.id,
        signersCount: signers.length,
        signatures: autentiqueData.signatures,
      },
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('[contracts] Autentique send error:', errMsg);
    // Return the actual error message to frontend
    if (err && typeof err === 'object' && 'response' in err) {
      const axiosErr = err as any;
      const detail = axiosErr.response?.data ? JSON.stringify(axiosErr.response.data) : errMsg;
      return next(createError(`Erro Autentique: ${detail}`, axiosErr.response?.status || 500));
    }
    next(createError(`Erro ao enviar contrato: ${errMsg}`, 500));
  }
});

// POST /api/contracts/:id/revise — Cancel current contract on Autentique and reopen for editing
router.post('/:id/revise', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const contract = await prisma.contract.findUnique({ where: { id: req.params.id } });
    if (!contract) return next(createError('Contract not found', 404));
    if (contract.status !== 'PENDING_SIGNATURE') {
      return next(createError('Só é possível alterar contratos aguardando assinatura.', 400));
    }

    // Cancel on Autentique if we have a document ID
    let autentiqueCancelled = false;
    let autentiqueCancelError: string | null = null;
    if (contract.autentiqueDocumentId) {
      const AUTENTIQUE_TOKEN = process.env.AUTENTIQUE_API_TOKEN;
      if (!AUTENTIQUE_TOKEN) {
        autentiqueCancelError = 'AUTENTIQUE_API_TOKEN não configurado no .env';
        console.error('[contracts] AUTENTIQUE_API_TOKEN not set — cannot cancel document on Autentique');
      } else {
        try {
          const axios = (await import('axios')).default;
          const query = 'mutation { deleteDocument(id: "' + contract.autentiqueDocumentId + '") }';
          const response = await axios.post('https://api.autentique.com.br/v2/graphql', { query }, {
            headers: {
              Authorization: `Bearer ${AUTENTIQUE_TOKEN}`,
              'Content-Type': 'application/json',
            },
          });

          // Check for GraphQL-level errors
          if (response.data?.errors?.length) {
            const gqlError = response.data.errors.map((e: any) => e.message).join('; ');
            autentiqueCancelError = `Autentique retornou erro: ${gqlError}`;
            console.error(`[contracts] Autentique GraphQL errors for doc ${contract.autentiqueDocumentId}:`, gqlError);
          } else if (response.data?.data?.deleteDocument !== undefined) {
            autentiqueCancelled = true;
            console.log(`[contracts] Autentique document ${contract.autentiqueDocumentId} cancelled successfully`);
          } else {
            autentiqueCancelError = 'Resposta inesperada do Autentique';
            console.warn(`[contracts] Unexpected Autentique response for doc ${contract.autentiqueDocumentId}:`, JSON.stringify(response.data));
          }
        } catch (autErr) {
          const errDetail = autErr instanceof Error ? autErr.message : String(autErr);
          if (autErr && typeof autErr === 'object' && 'response' in autErr) {
            const axiosErr = autErr as any;
            autentiqueCancelError = `Erro HTTP ${axiosErr.response?.status}: ${JSON.stringify(axiosErr.response?.data || errDetail)}`;
          } else {
            autentiqueCancelError = errDetail;
          }
          console.error('[contracts] Failed to cancel Autentique document:', autentiqueCancelError);
        }
      }
    } else {
      // No Autentique document to cancel — that's fine
      autentiqueCancelled = true;
    }

    // Delete signature records
    await prisma.contractSignatureRecord.deleteMany({ where: { contractId: contract.id } });

    // Reset contract to DRAFT
    const updated = await prisma.contract.update({
      where: { id: contract.id },
      data: {
        status: 'DRAFT',
        autentiqueDocumentId: null,
        autentiqueSentAt: null,
        autentiqueSignedAt: null,
      },
    });

    // Log activity
    const currentUserId = (req as any).user?.id;
    if (currentUserId) {
      await prisma.activity.create({
        data: {
          type: 'NOTE',
          content: 'Contrato cancelado para revisão. O contrato anterior no Autentique foi descartado.',
          dealId: contract.dealId,
          userId: currentUserId,
          metadata: { source: 'contract', action: 'revise' },
        },
      });
    }

    res.json({
      data: updated,
      autentiqueCancelled,
      autentiqueCancelError,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
