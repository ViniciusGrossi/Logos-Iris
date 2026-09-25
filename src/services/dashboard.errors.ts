// Logos Iris — painel-cliente-v1 (docs/specs/painel-cliente-v1.md)

export class DashboardError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "DashboardError";
  }
}

export class DashboardQueryError extends DashboardError {
  constructor(message: string) {
    super(`Falha ao acessar dados do dashboard: ${message}`, "DASHBOARD_QUERY_FAILED");
  }
}

export function dashboardErrorStatus(error: DashboardError): number {
  switch (error.code) {
    case "DASHBOARD_QUERY_FAILED":
      return 502;
    default:
      return 400;
  }
}
