"use client";

import React, { useCallback } from "react";
import {
  DragDropContext,
  Droppable,
  Draggable,
  DropResult,
} from "@hello-pangea/dnd";
import { Plus } from "lucide-react";
import type {
  EmailSection,
  SectionType,
  SectionData,
  SectionStyle,
  GlobalStyle,
} from "@/types/email-builder";
import { SectionWrapper } from "./SectionWrapper";
import { SectionRenderer } from "./SectionRenderer";

// ---------------------------------------------------------------------------
// Add Section Button (between sections)
// ---------------------------------------------------------------------------

function AddSectionButton({ onClick }: { onClick: () => void }) {
  return (
    <div className="group flex items-center justify-center py-1">
      <div className="flex-1 h-px bg-transparent group-hover:bg-blue-200 transition-colors" />
      <button
        type="button"
        onClick={onClick}
        className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider
                   text-gray-400 rounded-full border border-transparent
                   hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50
                   opacity-0 group-hover:opacity-100
                   transition-all duration-200"
      >
        <Plus className="h-3 w-3" />
        Adicionar
      </button>
      <div className="flex-1 h-px bg-transparent group-hover:bg-blue-200 transition-colors" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface EmailBuilderCanvasProps {
  sections: EmailSection[];
  selectedSectionId: string | null;
  globalStyle: GlobalStyle;
  onSelectSection: (id: string | null) => void;
  onUpdateSection: (
    sectionId: string,
    data: Partial<SectionData>,
    style?: Partial<SectionStyle>
  ) => void;
  onRemoveSection: (sectionId: string) => void;
  onDuplicateSection: (sectionId: string) => void;
  onMoveSection: (fromIndex: number, toIndex: number) => void;
  onAddSection: (type: SectionType, atIndex?: number) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function EmailBuilderCanvas({
  sections,
  selectedSectionId,
  globalStyle,
  onSelectSection,
  onUpdateSection,
  onRemoveSection,
  onDuplicateSection,
  onMoveSection,
  onAddSection,
}: EmailBuilderCanvasProps) {
  const handleDragEnd = useCallback(
    (result: DropResult) => {
      if (!result.destination) return;
      const from = result.source.index;
      const to = result.destination.index;
      if (from !== to) {
        onMoveSection(from, to);
      }
    },
    [onMoveSection]
  );

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // Only deselect when clicking the canvas background itself
      if (e.target === e.currentTarget) {
        onSelectSection(null);
      }
    },
    [onSelectSection]
  );

  return (
    <div
      className="flex-1 overflow-auto"
      style={{ backgroundColor: globalStyle.bodyBackgroundColor }}
      onClick={handleCanvasClick}
    >
      <div className="flex justify-center py-8 px-4">
        <div
          className="w-full rounded-lg shadow-sm"
          style={{
            maxWidth: globalStyle.contentWidth + "px",
            backgroundColor: globalStyle.contentBackgroundColor,
          }}
          onClick={handleCanvasClick}
        >
          {/* Empty state */}
          {sections.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <Plus className="h-10 w-10 mb-3 text-gray-300" />
              <p className="text-sm font-medium">Nenhuma secao adicionada</p>
              <p className="text-xs mt-1">
                Use o painel a esquerda para adicionar secoes
              </p>
            </div>
          )}

          {/* Add button at the top */}
          {sections.length > 0 && (
            <AddSectionButton onClick={() => onAddSection("text", 0)} />
          )}

          {/* Drag & drop context */}
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="email-sections">
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={snapshot.isDraggingOver ? "bg-blue-50/30 rounded" : ""}
                >
                  {sections.map((section, index) => (
                    <React.Fragment key={section.id}>
                      <Draggable
                        draggableId={section.id}
                        index={index}
                      >
                        {(dragProvided, dragSnapshot) => (
                          <div
                            ref={dragProvided.innerRef}
                            {...dragProvided.draggableProps}
                            style={{
                              ...dragProvided.draggableProps.style,
                              ...(dragSnapshot.isDragging
                                ? { boxShadow: "0 4px 20px rgba(0,0,0,0.15)", borderRadius: 8 }
                                : {}),
                            }}
                          >
                            <SectionWrapper
                              section={section}
                              isSelected={selectedSectionId === section.id}
                              onSelect={() => onSelectSection(section.id)}
                              onDuplicate={() => onDuplicateSection(section.id)}
                              onRemove={() => onRemoveSection(section.id)}
                              onMoveUp={() => {
                                if (index > 0) onMoveSection(index, index - 1);
                              }}
                              onMoveDown={() => {
                                if (index < sections.length - 1)
                                  onMoveSection(index, index + 1);
                              }}
                              dragHandleProps={dragProvided.dragHandleProps}
                            >
                              <SectionRenderer
                                section={section}
                                isSelected={selectedSectionId === section.id}
                                onUpdate={(data, style) =>
                                  onUpdateSection(section.id, data, style)
                                }
                                globalStyle={globalStyle}
                              />
                            </SectionWrapper>
                          </div>
                        )}
                      </Draggable>

                      {/* Add section button between sections */}
                      <AddSectionButton
                        onClick={() => onAddSection("text", index + 1)}
                      />
                    </React.Fragment>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        </div>
      </div>
    </div>
  );
}
