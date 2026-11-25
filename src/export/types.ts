/** Portable dump of local observations for user-owned export / backup. */

export interface ExportSignal {
  id: string;
  key: string;
  source: string;
  value: string | null;
  unit: string | null;
  confidence: number | null;
  createdAt: string;
}

export interface ExportObservation {
  id: string;
  /** Omitted from export when stripCoordinates is on (privacy). */
  latitude: number | null;
  longitude: number | null;
  capturedAt: string;
  placeLabel: string | null;
  placeSource: string | null;
  timeSource: string | null;
  tags: string[];
  outcomeRating: number | null;
  outcomeNotes: string | null;
  createdAt: string;
  updatedAt: string;
  /** Local photo path is device-specific; included only as a hint when present. */
  hasLocalPhoto: boolean;
  signals: ExportSignal[];
}

export interface GeocatchExportPayload {
  format: 'geocatch-datalink-export';
  version: 1;
  exportedAt: string;
  stripCoordinates: boolean;
  observationCount: number;
  observations: ExportObservation[];
}

export interface BuildExportOptions {
  /** When true, latitude/longitude are null in the payload (privacy). */
  stripCoordinates?: boolean;
}
