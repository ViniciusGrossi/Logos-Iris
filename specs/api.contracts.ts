// Logos Iris — API Contracts
// Fase 2 (/logos). Deriva de docs/PRD.md + specs/product.schema.json.
// Convenção Logos Tech: Controller → Service → Repository. Endpoints abaixo são o contrato do Controller.
// Toda rota tenant-scoped exige tenant_id resolvido por auth; toda rota admin exige checagem hardcoded de admin (sem role table nesta fase).

// ── Tipos base ──────────────────────────────────────────────

type UUID = string;
type ISODateTime = string;

type Persona = "atendimento" | "vendas" | "agendamento" | "sdr";
type WhatsAppProvider = "evolution" | "openwa" | "cloud_api";
type ConversationStatus = "ativa" | "pausada" | "encerrada";
type HandoffTrigger =
  | "botao_painel"
  | "from_me_detectado"
  | "comando_chat"
  | "pedido_cliente"
  | "baixa_confianca";
type ModelProvider =
  | "glm"
  | "kimi"
  | "deepseek"
  | "minimax"
  | "nvidia_nim"
  | "claude"
  | "gpt4o"
  | "groq";
type ModelTaskType =
  | "triagem"
  | "conversa_principal"
  | "extracao_documento"
  | "embeddings";
type KnowledgeField =
  | "catalogo"
  | "faq"
  | "politicas"
  | "horarios"
  | "saudacao"
  | "nome_agente"
  | "dados_negocio";
type EntryStatus = "rascunho" | "publicado" | "historico";

// ── WhatsAppGateway (webhook — 1 endpoint por adapter, normalizado antes do TenantRouter) ──

interface WhatsAppWebhookPayload {
  provider: WhatsAppProvider;
  tenant_whatsapp_number: string;
  from: string;
  message_id: string;
  content: string;
  media_type: "texto" | "audio" | "imagem" | "documento";
  from_me: boolean;
  timestamp: ISODateTime;
}

// POST /webhooks/whatsapp/:provider
type WebhookHandler = (payload: WhatsAppWebhookPayload) => Promise<{ received: true }>;

// ── Conversations (Painel Cliente) ──────────────────────────

interface ConversationSummary {
  id: UUID;
  contact_nome: string | null;
  contact_telefone: string;
  persona_ativa: Persona;
  status: ConversationStatus;
  pausada_ate: ISODateTime | null;
  ultima_mensagem_preview: string;
  ultima_mensagem_em: ISODateTime;
}

// GET /api/conversations?status=&persona=&page=&limit=  (paginação obrigatória)
type ListConversations = (params: {
  tenant_id: UUID;
  status?: ConversationStatus;
  persona?: Persona;
  page: number;
  limit: number;
}) => Promise<{ items: ConversationSummary[]; total: number; page: number; limit: number }>;

// GET /api/conversations/:id/messages?page=&limit=
type GetConversationMessages = (params: {
  tenant_id: UUID;
  conversation_id: UUID;
  page: number;
  limit: number;
}) => Promise<{ items: MessageDTO[]; total: number }>;

interface MessageDTO {
  id: UUID;
  direcao: "recebida" | "enviada";
  conteudo: string;
  tipo_midia: "texto" | "audio" | "imagem" | "documento";
  created_at: ISODateTime;
}

// POST /api/conversations/:id/pause
type PauseConversation = (params: {
  tenant_id: UUID;
  conversation_id: UUID;
  gatilho: HandoffTrigger;
  pausada_ate?: ISODateTime;
}) => Promise<{ status: "pausada" }>;

// POST /api/conversations/:id/resume
// Nunca silenciosa se pausa foi longa — Service layer decide se precisa gerar pergunta de confirmação ao dono antes de aplicar.
type ResumeConversation = (params: {
  tenant_id: UUID;
  conversation_id: UUID;
  confirmado_pelo_dono: boolean;
}) => Promise<{ status: "ativa" } | { status: "aguardando_confirmacao" }>;

// ── Appointments (Agendamento — Concierge, Stories 9-11) ─────

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

// ── Follow-ups (Story 8 — retomada de lead que sumiu, uma vez, com elegância) ──

