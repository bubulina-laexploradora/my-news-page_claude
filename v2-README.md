# My News Page — v2 (GitHub Actions build)

A personalized news dashboard. RSS feeds are fetched server-side by a scheduled GitHub Actions job, which writes a single `news.json` file to the repo. The browser just loads that file — no proxy, no CORS, no third-party services.

## What this version does

1. Every hour, GitHub Actions runs `build-news.js` on a Linux runner.
2. The script fetches every RSS feed directly (server-side has no CORS restriction), parses them, applies filters (international-only for Global, trusted-source whitelist for US and Romania), deduplicates, and writes a single `news.json` file.
3. The workflow commits `news.json` back to the repository.
4. GitHub Pages auto-deploys the new `news.json`.
5. When you open `index.html`, it fetches `news.json` from the same origin and renders it. Total page load is a single HTTP request to a small JSON file on GitHub's CDN.

The refresh button in the UI just re-fetches `news.json`. News is as fresh as the most recent scheduled build (hourly by default; configurable in the workflow file).

## Regions and sources

- **🌍 Global** — Google News WORLD topic + BBC World + Guardian World + Al Jazeera, filtered to international stories.
- **🇺🇸 United States** — Google News filtered to CNN, NYT, The Economist, CBS News, CBC News, Forbes.
- **🇪🇺 Europe** — Google News UK + Germany + France editions, English.
- **🇷🇴 Romania** — Google News Romania, filtered to G4Media, HotNews, Digi24, Europa Liberă, Spotmedia, PressOne, Adevărul, Pro TV, Agerpres, Mediafax, Ziare.
- **🇲🇽 Mexico** — Direct publisher RSS: Aristegui Noticias, Animal Político, El Universal, El Financiero, La Jornada, Proceso.

## Architecture

```
┌──────────────────────────────────┐
│  GitHub Actions runner (hourly)  │
│  build-news.js                   │
│  - fetches all RSS feeds         │
│  - parses XML, applies filters   │
│  - writes news.json              │
│  - commits to repo               │
└────────────────┬─────────────────┘
                 │ commit
                 ▼
       ┌────────────────────┐
       │  GitHub repo       │
       │  - news.json       │ ◄─────┐
       │  - index.html      │       │
       └─────────┬──────────┘       │
                 │ deploy            │
                 ▼                  │
       ┌────────────────────┐       │
       │  GitHub Pages CDN  │       │
       └─────────┬──────────┘       │
                 │                  │
                 ▼                  │
       ┌────────────────────┐       │
       │  Your browser      │ ──────┘
       │  - fetches         │
       │    news.json       │
       │  - renders UI      │
       └────────────────────┘
```

No proxies. No third-party services. Everything in the data pipeline is either your own code or a GitHub-owned service.

## Files

- **`index.html`** — the UI. Loads `news.json` on page open, renders headlines and sidebar.
- **`build-news.js`** — Node script that does the actual feed fetching, filtering, and JSON writing. Runs only on GitHub Actions; never in your browser.
- **`package.json`** — declares the one runtime dependency: `rss-parser`.
- **`.github/workflows/build-news.yml`** — the scheduled job. Runs hourly (`cron: '0 * * * *'`), on every push to relevant files, and on manual trigger via the Actions tab.
- **`news.json`** — the generated output. Looks like:
  ```json
  {
    "lastUpdated": "2026-06-02T08:00:00.000Z",
    "regions": {
      "🌍 Global": [ { "title": "...", "link": "...", "source": "...", "summary": "...", "pubDate": "..." }, ... ],
      "🇺🇸 United States": [ ... ],
      ...
    }
  }
  ```

## Why v2 over v1

| Concern                          | v1 (proxy)                                  | v2 (build)                                |
|----------------------------------|---------------------------------------------|-------------------------------------------|
| Third-party services in path     | 3 CORS proxies + Google                     | GitHub only                               |
| Antivirus false positives        | Frequent (proxies look like open relays)    | None                                      |
| Reliability                      | Depends on proxy uptime + rate limits       | Depends on GitHub uptime (very high)      |
| Freshness                        | Live on every refresh                       | Hourly (configurable)                     |
| Page load                        | Multiple HTTP calls + XML parsing in browser | One HTTP call, ~50KB JSON                 |
| Code complexity in browser       | ~500 lines (proxy fallback, XML parser)     | ~200 lines (just renders JSON)            |
| Privacy                          | Proxy operators see your reading habits     | No one sees what you read                 |
| Setup difficulty                 | Just open the file                          | Requires GitHub Pages + Actions setup     |

## Customizing

- **Refresh frequency.** Edit the `cron` line in `.github/workflows/build-news.yml`. `'0 * * * *'` = every hour. `'*/15 * * * *'` = every 15 minutes. (Note: GitHub may queue scheduled jobs during high-load periods.)
- **Adding a region.** Edit `REGIONS` and (optionally) `TRUSTED_SOURCES_BY_REGION` and `REGION_LABELS` in `build-news.js`, then also add it to `REGION_LABELS` in `index.html`.
- **Changing sources.** Edit the URL list under that region in `build-news.js`. For Google News with source-filtering, use a `news.google.com/rss/search?q=site:domain1+OR+site:domain2&...` URL. For direct publisher RSS, just paste their feed URL.
- **Manual trigger.** Go to the repo on GitHub → Actions tab → "Build news" → "Run workflow" button. Useful when you change the script and want to rebuild immediately.

## Failure modes and recovery

- **A feed starts returning empty results.** The script logs which feeds returned how many items. Check the latest workflow run logs in the Actions tab. Either the feed URL changed (update it in `build-news.js`) or the publisher started rate-limiting (try adding a different user-agent header or use Google News with a `site:` filter instead).
- **The workflow fails entirely.** The `news.json` from the previous successful build stays in place; the page keeps working with slightly older news. No data loss.
- **GitHub Pages doesn't update.** Pages sometimes lags by a minute or two after a commit. Hard refresh (Ctrl+Shift+R) usually fixes apparent staleness.

## Local development

To test changes to `build-news.js` without pushing:

```bash
npm install
node build-news.js
```

This writes `news.json` locally. Then open `index.html` in a browser (you may need to serve via a local web server because `fetch('news.json')` against a `file://` URL is blocked by browsers; `npx http-server` does the trick).

## Change history

- **v2.1** — Removed the cross-source verification feature. The keyword-overlap algorithm couldn't match across languages (Romanian/Spanish vs English) or detect wire-service syndication, and the labels could mislead more than they helped.
- **v2.0** — Initial GitHub Actions build pipeline, replacing v1's browser-side proxy fetches.
