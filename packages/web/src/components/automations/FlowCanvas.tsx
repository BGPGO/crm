"use client";

import { useState, useCallback } from "react";
import { Zap } from "lucide-react";
import FlowConnector from "./FlowConnector";
import FlowAddNodeMenu from "./FlowAddNodeMenu";
import FlowNode from "./FlowNode";
import SendWhatsAppAINode from "./nodes/SendWhatsAppAINode";
import SendWhatsAppTemplateNode from "./nodes/SendWhatsAppTemplateNode";
import WaitNode from "./nodes/WaitNode";
import ConditionNode from "./nodes/ConditionNode";
import MoveStageNode from "./nodes/MoveStageNode";
import MarkLostNode from "./nodes/MarkLostNode";
import AddTagNode from "./nodes/AddTagNode";
import RemoveTagNode from "./nodes/RemoveTagNode";

interface FlowStep {
  id: string;
  order: number;
  actionType: string;
  config: Record<string, any>;
  nextStepId?: string | null;
  trueStepId?: string | null;
  falseStepId?: string | null;
}

interface TriggerConfig {
  triggerType: string;
  triggerConfig: Record<string, any>;
}

interface FlowCanvasProps {
  trigger: TriggerConfig;
  steps: FlowStep[];
  onStepsChange: (steps: FlowStep[]) => void;
  onTriggerChange: (trigger: TriggerConfig) => void;
}

const triggerLabels: Record<string, string> = {
  NEW_LEAD: "Novo lead entra no funil",
  STAGE_CHANGED: "Lead muda de etapa",
  TAG_ADDED: "Tag adicionada ao lead",
  NO_RESPONSE: "Lead não responde",
  MANUAL: "Acionado manualmente",
};

function getNodeConfigComponent(
  actionType: string,
  config: Record<string, any>,
  onChange: (config: Record<string, any>) => void
) {
  switch (actionType) {
    case "SEND_WHATSAPP_AI":
      return <SendWhatsAppAINode config={config} onChange={onChange} />;
    case "SEND_WHATSAPP":
      return <SendWhatsAppTemplateNode config={config} onChange={onChange} />;
    case "WAIT":
      return <WaitNode config={config} onChange={onChange} />;
    case "CONDITION":
      return <ConditionNode config={config} onChange={onChange} />;
    case "MOVE_PIPELINE_STAGE":
      return <MoveStageNode config={config} onChange={onChange} />;
    case "MARK_LOST":
      return <MarkLostNode config={config} onChange={onChange} />;
    case "ADD_TAG":
      return <AddTagNode config={config} onChange={onChange} />;
    case "REMOVE_TAG":
      return <RemoveTagNode config={config} onChange={onChange} />;
    default:
      return null;
  }
}

export default function FlowCanvas({
  trigger,
  steps,
  onStepsChange,
  onTriggerChange,
}: FlowCanvasProps) {
  // Track which connector's menu is open (step id or "start" for top, "end" for bottom)
  const [openMenuAt, setOpenMenuAt] = useState<string | null>(null);

  const sortedSteps = [...steps].sort((a, b) => a.order - b.order);

  const handleAddStep = useCallback(
    (afterStepId: string | null, actionType: string) => {
      const newId = crypto.randomUUID
        ? crypto.randomUUID()
        : `step-${Date.now()}`;

      let insertOrder: number;
      if (afterStepId === null) {
        // Insert at beginning
        insertOrder = 0;
      } else {
        const afterStep = steps.find((s) => s.id === afterStepId);
        insertOrder = afterStep ? afterStep.order : steps.length;
      }

      // Shift orders of subsequent steps
      const updatedSteps = steps.map((s) =>
        s.order > insertOrder ? { ...s, order: s.order + 1 } : s
      );

      const newStep: FlowStep = {
        id: newId,
        order: insertOrder + 1,
        actionType,
        config: {},
        nextStepId: null,
        trueStepId: null,
        falseStepId: null,
      };

      onStepsChange([...updatedSteps, newStep]);
      setOpenMenuAt(null);
    },
    [steps, onStepsChange]
  );

  const handleDeleteStep = useCallback(
    (id: string) => {
      const filtered = steps.filter((s) => s.id !== id);
      // Re-order remaining steps
      const reordered = filtered
        .sort((a, b) => a.order - b.order)
        .map((s, i) => ({ ...s, order: i + 1 }));
      onStepsChange(reordered);
    },
    [steps, onStepsChange]
  );

  const handleUpdateStepConfig = useCallback(
    (id: string, config: Record<string, any>) => {
      onStepsChange(
        steps.map((s) => (s.id === id ? { ...s, config } : s))
      );
    },
    [steps, onStepsChange]
  );

  return (
    <div className="flex-1 overflow-y-auto">
      <div
        className="min-h-full py-10 flex flex-col items-center"
        style={{
          backgroundImage:
            "radial-gradient(circle, #e5e7eb 1px, transparent 1px)",
          backgroundSize: "20px 20px",
        }}
      >
        {/* Trigger node */}
        <div className="w-80 bg-gradient-to-r from-blue-500 to-blue-600 rounded-xl shadow-md text-white p-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
              <Zap size={16} />
            </div>
            <div>
              <p className="text-xs font-medium text-blue-100">Gatilho</p>
              <p className="text-sm font-semibold">
                {triggerLabels[trigger.triggerType] || trigger.triggerType || "Selecionar gatilho"}
              </p>
            </div>
          </div>
          {!trigger.triggerType && (
            <div className="mt-3">
              <select
                value={trigger.triggerType || ""}
                onChange={(e) =>
                  onTriggerChange({
                    ...trigger,
                    triggerType: e.target.value,
                  })
                }
                className="w-full px-3 py-2 text-sm bg-white/20 border border-white/30 rounded-lg text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-white/50"
              >
                <option value="" className="text-gray-900">
                  Selecionar...
                </option>
                {Object.entries(triggerLabels).map(([key, label]) => (
                  <option key={key} value={key} className="text-gray-900">
                    {label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Connector after trigger */}
        <div className="relative">
          <FlowConnector
            onAdd={() =>
              setOpenMenuAt(openMenuAt === "start" ? null : "start")
            }
          />
          <FlowAddNodeMenu
            open={openMenuAt === "start"}
            onClose={() => setOpenMenuAt(null)}
            onSelect={(actionType) => handleAddStep(null, actionType)}
          />
        </div>

        {/* Steps */}
        {sortedSteps.map((step, index) => (
          <div key={step.id} className="flex flex-col items-center">
            <FlowNode
              id={step.id}
              actionType={step.actionType}
              config={step.config}
              onConfigChange={(config) =>
                handleUpdateStepConfig(step.id, config)
              }
              onDelete={() => handleDeleteStep(step.id)}
            >
              {getNodeConfigComponent(step.actionType, step.config, (config) =>
                handleUpdateStepConfig(step.id, config)
              )}
            </FlowNode>

            {/* Connector after each step */}
            <div className="relative">
              <FlowConnector
                onAdd={() =>
                  setOpenMenuAt(
                    openMenuAt === step.id ? null : step.id
                  )
                }
              />
              <FlowAddNodeMenu
                open={openMenuAt === step.id}
                onClose={() => setOpenMenuAt(null)}
                onSelect={(actionType) => handleAddStep(step.id, actionType)}
              />
            </div>
          </div>
        ))}

        {/* End indicator */}
        <div className="w-48 py-3 text-center text-xs font-medium text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">
          Fim do fluxo
        </div>
      </div>
    </div>
  );
}
