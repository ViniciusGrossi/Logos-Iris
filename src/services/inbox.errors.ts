// Logos Iris — painel-cliente-v1 (docs/specs/painel-cliente-v1.md)
// Erros tipados — Controller mapeia code -> status HTTP. Nunca throw genérico nem 500 cru.

export class InboxError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "InboxError";
  }
}

/** Falha de acesso a conversations/messages (rede, permissão, etc) — nunca propaga o erro cru do driver. */
export class InboxQueryError extends InboxError {
  constructor(message: string) {
    super(`Falha ao acessar dados do inbox: ${message}`, "INBOX_QUERY_FAILED");
  }
}

export function inboxErrorStatus(error: InboxError): number {
  switch (error.code) {
    case "INBOX_QUERY_FAILED":
      return 502;
    default:
      return 400;
  }
}
