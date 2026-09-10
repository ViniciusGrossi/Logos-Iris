// Logos Iris — TenantKnowledgeBase (knowledge-base-v1)
// Validação Zod de todo input que cruza a fronteira do Service.
// Fonte canônica: docs/specs/knowledge-base-v1.md + specs/api.contracts.ts (TenantKnowledgeBase).

import { z } from "zod";

export const KNOWLEDGE_FIELDS = [
  "catalogo",
  "faq",
  "politicas",
  "horarios",
  "saudacao",
  "nome_agente",
  "dados_negocio",
] as const;

export const ENTRY_STATUSES = ["rascunho", "publicado", "historico"] as const;

// Persona é definida em conversation-engine.schema.ts para a spec conversa-principal; aqui é
// uma cópia local do union do contrato (specs/api.contracts.ts não é um módulo importável).
export const PERSONAS = ["atendimento", "vendas", "agendamento", "sdr"] as const;

/**
 * `conteudo` é jsonb estruturado (instrução + exemplo por campo, nunca textarea livre — decisão
 * travada no CLAUDE.md do projeto). O shape interno por campo é decidido no frontend/UI; aqui só
 * garantimos que é um objeto plano (nunca array, nunca string solta).
 */
export const conteudoSchema = z
  .record(z.string(), z.unknown())
  .refine((val) => typeof val === "object" && val !== null && !Array.isArray(val), {
    message: "conteudo precisa ser um objeto estruturado (nunca array nem texto livre)",
  });

// ── GET /api/knowledge-base?campo= ──

export const getKnowledgeBaseQuerySchema = z.object({
  tenant_id: z.uuid(),
  campo: z.enum(KNOWLEDGE_FIELDS).optional(),
});
export type GetKnowledgeBaseQuery = z.infer<typeof getKnowledgeBaseQuerySchema>;

// ── PUT /api/knowledge-base/:campo (salva como rascunho, nunca publica direto) ──

export const saveKnowledgeDraftSchema = z.object({
  tenant_id: z.uuid(),
  campo: z.enum(KNOWLEDGE_FIELDS),
  conteudo: conteudoSchema,
});
export type SaveKnowledgeDraftParams = z.infer<typeof saveKnowledgeDraftSchema>;

// ── POST /api/knowledge-base/publish ──

export const publishKnowledgeBaseSchema = z.object({
  tenant_id: z.uuid(),
});
export type PublishKnowledgeBaseParams = z.infer<typeof publishKnowledgeBaseSchema>;

// ── POST /api/knowledge-base/rollback/:versao ──

export const rollbackKnowledgeBaseSchema = z.object({
  tenant_id: z.uuid(),
  versao: z.coerce.number().int().positive(),
});
export type RollbackKnowledgeBaseParams = z.infer<typeof rollbackKnowledgeBaseSchema>;

// ── POST /api/knowledge-base/playground (testa contra rascunho, nunca envia mensagem real) ──

export const testPlaygroundSchema = z.object({
  tenant_id: z.uuid(),
  mensagem_simulada: z.string().min(1, "mensagem_simulada não pode ser vazia").max(4000),
  persona: z.enum(PERSONAS),
});
export type TestPlaygroundParams = z.infer<typeof testPlaygroundSchema>;
