# Geocatch Datalink

Photo-anchored field journaling for iOS and Android. Capture pins place and time, enrich with environmental context, and explore trends — locally first; cloud sync and AI are premium.

## Stack

- **Expo (React Native) + TypeScript**
- **expo-router** — Capture → Observations → Trends → Account navigation
- **expo-sqlite** — offline observation / signal store
- **Supabase** (optional) — Auth + Postgres + Storage for premium cloud sync
- **Multi-source enrichment** — Open-Meteo + MET Norway (keyless), optional OpenWeather / WeatherAPI keys, NWS (US); numeric fields averaged with std-dev samples

## Core loop (foundation)

1. **Capture** — camera or gallery import; EXIF GPS/time with device GPS fallback
2. **Place / time** — confirm on the observation screen; map pin + manual time when needed
3. **Enrichment** — multi-source weather / solar / water merge stored as local `signals` rows
4. **Trends** — multi-series charts, place/tag/date filters, σ bands, saved presets (`trend_views`)

## Develop

**Full first-run guide:** [docs/LOCAL_SETUP.md](docs/LOCAL_SETUP.md) — Expo install/run (iOS/Android), `.env` from `.env.example`, Open-Meteo vs keyed weather providers, Supabase (`supabase/schema.sql`), and premium entitlement.

```bash
npm install
cp .env.example .env   # optional; app works local-only without it
npm start
```

Then open in Expo Go, iOS simulator (`i` / `npm run ios`), or Android emulator (`a` / `npm run android`).

```bash
npm run typecheck
```

## Enrichment signals (GD-5 / GD-11 / GD-6)

Multi-source merge: selected providers are fetched in parallel; **numeric fields are averaged** per signal; **std-dev** + per-source **samples** are stored for charts (`{key}.std_dev`, `enrichment.sources` JSON).

**Modes (per dataset):** `top3` (usage-biased reliability, cold-start = ranking), `suggestions` (curated list **cap 5**), `custom` (user picks, **also cap 5** — UI rejects extras; merge/prefs truncate with a clear message). Prefs in `enrichment_prefs`; usage in `source_usage`.

**Providers:** Open-Meteo (keyless forecast/archive + marine), MET Norway (keyless), OpenWeather / WeatherAPI (env keys), NWS (US).

**Custom signals (GD-6):** Observation detail → **Custom signals** — request any catalog or free-form key (`requestUserSignal` / `resolveUserSignal` uses the same merger + caps). Miss or unknown key → `unavailable` free-text ready; `setFreeTextSignal` stores a typed value with optional **unit** so parseable numbers stay chartable.

| Key | Label | Unit | Trendable | Notes |
| --- | --- | --- | --- | --- |
| `solar.time_of_day` | Time of day | — | yes | Derived: night / dawn / morning / midday / afternoon / dusk |
| `solar.daylight_remaining_min` | Daylight remaining | min | yes | Minutes until sunset; 0 outside daylight |
| `solar.sunrise` / `solar.sunset` | Sunrise / Sunset | — | no | ISO from solar-capable sources |
| `solar.moon_phase` | Moon phase | — | yes | Derived illuminated fraction + name |
| `weather.pressure_msl` | Barometric pressure | hPa | yes | Multi-source average |
| `weather.wind_speed` | Wind speed | km/h | yes | Multi-source average |
| `weather.wind_direction` | Wind direction | deg | yes | Circular mean |
| `weather.humidity` | Humidity | % | yes | Multi-source average |
| `weather.uv_index` | UV index | — | yes | Averaged when available |
| `weather.precipitation` | Precipitation | mm | yes | Multi-source average |
| `water.temperature` | Water temperature | °C | yes | Marine SST or `unavailable` |
| `weather.temperature` | Air temperature | °C | yes | Extra trendable |
| `weather.feels_like` | Feels like | °C | yes | Apparent temperature |
| `weather.cloud_cover` | Cloud cover | % | yes | Extra trendable |
| `weather.visibility` | Visibility | m | yes | When sources provide it |
| `weather.dew_point` | Dew point | °C | yes | Extra trendable |
| `weather.wind_gusts` | Wind gusts | km/h | yes | When available |
| `weather.conditions` | Conditions | — | yes | First non-empty text source |
| `*.std_dev` | Std-dev companion | same | yes | When ≥2 sources contributed |
| `enrichment.*` | Status / provenance | — | no | `status`, `error`, `fetched_at`, `provider`, `sources` |