interface FollowUpDTO {
  id: UUID;
  conversation_id: UUID;
  agendado_para: ISODateTime;
  status: "pendente" | "enviado" | "cancelado";
}

// POST /api/follow-ups  (chamado pela tool "criar follow-up" da ConversationEngine — Service layer checa CheckFeatureGate("follow_ups_automaticos_mes") antes de criar)
type ScheduleFollowUp = (params: {
  tenant_id: UUID;
  conversation_id: UUID;
  agendado_para: ISODateTime;
}) => Promise<FollowUpDTO | { bloqueado: true; motivo: string }>;

// GET /api/follow-ups?status=  (usado pelo painel cliente para refletir uso vs limite do plano)
type ListFollowUps = (params: { tenant_id: UUID; status?: "pendente" | "enviado" | "cancelado" }) => Promise<FollowUpDTO[]>;

// ── ModelGateway (roteamento — chamado internamente pela ConversationEngine, não exposto ao painel cliente) ──

interface ModelRouteRequest {
  tenant_id: UUID;
  task_type: ModelTaskType;
  tier_do_plano: "basico" | "premium";
}

interface ModelRouteResult {
  model_id: UUID;
  provider: ModelProvider;
  model_name: string;
  fallback_chain_position: number;
}

type RouteModel = (req: ModelRouteRequest) => Promise<ModelRouteResult>;

// GET /api/admin/model-registry  (admin-only)
type ListModelRegistry = () => Promise<ModelRegistryEntryDTO[]>;

interface ModelRegistryEntryDTO {
  id: UUID;
  provider: ModelProvider;
  model_name: string;
  task_type: ModelTaskType;
  tier: "basico" | "premium";
  prioridade_fallback: number;
  ativo: boolean;
  custo_por_1k_tokens_input: number;
  custo_por_1k_tokens_output: number;
}

// PUT /api/admin/model-registry/:id  (admin-only)
type UpdateModelRegistryEntry = (params: {
  id: UUID;
  patch: Partial<Pick<ModelRegistryEntryDTO, "ativo" | "prioridade_fallback" | "custo_por_1k_tokens_input" | "custo_por_1k_tokens_output">>;
}) => Promise<ModelRegistryEntryDTO>;

// ── TenantKnowledgeBase (enriquecimento do cliente — Painel Cliente) ──

interface KnowledgeEntryDTO {
  id: UUID;
  campo: KnowledgeField;
  conteudo: Record<string, unknown>;
  status: EntryStatus;
  versao: number;
  contradicao_detectada: boolean;
}

// GET /api/knowledge-base?campo=
type GetKnowledgeBase = (params: { tenant_id: UUID; campo?: KnowledgeField }) => Promise<KnowledgeEntryDTO[]>;

// PUT /api/knowledge-base/:campo  (salva como rascunho, nunca publica direto)
type SaveKnowledgeDraft = (params: {
  tenant_id: UUID;
  campo: KnowledgeField;
  conteudo: Record<string, unknown>;
}) => Promise<{ entry: KnowledgeEntryDTO; contradicoes: string[] }>;

// POST /api/knowledge-base/publish  (lint de contradição + instrução disfarçada roda aqui — bloqueia se achar)
type PublishKnowledgeBase = (params: { tenant_id: UUID }) => Promise<
  { status: "publicado"; versao: number } | { status: "bloqueado"; motivos: string[] }
>;

// POST /api/knowledge-base/rollback/:versao
type RollbackKnowledgeBase = (params: { tenant_id: UUID; versao: number }) => Promise<{ status: "publicado"; versao: number }>;

// POST /api/knowledge-base/playground  (testa contra rascunho antes de publicar)
type TestPlayground = (params: {
  tenant_id: UUID;
  mensagem_simulada: string;
  persona: Persona;
}) => Promise<{ resposta_simulada: string }>;

// ── Artisanal Layer (admin-only — escrita; leitura simplificada no painel cliente) ──

// GET /api/admin/tenants/:tenant_id/artisanal-layer  (admin-only, histórico completo)
type GetArtisanalLayerAdmin = (params: { tenant_id: UUID }) => Promise<
  { id: UUID; conteudo: string; status: EntryStatus; versao: number }[]
