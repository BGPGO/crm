import prisma from '../../lib/prisma';

export class WindowService {
  /** Check if conversation has an open 24h window */
  static async isWindowOpen(conversationId: string): Promise<boolean> {
    const conv = await prisma.waConversation.findUnique({
      where: { id: conversationId },
      select: { windowExpiresAt: true },
    });
    if (!conv?.windowExpiresAt) return false;
    return conv.windowExpiresAt > new Date();
  }

  /**
   * Check if window is open with safety margin (default 30min).
   * Use this for smart-send decisions to avoid race conditions
   * where the window closes between the check and actual send.
   */
  static async isWindowOpenSafe(conversationId: string, marginMs = 30 * 60 * 1000): Promise<boolean> {
    const conv = await prisma.waConversation.findUnique({
      where: { id: conversationId },
      select: { windowExpiresAt: true },
    });
    if (!conv?.windowExpiresAt) return false;
    return conv.windowExpiresAt.getTime() > Date.now() + marginMs;
  }

  /** Open/extend 24h window from inbound message timestamp */
  static async openWindow(conversationId: string, inboundAt: Date): Promise<void> {
    const expiresAt = new Date(inboundAt.getTime() + 24 * 60 * 60 * 1000);
    await prisma.waConversation.update({
      where: { id: conversationId },
      data: { windowExpiresAt: expiresAt, lastClientMessageAt: inboundAt },
    });
  }

  /** Check if a phone requires template (no window or expired) */
  static async requiresTemplate(phone: string): Promise<boolean> {
    const conv = await prisma.waConversation.findUnique({ where: { phone } });
    if (!conv) return true;
    return !conv.windowExpiresAt || conv.windowExpiresAt <= new Date();
  }

  /** Get window expiry for a conversation */
  static async getWindowExpiry(conversationId: string): Promise<Date | null> {
    const conv = await prisma.waConversation.findUnique({
      where: { id: conversationId },
      select: { windowExpiresAt: true },
    });
    return conv?.windowExpiresAt || null;
  }
}
