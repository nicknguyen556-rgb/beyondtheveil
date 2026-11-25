# Geocatch Datalink

Photo-anchored field journaling for iOS and Android. Capture pins place and time, enrich with environmental context, and explore trends — locally first; cloud sync and AI are premium.

## Stack

- **Expo (React Native) + TypeScript**
- **expo-router** — Capture → Observations → Trends navigation
- **expo-sqlite** — offline observation / signal store

## Core loop (foundation)

1. **Capture** — create a local observation draft (photo ingest next)
2. **Place / time** — edit lat/lon, label, timestamp on the observation screen
3. **Enrichment** — attach default signal shells (weather / solar) locally
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

## Project layout

```
app/                 # expo-router screens
src/db/              # SQLite client, schema, observation repo
src/types/           # Observation, Signal, TrendView models
src/components/      # Shared UI shell
src/theme/           # Colors
```

See the product plan in the project store for phases beyond foundation.
