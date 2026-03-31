import prisma from '../../lib/prisma';

interface ConvFilters {
  status?: string;
  assignedUserId?: string;
  contactId?: string;
  search?: string; // search by phone or pushName
  needsHumanAttention?: boolean;
}

interface Pagination {
  page: number;
  limit: number;
}

export class WaConversationService {
  /** List conversations with filters and pagination */
  static async list(filters: ConvFilters, pagination: Pagination) {
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.assignedUserId) {
      where.assignedUserId = filters.assignedUserId;
    }

    if (filters.contactId) {
      where.contactId = filters.contactId;
    }

    if (filters.needsHumanAttention !== undefined) {
      where.needsHumanAttention = filters.needsHumanAttention;
    }

    if (filters.search) {
      where.OR = [
        { phone: { contains: filters.search } },
        { pushName: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      prisma.waConversation.findMany({
        where,
        skip,
        take: limit,
        orderBy: { lastMessageAt: 'desc' },
        include: {
          contact: { select: { id: true, name: true, email: true, phone: true } },
          assignedUser: { select: { id: true, name: true, email: true } },
          messages: {
            take: 1,
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              body: true,
              type: true,
              direction: true,
              senderType: true,
              createdAt: true,
            },
          },
        },
      }),
      prisma.waConversation.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    // Add lastMessage preview and unread count
    const enriched = data.map((conv) => {
      const lastMessage = conv.messages[0] || null;
      const { messages, ...rest } = conv;
      return {
        ...rest,
        lastMessage,
        windowOpen: conv.windowExpiresAt ? conv.windowExpiresAt > new Date() : false,
      };
    });

    return { data: enriched, total, page, limit, totalPages };
  }

  /** Get a single conversation with paginated messages */
  static async getWithMessages(id: string, messageLimit: number = 50) {
    const conversation = await prisma.waConversation.findUnique({
      where: { id },
      include: {
        contact: { select: { id: true, name: true, email: true, phone: true, organizationId: true } },
        assignedUser: { select: { id: true, name: true, email: true } },
      },
    });

    if (!conversation) return null;

    const messages = await prisma.waMessage.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: 'desc' },
      take: messageLimit,
      include: {
        senderUser: { select: { id: true, name: true } },
      },
    });

    const windowOpen = conversation.windowExpiresAt
      ? conversation.windowExpiresAt > new Date()
      : false;

    return {
      ...conversation,
      windowOpen,
      messages: messages.reverse(), // Return oldest first for display
    };
  }

  /** Count conversations by status and special flags */
  static async stats() {
    const [open, closed, archived, needsHuman, total] = await Promise.all([
      prisma.waConversation.count({ where: { status: 'WA_OPEN' } }),
      prisma.waConversation.count({ where: { status: 'WA_CLOSED' } }),
      prisma.waConversation.count({ where: { status: 'WA_ARCHIVED' } }),
      prisma.waConversation.count({ where: { needsHumanAttention: true, status: 'WA_OPEN' } }),
      prisma.waConversation.count(),
    ]);

    return { open, closed, archived, needsHumanAttention: needsHuman, total };
  }

  /** Assign a conversation to a user */
  static async assign(id: string, userId: string) {
    return prisma.waConversation.update({
      where: { id },
      data: { assignedUserId: userId },
    });
  }

  /** Close a conversation */
  static async close(id: string) {
    return prisma.waConversation.update({
      where: { id },
      data: { status: 'WA_CLOSED' },
    });
  }

  /** Archive a conversation */
  static async archive(id: string) {
    return prisma.waConversation.update({
      where: { id },
      data: { status: 'WA_ARCHIVED' },
    });
  }

  /** Mark conversation as read by agent */
  static async markRead(id: string) {
    return prisma.waConversation.update({
      where: { id },
      data: { lastReadAt: new Date() },
    });
  }
}
