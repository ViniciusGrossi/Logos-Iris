// Logos Iris — contact-memory (docs/specs/contact-memory.md)
// Validação Zod de todo input que cruza a fronteira do ContactMemoryService — antes do Service,
// nunca depois (CLAUDE.md, _shared.md §4).

import { z } from "zod";

export const uuidSchema = z.string().uuid();

/**
 * SummarizeContactMemory (API Contract da spec) — chamada interna disparada pelo job periódico
 * (pg_cron → pgmq → Edge Function). periodo_inicio precisa ser estritamente anterior a
 * periodo_fim (Requisito 1: resumo de "um período de conversa" — período invertido/vazio não é
 * um período válido a resumir).
 */
export const summarizeContactMemoryParamsSchema = z
  .object({
    tenant_id: uuidSchema,
    contact_id: uuidSchema,
    periodo_inicio: z.string().min(1), // ISODateTime
    periodo_fim: z.string().min(1), // ISODateTime
  })
  .refine((v) => new Date(v.periodo_inicio).getTime() < new Date(v.periodo_fim).getTime(), {
    message: "periodo_inicio deve ser uma data válida anterior a periodo_fim",
    path: ["periodo_fim"],
  });
export type SummarizeContactMemoryParams = z.infer<typeof summarizeContactMemoryParamsSchema>;
