"use client";

import { useState, useEffect } from "react";
import { ExternalLink, ImageOff, Instagram, Megaphone } from "lucide-react";
import { api } from "@/lib/api";

// Espelho de AdCreativeInfo do backend (services/metaAds/client.ts)
interface AdCreative {
  media_type: "video" | "image" | "carousel" | "unknown";
  video_url: string | null;
  image_url: string | null;
  thumbnail_url: string | null;
  body: string | null;
  title: string | null;
  description: string | null;
  link_url: string | null;
  cta_type: string | null;
  instagram_permalink_url: string | null;
  cards: Array<{
    image_url: string | null;
    title: string | null;
    description: string | null;
    link_url: string | null;
  }>;
}

interface AdCreativeInfo {
  id: string;
  name: string;
  campaign_name: string | null;
  url: string | null;
  creative: AdCreative | null;
}

interface Props {
  dealId: string;
}

/**
 * Card com o criativo do anúncio Meta que originou o lead (imagem/vídeo,
 * copy e CTA), buscado do ContIA via API do CRM. Não renderiza nada quando
 * o deal não tem utm_term ou o anúncio não é encontrado.
 */
export default function AdCreativeCard({ dealId }: Props) {
  const [ad, setAd] = useState<AdCreativeInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [imgBroken, setImgBroken] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setImgBroken(false);
    api
      .get<{ data: AdCreativeInfo | null }>(`/deals/${dealId}/ad-creative`)
      .then((res) => {
        if (!cancelled) setAd(res.data);
      })
      .catch(() => {
        if (!cancelled) setAd(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dealId]);

  if (loading) {
    return (
      <div className="py-2">
        <span className="text-xs text-gray-400">Criativo do anúncio</span>
        <div className="mt-1 h-32 rounded-lg bg-gray-100 animate-pulse" />
      </div>
    );
  }

  if (!ad || !ad.creative) return null;

  const c = ad.creative;
  const imageUrl = c.image_url ?? c.thumbnail_url ?? c.cards[0]?.image_url ?? null;
  // Link principal = post no Instagram (como o lead viu a propaganda);
  // Gerenciador de Anúncios fica como secundário.
  const igUrl = c.instagram_permalink_url;

  const media =
    c.media_type === "video" && c.video_url ? (
      <video
        src={c.video_url}
        poster={imageUrl ?? undefined}
        controls
        preload="none"
        className="w-full max-h-64 bg-black"
      />
    ) : imageUrl && !imgBroken ? (
      <img
        src={imageUrl}
        alt={ad.name}
        loading="lazy"
        onError={() => setImgBroken(true)}
        className="w-full max-h-64 object-cover"
      />
    ) : (
      <div className="flex items-center justify-center h-24 bg-gray-50 text-gray-300">
        <ImageOff size={24} />
      </div>
    );

  return (
    <div className="py-2">
      <span className="text-xs text-gray-400">Criativo do anúncio</span>
      <div className="mt-1 rounded-lg border border-gray-200 overflow-hidden bg-white">
        {igUrl && !(c.media_type === "video" && c.video_url) ? (
          <a href={igUrl} target="_blank" rel="noopener noreferrer" title="Ver post no Instagram">
            {media}
          </a>
        ) : (
          media
        )}

        <div className="p-2.5 space-y-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium text-gray-800 break-words">{ad.name}</p>
            <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
              {igUrl && (
                <a
                  href={igUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Ver post no Instagram"
                  className="text-gray-400 hover:text-pink-600"
                >
                  <Instagram size={13} />
                </a>
              )}
              {ad.url && (
                <a
                  href={ad.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Abrir no Gerenciador de Anúncios"
                  className="text-gray-400 hover:text-petrol-600"
                >
                  <ExternalLink size={13} />
                </a>
              )}
            </div>
          </div>

          {ad.campaign_name && (
            <p className="flex items-center gap-1 text-xs text-gray-500">
              <Megaphone size={11} className="flex-shrink-0" />
              <span className="break-words">{ad.campaign_name}</span>
            </p>
          )}

          {c.title && <p className="text-xs font-medium text-gray-700">{c.title}</p>}

          {c.body && (
            <p className="text-xs text-gray-500 whitespace-pre-line line-clamp-4">{c.body}</p>
          )}

          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            {c.cta_type && (
              <span className="inline-flex items-center text-[10px] uppercase tracking-wide bg-petrol-50 text-petrol-700 px-1.5 py-0.5 rounded">
                {c.cta_type.replace(/_/g, " ")}
              </span>
            )}
            {c.media_type === "carousel" && c.cards.length > 0 && (
              <span className="inline-flex items-center text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                carrossel · {c.cards.length} cards
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
