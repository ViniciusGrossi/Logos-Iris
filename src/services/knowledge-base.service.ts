// Logos Iris — TenantKnowledgeBase (knowledge-base-v1)
// Toda a lógica de negócio do enriquecimento guiado do tenant. Independente de protocolo.
// Fora de escopo nesta v1 (ver docs/specs/knowledge-base-v1.md): upload de documento, entrevista
// via WhatsApp, camada artesanal, pipeline de embeddings (publish só "dispara o evento" — não
// redefinido aqui, ver SYNC REQUESTS no report do worker).

import { buildSimulatedResponse, detectContradictions, detectDisguisedInstructions } from "@/lib/knowledge-base/lint";
import type { KnowledgeEntryRepository } from "@/repositories/knowledge-base.repository";
import {
  getKnowledgeBaseQuerySchema,
  KNOWLEDGE_FIELDS,
  publishKnowledgeBaseSchema,
  rollbackKnowledgeBaseSchema,
  saveKnowledgeDraftSchema,
  testPlaygroundSchema,
  type GetKnowledgeBaseQuery,
  type PublishKnowledgeBaseParams,
  type RollbackKnowledgeBaseParams,
  type SaveKnowledgeDraftParams,
  type TestPlaygroundParams,
} from "@/schemas/knowledge-base.schema";
import { NoDraftToPublishError, VersionNotFoundError } from "@/services/knowledge-base.errors";
import type {
  KnowledgeEntryDTO,
  KnowledgeField,
  PublishKnowledgeBaseResult,
  RollbackKnowledgeBaseResult,
  SaveKnowledgeDraftResult,
  TestPlaygroundResult,
} from "@/types/knowledge-base.types";

/**
 * `versao` é um contador tenant-wide (não por campo, embora a coluna também carregue por-linha) —
 * cada ciclo de edição (1..N campos editados antes do próximo publish) compartilha a mesma
 * `versao` de rascunho; publish() promove essas linhas a 'publicado' e demove o 'publicado'
 * anterior de cada campo tocado para 'historico'. Campos não tocados neste ciclo continuam
 * publicados na versão anterior deles. rollback(N) restaura, campo a campo, a linha que existir
 * naquela versão N (histórica ou publicada) como a publicada atual daquele campo.
 */
function nextDraftVersao(rows: KnowledgeEntryDTO[]): number {
  const draftVersoes = rows.filter((row) => row.status === "rascunho").map((row) => row.versao);
  if (draftVersoes.length > 0) return Math.max(...draftVersoes);

  const allVersoes = rows.map((row) => row.versao);
  const maxVersao = allVersoes.length > 0 ? Math.max(...allVersoes) : 0;
  return maxVersao + 1;
}

/** Conteúdo "efetivo" por campo: rascunho (se houver) tem precedência sobre publicado (Requisito 7). */
function buildEffectiveContentMap(
  rows: KnowledgeEntryDTO[],
  override?: { campo: KnowledgeField; conteudo: Record<string, unknown> },
): Map<KnowledgeField, Record<string, unknown>> {
  const effective = new Map<KnowledgeField, Record<string, unknown>>();

  for (const campo of KNOWLEDGE_FIELDS) {
    if (override && override.campo === campo) {
      effective.set(campo, override.conteudo);
      continue;
    }

    const campoRows = rows.filter((row) => row.campo === campo);
    const draft = campoRows.filter((row) => row.status === "rascunho").sort((a, b) => b.versao - a.versao)[0];
    if (draft) {
      effective.set(campo, draft.conteudo);
      continue;
    }

    const published = campoRows.filter((row) => row.status === "publicado").sort((a, b) => b.versao - a.versao)[0];
    if (published) {
      effective.set(campo, published.conteudo);
    }
  }

  return effective;
}

export class KnowledgeBaseService {
  constructor(private readonly repo: KnowledgeEntryRepository) {}

  /** GET /api/knowledge-base?campo= — RLS + filtro explícito garantem que só o próprio tenant volta. */
  async getKnowledgeBase(input: GetKnowledgeBaseQuery): Promise<KnowledgeEntryDTO[]> {
    const parsed = getKnowledgeBaseQuerySchema.parse(input);
    return this.repo.findByTenant(parsed.tenant_id, parsed.campo);
  }

