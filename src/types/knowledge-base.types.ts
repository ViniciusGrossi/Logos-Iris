// Logos Iris — TenantKnowledgeBase (knowledge-base-v1)
// Tipos de saída (DTOs/resultados). Enums derivam de src/schemas/knowledge-base.schema.ts
// (fonte única — evita drift entre validação de input e tipo).

import type { ENTRY_STATUSES, KNOWLEDGE_FIELDS, PERSONAS } from "@/schemas/knowledge-base.schema";

export type KnowledgeField = (typeof KNOWLEDGE_FIELDS)[number];
export type EntryStatus = (typeof ENTRY_STATUSES)[number];
export type Persona = (typeof PERSONAS)[number];

/** Linha de iris.knowledge_base_entries — retornada pelo Repository, nunca a row bruta do banco. */
export interface KnowledgeEntryDTO {
  id: string;
  campo: KnowledgeField;
  conteudo: Record<string, unknown>;
  status: EntryStatus;
  versao: number;
  contradicao_detectada: boolean;
}

/** Retorno de SaveKnowledgeDraft. */
export interface SaveKnowledgeDraftResult {
  entry: KnowledgeEntryDTO;
  contradicoes: string[];
}

/** Retorno de PublishKnowledgeBase — nunca mistura os dois formatos no mesmo objeto. */
export type PublishKnowledgeBaseResult =
  | { status: "publicado"; versao: number }
  | { status: "bloqueado"; motivos: string[] };

/** Retorno de RollbackKnowledgeBase. */
export interface RollbackKnowledgeBaseResult {
  status: "publicado";
  versao: number;
}

/** Retorno de TestPlayground. */
export interface TestPlaygroundResult {
  resposta_simulada: string;
}
