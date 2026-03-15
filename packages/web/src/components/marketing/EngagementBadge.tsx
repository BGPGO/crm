import clsx from "clsx";

type EngagementLevel = "ENGAGED" | "INTERMEDIATE" | "DISENGAGED";

interface EngagementBadgeProps {
  level: EngagementLevel;
}

const config: Record<EngagementLevel, { label: string; classes: string }> = {
  ENGAGED: {
    label: "Engajado",
    classes: "bg-green-100 text-green-700",
  },
  INTERMEDIATE: {
    label: "Intermediário",
    classes: "bg-yellow-100 text-yellow-700",
  },
  DISENGAGED: {
    label: "Desengajado",
    classes: "bg-red-100 text-red-700",
  },
};

export default function EngagementBadge({ level }: EngagementBadgeProps) {
  const { label, classes } = config[level] ?? config.DISENGAGED;

  return (
    <span
      className={clsx(
        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
        classes
      )}
    >
      {label}
    </span>
  );
}
