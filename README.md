# Geocatch Datalink

Photo-anchored field journaling for iOS and Android. Capture pins place and time, enrich with environmental context, and explore trends — locally first; cloud sync and AI are premium.

## Stack

- **Expo (React Native) + TypeScript**
- **expo-router** — Capture → Observations → Trends navigation
- **expo-sqlite** — offline observation / signal store
- **Open-Meteo** — free weather / marine enrichment (no API key)

## Core loop (foundation)

1. **Capture** — camera or gallery import; EXIF GPS/time with device GPS fallback
2. **Place / time** — confirm on the observation screen; map pin + manual time when needed
3. **Enrichment** — Open-Meteo weather + solar context stored as local `signals` rows
4. **Trends** — chart UI reserved; schema includes `trend_views`

## Develop

```bash
npm install
npm start
```

Then open in Expo Go, iOS simulator, or Android emulator.

```bash
npm run typecheck
```

## Enrichment signals (GD-5)

Provider: **Open-Meteo** (`forecast` for ~last 90 days, `archive` for older, with cross-fallback). Marine SST is requested separately and marked `unavailable` (free-text ready) when the model returns no coverage.

| Key | Label | Unit | Trendable | Notes |
| --- | --- | --- | --- | --- |
| `solar.time_of_day` | Time of day | — | yes | Derived: night / dawn / morning / midday / afternoon / dusk |
| `solar.daylight_remaining_min` | Daylight remaining | min | yes | Minutes until sunset; 0 outside daylight |
| `solar.sunrise` / `solar.sunset` | Sunrise / Sunset | — | no | ISO local from Open-Meteo daily |
| `solar.moon_phase` | Moon phase | — | yes | Derived illuminated fraction + name |
| `weather.pressure_msl` | Barometric pressure | hPa | yes | Required default |
| `weather.wind_speed` | Wind speed | km/h | yes | Required default |
| `weather.wind_direction` | Wind direction | deg | yes | Required default |
| `weather.humidity` | Humidity | % | yes | Required default |
| `weather.uv_index` | UV index | — | yes | Best on forecast samples |
| `weather.precipitation` | Precipitation | mm | yes | Required default |
| `water.temperature` | Water temperature | °C | yes | Marine SST or `unavailable` |
| `weather.temperature` | Air temperature | °C | yes | Extra trendable |
| `weather.feels_like` | Feels like | °C | yes | Apparent temperature |
| `weather.cloud_cover` | Cloud cover | % | yes | Extra trendable |
| `weather.visibility` | Visibility | m | yes | When model provides it |
| `weather.dew_point` | Dew point | °C | yes | Extra trendable |
| `weather.wind_gusts` | Wind gusts | km/h | yes | When available |
| `weather.conditions` | Conditions | — | yes | WMO weather-code text |
| `enrichment.*` | Status / errors | — | no | `status`, `error`, `fetched_at`, `provider` |

API failures are stored as `enrichment.status=failed` (or `partial` / `skipped`) without crashing the observation screen. Re-running **Fetch weather & solar** replaces prior enrichment keys.

Canonical definitions live in `src/enrichment/catalog.ts`.

## Project layout

```
app/                 # expo-router screens (Capture, Log, detail, map pin)
src/capture/         # Photo pick, EXIF parse, place/time resolve, persist
src/enrichment/      # Open-Meteo client, solar/moon, signal catalog
src/db/              # SQLite client, schema, observation repo
src/types/           # Observation, Signal, TrendView models
src/components/      # Shared UI shell
src/theme/           # Colors
```

See the product plan in the project store for phases beyond foundation.
