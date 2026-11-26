# Local setup — Geocatch Datalink

Run the Expo app on iOS or Android, optionally wire weather API keys and Supabase for premium sync.

The app is fully usable **offline / local-only** with no `.env` at all. Enrichment still works via keyless providers (Open-Meteo, MET Norway, NWS). Supabase and keyed weather APIs are optional.

## Prerequisites

- **Node.js** 20+ (LTS recommended) and npm
- **Expo Go** on a physical device, or an **iOS Simulator** / **Android Emulator**
- For iOS Simulator: macOS with Xcode
- For Android Emulator: Android Studio + an AVD

## Install and run

```bash
git clone https://github.com/nicknguyen556-rgb/beyondtheveil.git
cd beyondtheveil
npm install
```

Optional env (see [Environment variables](#environment-variables)):

```bash
cp .env.example .env
# edit .env — leave placeholders blank or unset keys you do not need
```

Start Metro:

```bash
npm start
```

Then:

| Target | How |
| --- | --- |
| **Expo Go** | Scan the QR code in the terminal / Dev Tools |
| **iOS Simulator** | Press `i` in the terminal, or `npm run ios` |
| **Android Emulator** | Press `a`, or `npm run android` (emulator must be running) |

Typecheck:

```bash
npm run typecheck
```

After changing `.env`, restart Metro (`Ctrl+C`, then `npm start`) so `EXPO_PUBLIC_*` values reload.

## Environment variables

Copy `.env.example` → `.env`. Never commit real keys (`.env` is gitignored).

| Variable | Required? | Purpose |
| --- | --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | No | Supabase project URL for Auth + sync |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | No | Supabase anon (public) key |
| `EXPO_PUBLIC_OPENWEATHER_API_KEY` | No | Enables OpenWeather as an enrichment source |
| `EXPO_PUBLIC_WEATHERAPI_KEY` | No | Enables WeatherAPI.com as an enrichment source |

Placeholder values (e.g. `YOUR_PROJECT`, `YOUR_SUPABASE_*`) are treated as **unset** — the app stays local-only.

For EAS builds, set the same names as EAS secrets / env rather than committing `.env`.

## Weather providers

Enrichment merges multiple sources in parallel; numeric fields are averaged (see README / `src/enrichment/`).

### Keyless (work with no env)

| Source | Coverage notes |
| --- | --- |
| **Open-Meteo** | Forecast + archive weather, sunrise/sunset, marine SST when available |
| **MET Norway** | Locationforecast; near-term weather |
| **NWS** (`api.weather.gov`) | US grid forecast only |

Default dataset modes (`top3` / `suggestions` / `custom`) pick among configured sources. Missing env keys skip that source with a clear note — enrichment still runs on the others.

### Keyed (optional)

| Source | Env var | When to use |
| --- | --- | --- |
| **OpenWeather** | `EXPO_PUBLIC_OPENWEATHER_API_KEY` | Extra weather overlap in the merge |
| **WeatherAPI** | `EXPO_PUBLIC_WEATHERAPI_KEY` | Weather + sunrise/sunset |

Get keys from [OpenWeatherMap](https://openweathermap.org/api) and [WeatherAPI.com](https://www.weatherapi.com/). Leave them blank to rely on Open-Meteo / MET Norway / NWS only.

Source prefs live in the app (`enrichment_prefs`); caps and ranking are defined in `src/enrichment/sources/`.

## Supabase project setup (premium sync)

Skip this section if you only need local capture / trends.

1. Create a project at [supabase.com](https://supabase.com).
2. **Project Settings → API**: copy **Project URL** and **anon public** key into `.env` as `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
3. **SQL Editor**: paste and run the full contents of [`supabase/schema.sql`](../supabase/schema.sql). That creates:
   - `public.profiles` (`user_id`, `entitlement` ∈ `free` \| `premium`, RLS to `auth.uid()`)
   - `public.observations` (LWW via `updated_at`, RLS)
   - `public.signals` (per-observation rows, RLS)
4. **Authentication → Providers**: enable **Email** (password) so Account sign-in / sign-up work.
5. **Storage**: create a **private** bucket named exactly `observation-photos`.
6. **Storage policies**: authenticated users may read/write only under their own folder `{user_id}/` (paths look like `{user_id}/{observationId}.jpg`). Example policies:

```sql
-- Allow authenticated users to manage objects under their own user_id prefix
create policy "observation_photos_select_own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'observation-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "observation_photos_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'observation-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "observation_photos_update_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'observation-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "observation_photos_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'observation-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
```

7. Restart Metro, open the **Account** tab — it should say Supabase URL/key detected.

## Premium entitlement

There is no App Store / Play IAP yet. Entitlement is:

| Layer | Behavior |
| --- | --- |
| **Local flag** | Account tab → **Enable premium (local flag)**. Stored in SQLite `meta.entitlement`. |
| **Remote** | `profiles.entitlement` when signed in and reachable; overrides the local flag on resolve. |
| **Default** | `free` — fully offline; no cloud upload, no AI trend suggestions. |

**Premium unlocks** (same gate):

- Cloud sync (Auth + push/pull observations, signals, photos) — Account → **Sync now**
- AI suggestions on the **Trends** tab (analysis of stored local data only)

To try premium without a paid store product:

1. Configure Supabase (above) **or** stay local-only with just the local flag (sync still needs Supabase + sign-in).
2. Toggle **Enable premium** on Account.
3. Optionally set `profiles.entitlement = 'premium'` for your user in the Supabase Table Editor so other devices inherit it.

Free stays usable with no account and no network.

## First-run smoke path

1. `npm install` → `npm start` → open on device/simulator.
2. **Capture** — take or import a photo; confirm place/time on the observation screen.
3. **Fetch weather & solar** on the observation (keyless providers should populate signals).
4. **Log** — list / map / timeline; optional JSON/CSV export.
5. **Trends** — pick signal keys and chart.
6. (Optional) Configure `.env`, apply `schema.sql`, enable premium, sign in, **Sync now**.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Account says Supabase not configured | Real URL + anon key in `.env` (not placeholders); restart Metro |
| Keyed weather missing | Key set and non-empty; source enabled in enrichment prefs |
| Sync skipped / free plan | Enable premium on Account; sign in; network online |
| Photo sync fails | Bucket `observation-photos` exists, private, with `{user_id}/` policies |
| Camera / location prompts | Grant permissions; EXIF without GPS falls back to device location or map pin |
