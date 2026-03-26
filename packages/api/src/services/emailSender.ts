import { Resend } from 'resend';
import prisma from '../lib/prisma';
import { createUnsubToken } from '../routes/email-tracking';

const resend = new Resend(process.env.RESEND_API_KEY);

const TRACKING_BASE_URL = process.env.API_URL || 'http://localhost:3001/api';
const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 1000;

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Appends a 1x1 tracking pixel before </body> (or at the end of the HTML).
 */
export function injectTrackingPixel(html: string, sendId: string): string {
  const pixel = `<img src="${TRACKING_BASE_URL}/t/open/${sendId}" width="1" height="1" style="display:none" alt="" />`;

  if (html.includes('</body>')) {
    return html.replace('</body>', `${pixel}</body>`);
  }

  return html + pixel;
}

/**
 * Finds all href="..." in the HTML, replaces each with a tracking redirect URL,
 * and returns the modified HTML along with the list of unique links found.
 */
export function wrapLinksWithTracking(
  html: string,
  campaignId: string
): { html: string; links: { originalUrl: string; trackingId: string }[] } {
  const links: { originalUrl: string; trackingId: string }[] = [];
  const seenUrls = new Map<string, string>();

  const modifiedHtml = html.replace(/href="(https?:\/\/[^"]+)"/gi, (_match, url: string) => {
    // Skip unsubscribe links — they already have their own tracking
    if (url.includes('/unsubscribe/')) {
      return `href="${url}"`;
    }

    let trackingId = seenUrls.get(url);
    if (!trackingId) {
      // Generate a simple unique id (will be replaced by DB cuid on insert)
      trackingId = `${campaignId}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      seenUrls.set(url, trackingId);
      links.push({ originalUrl: url, trackingId });
    }

    return `href="${TRACKING_BASE_URL}/t/click/${trackingId}"`;
  });

  return { html: modifiedHtml, links };
}

// ─── Main Functions ─────────────────────────────────────────────────────────

/**
 * Sends all queued emails for a campaign, processing in batches to respect
 * Resend rate limits. Creates EmailLink records, injects tracking pixel,
 * wraps links, and updates statuses.
 */
export async function sendCampaignEmails(campaignId: string): Promise<void> {
  const campaign = await prisma.emailCampaign.findUniqueOrThrow({
    where: { id: campaignId },
    include: {
      template: true,
      sends: {
        where: { status: 'QUEUED' },
        include: { contact: true },
      },
    },
  });

  if (!campaign.template) {
    throw new Error(`Campaign ${campaignId} has no template assigned`);
  }

  const baseHtml = campaign.template.htmlContent;

  // ── Anti-spam: filter out unsubscribed, bounced, and invalid contacts ──
  const contactEmails = campaign.sends.map(s => s.contact.email).filter(Boolean) as string[];
  const suppressedEmails = new Set<string>();

  // Check UnsubscribeList
  if (contactEmails.length > 0) {
    const unsubs = await prisma.unsubscribeList.findMany({
      where: { email: { in: contactEmails, mode: 'insensitive' } },
      select: { email: true },
    });
    unsubs.forEach(u => suppressedEmails.add(u.email.toLowerCase()));
  }

  // Check previously bounced sends (hard bounces)
  if (contactEmails.length > 0) {
    const bounced = await prisma.emailSend.findMany({
      where: { contact: { email: { in: contactEmails, mode: 'insensitive' } }, status: 'BOUNCED' },
      select: { contact: { select: { email: true } } },
      distinct: ['contactId'],
    });
    bounced.forEach(b => { if (b.contact.email) suppressedEmails.add(b.contact.email.toLowerCase()); });
  }

  // Check spam complaints
  if (contactEmails.length > 0) {
    const spam = await prisma.emailSend.findMany({
      where: { contact: { email: { in: contactEmails, mode: 'insensitive' } }, status: 'SPAM' },
      select: { contact: { select: { email: true } } },
      distinct: ['contactId'],
    });
    spam.forEach(s => { if (s.contact.email) suppressedEmails.add(s.contact.email.toLowerCase()); });
  }

  if (suppressedEmails.size > 0) {
    console.log(`[emailSender] Suppressing ${suppressedEmails.size} contacts (unsubscribed/bounced/spam)`);
    // Mark suppressed sends as cancelled
    for (const send of campaign.sends) {
      if (send.contact.email && suppressedEmails.has(send.contact.email.toLowerCase())) {
        await prisma.emailSend.update({
          where: { id: send.id },
          data: { status: 'UNSUBSCRIBED' },
        });
      }
    }
  }

  const fromAddress = `${campaign.fromName} <${campaign.fromEmail}>`;

  // Wrap links and create EmailLink records for this campaign
  const { html: linkedHtml, links } = wrapLinksWithTracking(baseHtml, campaignId);

  // Persist EmailLink records
  for (const link of links) {
    await prisma.emailLink.upsert({
      where: { trackingId: link.trackingId },
      update: {},
      create: {
        originalUrl: link.originalUrl,
        trackingId: link.trackingId,
        emailCampaignId: campaignId,
      },
    });
  }

  // Process sends in batches
  const sends = campaign.sends.filter(s =>
    s.contact.email && !suppressedEmails.has(s.contact.email.toLowerCase())
  );

  for (let i = 0; i < sends.length; i += BATCH_SIZE) {
    const batch = sends.slice(i, i + BATCH_SIZE);

    await Promise.all(
      batch.map(async (send) => {
        try {
          if (!send.contact.email) {
            console.warn(`Skipping send ${send.id}: contact has no email`);
            return;
          }

          // Inject per-send tracking pixel
          const finalHtml = injectTrackingPixel(linkedHtml, send.id);

          // Generate unsubscribe URL for this send
          const unsubToken = createUnsubToken(send.id);
          const unsubUrl = `${TRACKING_BASE_URL.replace('/api', '')}/api/unsubscribe/${unsubToken}`;

          // Generate plain text from HTML (strip tags)
          const plainText = finalHtml
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/p>/gi, '\n\n')
            .replace(/<\/div>/gi, '\n')
            .replace(/<\/tr>/gi, '\n')
            .replace(/<\/li>/gi, '\n')
            .replace(/<[^>]+>/g, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/\n{3,}/g, '\n\n')
            .trim();

          const result = await resend.emails.send({
            from: fromAddress,
            to: send.contact.email,
            replyTo: campaign.fromEmail,
            subject: campaign.subject,
            html: finalHtml,
            text: plainText,
            headers: {
              'List-Unsubscribe': `<${unsubUrl}>`,
              'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
            },
          });

          await prisma.emailSend.update({
            where: { id: send.id },
            data: {
              status: 'SENT',
              sentAt: new Date(),
              messageId: result.data?.id ?? null,
            },
          });
        } catch (error: any) {
          const errorMsg = error?.message || String(error);
          console.error(`Failed to send email for send ${send.id}:`, errorMsg);

          // Only mark as BOUNCED if it's a recipient issue, otherwise mark as FAILED
          const isBounce = errorMsg.includes('bounce') || errorMsg.includes('invalid') || errorMsg.includes('not found');
          await prisma.emailSend.update({
            where: { id: send.id },
            data: { status: isBounce ? 'BOUNCED' : 'QUEUED' }, // QUEUED = can retry later
          });
        }
      })
    );

    // Small delay between batches to respect rate limits
    if (i + BATCH_SIZE < sends.length) {
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }

  // Update campaign status
  await prisma.emailCampaign.update({
    where: { id: campaignId },
    data: {
      status: 'SENT',
      sentAt: new Date(),
      totalRecipients: sends.length,
    },
  });
}

/**
 * Sends a single test email for a campaign without creating EmailSend records.
 */
export async function sendTestEmail(campaignId: string, email: string): Promise<void> {
  const campaign = await prisma.emailCampaign.findUniqueOrThrow({
    where: { id: campaignId },
    include: { template: true },
  });

  if (!campaign.template) {
    throw new Error(`Campaign ${campaignId} has no template assigned`);
  }

  const fromAddress = `${campaign.fromName} <${campaign.fromEmail}>`;

  await resend.emails.send({
    from: fromAddress,
    to: email,
    subject: `[TESTE] ${campaign.subject}`,
    html: campaign.template.htmlContent,
  });
}
