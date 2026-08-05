// Logos Iris — tenant-router-queue (módulo 2)
// Erros tipados — nunca throw genérico nem 500 cru (_shared.md §4, CLAUDE.md).

export class TenantRouterError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "TenantRouterError";
  }
}

/**
 * Item vindo da fila pgmq (ou params de resolveTenant) que não passa na validação Zod.
 * Trust boundary: a fila é alimentada por outro módulo; item corrompido não pode virar
 * roteamento parcial nem estourar exceção não tipada no worker.
 */
export class InvalidQueueMessageError extends TenantRouterError {
  constructor(reason: string) {
    super(`Item de fila inválido: ${reason}`, "INVALID_QUEUE_MESSAGE");
    this.name = "InvalidQueueMessageError";
  }
}