API failures are stored as `enrichment.status=failed` (or `partial` / `skipped`) without crashing the observation screen. Re-running **Fetch weather & solar** replaces prior enrichment keys.

Canonical definitions: `src/enrichment/catalog.ts` · docs: project store `docs/enrichment-signals.md`.

## Trends (GD-7)

The **Trends** tab plots multi-series charts from local observations:

- **Signal keys** — catalog trendable keys, keys present in SQLite, free-form keys, and `outcome.rating`
- **Filters** — date range (UTC day bounds), place radius (Haversine km around a capture), tags (AND)
- **Std-dev** — optional ±σ band from `{key}.std_dev` companions (multi-source sample spread)
- **Presets** — built-in packs plus saved `trend_views` rows (filters, keys, chart type, dates)

Charting uses `react-native-svg` for clear line / scatter / bar series. Shared absolute Y when units match; otherwise independent relative scales with a legend note.

## Premium cloud sync (GD-8)

Free stays fully usable offline. Premium unlocks Supabase Auth + observation/photo/signal sync across devices.

1. Copy `.env.example` → `.env` and set `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` (never commit real keys). Optional: `EXPO_PUBLIC_OPENWEATHER_API_KEY` / `EXPO_PUBLIC_WEATHERAPI_KEY` for keyed weather sources.
2. Apply `supabase/schema.sql` in your Supabase project; create private Storage bucket `observation-photos` with `{user_id}/` policies (steps in [docs/LOCAL_SETUP.md](docs/LOCAL_SETUP.md)).
3. In the **Account** tab: enable the local premium flag (or set `profiles.entitlement`), sign in, then **Sync now**.

Sync is last-write-wins per observation using `updated_at` (merge decisions shown with timestamps). Missing env, free entitlement, or offline network fail gracefully — local SQLite keeps working.

## Premium AI suggestions (GD-9)

Same entitlement as cloud sync. On the **Trends** tab, premium users can **Generate from stored data**:

- On-device analysis of local observations + signals only (never invents rows)
- **Correlations** — Pearson r between signals and outcome ratings (or signal pairs)
- **Interesting periods** — high-rating or elevated-signal date windows bounded by real captures
- Each suggestion lists signal keys, date window, sample size / r, and supporting observation count
- **Apply to chart** loads those keys + dates; **Dismiss** hides the suggestion (`ai_suggestions.dismissed_at`)

## Polish — map, timeline, export (GD-10 / phase 6)

The **Log** tab switches between:

- **List** — classic observation rows
- **Map** — all captures with coordinates (`react-native-maps`); tap a marker for detail
- **Timeline** — day-grouped chronological rail

**Data export** (same tab): JSON or CSV of observations + signals via the system share sheet. Optional **strip coordinates** for privacy. Photos are not bundled; the payload only notes whether a local photo exists. `eas.json` is included for EAS development / preview / production builds.

## Project layout

```
app/                 # expo-router screens (Capture, Log, Trends, Account, detail, map pin)
src/capture/         # Photo pick, EXIF parse, place/time resolve, persist
src/enrichment/      # Multi-source merge, providers, solar/moon, signal catalog
src/trends/          # Series builder, place radius, built-in presets
src/suggestions/     # Premium AI analyzer (stored data only) + evidence types
src/sync/            # Supabase client, auth, entitlement gate, LWW sync engine
src/export/          # JSON/CSV export builders + share sheet
src/db/              # SQLite client, schema, observation + trend_views + ai_suggestions
src/types/           # Observation, Signal, TrendView, AiSuggestion, Entitlement
src/components/      # Shared UI (map/timeline views, TrendChart, AI, source prefs)
src/theme/           # Colors
supabase/            # SQL schema for Auth/Postgres/Storage (no secrets)
eas.json             # EAS Build profiles
```

See the product plan in the project store for phases beyond foundation.
