import { api } from "@/lib/api";

type ReuniaoVinculada = {
  id: string;
  eventType: string;
  startTime: string;
  inviteeName: string | null;
};

/**
 * Tarefa deixou de ser reunião → e a reunião?
 *
 * Não existe vínculo formal entre tarefa e reunião no banco: a API infere o par
 * pela negociação. Trocar o tipo de reunião pra ligação não mexia na reunião,
 * então ela continuava no card "Próximas reuniões" e o lembrete ainda saía pro
 * lead. Aqui a tela pergunta antes de salvar.
 *
 * Retorna o que mandar em `cancelLinkedMeeting` no PUT da tarefa.
 */
export async function perguntarSobreReuniaoVinculada(
  task: { id: string; type: string },
  novoTipo: string,
): Promise<boolean> {
  // Só faz sentido no sentido reunião → outra coisa.
  if (task.type !== "MEETING" || novoTipo === "MEETING") return false;

  let reuniao: ReuniaoVinculada | null = null;
  try {
    const res = await api.get<{ data: ReuniaoVinculada | null }>(`/tasks/${task.id}/linked-meeting`);
    reuniao = res.data ?? null;
  } catch {
    // Falha na consulta não pode travar a edição da tarefa: segue sem mexer na
    // reunião (mesmo comportamento de antes desse fluxo existir).
    return false;
  }
  if (!reuniao) return false;

  const quando = new Date(reuniao.startTime).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const comQuem = reuniao.inviteeName ? ` com ${reuniao.inviteeName}` : "";

  return confirm(
    `Esta tarefa está ligada à reunião de ${quando}${comQuem} (${reuniao.eventType}).\n\n` +
      `OK = cancelar a reunião também (o lead deixa de receber os lembretes).\n` +
      `Cancelar = manter a reunião agendada e só mudar o tipo da tarefa.`,
  );
}
