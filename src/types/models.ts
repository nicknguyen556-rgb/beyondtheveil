/** Core domain types for Geocatch Datalink (local-first observations). */

export type SignalSource = 'api' | 'manual' | 'derived';

export type Entitlement = 'free' | 'premium';

export type ChartType = 'line' | 'scatter' | 'bar';

export type PlaceSource = 'exif' | 'device' | 'manual';

export type TimeSource = 'exif' | 'device' | 'manual';

export interface Observation {
  id: string;
  photoUri: string | null;
  latitude: number | null;
  longitude: number | null;
  capturedAt: string;
  placeLabel: string | null;
  placeSource: PlaceSource | null;
  timeSource: TimeSource | null;
  tagsJson: string;
  outcomeRating: number | null;
  outcomeNotes: string | null;
  createdAt: string;
  updatedAt: string;
  syncedAt: string | null;
}

export interface Signal {
  id: string;
  observationId: string;
  key: string;
  source: SignalSource;
  value: string | null;
  unit: string | null;
  confidence: number | null;
  createdAt: string;
}

export interface TrendView {
  id: string;
  name: string;
  filtersJson: string;
  signalKeysJson: string;
  chartType: ChartType;
  dateRangeStart: string | null;
  dateRangeEnd: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewObservationInput {
  photoUri?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  capturedAt?: string;
  placeLabel?: string | null;
  placeSource?: PlaceSource | null;
  timeSource?: TimeSource | null;
  tags?: string[];
  outcomeRating?: number | null;
  outcomeNotes?: string | null;
}

export interface NewSignalInput {
  observationId: string;
  key: string;
  source: SignalSource;
  value?: string | null;
  unit?: string | null;
  confidence?: number | null;
}

/** Core loop stages reflected in the UI shell. */
export type CoreLoopStage =
  | 'photo'
  | 'place_time'
  | 'enrichment'
  | 'trends';
