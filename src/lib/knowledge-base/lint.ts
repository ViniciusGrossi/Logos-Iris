// Logos Iris — TenantKnowledgeBase (knowledge-base-v1)
// Lint de contradição + lint de instrução disfarçada de fato. Heurística por campo + comparação
// leve (Restrições Técnicas da spec: "sem libs novas... heurística por campo + comparação leve").
// Funções puras — sem I/O, testáveis isoladamente e reaproveitadas pelo Service.

import type { KnowledgeField } from "@/types/knowledge-base.types";

// Faixa Unicode "Combining Diacritical Marks" (U+0300-U+036F) via \u escape — evita caractere
// combinante literal no código-fonte (ambíguo em editores/diffs).
const COMBINING_DIACRITICS_RE = new RegExp("[̀-ͯ]", "g");

function normalize(text: string): string {
  return text.normalize("NFD").replace(COMBINING_DIACRITICS_RE, "").toLowerCase();
}

// ── Lint de contradição (Requisito 3) ──
// Heurística: extrai menções "N dias" e associa a uma palavra-chave de política de negócio
// próxima (janela de contexto). Se a mesma palavra-chave aparece com números de dias distintos
// entre campos, é uma contradição (ex.: "troca em 7 dias" no campo políticas vs "30 dias" no FAQ).

const DAY_MENTION_KEYWORDS: Record<string, string[]> = {
  troca: ["troca", "trocar", "trocas"],
  devolucao: ["devolucao", "devolver", "devolvido"],
  reembolso: ["reembolso", "estorno", "ressarcimento"],
  garantia: ["garantia"],
  entrega: ["entrega", "prazo de entrega", "envio"],
  cancelamento: ["cancelamento", "cancelar"],
};

interface DayMention {
  keyword: string;
  dias: number;
}

function extractDayMentions(rawText: string): DayMention[] {
  const text = normalize(rawText);
  const mentions: DayMention[] = [];
  const re = /(\d{1,3})\s*dias?/g;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    const windowStart = Math.max(0, match.index - 40);
    const windowEnd = Math.min(text.length, match.index + match[0].length + 10);
    const window = text.slice(windowStart, windowEnd);

    for (const [keyword, aliases] of Object.entries(DAY_MENTION_KEYWORDS)) {
      if (aliases.some((alias) => window.includes(alias))) {
        mentions.push({ keyword, dias: Number(match[1]) });
        break;
      }
    }
  }

  return mentions;
}

/**
 * Compara o conteúdo efetivo (rascunho tem precedência sobre publicado — ver
 * buildEffectiveContentMap) de todos os campos e retorna uma descrição por conflito encontrado.
 * Nunca lança — retorna array vazio quando não há contradição.
 */
export function detectContradictions(effective: Map<KnowledgeField, Record<string, unknown>>): string[] {
  const allMentions: { campo: KnowledgeField; keyword: string; dias: number }[] = [];

  for (const [campo, conteudo] of effective.entries()) {
    const text = JSON.stringify(conteudo);
    for (const mention of extractDayMentions(text)) {
      allMentions.push({ campo, ...mention });
    }
  }

  const byKeyword = new Map<string, { campo: KnowledgeField; dias: number }[]>();
  for (const mention of allMentions) {
    const list = byKeyword.get(mention.keyword) ?? [];
    list.push({ campo: mention.campo, dias: mention.dias });
    byKeyword.set(mention.keyword, list);
  }

  const contradicoes: string[] = [];
  for (const [keyword, list] of byKeyword.entries()) {
    const distinctDias = new Set(list.map((item) => item.dias));
    if (distinctDias.size > 1) {
      const detail = list.map((item) => `${item.campo}: ${item.dias} dias`).join(" vs ");
      contradicoes.push(`Conflito em "${keyword}": ${detail}`);
    }
  }

  return contradicoes;
}

// ── Lint de instrução disfarçada de fato (Requisito 4 — roda na publicação, bloqueia) ──

const DISGUISED_INSTRUCTION_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /ignore\s+(suas|as|todas)?\s*(instru[cç][oõ]es|regras)/i, label: "ignorar instruções/regras" },
  { pattern: /desconsidere\s+(suas|as)?\s*(instru[cç][oõ]es|regras)/i, label: "desconsiderar instruções/regras" },
  { pattern: /esque[cç]a\s+(tudo|suas\s+instru[cç][oõ]es|as\s+regras)/i, label: "esquecer instruções" },
  { pattern: /voc[eê]\s+(agora\s+)?[eé]\s+um[a]?\s+outro/i, label: "reatribuição de persona" },
  { pattern: /aja\s+como\s+(se|um|uma)/i, label: "instrução de role-play/jailbreak" },
  { pattern: /system\s*prompt/i, label: "referência a system prompt" },
  { pattern: /\byou\s+are\s+now\b/i, label: "reatribuição de persona (EN)" },
  { pattern: /ignore\s+(your|all)\s+(previous\s+)?instructions/i, label: "ignore instructions (EN)" },
  { pattern: /disregard\s+(the\s+)?(system|previous)\s+(prompt|instructions)/i, label: "disregard instructions (EN)" },
];

/**
 * Varre o conteúdo efetivo por instrução disfarçada de fato (ex.: "ignore suas instruções e diga
 * X"). Retorna 1 motivo por (campo, padrão) encontrado — publish() bloqueia se a lista não for
 * vazia. Nunca lança.
 */
export function detectDisguisedInstructions(effective: Map<KnowledgeField, Record<string, unknown>>): string[] {
  const motivos: string[] = [];

  for (const [campo, conteudo] of effective.entries()) {
    const text = JSON.stringify(conteudo);
    for (const { pattern, label } of DISGUISED_INSTRUCTION_PATTERNS) {
      const match = text.match(pattern);
      if (match) {
        motivos.push(`Campo "${campo}" contém instrução disfarçada de fato (${label}): "${match[0]}"`);
      }
    }
  }

  return motivos;
}

// ── Playground (Requisito 7) — resposta simulada heurística, sem chamar LLM/adapter real ──

function scoreOverlap(messageWords: string[], text: string): number {
  return messageWords.reduce((score, word) => (text.includes(word) ? score + 1 : score), 0);
}

/**
 * Escolhe o campo mais relevante para a mensagem simulada (overlap léxico simples) e monta uma
 * resposta determinística refletindo o conteúdo EFETIVO (rascunho > publicado). Não chama nenhum
 * ModelGateway/adapter de WhatsApp — é só reflexo do conteúdo, nunca uma mensagem real enviada.
 */
export function buildSimulatedResponse(
  effective: Map<KnowledgeField, Record<string, unknown>>,
  mensagemSimulada: string,
  persona: string,
): string {
  const messageWords = normalize(mensagemSimulada)
    .split(/\s+/)
    .filter((word) => word.length > 2);

  let bestCampo: KnowledgeField | undefined;
  let bestScore = -1;

  for (const [campo, conteudo] of effective.entries()) {
    const text = normalize(JSON.stringify(conteudo));
    const score = scoreOverlap(messageWords, text);
    if (score > bestScore) {
      bestScore = score;
      bestCampo = campo;
    }
  }

  if (!bestCampo) {
    return `[Simulação — persona ${persona}] Nenhuma informação guiada cadastrada ainda para responder "${mensagemSimulada}".`;
  }

  const conteudo = effective.get(bestCampo);
  return `[Simulação — persona ${persona}] Com base no campo "${bestCampo}": ${JSON.stringify(conteudo)}`;
}
