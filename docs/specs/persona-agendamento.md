---
title: "persona-agendamento — Spec"
date: 2026-07-12
projeto: "Logos Iris"
fase: "build-backend"
status: draft
wave: 1
tags: [spec, feature, sdd]
---

# Spec: persona-agendamento

## Objetivo
Cliente final recebe opções concretas de horário e agenda em uma troca de mensagem; a Iris confirma automaticamente na véspera (com remarcação em um toque) para reduzir no-show sem o dono precisar ligar.

## Fora de Escopo
- Personas Atendimento, Vendas e SDR (specs próprias).
- Follow-up de lead que sumiu no orçamento (Story 8, persona Vendas — `ScheduleFollowUp` já contratado em `api.contracts.ts`, mas pertence a outra spec).
- Multi-número por tenant (schema trava 1:1 tenant↔WhatsApp — fora até haver cliente real com essa necessidade, PRD §Módulo 2).
- Cancelamento/edição livre de agendamento fora dos valores de `AppointmentStatus` já contratados.
- **Migration `tenants.timezone`** — ver Restrições Técnicas (Spec Sync Request, aprovação pendente).

## Requisitos Funcionais
1. Quando o cliente final pede horário, a tool "propor horário" da `ConversationEngineService` oferece opções concretas (nunca pergunta aberta) e, ao confirmado, cria um `appointment` via `POST /api/appointments` com `status='agendado'`.
2. Um job diário (`pg_cron`) varre `appointments` com `horario` = amanhã e status em `(agendado, confirmado)`, envia mensagem de confirmação e grava `confirmacao_enviada_em`.
3. O cliente final pode remarcar em um toque a partir da mensagem de confirmação — isso chama `PATCH /api/appointments/:id/status` com `status='remarcado'` e `novo_horario`.
4. O dono lista agendamentos por período/status via `GET /api/appointments`.
5. Os jobs de confirmação de véspera e de resumo diário (consumido por `painel-cliente-v1.md`) calculam "véspera"/"hoje" no fuso horário do **tenant**, não em UTC fixo — bloqueado até `tenants.timezone` existir (ver Restrições Técnicas).
6. `CreateAppointment` rejeita `horario` no passado antes de chamar o Repository (validação Zod + regra de Service).
7. Um `appointment` só é criado com `contact_id` e `conversation_id` do mesmo `tenant_id` do chamador (RLS + validação cruzada no Service).

## API Contract
> Copiado EXATAMENTE de `specs/api.contracts.ts`.
```typescript
type AppointmentStatus = "agendado" | "confirmado" | "remarcado" | "no_show" | "cancelado" | "concluido";

interface AppointmentDTO {
  id: UUID;
  contact_id: UUID;
  conversation_id: UUID;
  horario: ISODateTime;
  status: AppointmentStatus;
  confirmacao_enviada_em: ISODateTime | null;
}

// GET /api/appointments?from=&to=&status=
type ListAppointments = (params: {
  tenant_id: UUID;
  from: ISODateTime;
  to: ISODateTime;
  status?: AppointmentStatus;
}) => Promise<AppointmentDTO[]>;

// POST /api/appointments  (chamado pela tool "propor horário" da ConversationEngine)
type CreateAppointment = (params: {
  tenant_id: UUID;
  contact_id: UUID;
  conversation_id: UUID;
  horario: ISODateTime;
}) => Promise<AppointmentDTO>;

// PATCH /api/appointments/:id/status  (confirmação véspera, remarcação em um toque, marcar no-show)
type UpdateAppointmentStatus = (params: {
  tenant_id: UUID;
  appointment_id: UUID;
  status: AppointmentStatus;
  novo_horario?: ISODateTime;
}) => Promise<AppointmentDTO>;
```

## Critérios de Aceite (= test cases do worker)
- [ ] Given horários livres do tenant, When o cliente final pede agendamento na conversa, Then a Iris propõe ≥1 opção concreta de horário (não pergunta aberta) e, ao confirmado, `CreateAppointment` grava `status='agendado'`.
- [ ] Given um `appointment` com `horario`=amanhã e `status` em `(agendado, confirmado)`, When o job de confirmação de véspera roda, Then o sistema envia a mensagem de confirmação e grava `confirmacao_enviada_em`.
- [ ] Given uma confirmação de véspera enviada, When o cliente responde pedindo outro horário em um toque, Then `UpdateAppointmentStatus` muda `status` para `remarcado` e grava `novo_horario`.
- [ ] Given um `horario` no passado em `CreateAppointment`, When a validação roda, Then a Service rejeita antes de chamar o Repository (nenhuma linha criada).
- [ ] Given `tenants.timezone` inexistente (Sync Request pendente), When o job de confirmação de véspera ou resumo diário tenta calcular "amanhã"/"hoje", Then a implementação NUNCA assume UTC fixo silenciosamente — registra aviso auditável e não dispara com horário errado, até a migration ser aprovada.
- [ ] RLS: tenant A não acessa `appointments` de tenant B (`ListAppointments` e `UpdateAppointmentStatus` retornam vazio/erro).
- [ ] Nenhum erro em console/logs.
- [ ] `validate` passa.

## Restrições Técnicas
- **Tabelas:** existentes — `appointments`, `conversations`, `contacts`, `tenants`. **Spec Sync Request:** migration nova exigida: `tenants.timezone`, aprovação pendente — sem essa coluna, os jobs de confirmação de véspera (Story 10) e resumo diário (Story 27, consumido em `painel-cliente-v1.md`) não têm como calcular corretamente "véspera"/"hoje" por tenant. Até aprovação, os jobs devem operar em modo degradado (log de aviso, nunca enviar com hora errada) — não usar UTC/horário fixo como substituto silencioso. Já registrada como task `8.1` em `docs/tasks.md`.
- **Endpoints:** `POST /api/appointments` · `GET /api/appointments` · `PATCH /api/appointments/:id/status`.
- **Libs novas:** nenhuma.
- **Background jobs:** confirmação de véspera (`pg_cron` diário → `pgmq` → Edge Function), conforme ARCHITECTURE.md §Pontos de Integração.

## Tokens e APIs Externas
| API | Modelo/Tier | Rate Limit | Custo estimado | Fallback |
|---|---|---|---|---|
| N/A | N/A | N/A | N/A | Esta feature consome `ConversationEngine`→`ModelGateway` (spec própria) para gerar a proposta de horário e `WhatsAppGateway` (spec própria) para envio; nenhuma chamada direta a API externa é definida nesta spec. |

## Segurança
- **Auth:** JWT tenant obrigatório nas rotas de painel; service-role para o job de `pg_cron`.
- **RLS:** `tenant_id = claim` em `appointments` (schema já define).
- **Criptografia:** nenhum campo pgcrypto nesta tabela — `horario`/`status` não são PII; `contact_id` referencia `contacts`, já cifrado na tabela própria.
- **LGPD:** horário de agendamento não é dado sensível por si, mas está ligado a `contact_id` (PII) — a spec nunca expõe telefone/nome do contato fora do DTO decriptado pelo Service.

## Sub-Agents Designados
| Agent | Task | SOP |
|---|---|---|
| backend-engineer | endpoints `appointments` + `AppointmentService` + job de confirmação de véspera + testes | agents/backend-engineer.md |

> Nenhuma tela dedicada nesta spec — a métrica `agendamentos_criados` do dashboard já é coberta por `painel-cliente-v1.md` (consumo de `GetDailySummary`).

## Validação
```bash
# Como provar que funciona:
npm run test -- --grep "persona-agendamento"
# Job: simular pg_cron em ambiente local, checar confirmacao_enviada_em preenchido
```
