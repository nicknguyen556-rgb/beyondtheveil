import type { SuggestionKind } from '@/types/models';

/** Structured evidence shown in the UI — never fabricated observation values. */
export interface SuggestionEvidence {
  /** Pearson r when kind is correlation. */
  correlation?: number;
  sampleSize: number;
  /** Mean of the primary signal over the supporting observations. */
  signalMean?: number;
  /** Mean outcome rating when ratings were used. */
  outcomeMean?: number;
  /** Human-readable method note (e.g. "pearson vs outcome.rating"). */
  method: string;
}

/** In-memory draft before persistence — IDs must already exist in SQLite. */
export interface SuggestionDraft {
  kind: SuggestionKind;
  title: string;
  summary: string;
  signalKeys: string[];
  observationIds: string[];
  dateRangeStart: string | null;
  dateRangeEnd: string | null;
  evidence: SuggestionEvidence;
  /** Higher = show first. */
  score: number;
}

export function parseJsonStringArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
  } catch {
    return [];
  }
}

export function parseSuggestionEvidence(raw: string | null | undefined): SuggestionEvidence {
  const fallback: SuggestionEvidence = { sampleSize: 0, method: 'unknown' };
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as Partial<SuggestionEvidence>;
    return {
      correlation:
        typeof parsed.correlation === 'number' && Number.isFinite(parsed.correlation)
          ? parsed.correlation
          : undefined,
      sampleSize:
        typeof parsed.sampleSize === 'number' && Number.isFinite(parsed.sampleSize)
          ? parsed.sampleSize
          : 0,
      signalMean:
        typeof parsed.signalMean === 'number' && Number.isFinite(parsed.signalMean)
          ? parsed.signalMean
          : undefined,
      outcomeMean:
        typeof parsed.outcomeMean === 'number' && Number.isFinite(parsed.outcomeMean)
          ? parsed.outcomeMean
          : undefined,
      method: typeof parsed.method === 'string' ? parsed.method : 'unknown',
    };
  } catch {
    return fallback;
  }
}
