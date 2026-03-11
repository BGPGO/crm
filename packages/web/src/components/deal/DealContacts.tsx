"use client";

import { Phone, Mail, UserPlus, Trash2, User } from "lucide-react";

export interface DealContact {
  id: string;
  name: string;
  phone?: string;
  email?: string;
}

interface DealContactsProps {
  contacts: DealContact[];
  onAdd?: () => void;
  onRemove?: (id: string) => void;
}

export default function DealContacts({ contacts, onAdd, onRemove }: DealContactsProps) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-800">Contatos</h3>
        <button
          onClick={onAdd}
          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium transition-colors"
        >
          <UserPlus size={13} />
          Adicionar contato
        </button>
      </div>

      <div className="space-y-2">
        {contacts.map((contact) => (
          <div
            key={contact.id}
            className="flex items-start gap-3 p-3 bg-white border border-gray-200 rounded-lg group hover:border-blue-200 transition-colors"
          >
            {/* Avatar */}
            <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0">
              <User size={15} />
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-800">{contact.name}</p>
              {contact.phone && (
                <a
                  href={`tel:${contact.phone}`}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600 mt-0.5 transition-colors"
                >
                  <Phone size={11} />
                  {contact.phone}
                </a>
              )}
              {contact.email && (
                <a
                  href={`mailto:${contact.email}`}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600 mt-0.5 transition-colors"
                >
                  <Mail size={11} />
                  {contact.email}
                </a>
              )}
            </div>

            {/* Remove */}
            {onRemove && (
              <button
                onClick={() => onRemove(contact.id)}
                className="p-1 text-gray-200 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all rounded"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
