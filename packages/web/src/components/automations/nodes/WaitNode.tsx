"use client";

interface NodeConfigProps {
  config: Record<string, any>;
  onChange: (config: Record<string, any>) => void;
}

const unitLabels: Record<string, string> = {
  minutes: "Minutos",
  hours: "Horas",
  days: "Dias",
};

function computeLabel(duration: number, unit: string): string {
  const label = unit === "minutes" ? "minuto" : unit === "hours" ? "hora" : "dia";
  const plural = duration !== 1 ? "s" : "";
  return `Aguardar ${duration || 0} ${label}${plural}`;
}

export default function WaitNode({ config, onChange }: NodeConfigProps) {
  const duration = config.duration || 1;
  const unit = config.unit || "hours";

  return (
    <div className="space-y-3">
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Duração
          </label>
          <input
            type="number"
            value={duration}
            onChange={(e) =>
              onChange({ ...config, duration: parseInt(e.target.value) || 0 })
            }
            min={1}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <div className="flex-1">
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Unidade
          </label>
          <select
            value={unit}
            onChange={(e) => onChange({ ...config, unit: e.target.value })}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
          >
            <option value="minutes">Minutos</option>
            <option value="hours">Horas</option>
            <option value="days">Dias</option>
          </select>
        </div>
      </div>
      <div className="bg-blue-50 rounded-lg px-3 py-2">
        <p className="text-xs text-blue-700 font-medium">
          {computeLabel(duration, unit)}
        </p>
      </div>
    </div>
  );
}
