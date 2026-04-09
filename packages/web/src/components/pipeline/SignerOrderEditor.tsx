"use client";

import { ArrowDown, ArrowUp, Info } from "lucide-react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";

interface Signer {
  email: string;
  name: string;
  action: "SIGN" | "SIGN_AS_A_WITNESS";
  role?: string; // "testemunha1" | "testemunha2" | "contratante" | "contratada"
}

interface SignerOrderEditorProps {
  signers: Signer[];
  onSignersChange: (signers: Signer[]) => void;
  sortable: boolean;
  onSortableChange: (sortable: boolean) => void;
}

function getRoleLabel(signer: Signer): string {
  if (signer.action === "SIGN_AS_A_WITNESS") return "Testemunha";
  if (signer.role === "contratada") return "Contratada";
  return "Assinante";
}

function getRoleBadgeVariant(
  signer: Signer
): "gray" | "purple" | "blue" {
  if (signer.action === "SIGN_AS_A_WITNESS") return "gray";
  if (signer.role === "contratada") return "purple";
  return "blue";
}

export default function SignerOrderEditor({
  signers,
  onSignersChange,
  sortable,
  onSortableChange,
}: SignerOrderEditorProps) {
  function moveUp(index: number) {
    if (index === 0) return;
    const updated = [...signers];
    [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
    onSignersChange(updated);
  }

  function moveDown(index: number) {
    if (index === signers.length - 1) return;
    const updated = [...signers];
    [updated[index], updated[index + 1]] = [updated[index + 1], updated[index]];
    onSignersChange(updated);
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-4">
      {/* Header */}
      <h3 className="text-sm font-semibold text-gray-800">
        Ordem de Assinatura
      </h3>

      {/* Toggle */}
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={sortable}
          onChange={(e) => onSortableChange(e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
        />
        <span className="text-sm text-gray-700">
          Exigir ordem sequencial de assinatura
        </span>
      </label>

      {/* Signer list */}
      <div className={sortable ? undefined : "opacity-50 pointer-events-none"}>
        {/* Column headers */}
        <div className="flex items-center gap-3 px-2 pb-1 border-b border-gray-200">
          <span className="w-6 text-xs font-medium text-gray-400 text-center">
            #
          </span>
          <span className="flex-1 text-xs font-medium text-gray-400">
            Nome
          </span>
          <span className="w-24 text-xs font-medium text-gray-400">
            Tipo
          </span>
          <span className="w-14 text-xs font-medium text-gray-400 text-right">
            Ações
          </span>
        </div>

        {/* Rows */}
        <ul className="divide-y divide-gray-100">
          {signers.map((signer, index) => (
            <li
              key={signer.email}
              className="flex items-center gap-3 px-2 py-2"
            >
              {/* Order number */}
              <span
                className={`w-6 text-center text-xs font-semibold tabular-nums ${
                  sortable ? "text-gray-700" : "text-gray-400"
                }`}
              >
                {index + 1}
              </span>

              {/* Name + email */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">
                  {signer.name}
                </p>
                <p className="text-xs text-gray-400 truncate">{signer.email}</p>
              </div>

              {/* Role badge */}
              <div className="w-24 flex">
                <Badge variant={getRoleBadgeVariant(signer)}>
                  {getRoleLabel(signer)}
                </Badge>
              </div>

              {/* Up / Down buttons */}
              <div className="w-14 flex items-center justify-end gap-0.5">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => moveUp(index)}
                  disabled={index === 0}
                  aria-label="Mover para cima"
                  className="p-1"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => moveDown(index)}
                  disabled={index === signers.length - 1}
                  aria-label="Mover para baixo"
                  className="p-1"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Info note */}
      <div className="flex items-start gap-2 text-xs text-gray-500 bg-gray-50 rounded-md px-3 py-2">
        <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-gray-400" />
        <p>
          Quando ativada, cada pessoa só recebe o documento após a anterior
          assinar.
        </p>
      </div>
    </div>
  );
}
