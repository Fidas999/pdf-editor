/**
 * Hybrid font matching: local catalog first, AI only on low confidence
 * or when the user explicitly requests it.
 */

import {
  FONT_CATALOG,
  findFontById,
  type CatalogFont,
} from "./fontCatalog";
import {
  isHighConfidence,
  matchFontLocally,
  type FontMatchResult,
} from "./textStyle";

export interface FontSuggestion {
  font: CatalogFont;
  confidence: number;
  source: "local" | "ai" | "user";
  reason?: string;
}

export interface MatchFontInput {
  /** Original PDF font name from pdf.js. */
  fontName?: string;
  /** Optional PNG/JPEG data URL crop of the text region. */
  imageDataUrl?: string;
  /** Force AI even when local confidence is high. */
  forceAi?: boolean;
}

export interface MatchFontOutput {
  primary: FontSuggestion;
  alternatives: FontSuggestion[];
  usedAi: boolean;
}

const AI_CONFIDENCE_THRESHOLD = 0.78;

/**
 * Resolve the best font for a text region.
 * Local matching always runs; AI runs only if configured and needed.
 */
export async function matchFont(
  input: MatchFontInput
): Promise<MatchFontOutput> {
  const local = matchFontLocally(input.fontName);
  const localSuggestion: FontSuggestion = {
    font: local.font,
    confidence: local.confidence,
    source: "local",
    reason: `Matched via ${local.source}`,
  };

  const needAi =
    input.forceAi ||
    (!isHighConfidence(local.confidence) && !!input.imageDataUrl);

  if (!needAi) {
    return {
      primary: localSuggestion,
      alternatives: alternativesFromLocal(local),
      usedAi: false,
    };
  }

  const ai = await matchFontWithAi({
    fontName: input.fontName,
    imageDataUrl: input.imageDataUrl,
    localHint: local,
  });

  if (!ai || ai.length === 0) {
    return {
      primary: localSuggestion,
      alternatives: alternativesFromLocal(local),
      usedAi: false,
    };
  }

  const primary = ai[0];
  // Prefer AI only when it beats local or user forced it
  const useAiPrimary =
    input.forceAi || primary.confidence >= local.confidence;

  return {
    primary: useAiPrimary ? primary : localSuggestion,
    alternatives: [
      ...(useAiPrimary ? [localSuggestion] : []),
      ...ai.slice(useAiPrimary ? 1 : 0),
      ...alternativesFromLocal(local).filter(
        (a) => a.font.id !== primary.font.id
      ),
    ].slice(0, 5),
    usedAi: true,
  };
}

function alternativesFromLocal(local: FontMatchResult): FontSuggestion[] {
  return FONT_CATALOG.filter(
    (f) => f.category === local.font.category && f.id !== local.font.id
  )
    .slice(0, 3)
    .map((font) => ({
      font,
      confidence: Math.max(0.2, local.confidence - 0.15),
      source: "local" as const,
      reason: `Same category (${font.category})`,
    }));
}

interface AiMatchInput {
  fontName?: string;
  imageDataUrl?: string;
  localHint: FontMatchResult;
}

/**
 * AI font matcher — optional. Uses VITE_FONT_AI_URL + VITE_FONT_AI_KEY when set.
 * The remote API must return JSON: { suggestions: [{ id, confidence, reason? }] }
 * where id is a catalog font id. Without config, returns null (local-only).
 */
export async function matchFontWithAi(
  input: AiMatchInput
): Promise<FontSuggestion[] | null> {
  const endpoint = import.meta.env.VITE_FONT_AI_URL as string | undefined;
  const apiKey = import.meta.env.VITE_FONT_AI_KEY as string | undefined;

  if (!endpoint) {
    // No AI configured — soft local boost using catalog proximity
    return softVisualFallback(input);
  }

  try {
    const catalogIds = FONT_CATALOG.map((f) => ({
      id: f.id,
      label: f.label,
      category: f.category,
    }));
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        fontName: input.fontName,
        imageDataUrl: input.imageDataUrl,
        catalog: catalogIds,
        localHint: {
          id: input.localHint.font.id,
          confidence: input.localHint.confidence,
        },
      }),
    });
    if (!res.ok) {
      console.warn("Font AI request failed", res.status);
      return softVisualFallback(input);
    }
    const data = (await res.json()) as {
      suggestions?: Array<{ id: string; confidence: number; reason?: string }>;
    };
    const suggestions: FontSuggestion[] = [];
    for (const s of data.suggestions ?? []) {
      const font = findFontById(s.id);
      if (!font) continue;
      suggestions.push({
        font,
        confidence: Math.min(1, Math.max(0, s.confidence)),
        source: "ai",
        reason: s.reason,
      });
    }
    return suggestions.length ? suggestions : softVisualFallback(input);
  } catch (err) {
    console.warn("Font AI unavailable", err);
    return softVisualFallback(input);
  }
}

/**
 * When AI is not configured, still provide ranked alternatives from the
 * same category so the “Sugerir fonte” UI has something useful.
 */
function softVisualFallback(input: AiMatchInput): FontSuggestion[] {
  const local = input.localHint;
  const same = FONT_CATALOG.filter((f) => f.category === local.font.category);
  return same.map((font, i) => ({
    font,
    confidence: Math.max(
      0.25,
      local.confidence - i * 0.08 + (font.id === local.font.id ? 0.05 : 0)
    ),
    source: "local" as const,
    reason: input.imageDataUrl
      ? "Sugestão local (AI não configurada)"
      : "Sugestão local por categoria",
  }));
}

/** Whether the app can call a remote AI font matcher. */
export function isFontAiConfigured(): boolean {
  return Boolean(import.meta.env.VITE_FONT_AI_URL);
}

export { AI_CONFIDENCE_THRESHOLD };
