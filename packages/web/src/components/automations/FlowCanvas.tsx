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
import WaitForResponseNode from "./nodes/WaitForResponseNode";

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
    case "WAIT_FOR_RESPONSE":
      return <WaitForResponseNode config={config} onChange={onChange} />;
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
  const [openMenuAt, setOpenMenuAt] = useState<string | null>(null);

  const stepsMap = new Map(steps.map((s) => [s.id, s]));

  // Find root: the step no other step points to
  const referencedIds = new Set<string>();
  steps.forEach((s) => {
    if (s.nextStepId) referencedIds.add(s.nextStepId);
    if (s.trueStepId) referencedIds.add(s.trueStepId);
    if (s.falseStepId) referencedIds.add(s.falseStepId);
  });
  const rootStep = steps.find((s) => !referencedIds.has(s.id)) || null;

  // Generate unique ID
  const genId = () =>
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `step-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  // Recompute order by traversing the tree
  function recomputeOrder(allSteps: FlowStep[]): FlowStep[] {
    const map = new Map(allSteps.map((s) => [s.id, { ...s }]));
    const refs = new Set<string>();
    allSteps.forEach((s) => {
      if (s.nextStepId) refs.add(s.nextStepId);
      if (s.trueStepId) refs.add(s.trueStepId);
      if (s.falseStepId) refs.add(s.falseStepId);
    });
    const root = allSteps.find((s) => !refs.has(s.id));

    let order = 1;
    const visited = new Set<string>();
    const traverse = (id: string | null | undefined) => {
      if (!id || visited.has(id)) return;
      visited.add(id);
      const step = map.get(id);
      if (!step) return;
      step.order = order++;
      if (step.actionType === "CONDITION" || step.actionType === "WAIT_FOR_RESPONSE") {
        traverse(step.trueStepId);
        traverse(step.falseStepId);
      }
      traverse(step.nextStepId);
    };
    if (root) traverse(root.id);

    return allSteps.map((s) => map.get(s.id) || s);
  }

  // Add step helper
  const handleAddStep = useCallback(
    (
      parentStepId: string | null,
      position: "next" | "true" | "false" | "before-first",
      actionType: string
    ) => {
      const newId = genId();
      const newStep: FlowStep = {
        id: newId,
        order: 0,
        actionType,
        config: {},
        nextStepId: null,
        trueStepId: null,
        falseStepId: null,
      };

      let updated = [...steps];

      if (position === "before-first") {
        newStep.nextStepId = rootStep?.id || null;
        updated.push(newStep);
      } else if (parentStepId) {
        const parentIdx = updated.findIndex((s) => s.id === parentStepId);
        if (parentIdx >= 0) {
          const parent = { ...updated[parentIdx] };
          if (position === "next") {
            newStep.nextStepId = parent.nextStepId || null;
            parent.nextStepId = newId;
          } else if (position === "true") {
            newStep.nextStepId = parent.trueStepId || null;
            parent.trueStepId = newId;
          } else if (position === "false") {
            newStep.nextStepId = parent.falseStepId || null;
            parent.falseStepId = newId;
          }
          updated[parentIdx] = parent;
          updated.push(newStep);
        }
      }

      updated = recomputeOrder(updated);
      onStepsChange(updated);
      setOpenMenuAt(null);
    },
    [steps, rootStep, onStepsChange]
  );

  // Delete step helper
  const handleDeleteStep = useCallback(
    (id: string) => {
      let updated = [...steps];
      const step = updated.find((s) => s.id === id);
      if (!step) return;

      // Find parent that references this step
      const parent = updated.find(
        (s) =>
          s.nextStepId === id || s.trueStepId === id || s.falseStepId === id
      );

      // If CONDITION or WAIT_FOR_RESPONSE, collect all steps in both branches to delete
      const toDelete = new Set<string>([id]);
      if (step.actionType === "CONDITION" || step.actionType === "WAIT_FOR_RESPONSE") {
        const collectBranch = (startId: string | null | undefined) => {
          let currentId = startId;
          while (currentId && !toDelete.has(currentId)) {
            toDelete.add(currentId);
            const s = updated.find((x) => x.id === currentId);
            if (s?.actionType === "CONDITION" || s?.actionType === "WAIT_FOR_RESPONSE") {
              collectBranch(s.trueStepId);
              collectBranch(s.falseStepId);
            }
            currentId = s?.nextStepId;
          }
        };
        collectBranch(step.trueStepId);
        collectBranch(step.falseStepId);
      }

      // Relink parent
      if (parent) {
        const pIdx = updated.findIndex((s) => s.id === parent.id);
        const p = { ...updated[pIdx] };
        const skipTo =
          step.actionType === "CONDITION" || step.actionType === "WAIT_FOR_RESPONSE" ? null : step.nextStepId || null;
        if (p.nextStepId === id) p.nextStepId = skipTo;
        if (p.trueStepId === id) p.trueStepId = skipTo;
        if (p.falseStepId === id) p.falseStepId = skipTo;
        updated[pIdx] = p;
      }

      updated = updated.filter((s) => !toDelete.has(s.id));
      updated = recomputeOrder(updated);
      onStepsChange(updated);
    },
    [steps, onStepsChange]
  );

  const handleUpdateStepConfig = useCallback(
    (id: string, config: Record<string, any>) => {
      onStepsChange(steps.map((s) => (s.id === id ? { ...s, config } : s)));
    },
    [steps, onStepsChange]
  );

  // Recursive chain renderer
  function renderChain(
    startStepId: string | null | undefined,
    parentId: string | null,
    position: "next" | "true" | "false" | "before-first"
  ): React.ReactNode {
    if (!startStepId) {
      // End of chain - show add button + end marker
      const menuKey = `end-${parentId}-${position}`;
      return (
        <div className="flex flex-col items-center">
          <div className="relative">
            <FlowConnector
              onAdd={() =>
                setOpenMenuAt(openMenuAt === menuKey ? null : menuKey)
              }
            />
            <FlowAddNodeMenu
              open={openMenuAt === menuKey}
              onClose={() => setOpenMenuAt(null)}
              onSelect={(actionType) => {
                if (parentId) {
                  handleAddStep(parentId, position, actionType);
                } else {
                  handleAddStep(null, "before-first", actionType);
                }
              }}
            />
          </div>
          <div className="w-36 py-2 text-center text-[10px] font-medium text-gray-400 border border-dashed border-gray-200 rounded-lg">
            Fim
          </div>
        </div>
      );
    }

    const step = stepsMap.get(startStepId);
    if (!step) return null;

    const menuKey = `after-${step.id}`;

    return (
      <div className="flex flex-col items-center">
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

        {step.actionType === "CONDITION" ? (
          // Branch into Sim/Nao
          <>
            <div className="w-0.5 h-4 bg-gray-300" />
            <div className="flex items-start">
              {/* Left branch - Sim */}
              <div className="flex flex-col items-center min-w-[280px]">
                <div
                  className="h-5 border-r-2 border-t-2 border-gray-300 rounded-tr-xl self-stretch"
                  style={{ marginLeft: "50%" }}
                />
                <span className="text-xs font-semibold text-green-700 bg-green-100 px-3 py-0.5 rounded-full mb-1">
                  Sim
                </span>
                {renderChain(step.trueStepId, step.id, "true")}
              </div>
              {/* Right branch - Nao */}
              <div className="flex flex-col items-center min-w-[280px]">
                <div
                  className="h-5 border-l-2 border-t-2 border-gray-300 rounded-tl-xl self-stretch"
                  style={{ marginRight: "50%" }}
                />
                <span className="text-xs font-semibold text-red-700 bg-red-100 px-3 py-0.5 rounded-full mb-1">
                  Não
                </span>
                {renderChain(step.falseStepId, step.id, "false")}
              </div>
            </div>
          </>
        ) : step.actionType === "WAIT_FOR_RESPONSE" ? (
          // Branch into Sem resposta / Respondeu
          <>
            <div className="w-0.5 h-4 bg-gray-300" />
            <div className="flex items-start">
              {/* Left branch - Sem resposta (trueStepId) */}
              <div className="flex flex-col items-center min-w-[280px]">
                <div
                  className="h-5 border-r-2 border-t-2 border-gray-300 rounded-tr-xl self-stretch"
                  style={{ marginLeft: "50%" }}
                />
                <span className="text-xs font-semibold text-red-700 bg-red-100 px-3 py-0.5 rounded-full mb-1">
                  Sem resposta
                </span>
                {renderChain(step.trueStepId, step.id, "true")}
              </div>
              {/* Right branch - Respondeu (falseStepId) */}
              <div className="flex flex-col items-center min-w-[280px]">
                <div
                  className="h-5 border-l-2 border-t-2 border-gray-300 rounded-tl-xl self-stretch"
                  style={{ marginRight: "50%" }}
                />
                <span className="text-xs font-semibold text-green-700 bg-green-100 px-3 py-0.5 rounded-full mb-1">
                  Respondeu
                </span>
                {renderChain(step.falseStepId, step.id, "false")}
              </div>
            </div>
          </>
        ) : (
          // Linear: connector then next step
          <>
            <div className="relative">
              <FlowConnector
                onAdd={() =>
                  setOpenMenuAt(openMenuAt === menuKey ? null : menuKey)
                }
              />
              <FlowAddNodeMenu
                open={openMenuAt === menuKey}
                onClose={() => setOpenMenuAt(null)}
                onSelect={(actionType) =>
                  handleAddStep(step.id, "next", actionType)
                }
              />
            </div>
            {step.nextStepId ? (
              renderChain(step.nextStepId, step.id, "next")
            ) : (
              <div className="w-36 py-2 text-center text-[10px] font-medium text-gray-400 border border-dashed border-gray-200 rounded-lg">
                Fim
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  // Menu key for the "before-first" add button (between trigger and first step)
  const beforeFirstMenuKey = "before-first";

  return (
    <div className="flex-1 overflow-auto">
      <div
        className="min-h-full py-10 flex flex-col items-center"
        style={{
          backgroundImage:
            "radial-gradient(circle, #e5e7eb 1px, transparent 1px)",
          backgroundSize: "20px 20px",
          minWidth: "fit-content",
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
                {triggerLabels[trigger.triggerType] ||
                  trigger.triggerType ||
                  "Selecionar gatilho"}
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

        {/* Connector after trigger → into the flow tree */}
        {steps.length === 0 ? (
          // No steps yet: show add button to create the first step
          <>
            <div className="relative">
              <FlowConnector
                onAdd={() =>
                  setOpenMenuAt(
                    openMenuAt === beforeFirstMenuKey
                      ? null
                      : beforeFirstMenuKey
                  )
                }
              />
              <FlowAddNodeMenu
                open={openMenuAt === beforeFirstMenuKey}
                onClose={() => setOpenMenuAt(null)}
                onSelect={(actionType) =>
                  handleAddStep(null, "before-first", actionType)
                }
              />
            </div>
            <div className="w-48 py-3 text-center text-xs font-medium text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">
              Fim do fluxo
            </div>
          </>
        ) : (
          // Has steps: render the "before-first" add button, then the tree
          <>
            <div className="relative">
              <FlowConnector
                onAdd={() =>
                  setOpenMenuAt(
                    openMenuAt === beforeFirstMenuKey
                      ? null
                      : beforeFirstMenuKey
                  )
                }
              />
              <FlowAddNodeMenu
                open={openMenuAt === beforeFirstMenuKey}
                onClose={() => setOpenMenuAt(null)}
                onSelect={(actionType) =>
                  handleAddStep(null, "before-first", actionType)
                }
              />
            </div>
            {renderChain(rootStep?.id || null, null, "before-first")}
          </>
        )}
      </div>
    </div>
  );
}
