// Logos Iris — MessageDebouncerService (módulo 3, docs/specs/message-debouncer.md)
// Agrupa mensagens picadas do mesmo remetente numa janela curta antes de acionar o Engine.
// Sem endpoint HTTP — acionado por pg_cron a cada 10s (ADR-031).

import type { MessageDebouncerRepository } from "@/repositories/message-debouncer.repository";

export interface MessageDebouncerServiceDeps {
  debouncerRepo: MessageDebouncerRepository;
}

export class MessageDebouncerService {
  constructor(private readonly deps: MessageDebouncerServiceDeps) {}

  /**
   * Requisito 1 + 2: bufferiza uma mensagem para a conversa, setando/estendendo
   * o debounce_until. Não aciona o Engine — só agenda.
   */
  async bufferMessage(params: {
    conversationId: string;
    tenantId: string;
    messageId: string;
  }): Promise<{ debounceUntil: Date }> {
    return this.deps.debouncerRepo.bufferMessage(params);
  }

  /**
   * Requisito 3: varre conversas com debounce vencido e retorna os buffers
   * agregados para o Engine processar. Chamado pelo cron a cada 10s.
   */
  async flushDue(): Promise<{ conversationId: string; messageIds: string[] }[]> {
    return this.deps.debouncerRepo.flushDue();
  }

  /**
   * Requisito 4: limpa o debounce_until após o flush para que a conversa
   * saia do índice parcial e não seja reprocessada.
   */
  async clearDebounce(conversationId: string): Promise<void> {
    return this.deps.debouncerRepo.clearDebounce(conversationId);
  }
}