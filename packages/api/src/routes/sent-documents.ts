import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { createError } from '../middleware/errorHandler';

const router = Router();

// POST /api/sent-documents/send — Send HTML document to Autentique for digital signature
router.post('/send', async (req: Request, res: Response, next: NextFunction) => {
  const reqId = Math.random().toString(36).slice(2, 8);
  try {
    console.log(`[sent-documents:${reqId}] /send entrada — userId=${(req as any).user?.id ?? 'anon'} brand=${(req as any).brand ?? '?'} contentLength=${req.headers['content-length']}`);

    const AUTENTIQUE_TOKEN = process.env.AUTENTIQUE_API_TOKEN;
    if (!AUTENTIQUE_TOKEN) {
      console.error(`[sent-documents:${reqId}] AUTENTIQUE_API_TOKEN not set in .env`);
      return next(createError('AUTENTIQUE_API_TOKEN não configurado. Adicione o token no .env da API.', 400));
    }

    const { htmlContent, fileName, signers, emailTemplateId, sortable, dealId } = req.body;

    console.log(`[sent-documents:${reqId}] payload — fileName=${fileName} htmlLen=${htmlContent?.length ?? 0} signers=${signers?.length ?? 0} emailTemplateId=${emailTemplateId ?? 'none'} sortable=${sortable} dealId=${dealId ?? 'none'}`);

    // Validate required fields
    if (!htmlContent) return next(createError('htmlContent é obrigatório.', 400));
    if (!fileName) return next(createError('fileName é obrigatório.', 400));
    if (!signers || !Array.isArray(signers) || signers.length === 0) {
      return next(createError('signers é obrigatório e deve ter ao menos 1 entrada.', 400));
    }

    for (const s of signers) {
      if (!s.email || !s.name || !s.action) {
        console.error(`[sent-documents:${reqId}] signer invalido:`, JSON.stringify(s));
        return next(createError('Cada signer deve ter email, name e action.', 400));
      }
    }

    // Convert HTML to Base64
    const htmlBase64 = Buffer.from(htmlContent, 'utf-8').toString('base64');

    // GraphQL mutation — avoid $ interpolation with regular string
    const query = 'mutation CreateDocumentMutation($document: DocumentInput!, $signers: [SignerInput!]!, $file: Upload!) { createDocument(sandbox: false, document: $document, signers: $signers, file: $file) { id name created_at signatures { public_id name email created_at action { name } link { short_link } } } }';

    const documentInput: Record<string, unknown> = { name: fileName };
    if (sortable !== undefined) {
      documentInput.sortable = sortable;
    }
    if (emailTemplateId) {
      documentInput.email_template_id = emailTemplateId;
    }

    const variables = {
      document: documentInput,
      signers: signers.map((s: { email: string; name?: string; action: string; delivery_order?: number }) => ({
        email: s.email,
        action: s.action || 'SIGN',
        name: s.name || undefined,
        ...(s.delivery_order !== undefined ? { delivery_order: s.delivery_order } : {}),
      })),
      file: null,
    };

    // Build multipart form
    const FormData = (await import('form-data')).default;
    const form = new FormData();
    form.append('operations', JSON.stringify({ query, variables }));
    form.append('map', JSON.stringify({ '0': ['variables.file'] }));
    form.append('0', Buffer.from(htmlContent, 'utf-8'), {
      filename: fileName,
      contentType: 'text/html',
    });

    console.log(`[sent-documents:${reqId}] enviando pra Autentique — multipart pronto`);
    const axios = (await import('axios')).default;
    const response = await axios.post('https://api.autentique.com.br/v2/graphql', form, {
      headers: {
        ...form.getHeaders(),
        Authorization: `Bearer ${AUTENTIQUE_TOKEN}`,
      },
      timeout: 60000,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });

    console.log(`[sent-documents:${reqId}] Autentique respondeu — status=${response.status} hasData=${!!response.data?.data}`);

    const autentiqueData = response.data?.data?.createDocument;
    if (!autentiqueData?.id) {
      console.error(`[sent-documents:${reqId}] Autentique sem createDocument.id:`, JSON.stringify(response.data));
      return next(createError('Autentique API error: ' + JSON.stringify(response.data?.errors || 'unknown'), 400));
    }
    console.log(`[sent-documents:${reqId}] Autentique OK — autentiqueDocId=${autentiqueData.id}`);

    // Infer document type from fileName
    const lowerName = fileName.toLowerCase();
    let documentType = 'contract';
    if (lowerName.includes('aditivo')) documentType = 'aditivo';
    else if (lowerName.includes('distrato')) documentType = 'distrato';

    // Save to SentDocument
    const sentDocument = await prisma.sentDocument.create({
      data: {
        autentiqueDocumentId: autentiqueData.id,
        documentName: fileName,
        documentType,
        signerEmails: signers.map((s: { email: string }) => s.email).join(','),
        status: 'pending',
        totalSigners: signers.length,
        signedCount: 0,
        dealId: dealId || null,
        metadata: autentiqueData.signatures || null,
      },
    });

    // Log activity on deal if dealId provided
    if (dealId) {
      const currentUserId = (req as any).user?.id;
      if (currentUserId) {
        await prisma.activity.create({
          data: {
            type: 'NOTE',
            content: `Documento "${fileName}" enviado para assinatura via Autentique (${signers.length} assinantes).`,
            dealId,
            userId: currentUserId,
            metadata: {
              source: 'sent-document',
              autentiqueId: autentiqueData.id,
              sentDocumentId: sentDocument.id,
              signers: signers.map((s: { email: string }) => s.email),
            },
          },
        });
      }
    }

    res.json({
      data: {
        documentId: sentDocument.id,
        autentiqueDocumentId: autentiqueData.id,
        signersCount: signers.length,
        signatures: autentiqueData.signatures,
      },
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const errStack = err instanceof Error ? err.stack : '';
    console.error(`[sent-documents:${reqId}] Send error:`, errMsg);
    if (errStack) console.error(`[sent-documents:${reqId}] stack:`, errStack);
    if (err && typeof err === 'object' && 'response' in err) {
      const axiosErr = err as any;
      console.error(`[sent-documents:${reqId}] axios response status=${axiosErr.response?.status} data=`, JSON.stringify(axiosErr.response?.data));
      const detail = axiosErr.response?.data ? JSON.stringify(axiosErr.response.data) : errMsg;
      return next(createError(`Erro Autentique: ${detail}`, axiosErr.response?.status || 500));
    }
    if (err && typeof err === 'object' && 'code' in err) {
      const errWithCode = err as any;
      console.error(`[sent-documents:${reqId}] erro com code=${errWithCode.code} (provavel timeout ou rede)`);
    }
    next(createError(`Erro ao enviar documento: ${errMsg}`, 500));
  }
});

// GET /api/sent-documents — List all sent documents, optional ?dealId=xxx filter
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { dealId } = req.query;

    const where: Record<string, unknown> = {};
    if (dealId) where.dealId = String(dealId);

    const documents = await prisma.sentDocument.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    res.json({ data: documents });
  } catch (err) {
    next(err);
  }
});

