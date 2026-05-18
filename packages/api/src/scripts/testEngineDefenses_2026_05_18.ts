/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Teste DRY-RUN — Defesas do Engine WABA (2026-05-18)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Valida os 3 mecanismos de defesa implementados:
 *   1. Bloqueio de templates com status DISABLED (sem retry)
 *   2. Bloqueio de contato com phoneInvalid=true
 *   3. Circuit-breaker para template degradado (failRate > 30% / sent >= 5)
 *   4. Passagem normal: template OK + contato válido
 *
 * MODO DRY-RUN: nenhuma chamada à Meta API, nenhuma gravação no banco.
 * ═══════════════════════════════════════════════════════════════════════════
 */

interface MockTemplate {
  name: string;
  status: string;
  category: string;
  failRate7d: number;
  sentCount7d: number;
  healthFlag: string | null;
}

interface MockContact {
  id: string;
  name: string;
  phone: string;
  phoneInvalid: boolean;
  phoneInvalidAt: Date | null;
}

interface ActionResult {
  success: boolean;
  output?: string;
  retry?: boolean;
}

// ─── Lógica extraída do engine para simulação ─────────────────────────────

function checkEngineDefenses(
  template: MockTemplate,
  contact: MockContact,
): ActionResult {
  // Fix #1 — Bloquear templates DISABLED sem retry
  if (template.status === 'DISABLED') {
    console.log(
      `  [automationActions] Bloqueando envio: template "${template.name}" está DISABLED — sem retry`,
    );
    return {
      success: false,
      retry: false,
      output: JSON.stringify({ error: 'TEMPLATE_DISABLED', templateName: template.name }),
    };
  }

  // Aguardar aprovação para status não-APPROVED
  if (template.status !== 'APPROVED') {
    return {
      success: false,
      retry: true,
      output: `Template "${template.name}" não está aprovado (status: ${template.status}) — aguardando aprovação`,
    };
  }

  // Fix #2 — Bloquear contato com phoneInvalid
  if (contact.phoneInvalid) {
    console.log(
      `  [automationActions] Bloqueando envio: contato ${contact.name} (${contact.id}) tem phoneInvalid=true`,
    );
    return {
      success: false,
      retry: false,
      output: JSON.stringify({ error: 'CONTACT_PHONE_INVALID', contactId: contact.id }),
    };
  }

  // Fix #3 — Circuit-breaker
  const FAIL_THRESHOLD = 0.30;
  const MIN_SAMPLES = 5;
  if (template.failRate7d > FAIL_THRESHOLD && template.sentCount7d >= MIN_SAMPLES) {
    const reason = `TEMPLATE_DEGRADED (failRate=${(template.failRate7d * 100).toFixed(1)}% sent7d=${template.sentCount7d})`;
    console.log(
      `  [automationActions] Circuit-breaker disparado para "${template.name}": ${reason}`,
    );
    return {
      success: false,
      retry: false,
      output: JSON.stringify({ error: 'TEMPLATE_DEGRADED', templateName: template.name, reason }),
    };
  }

  // Tudo OK — passaria para envio
  return {
    success: true,
    output: `Template "${template.name}" liberado para envio para ${contact.name} (${contact.phone})`,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function printResult(label: string, result: ActionResult): void {
  const status = result.success ? '✓ PASSOU' : '✗ BLOQUEADO';
  const retryInfo = result.retry === true ? ' [retry=true]' : result.retry === false ? ' [retry=false]' : '';
  console.log(`  Resultado: ${status}${retryInfo}`);
  console.log(`  Output: ${result.output}`);
  console.log('');
}

function assertBlocked(result: ActionResult, expectedError: string): void {
  if (result.success) throw new Error(`Esperava bloqueio (${expectedError}) mas o envio passou`);
  if (result.retry !== false) throw new Error(`Esperava retry=false para ${expectedError} mas got retry=${result.retry}`);
  const parsed = JSON.parse(result.output || '{}');
  if (parsed.error !== expectedError) throw new Error(`Esperava error="${expectedError}" mas got "${parsed.error}"`);
}

function assertPassed(result: ActionResult): void {
  if (!result.success) throw new Error(`Esperava que o envio passasse mas foi bloqueado: ${result.output}`);
}

// ─── Casos de teste ───────────────────────────────────────────────────────

async function run(): Promise<void> {
  console.log('═══════════════════════════════════════════════════════════');
  console.log(' Teste DRY-RUN — Defesas do Engine WABA (2026-05-18)');
  console.log('═══════════════════════════════════════════════════════════\n');

  let passed = 0;
  let failed = 0;

  // ── Cenário 1: Template DISABLED → bloqueio sem retry ──
  {
    console.log('[ Cenário 1 ] Template DISABLED → deve bloquear sem retry');
    const template: MockTemplate = {
      name: 'seguimento_lead_v2',
      status: 'DISABLED',
      category: 'MARKETING',
      failRate7d: 0.05,
      sentCount7d: 20,
      healthFlag: 'HEALTHY',
    };
    const contact: MockContact = {
      id: 'cnt_abc123',
      name: 'Maria Silva',
      phone: '5551998765432',
      phoneInvalid: false,
      phoneInvalidAt: null,
    };

    try {
      const result = checkEngineDefenses(template, contact);
      printResult('Cenário 1', result);
      assertBlocked(result, 'TEMPLATE_DISABLED');
      console.log('  → ASSERTIVA OK\n');
      passed++;
    } catch (err: any) {
      console.error(`  → FALHOU: ${err.message}\n`);
      failed++;
    }
  }

  // ── Cenário 2: Contato com phoneInvalid=true → bloqueio sem retry ──
  {
    console.log('[ Cenário 2 ] Contact.phoneInvalid=true → deve bloquear sem retry');
    const template: MockTemplate = {
      name: 'boas_vindas_completo',
      status: 'APPROVED',
      category: 'UTILITY',
      failRate7d: 0.02,
      sentCount7d: 50,
      healthFlag: 'HEALTHY',
    };
    const contact: MockContact = {
      id: 'cnt_def456',
      name: 'João Pereira',
      phone: '5551977654321',
      phoneInvalid: true,
      phoneInvalidAt: new Date('2026-05-17T10:00:00Z'),
    };

    try {
      const result = checkEngineDefenses(template, contact);
      printResult('Cenário 2', result);
      assertBlocked(result, 'CONTACT_PHONE_INVALID');
      console.log('  → ASSERTIVA OK\n');
      passed++;
    } catch (err: any) {
      console.error(`  → FALHOU: ${err.message}\n`);
      failed++;
    }
  }

  // ── Cenário 3: Circuit-breaker disparado (failRate=50%, sent=10) ──
  {
    console.log('[ Cenário 3 ] failRate=50% + sentCount=10 → circuit-breaker deve disparar');
    const template: MockTemplate = {
      name: 'proposta_comercial_v3',
      status: 'APPROVED',
      category: 'MARKETING',
      failRate7d: 0.50,
      sentCount7d: 10,
      healthFlag: 'CRITICAL',
    };
    const contact: MockContact = {
      id: 'cnt_ghi789',
      name: 'Ana Costa',
      phone: '5551966543210',
      phoneInvalid: false,
      phoneInvalidAt: null,
    };

    try {
      const result = checkEngineDefenses(template, contact);
      printResult('Cenário 3', result);
      assertBlocked(result, 'TEMPLATE_DEGRADED');
      console.log('  → ASSERTIVA OK\n');
      passed++;
    } catch (err: any) {
      console.error(`  → FALHOU: ${err.message}\n`);
      failed++;
    }
  }

  // ── Cenário 4: Template saudável + contato válido → deve passar ──
  {
    console.log('[ Cenário 4 ] Template APPROVED saudável + contato válido → deve passar normalmente');
    const template: MockTemplate = {
      name: 'confirmacao_reuniao',
      status: 'APPROVED',
      category: 'UTILITY',
      failRate7d: 0.05,
      sentCount7d: 20,
      healthFlag: 'HEALTHY',
    };
    const contact: MockContact = {
      id: 'cnt_jkl012',
      name: 'Carlos Bertuzzi',
      phone: '5551955432109',
      phoneInvalid: false,
      phoneInvalidAt: null,
    };

    try {
      const result = checkEngineDefenses(template, contact);
      printResult('Cenário 4', result);
      assertPassed(result);
      console.log('  → ASSERTIVA OK\n');
      passed++;
    } catch (err: any) {
      console.error(`  → FALHOU: ${err.message}\n`);
      failed++;
    }
  }

  // ── Cenário 5 (borda): Circuit-breaker NÃO dispara com amostras insuficientes ──
  {
    console.log('[ Cenário 5 ] failRate=50% mas sent=3 (< mínimo 5) → NÃO deve bloquear');
    const template: MockTemplate = {
      name: 'lembrete_boleto',
      status: 'APPROVED',
      category: 'UTILITY',
      failRate7d: 0.50,
      sentCount7d: 3, // Abaixo do mínimo de amostras
      healthFlag: 'WARNING',
    };
    const contact: MockContact = {
      id: 'cnt_mno345',
      name: 'Fernanda Lima',
      phone: '5551944321098',
      phoneInvalid: false,
      phoneInvalidAt: null,
    };

    try {
      const result = checkEngineDefenses(template, contact);
      printResult('Cenário 5', result);
      assertPassed(result);
      console.log('  → ASSERTIVA OK (amostras insuficientes = circuit-breaker inativo)\n');
      passed++;
    } catch (err: any) {
      console.error(`  → FALHOU: ${err.message}\n`);
      failed++;
    }
  }

  // ── Resumo ──
  console.log('═══════════════════════════════════════════════════════════');
  console.log(` Resultado: ${passed} passou(ram), ${failed} falhou(ram)`);
  console.log('═══════════════════════════════════════════════════════════');

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Erro inesperado:', err);
  process.exit(1);
});
