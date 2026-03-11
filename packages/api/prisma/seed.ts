import { PrismaClient, UserRole, WebhookType } from "@prisma/client";
import * as crypto from "crypto";

const prisma = new PrismaClient();

// Simple SHA-256 hash for the password (no bcrypt dependency required)
function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password).digest("hex");
}

async function main() {
  console.log("Seeding database...");

  // ─── Pipeline "Funil de Vendas" com 8 etapas ────────────────────────────────
  const pipeline = await prisma.pipeline.upsert({
    where: { id: "default-pipeline" },
    update: { name: "Funil de Vendas", isDefault: true },
    create: {
      id: "default-pipeline",
      name: "Funil de Vendas",
      isDefault: true,
      stages: {
        create: [
          { name: "Lead",                  order: 1, color: "#3B82F6" },
          { name: "Contato Feito",         order: 2, color: "#06B6D4" },
          { name: "Marcar Reunião",        order: 3, color: "#8B5CF6" },
          { name: "Reunião Marcada",       order: 4, color: "#F59E0B" },
          { name: "Proposta Enviada",      order: 5, color: "#F97316" },
          { name: "Aguardando Dados",      order: 6, color: "#EF4444" },
          { name: "Aguardando Assinatura", order: 7, color: "#EC4899" },
          { name: "Ganho Fechado",         order: 8, color: "#22C55E" },
        ],
      },
    },
  });

  console.log(`Pipeline criado: ${pipeline.name}`);

  // ─── Admin user ─────────────────────────────────────────────────────────────
  const admin = await prisma.user.upsert({
    where: { email: "admin@bgpgo.com.br" },
    update: {},
    create: {
      email: "admin@bgpgo.com.br",
      name: "Admin BGPGO",
      password: hashPassword("admin123"),
      role: UserRole.ADMIN,
      isActive: true,
    },
  });

  console.log(`Usuário admin criado: ${admin.email}`);

  // ─── Sources ────────────────────────────────────────────────────────────────
  const sourcesData = [
    { name: "Site" },
    { name: "Indicação" },
    { name: "Redes Sociais" },
    { name: "WhatsApp" },
    { name: "Evento" },
  ];

  for (const source of sourcesData) {
    await prisma.source.upsert({
      where: { name: source.name },
      update: {},
      create: source,
    });
  }

  console.log(`${sourcesData.length} fontes criadas.`);

  // ─── Lost Reasons ───────────────────────────────────────────────────────────
  const lostReasonsData = [
    { name: "Preço" },
    { name: "Concorrência" },
    { name: "Timing" },
    { name: "Sem resposta" },
    { name: "Desistiu" },
    { name: "Não qualificado" },
  ];

  for (const reason of lostReasonsData) {
    await prisma.lostReason.upsert({
      where: { name: reason.name },
      update: {},
      create: reason,
    });
  }

  console.log(`${lostReasonsData.length} motivos de perda criados.`);

  // ─── WebhookConfig de exemplo ───────────────────────────────────────────────
  await prisma.webhookConfig.upsert({
    where: { id: "webhook-greatpages-incoming" },
    update: {},
    create: {
      id: "webhook-greatpages-incoming",
      name: "GreatPages",
      url: "https://placeholder.bgpgo.com.br/webhooks/incoming/greatpages",
      type: WebhookType.INCOMING,
      events: ["lead.created"],
      isActive: true,
    },
  });

  console.log("WebhookConfig de exemplo criado.");

  console.log("Seed concluído com sucesso!");
}

main()
  .catch((e) => {
    console.error("Erro no seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
