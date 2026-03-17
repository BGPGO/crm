"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import FlowStepCard, { Step } from "@/components/marketing/FlowStepCard";

interface FlowBuilderProps {
  steps: Step[];
  onChange: (steps: Step[]) => void;
  readOnly?: boolean;
}

const ACTION_OPTIONS = [
  { value: "ADD_TAG", label: "Adicionar Tag" },
  { value: "REMOVE_TAG", label: "Remover Tag" },
  { value: "SEND_EMAIL", label: "Enviar Email" },
  { value: "SEND_WHATSAPP", label: "Enviar WhatsApp" },
  { value: "WAIT", label: "Aguardar" },
  { value: "UPDATE_FIELD", label: "Atualizar Campo" },
  { value: "MOVE_PIPELINE_STAGE", label: "Mover Etapa" },
  { value: "CONDITION", label: "Condição" },
];

export default function FlowBuilder({
  steps,
  onChange,
  readOnly = false,
}: FlowBuilderProps) {
  const [showPickerAt, setShowPickerAt] = useState<number | null>(null);

  const addStep = (afterIndex: number, actionType: string) => {
    const newStep: Step = {
      order: afterIndex + 1,
      actionType,
      config: {},
    };

    const updated = [...steps];
    updated.splice(afterIndex + 1, 0, newStep);

    // Re-index orders
    const reindexed = updated.map((s, i) => ({ ...s, order: i }));
    onChange(reindexed);
    setShowPickerAt(null);
  };

  const updateStep = (index: number, step: Step) => {
    const updated = steps.map((s, i) => (i === index ? step : s));
    onChange(updated);
  };

  const deleteStep = (index: number) => {
    const updated = steps.filter((_, i) => i !== index);
    const reindexed = updated.map((s, i) => ({ ...s, order: i }));
    onChange(reindexed);
  };

  const renderConnector = (index: number) => {
    if (readOnly) {
      return (
        <div className="flex justify-center">
          <div className="w-0.5 h-8 bg-gray-300" />
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center">
        <div className="w-0.5 h-3 bg-gray-300" />
        <button
          type="button"
          onClick={() =>
            setShowPickerAt(showPickerAt === index ? null : index)
          }
          className="flex items-center justify-center w-6 h-6 rounded-full border-2 border-dashed border-gray-300 text-gray-400 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50 transition-colors"
          title="Adicionar passo"
        >
          <Plus size={12} />
        </button>

        {showPickerAt === index && (
          <div className="mt-1 bg-white rounded-lg border border-gray-200 shadow-lg py-1 z-20 w-56">
            {ACTION_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => addStep(index, opt.value)}
                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}

        <div className="w-0.5 h-3 bg-gray-300" />
      </div>
    );
  };

  return (
    <div className="space-y-0">
      {/* Start node */}
      <div className="flex justify-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-600 text-white text-sm font-medium shadow-sm">
          <div className="w-2 h-2 rounded-full bg-white" />
          Início
        </div>
      </div>

      {steps.length === 0 && !readOnly && (
        <>
          <div className="flex flex-col items-center">
            <div className="w-0.5 h-6 bg-gray-300" />
            <button
              type="button"
              onClick={() =>
                setShowPickerAt(showPickerAt === -1 ? null : -1)
              }
              className="flex items-center gap-2 px-4 py-2 rounded-lg border-2 border-dashed border-gray-300 text-gray-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-colors text-sm"
            >
              <Plus size={14} />
              Adicionar primeiro passo
            </button>

            {showPickerAt === -1 && (
              <div className="mt-2 bg-white rounded-lg border border-gray-200 shadow-lg py-1 z-20 w-56">
                {ACTION_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => addStep(-1, opt.value)}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {steps.map((step, index) => (
        <div key={step.id ?? `step-${index}`}>
          {/* Connector line from previous */}
          {renderConnector(index - 1)}

          {/* Step card */}
          <div className="max-w-md mx-auto">
            <FlowStepCard
              step={step}
              onUpdate={(updated) => updateStep(index, updated)}
              onDelete={() => deleteStep(index)}
              readOnly={readOnly}
            />
          </div>
        </div>
      ))}

      {/* Add step at end */}
      {steps.length > 0 && renderConnector(steps.length - 1)}

      {/* End node */}
      <div className="flex justify-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gray-200 text-gray-600 text-sm font-medium">
          <div className="w-2 h-2 rounded-full bg-gray-400" />
          Fim
        </div>
      </div>
    </div>
  );
}
