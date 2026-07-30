import prisma from './prisma';

/**
 * Acha o usuário do CRM a partir de um email vindo de sistema externo.
 *
 * Existe porque o email da pessoa nem sempre é o mesmo em todo lugar: o Calendly
 * manda `henrique.kovalezyk@bertuzzipatrimonial.com.br` e o CRM tem
 * `henrique@bertuzzipatrimonial.com.br`. A busca direta por `email` falhava sem
 * erro nenhum e o deal ficava com o responsável errado — foi assim que reuniões
 * do Henrique apareceram como sendo do Oliver.
 *
 * Procura primeiro no `email` e depois em `emailAliases`. Para ensinar um alias
 * novo basta acrescentar ao array do usuário, sem mexer em código.
 */
export async function resolveTeamUserByEmail(
  email: string | null | undefined,
): Promise<{ id: string; name: string } | null> {
  if (!email) return null;
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;

  const user = await prisma.user.findFirst({
    where: {
      isActive: true,
      OR: [
        { email: { equals: normalized, mode: 'insensitive' } },
        { emailAliases: { has: normalized } },
      ],
    },
    select: { id: true, name: true },
  });

  if (!user) {
    // Não é erro: pode ser convidado externo. Mas se for gente da casa, esse log
    // é o que denuncia o alias faltando.
    console.warn(`[resolveTeamUser] nenhum usuário do CRM para o email "${normalized}"`);
  }

  return user;
}
