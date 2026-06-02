# My News Page — v1 (CORS proxy version)

A personalized news dashboard that fetches RSS feeds live from the browser through third-party CORS proxies.

**Status:** kept for reference. Superseded by v2 (`/`) which uses a scheduled GitHub Actions build instead.

## What this version does

A single `index.html` file. When you open it:

1. The page's JavaScript loops over a list of RSS feed URLs (one or more per region).
2. For each feed URL, it asks a public CORS proxy (`api.allorigins.win`, `corsproxy.io`, or `api.codetabs.com`) to fetch the RSS XML.
3. The browser parses the XML, applies filters (trusted-source whitelist for some regions, international-only filter for Global), deduplicates by headline, and renders the result.
4. Refresh button repeats the whole process — news is always live.

Everything runs in your browser. There is no server, no scheduled job, no build step.

## Regions and sources

- **🌍 Global** — Google News WORLD topic + BBC World + Guardian World + Al Jazeera. Filtered to international stories (drops US-domestic, entertainment, lifestyle).
- **🇺🇸 United States** — Google News, filtered to CNN, NYT, The Economist, CBS News, CBC News, Forbes.
- **🇪🇺 Europe** — Google News, UK + Germany + France editions, English.
- **🇷🇴 Romania** — Google News Romania, filtered to G4Media, HotNews, Digi24, Europa Liberă, Spotmedia, PressOne, Adevărul, Pro TV, Agerpres, Mediafax, Ziare.
- **🇲🇽 Mexico** — Direct publisher RSS: Aristegui Noticias, Animal Político, El Universal, El Financiero, La Jornada, Proceso.

## Architecture

```
┌──────────────────────────┐         ┌────────────────────┐         ┌──────────────────┐
│  Your browser            │ ──────► │  CORS proxy        │ ──────► │  RSS publisher   │
│  index.html              │         │  allorigins.win    │         │  BBC, NYT, etc.  │
│  - fetches feeds         │ ◄────── │  (or fallbacks)    │ ◄────── │                  │
│  - parses XML            │         └────────────────────┘         └──────────────────┘
│  - filters, dedupes      │
│  - renders UI            │
└──────────────────────────┘
```

The proxy exists because browsers enforce a security rule (CORS) that prevents JavaScript from reading content from a different domain. Most RSS feeds don't set CORS-permissive headers, so the browser blocks the fetch. The proxy fetches the RSS on the browser's behalf and re-serves it with permissive CORS headers.

The page has three proxies hardcoded and tries each in order. If one fails or is rate-limited, it moves to the next.

## Why v2 replaced this

Three real-world problems showed up:

1. **Proxies are unreliable.** They get rate-limited, occasionally return empty responses, and sometimes block specific feed URLs (Mexico's feeds were repeatedly blocked).
2. **Antivirus software flags open CORS proxies.** Bitdefender and similar tools block `allorigins.win` and other proxies, breaking the page.
3. **Trust in third parties.** The proxy operators can see every URL you fetch, modify content in transit, or disappear at any time. They are run by individuals as free side projects with no SLA.

## Features

- Five regional tabs (Global, US, Europe, Romania, Mexico).
- Sidebar with top story from each region.
- Verify-across-sources button: extracts keywords from any headline and searches your trusted-source pool for matching coverage, then labels the result as corroborated, uncorroborated, or unverified.
- Source filtering: only headlines from a curated list of reputable outlets get through.

## File

- `index.html` — the whole application (HTML + CSS + JavaScript in one file).

## How to use locally

Just open `index.html` in any modern browser. No build, no dependencies, no server. If proxies are working, news loads in 2–4 seconds.

## When v1 might still be the right choice

- You need news the instant you hit refresh (v2 is hourly).
- You can't or don't want to use GitHub Actions.
- You're willing to whitelist proxy domains in your antivirus.
