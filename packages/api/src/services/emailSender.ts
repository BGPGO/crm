import { Resend } from 'resend';
import prisma from '../lib/prisma';

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
  const sends = campaign.sends;

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

          const result = await resend.emails.send({
            from: fromAddress,
            to: send.contact.email,
            subject: campaign.subject,
            html: finalHtml,
          });

          await prisma.emailSend.update({
            where: { id: send.id },
            data: {
              status: 'SENT',
              sentAt: new Date(),
              messageId: result.data?.id ?? null,
            },
          });
        } catch (error) {
          console.error(`Failed to send email for send ${send.id}:`, error);

          await prisma.emailSend.update({
            where: { id: send.id },
            data: { status: 'BOUNCED' },
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
