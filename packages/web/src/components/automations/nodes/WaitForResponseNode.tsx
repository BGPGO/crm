"use client";

interface NodeConfigProps {
  config: Record<string, any>;
  onChange: (config: Record<string, any>) => void;
}

const channelOptions = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "Email" },
  { value: "any", label: "Qualquer canal" },
];

function computeLabel(waitHours: number, channel: string): string {
  const channelLabel =
    channel === "whatsapp"
      ? "WhatsApp"
      : channel === "email"
      ? "Email"
      : "qualquer canal";
  const hoursLabel = waitHours === 1 ? "1 hora" : `${waitHours} horas`;
  return `Se sem resposta via ${channelLabel} após ${hoursLabel}...`;
}

export default function WaitForResponseNode({
  config,
  onChange,
}: NodeConfigProps) {
  const waitHours = config.waitHours || 3;
  const channel = config.channel || "whatsapp";

  return (
    <div className="space-y-3">
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Tempo de espera (horas)
          </label>
          <input
            type="number"
            value={waitHours}
            onChange={(e) =>
              onChange({
                ...config,
                waitHours: Math.min(720, Math.max(1, parseInt(e.target.value) || 1)),
              })
            }
            min={1}
            max={720}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
          />
        </div>
        <div className="flex-1">
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Canal
          </label>
          <select
            value={channel}
            onChange={(e) => onChange({ ...config, channel: e.target.value })}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-white"
          >
            {channelOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-amber-50 rounded-lg px-3 py-2">
        <p className="text-xs text-amber-700 font-medium">
          {computeLabel(waitHours, channel)}
        </p>
      </div>

      <div className="flex items-center gap-4 pt-1">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-400" />
          <span className="text-xs text-gray-500">Sem resposta</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-green-400" />
          <span className="text-xs text-gray-500">Respondeu</span>
        </div>
      </div>
    </div>
  );
}
