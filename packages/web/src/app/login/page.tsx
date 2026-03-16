"use client";

import { useState, useEffect, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { Eye, EyeOff, Lock, Mail, ArrowRight } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const { login, isAuthenticated, loading: authLoading } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      router.replace("/");
    }
  }, [isAuthenticated, authLoading, router]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await login(email, password);
      router.replace("/");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Erro ao fazer login";
      if (message.includes("Invalid login credentials")) {
        setError("E-mail ou senha incorretos.");
      } else if (message.includes("Email not confirmed")) {
        setError(
          "E-mail ainda não foi confirmado. Verifique sua caixa de entrada."
        );
      } else {
        setError(message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-400 border-t-transparent" />
      </div>
    );
  }

  if (isAuthenticated) return null;

  return (
    <div className="min-h-screen flex bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900">
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:flex-1 flex-col justify-between p-12 relative overflow-hidden">
        {/* Decorative circles */}
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -right-32 w-[500px] h-[500px] bg-indigo-500/10 rounded-full blur-3xl" />

        <div className="relative z-10">
          <h1 className="text-3xl font-bold text-white tracking-tight">
            Bertuzzi<span className="text-blue-400">Patrimonial</span>
          </h1>
          <p className="text-blue-200/60 text-sm mt-1">Plataforma de Gestão</p>
        </div>

        <div className="relative z-10 space-y-8">
          <div>
            <h2 className="text-4xl font-bold text-white leading-tight">
              CRM, Marketing<br />
              e Conversas.
            </h2>
            <p className="text-blue-200/70 mt-4 text-lg max-w-md">
              Gerencie seu pipeline, automatize campanhas e converse com leads
              — tudo em uma plataforma.
            </p>
          </div>

          <div className="flex gap-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                <div className="w-2 h-2 rounded-full bg-blue-400" />
              </div>
              <div>
                <p className="text-white text-sm font-medium">Pipeline</p>
                <p className="text-blue-200/50 text-xs">Kanban visual</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-indigo-500/20 flex items-center justify-center">
                <div className="w-2 h-2 rounded-full bg-indigo-400" />
              </div>
              <div>
                <p className="text-white text-sm font-medium">Marketing</p>
                <p className="text-blue-200/50 text-xs">Email & automação</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                <div className="w-2 h-2 rounded-full bg-emerald-400" />
              </div>
              <div>
                <p className="text-white text-sm font-medium">Conversas</p>
                <p className="text-blue-200/50 text-xs">WhatsApp IA</p>
              </div>
            </div>
          </div>
        </div>

        <p className="relative z-10 text-blue-200/30 text-xs">
          &copy; {new Date().getFullYear()} Bertuzzi Patrimonial. Todos os direitos reservados.
        </p>
      </div>

      {/* Right side - Login form */}
      <div className="flex-1 lg:max-w-lg flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm">
          {/* Mobile branding */}
          <div className="lg:hidden text-center mb-10">
            <h1 className="text-2xl font-bold text-white tracking-tight">
              Bertuzzi<span className="text-blue-400">Patrimonial</span>
            </h1>
            <p className="text-blue-200/50 text-sm mt-1">Plataforma de Gestão</p>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-white">Entrar</h2>
            <p className="text-blue-200/50 text-sm mt-1">
              Acesse sua conta para continuar
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-300 text-sm rounded-xl px-4 py-3 flex items-start gap-2">
                <span className="shrink-0 mt-0.5">!</span>
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label
                htmlFor="email"
                className="block text-sm font-medium text-blue-100/70"
              >
                E-mail
              </label>
              <div className="relative">
                <Mail
                  size={16}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-blue-300/40"
                />
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  className="w-full pl-10 pr-4 py-3 text-sm text-white bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all placeholder-blue-200/30"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="password"
                className="block text-sm font-medium text-blue-100/70"
              >
                Senha
              </label>
              <div className="relative">
                <Lock
                  size={16}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-blue-300/40"
                />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Sua senha"
                  className="w-full pl-10 pr-11 py-3 text-sm text-white bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all placeholder-blue-200/30"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-300/40 hover:text-blue-200/70 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 px-4 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-900 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 group"
            >
              {submitting ? (
                <>
                  <span className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white" />
                  Entrando...
                </>
              ) : (
                <>
                  Entrar
                  <ArrowRight
                    size={16}
                    className="group-hover:translate-x-0.5 transition-transform"
                  />
                </>
              )}
            </button>
          </form>

          <p className="text-center text-xs text-blue-200/20 mt-8">
            BGPGO CRM &mdash; v2.0
          </p>
        </div>
      </div>
    </div>
  );
}