  /** PUT /api/knowledge-base/:campo — sempre grava como 'rascunho', nunca publica direto (Requisito 2). */
  async saveKnowledgeDraft(input: SaveKnowledgeDraftParams): Promise<SaveKnowledgeDraftResult> {
    const parsed = saveKnowledgeDraftSchema.parse(input);
    const rows = await this.repo.findByTenant(parsed.tenant_id);
    const draftVersao = nextDraftVersao(rows);

    const effective = buildEffectiveContentMap(rows, { campo: parsed.campo, conteudo: parsed.conteudo });
    // Requisito 3 — lint de contradição roda ao salvar rascunho.
    const contradicoes = detectContradictions(effective);

    const entry = await this.repo.upsertDraft({
      tenantId: parsed.tenant_id,
      campo: parsed.campo,
      versao: draftVersao,
      conteudo: parsed.conteudo,
      contradicaoDetectada: contradicoes.length > 0,
    });

    return { entry, contradicoes };
  }

  /**
   * POST /api/knowledge-base/publish — lint de instrução disfarçada bloqueia (Requisito 4); lint
   * de contradição roda mas é informacional aqui (não bloqueia — contrato PublishKnowledgeBase não
   * tem campo `contradicoes` na resposta, só SaveKnowledgeDraft tem).
   */
  async publishKnowledgeBase(input: PublishKnowledgeBaseParams): Promise<PublishKnowledgeBaseResult> {
    const parsed = publishKnowledgeBaseSchema.parse(input);
    const rows = await this.repo.findByTenant(parsed.tenant_id);
    const draftRows = rows.filter((row) => row.status === "rascunho");

    if (draftRows.length === 0) {
      throw new NoDraftToPublishError();
    }

    const draftVersao = Math.max(...draftRows.map((row) => row.versao));
    const effective = buildEffectiveContentMap(rows);

    const motivos = detectDisguisedInstructions(effective);
    if (motivos.length > 0) {
      // Requisito 4: bloqueia — nenhuma versão nova vira publicado, rascunho permanece intocado.
      return { status: "bloqueado", motivos };
    }

    // Requisito 3 (informacional na publicação, não bloqueia).
    detectContradictions(effective);

    for (const draftRow of draftRows.filter((row) => row.versao === draftVersao)) {
      const currentPublicado = rows.find((row) => row.campo === draftRow.campo && row.status === "publicado");
      if (currentPublicado) {
        await this.repo.setStatus(currentPublicado.id, parsed.tenant_id, "historico");
      }
      await this.repo.setStatus(draftRow.id, parsed.tenant_id, "publicado");
    }

    return { status: "publicado", versao: draftVersao };
  }

  /** POST /api/knowledge-base/rollback/:versao — restaura, campo a campo, a linha existente na versão N. */
  async rollbackKnowledgeBase(input: RollbackKnowledgeBaseParams): Promise<RollbackKnowledgeBaseResult> {
    const parsed = rollbackKnowledgeBaseSchema.parse(input);
    const rows = await this.repo.findByTenant(parsed.tenant_id);
    const targetRows = rows.filter((row) => row.versao === parsed.versao);

    if (targetRows.length === 0) {
      throw new VersionNotFoundError(parsed.versao);
    }

    for (const targetRow of targetRows) {
      const currentPublicado = rows.find((row) => row.campo === targetRow.campo && row.status === "publicado");
      if (currentPublicado && currentPublicado.id !== targetRow.id) {
        await this.repo.setStatus(currentPublicado.id, parsed.tenant_id, "historico");
      }
      if (targetRow.status !== "publicado") {
        await this.repo.setStatus(targetRow.id, parsed.tenant_id, "publicado");
      }
    }

    return { status: "publicado", versao: parsed.versao };
  }

  /** POST /api/knowledge-base/playground — testa contra o RASCUNHO atual, nunca a versão publicada nem envia mensagem real (Requisito 7). */
  async testPlayground(input: TestPlaygroundParams): Promise<TestPlaygroundResult> {
    const parsed = testPlaygroundSchema.parse(input);
    const rows = await this.repo.findByTenant(parsed.tenant_id);
    const effective = buildEffectiveContentMap(rows);

    const respostaSimulada = buildSimulatedResponse(effective, parsed.mensagem_simulada, parsed.persona);
    return { resposta_simulada: respostaSimulada };
  }
}
