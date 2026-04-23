import clsx from "clsx";

export type MeetingSource = "CALENDLY_EMAIL" | "CALENDLY_LP" | "SDR_IA" | "HUMANO";

const CONFIG: Record<MeetingSource, { label: string; className: string }> = {
  CALENDLY_EMAIL: { label: "Email",  className: "bg-blue-100 text-blue-700 border-blue-200" },
  CALENDLY_LP:    { label: "Direto", className: "bg-gray-100 text-gray-700 border-gray-300" },
  SDR_IA:         { label: "BIA",    className: "bg-green-100 text-green-700 border-green-200" },
  HUMANO:         { label: "Humano", className: "bg-orange-100 text-orange-700 border-orange-200" },
};

interface Props {
  source?: MeetingSource | null;
  size?: "sm" | "md";
  className?: string;
}

export default function MeetingSourceBadge({ source, size = "sm", className }: Props) {
  if (!source) return null;
  const cfg = CONFIG[source];
  if (!cfg) return null;
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full font-medium border",
        size === "sm" ? "text-[10px] px-1.5 py-0.5" : "text-xs px-2 py-0.5",
        cfg.className,
        className,
      )}
      title={`Origem da reunião: ${cfg.label}`}
    >
      {cfg.label}
    </span>
  );
}