// POST /api/sent-documents/:id/check-status — Check signature status on Autentique
router.post('/:id/check-status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const AUTENTIQUE_TOKEN = process.env.AUTENTIQUE_API_TOKEN;
    if (!AUTENTIQUE_TOKEN) {
      return next(createError('AUTENTIQUE_API_TOKEN não configurado.', 400));
    }

    const sentDoc = await prisma.sentDocument.findUnique({ where: { id: req.params.id } });
    if (!sentDoc) return next(createError('SentDocument not found', 404));

    // Query Autentique for current signature status
    const query = `{ document(id: "${sentDoc.autentiqueDocumentId}") { id name created_at signatures { public_id name email created_at action { name } link { short_link } user { id name email } signed { created_at } rejected { created_at } viewed { created_at } } } }`;

    const axios = (await import('axios')).default;
    const response = await axios.post(
      'https://api.autentique.com.br/v2/graphql',
      { query },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${AUTENTIQUE_TOKEN}`,
        },
      }
    );

    const docData = response.data?.data?.document;
    if (!docData) {
      console.error('[sent-documents] Autentique check-status error:', JSON.stringify(response.data));
      return next(createError('Autentique API error: ' + JSON.stringify(response.data?.errors || 'unknown'), 400));
    }

    const signatures = docData.signatures || [];
    const signedCount = signatures.filter((s: any) => s.signed?.created_at).length;
    const totalSigners = signatures.length;
    const allSigned = totalSigners > 0 && signedCount === totalSigners;

    const updated = await prisma.sentDocument.update({
      where: { id: sentDoc.id },
      data: {
        status: allSigned ? 'signed' : 'pending',
        signedCount,
        totalSigners,
        lastCheckedAt: new Date(),
        metadata: signatures,
      },
    });

    res.json({ data: updated });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('[sent-documents] Check-status error:', errMsg);
    if (err && typeof err === 'object' && 'response' in err) {
      const axiosErr = err as any;
      const detail = axiosErr.response?.data ? JSON.stringify(axiosErr.response.data) : errMsg;
      return next(createError(`Erro Autentique: ${detail}`, axiosErr.response?.status || 500));
    }
    next(createError(`Erro ao verificar status: ${errMsg}`, 500));
  }
});

// DELETE /api/sent-documents/:id — Delete a SentDocument record
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sentDoc = await prisma.sentDocument.findUnique({ where: { id: req.params.id } });
    if (!sentDoc) return next(createError('SentDocument not found', 404));

    await prisma.sentDocument.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
