"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";

interface NodeConfigProps {
  config: Record<string, any>;
  onChange: (config: Record<string, any>) => void;
}

interface TagOption {
  id: string;
  name: string;
}

export default function AddTagNode({ config, onChange }: NodeConfigProps) {
  const [tags, setTags] = useState<TagOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadTags() {
      try {
        const res = await api.get<{ data: TagOption[] }>("/tags");
        setTags(res.data || []);
      } catch {
        // API might not be ready
      } finally {
        setLoading(false);
      }
    }
    loadTags();
  }, []);

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          Tag
        </label>
        {loading ? (
          <div className="h-9 bg-gray-100 rounded-lg animate-pulse" />
        ) : (
          <select
            value={config.tagId || ""}
            onChange={(e) => {
              const tag = tags.find((t) => t.id === e.target.value);
              onChange({
                ...config,
                tagId: e.target.value,
                tagName: tag?.name || "",
              });
            }}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent bg-white"
          >
            <option value="">Selecionar tag...</option>
            {tags.map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag.name}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}
