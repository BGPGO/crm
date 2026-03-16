"use client";

import { useState, useEffect, useRef } from "react";
import { Search, Plus } from "lucide-react";
import { api } from "@/lib/api";
import TagBadge from "./TagBadge";

interface Tag {
  id: string;
  name: string;
  color: string;
}

interface TagSelectorProps {
  selectedTagIds: string[];
  onChange: (tagIds: string[]) => void;
}

export default function TagSelector({ selectedTagIds, onChange }: TagSelectorProps) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const fetchTags = () => {
    api
      .get<{ data: Tag[] }>("/tags")
      .then((res) => setTags(Array.isArray(res) ? res : res.data ?? []))
      .catch(() => {
        api.get<Tag[]>("/tags").then((res) => setTags(Array.isArray(res) ? res : [])).catch(console.error);
      });
  };

  useEffect(() => {
    fetchTags();
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selectedTags = tags.filter((t) => selectedTagIds.includes(t.id));
  const availableTags = tags.filter(
    (t) =>
      !selectedTagIds.includes(t.id) &&
      t.name.toLowerCase().includes(search.toLowerCase())
  );

  const showCreateOption =
    search.trim().length > 0 &&
    !tags.some((t) => t.name.toLowerCase() === search.trim().toLowerCase());

  const addTag = (id: string) => {
    onChange([...selectedTagIds, id]);
    setSearch("");
  };

  const removeTag = (id: string) => {
    onChange(selectedTagIds.filter((tid) => tid !== id));
  };

  const handleCreate = async () => {
    const name = search.trim();
    if (!name || creating) return;
    setCreating(true);
    try {
      const newTag = await api.post<Tag>("/tags", { name });
      await fetchTags();
      onChange([...selectedTagIds, newTag.id]);
      setSearch("");
    } catch (err) {
      console.error("Erro ao criar tag:", err);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div ref={wrapperRef} className="relative">
      {/* Selected tags */}
      <div
        className="flex flex-wrap items-center gap-1.5 min-h-[38px] px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-lg cursor-pointer focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500"
        onClick={() => setOpen(true)}
      >
        {selectedTags.map((tag) => (
          <TagBadge
            key={tag.id}
            name={tag.name}
            color={tag.color}
            onRemove={() => removeTag(tag.id)}
          />
        ))}
        {selectedTags.length === 0 && (
          <span className="text-gray-400">Selecionar tags...</span>
        )}
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-hidden">
          {/* Search / Create input */}
          <div className="p-2 border-b border-gray-100">
            <div className="relative">
              <Search
                size={14}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type="text"
                placeholder="Buscar ou criar tag..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                autoFocus
              />
            </div>
          </div>

          {/* Tag list */}
          <div className="overflow-y-auto max-h-44 p-1">
            {/* Create option */}
            {showCreateOption && (
              <button
                type="button"
                onClick={handleCreate}
                disabled={creating}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-blue-600 rounded-md hover:bg-blue-50 transition-colors text-left font-medium"
              >
                <Plus size={14} className="flex-shrink-0" />
                {creating ? "Criando..." : `Criar tag: "${search.trim()}"`}
              </button>
            )}

            {availableTags.length === 0 && !showCreateOption ? (
              <div className="px-3 py-2 text-sm text-gray-400 text-center">
                Nenhuma tag encontrada
              </div>
            ) : (
              availableTags.map((tag) => (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => addTag(tag.id)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 rounded-md hover:bg-gray-50 transition-colors text-left"
                >
                  <span
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: tag.color }}
                  />
                  {tag.name}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