>;

// PUT /api/admin/tenants/:tenant_id/artisanal-layer  (admin-only)
type SaveArtisanalLayerDraft = (params: { tenant_id: UUID; conteudo: string }) => Promise<{ versao: number; status: "rascunho" }>;

// POST /api/admin/tenants/:tenant_id/artisanal-layer/publish  (admin-only)
type PublishArtisanalLayer = (params: { tenant_id: UUID }) => Promise<{ status: "publicado"; versao: number }>;

// GET /api/artisanal-layer/summary  (painel cliente — versão simplificada, read-only; namespace separado de /api/knowledge-base porque nunca compartilha registro/histórico com o enriquecimento do cliente)
type GetArtisanalLayerSummaryForClient = (params: { tenant_id: UUID }) => Promise<{ resumo_publico: string[] }>;

// ── Feature Gating ───────────────────────────────────────────

interface PlanFeatures {
  max_personas_ativas: number;
  roteador_invisivel_incluso: boolean;
  tier_modelo: "basico" | "premium";
  limite_mensagens_mes: number;
  retencao_memoria_dias: number;
  follow_ups_automaticos_mes: number;
  auditoria_qualidade_incluida: boolean;
  seats_painel: number;
  api_oficial_meta_addon_disponivel: boolean;
  voz_clonada_addon_disponivel: boolean;
}

// GET /api/plan/features  (painel cliente — reflete o gate, nunca aplica)
type GetCurrentPlanFeatures = (params: { tenant_id: UUID }) => Promise<{ plano_nome: string; features: PlanFeatures; uso_atual: UsageSnapshot }>;

interface UsageSnapshot {
  mensagens_mes_atual: number;
  personas_ativas_count: number;
  numeros_conectados: number;
}

// Checagem de gate roda no Service layer, chamada internamente antes de qualquer ação limitada por plano — não é endpoint HTTP.
type CheckFeatureGate = (params: { tenant_id: UUID; feature: keyof PlanFeatures }) => Promise<{ permitido: boolean; motivo?: string }>;

// ── Admin — Tenants ──────────────────────────────────────────

// GET /api/admin/tenants?page=&limit=  (admin-only, paginação obrigatória)
type ListTenants = (params: { page: number; limit: number; status?: "ativo" | "pausado" | "cancelado" }) => Promise<{
  items: TenantSummaryDTO[];
  total: number;
}>;

interface TenantSummaryDTO {
  id: UUID;
  nome_empresa: string;
  plano_nome: string;
  status: "ativo" | "pausado" | "cancelado";
  whatsapp_connection_status: "conectado" | "desconectado" | "pareando";
}

// POST /api/admin/tenants  (admin-only)
type CreateTenant = (params: {
  nome_empresa: string;
  plano_id: UUID;
  whatsapp_provider: WhatsAppProvider;
  whatsapp_number: string;
  personas_ativas: Persona[];
}) => Promise<TenantSummaryDTO>;

// PATCH /api/admin/tenants/:id/status  (admin-only)
type UpdateTenantStatus = (params: { id: UUID; status: "ativo" | "pausado" | "cancelado" }) => Promise<TenantSummaryDTO>;

// ── CostObservability ────────────────────────────────────────

// GET /api/admin/cost?tenant_id=&model_id=&from=&to=  (admin-only)
type GetCostBreakdown = (params: {
  tenant_id?: UUID;
  model_id?: UUID;
  from: ISODateTime;
  to: ISODateTime;
}) => Promise<{
  total_custo_usd: number;
  total_tokens_input: number;
  total_tokens_output: number;
  latencia_media_ms: number;
  taxa_escalonamento: number;
  quebra_por_modelo: { model_id: UUID; provider: ModelProvider; custo_usd: number; taxa_escalonamento: number }[];
}>;

// GET /api/dashboard/summary  (painel cliente — "a Iris te conta o dia", também alimenta resumo diário via WhatsApp)
type GetDailySummary = (params: { tenant_id: UUID; data: ISODateTime }) => Promise<{
  total_conversas: number;
  orcamentos_gerados: number;
  agendamentos_criados: number;
  leads_quentes: { conversation_id: UUID; resumo: string }[];
}>;
