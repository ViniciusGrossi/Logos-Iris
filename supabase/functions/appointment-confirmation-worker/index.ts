// Logos Iris — appointment-confirmation-worker (docs/specs/persona-agendamento.md, Requisitos 2/5)
// Acionado de hora em hora por pg_cron + pg_net (migração 0025), roda como service_role no runtime
// Deno das Edge Functions (ADR-031). Consome iris.appointments_due_for_confirmation() — a "véspera"
// já é calculada no fuso do TENANT dentro do SQL (Requisito 5), este worker só executa o envio.
//
// Primeiro caller real de WhatsAppGatewayAdapter.send() em produção (ALTO-2, fix migração 0024) —
// send()/pareamento() dos 3 adapters resolvem a credencial via
// WhatsAppConnectionRepository.resolveCredentials() sob demanda, nunca a partir da coluna crua.
// Pré-condição operacional: cada tenant precisa ter um secret real cadastrado no Vault
// (vault.create_secret) sob o nome referenciado em whatsapp_connections.credentials_ref — sem isso,
// resolveCredentials lança e este worker conta o item como falha (não fabrica envio).
//
// Segurança: nenhum conteúdo de mensagem/telefone em log — só ids técnicos e contadores (LGPD).

import type { WhatsAppGatewayAdapter, MediaType } from "@/adapters/whatsapp/types";
import type { WhatsAppProvider } from "@/schemas/whatsapp-gateway.schema";
import { EvolutionAdapter } from "@/adapters/whatsapp/evolution.adapter";
import { OpenWaAdapter } from "@/adapters/whatsapp/openwa.adapter";
import { CloudApiAdapter } from "@/adapters/whatsapp/cloud-api.adapter";
import { SupabaseWhatsAppConnectionRepository } from "@/repositories/whatsapp-connection.repository";
import { createDenoServiceClient } from "./deno-client.ts";

type DueRow = {
  appointment_id: string;
  tenant_id: string;
  contact_id: string;
  conversation_id: string;
  horario: string;
};

function formatHorario(horario: string): string {
  // pt-BR, fuso do servidor Deno é UTC — suficiente pro texto da mensagem ser "dd/mm às HH:mm"
  // sem depender de Intl com timezone dinâmico (Deno Deploy inclui ICU completo, mas o fuso do
  // TENANT já foi usado na query SQL; aqui é só formatação de exibição, não cálculo de "véspera").
  const d = new Date(horario);
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

Deno.serve(async (req: Request) => {
  const db = createDenoServiceClient();

  const providedToken = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: isAuthorized, error: authError } = await db.rpc("router_worker_verify_token", {
    p_token: providedToken,
  });
  if (authError || !isAuthorized) {
    return Response.json({ ok: false, stage: "auth" }, { status: 401 });
  }

  const { data: due, error: dueError } = await db.rpc("appointments_due_for_confirmation");
  if (dueError) {
    return Response.json({ ok: false, stage: "due_query", error: dueError.message }, { status: 500 });
  }

  const rows = (due ?? []) as DueRow[];
  const connectionRepo = new SupabaseWhatsAppConnectionRepository(db);
  const adapters: Record<WhatsAppProvider, WhatsAppGatewayAdapter> = {
    evolution: new EvolutionAdapter(connectionRepo),
    openwa: new OpenWaAdapter(connectionRepo),
    cloud_api: new CloudApiAdapter(connectionRepo),
  };

  let enviadas = 0,
    sem_conexao = 0,
    falhas = 0;

  for (const row of rows) {
    try {
      // connectionRepo.resolveCredentials() (chamado dentro de adapters[...].send() abaixo) é
      // memoizado por tenant_id nesta mesma instância do Repository (achado do /code-review: N
      // appointments do mesmo tenant no batch não disparam N RPCs de decrypt no Vault).
      const connection = await connectionRepo.getByTenantId(row.tenant_id);
      if (!connection || connection.session_status !== "conectado") {
        sem_conexao++;
        continue; // não é falha transitória — tenant sem WhatsApp conectado, tenta de novo no próximo tick
      }

      const { data: phone, error: phoneError } = await db.rpc("gateway_get_contact_phone", {
        p_tenant_id: row.tenant_id,
        p_contact_id: row.contact_id,
      });
      if (phoneError || !phone) {
        falhas++;
        continue;
      }

      const mediaType: MediaType = "texto";
      await adapters[connection.provider].send({
        tenant_id: row.tenant_id,
        to: phone,
        content: `Olá! Confirmando seu horário agendado para ${formatHorario(row.horario)}. Se precisar remarcar, é só responder esta mensagem.`,
        media_type: mediaType,
      });

      await db.rpc("appointments_mark_confirmation_sent", { p_appointment_id: row.appointment_id });
      enviadas++;
    } catch {
      // Credencial ausente no Vault (ALTO-2), rede/timeout do provedor, etc. — nunca propaga pro
      // batch inteiro; confirmacao_enviada_em fica null e o item é retentado no próximo tick.
      falhas++;
    }
  }

  return Response.json({ ok: true, devidas: rows.length, enviadas, sem_conexao, falhas });
});
