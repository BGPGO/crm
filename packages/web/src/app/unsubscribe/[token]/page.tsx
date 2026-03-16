"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

export default function UnsubscribePage() {
  const params = useParams();
  const token = params.token as string;
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");

  useEffect(() => {
    // The actual unsubscribe happens on the API side when the link is visited
    // This page just shows a confirmation
    fetch(`/api/email-tracking/unsubscribe/${token}`)
      .then((res) => {
        if (res.ok) setStatus("success");
        else setStatus("error");
      })
      .catch(() => setStatus("error"));
  }, [token]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 max-w-md w-full text-center">
        {status === "loading" && (
          <>
            <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <h1 className="text-lg font-semibold text-gray-900">Processando...</h1>
            <p className="text-sm text-gray-500 mt-2">Aguarde enquanto processamos sua solicitação.</p>
          </>
        )}
        {status === "success" && (
          <>
            <div className="w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-lg font-semibold text-gray-900">Descadastrado com sucesso</h1>
            <p className="text-sm text-gray-500 mt-2">
              Você foi removido da nossa lista de emails. Não receberá mais comunicações por email.
            </p>
          </>
        )}
        {status === "error" && (
          <>
            <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h1 className="text-lg font-semibold text-gray-900">Erro ao processar</h1>
            <p className="text-sm text-gray-500 mt-2">
              Não foi possível processar sua solicitação. Tente novamente mais tarde.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
