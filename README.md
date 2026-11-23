# Geocatch Datalink

Photo-anchored field journaling for iOS and Android. Capture pins place and time, enrich with environmental context, and explore trends — locally first; cloud sync and AI are premium.

## Stack

- **Expo (React Native) + TypeScript**
- **expo-router** — Capture → Observations → Trends navigation
- **expo-sqlite** — offline observation / signal store
- **Multi-source enrichment** — Open-Meteo + MET Norway (keyless), optional OpenWeather / WeatherAPI keys, NWS (US); numeric fields averaged with std-dev samples

## Core loop (foundation)

1. **Capture** — camera or gallery import; EXIF GPS/time with device GPS fallback
2. **Place / time** — confirm on the observation screen; map pin + manual time when needed
3. **Enrichment** — multi-source weather / solar / water merge stored as local `signals` rows
4. **Trends** — multi-series charts, place/tag/date filters, σ bands, saved presets (`trend_views`)

## Develop

```bash
npm install
npm start
```

Then open in Expo Go, iOS simulator, or Android emulator.

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

## Project layout

```
app/                 # expo-router screens (Capture, Log, Trends, detail, map pin)
src/capture/         # Photo pick, EXIF parse, place/time resolve, persist
src/enrichment/      # Multi-source merge, providers, solar/moon, signal catalog
src/trends/          # Series builder, place radius, built-in presets
src/db/              # SQLite client, schema, observation + trend_views repos
src/types/           # Observation, Signal, TrendView models
src/components/      # Shared UI (TrendChart, source prefs, custom signals)
src/theme/           # Colors
```

See the product plan in the project store for phases beyond foundation.
