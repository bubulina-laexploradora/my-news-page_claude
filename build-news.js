// Fetches all RSS feeds, applies filters, writes news.json.
// Runs on GitHub Actions hourly — no browser, no proxy, no CORS.

import Parser from 'rss-parser';
import { writeFileSync } from 'fs';

const parser = new Parser({
  headers: {
    'User-Agent': 'Mozilla/5.0 (compatible; PersonalNewsBot/1.0)',
    'Accept': 'application/rss+xml, application/xml, text/xml, */*'
  },
  timeout: 15000,
});

const REGIONS = {
  "🌍 Global": [
    "https://news.google.com/rss/headlines/section/topic/WORLD?hl=en-US&gl=US&ceid=US:en",
    "https://feeds.bbci.co.uk/news/world/rss.xml",
    "https://www.theguardian.com/world/rss",
    "https://www.aljazeera.com/xml/rss/all.xml"
  ],
  "🇺🇸 United States": [
    "https://news.google.com/rss/search?q=when:1d+(site:cnn.com+OR+site:nytimes.com+OR+site:economist.com+OR+site:cbsnews.com+OR+site:cbc.ca+OR+site:forbes.com)&hl=en-US&gl=US&ceid=US:en"
  ],
  "🇪🇺 Europe": [
    "https://news.google.com/rss?hl=en-GB&gl=GB&ceid=GB:en",
    "https://news.google.com/rss?hl=en&gl=DE&ceid=DE:en",
    "https://news.google.com/rss?hl=en&gl=FR&ceid=FR:en"
  ],
  "🇷🇴 Romania": [
    "https://news.google.com/rss?hl=ro&gl=RO&ceid=RO:ro"
  ],
  "🇲🇽 Mexico": [
    "https://aristeguinoticias.com/feed",
    "https://www.animalpolitico.com/feed",
    "https://www.eluniversal.com.mx/rss.xml",
    "https://www.elfinanciero.com.mx/rss/nacional/feed",
    "https://www.jornada.com.mx/rss/edicion.xml",
    "https://www.proceso.com.mx/feed"
  ]
};

const TRUSTED_SOURCES_BY_REGION = {
  "🇷🇴 Romania": [
    "g4media.ro", "hotnews.ro", "digi24.ro", "europalibera.org",
    "spotmedia.ro", "pressone.ro", "adevarul.ro", "stirileprotv.ro",
    "news.ro", "agerpres.ro", "mediafax.ro", "ziare.com"
  ],
  "🇺🇸 United States": [
    "cnn.com", "nytimes.com", "economist.com", "cbsnews.com",
    "cbc.ca", "forbes.com"
  ]
};

const SOURCE_NAME_HINTS = {
  "g4media.ro": ["g4media"],
  "hotnews.ro": ["hotnews"],
  "digi24.ro": ["digi24"],
  "europalibera.org": ["europa libera", "europa liberă", "radio free europe"],
  "spotmedia.ro": ["spotmedia"],
  "pressone.ro": ["pressone"],
  "adevarul.ro": ["adevarul", "adevărul"],
  "stirileprotv.ro": ["pro tv", "stirile pro"],
  "news.ro": ["news.ro"],
  "agerpres.ro": ["agerpres"],
  "mediafax.ro": ["mediafax"],
  "ziare.com": ["ziare.com"],
  "cnn.com": ["cnn"],
  "nytimes.com": ["new york times", "nyt"],
  "economist.com": ["economist"],
  "cbsnews.com": ["cbs news"],
  "cbc.ca": ["cbc"],
  "forbes.com": ["forbes"]
};

const NON_INTERNATIONAL_PATTERNS = [
  /\/us-news\//i, /\/us\//i, /\/usa\//i,
  /\/entertainment\//i, /\/celebrity\//i, /\/celebrities\//i, /\/lifestyle\//i,
  /\/sports?\//i, /\/sport\//i, /\/style\//i, /\/fashion\//i, /\/arts?\//i,
  /\/food\//i, /\/travel\//i, /\/health\//i, /\/wellness\//i,
  /\/opinion\//i, /\/opinions\//i, /\/editorial\//i
];

const NON_INTERNATIONAL_TITLE_KEYWORDS = [
  /\b(congress|senate|house republicans|house democrats|gop|capitol hill)\b/i,
  /\b(supreme court justice|scotus)\b/i,
  /\b(california|texas|florida|new york state|alabama|georgia|ohio|michigan|pennsylvania|illinois)\b/i,
  /\b(taylor swift|kardashian|matthew perry|kim kardashian|beyonc|drake|kanye)\b/i,
  /\b(grammy|oscar|emmy|met gala|super bowl|nba|nfl|mlb)\b/i,
  /\b(stock plunges|shares jump|stock soars|q[1-4] earnings)\b/i
];

const INTERNATIONAL_KEYWORDS = [
  /\b(ukraine|russia|china|israel|gaza|hamas|iran|syria|lebanon|yemen|sudan|ethiopia)\b/i,
  /\b(european union|eu summit|nato|un security council|united nations|g7|g20|brics)\b/i,
  /\b(putin|zelensky|netanyahu|xi jinping|macron|merz|starmer|sheinbaum|lula|modi|erdogan)\b/i,
  /\b(climate summit|cop\d+|world bank|imf|wto)\b/i
];

// --- Helpers ---

function stripHtml(html) {
  return (html || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
}

function truncate(text, len) {
  if (!text) return '';
  return text.length > len ? text.slice(0, len).trim() + '…' : text;
}

function splitSource(title) {
  const m = (title || '').match(/^(.+?)\s+-\s+([^-]+)$/);
  if (m) return { title: m[1].trim(), source: m[2].trim() };
  return { title: title || '', source: '' };
}

function domainFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function isInternational(item) {
  const title = (item.title || '').toLowerCase();
  const link = item.link || '';
  if (INTERNATIONAL_KEYWORDS.some(re => re.test(title))) return true;
  if (NON_INTERNATIONAL_PATTERNS.some(re => re.test(link))) return false;
  if (NON_INTERNATIONAL_TITLE_KEYWORDS.some(re => re.test(title))) return false;
  return true;
}

function matchesTrustedSource(item, trustedList) {
  const sourceUrlDomain = domainFromUrl(item.sourceUrl || '');
  if (sourceUrlDomain && trustedList.some(td => sourceUrlDomain === td || sourceUrlDomain.endsWith('.' + td))) return true;

  const linkDomain = domainFromUrl(item.link);
  if (linkDomain && trustedList.some(td => linkDomain === td || linkDomain.endsWith('.' + td))) return true;

  const sourceName = (item.source || '').toLowerCase();
  if (sourceName) {
    for (const td of trustedList) {
      const hints = SOURCE_NAME_HINTS[td] || [];
      if (hints.some(h => sourceName.includes(h))) return true;
    }
  }
  return false;
}

// --- Fetch + normalize a single feed ---

const FEED_TIMEOUT_MS = 20000; // hard limit per feed — overrides rss-parser's own timeout

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms))
  ]);
}

async function fetchFeed(url) {
  try {
    const feed = await withTimeout(parser.parseURL(url), FEED_TIMEOUT_MS, url);
    return (feed.items || []).map(item => {
      const rawTitle = stripHtml(item.title || '');
      const { title, source: titleSource } = splitSource(rawTitle);
      // For Google News items, the publisher info is in item.creator or feed.title; for direct feeds, feed.title is the publisher
      const sourceName = item.creator || titleSource || feed.title || '';
      const sourceUrl = feed.link || '';
      return {
        title,
        link: item.link || '',
        source: sourceName.trim(),
        sourceUrl,
        summary: truncate(stripHtml(item.contentSnippet || item.content || item.summary || ''), 180),
        pubDate: item.pubDate || item.isoDate || ''
      };
    }).filter(i => i.title);
  } catch (e) {
    console.warn(`  ✗ ${url.slice(0, 80)} — ${e.message}`);
    return [];
  }
}

// --- Build one region (merge, filter, dedupe, sort) ---

async function loadRegion(name, urls) {
  console.log(`\n${name}:`);
  const lists = await Promise.all(urls.map(async u => {
    const items = await fetchFeed(u);
    if (items.length > 0) {
      console.log(`  ✓ ${u.slice(0, 80)} → ${items.length} items`);
    }
    return items;
  }));
  let merged = lists.flat();

  if (name === "🌍 Global") {
    const before = merged.length;
    merged = merged.filter(isInternational);
    console.log(`  • International filter: ${merged.length} / ${before}`);
  }

  const trusted = TRUSTED_SOURCES_BY_REGION[name];
  if (trusted) {
    const filtered = merged.filter(i => matchesTrustedSource(i, trusted));
    console.log(`  • Trusted-source filter: ${filtered.length} / ${merged.length}`);
    if (filtered.length > 0) merged = filtered;
  }

  const seen = new Set();
  const unique = merged.filter(i => {
    const key = i.title.toLowerCase().slice(0, 60);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  unique.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
  console.log(`  → final: ${unique.length} items`);
  return unique;
}

// --- Main ---

async function main() {
  const output = { lastUpdated: new Date().toISOString(), regions: {} };
  for (const [name, urls] of Object.entries(REGIONS)) {
    const items = await loadRegion(name, urls);
    output.regions[name] = items.slice(0, 25);
  }
  writeFileSync('news.json', JSON.stringify(output, null, 2));
  console.log(`\n✓ news.json written (${Object.values(output.regions).reduce((a, b) => a + b.length, 0)} total items)`);
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.error(e);
    process.exit(1);
  });

// Safety net: if main() itself hangs (e.g. a feed library bug), force-quit after 3 minutes
setTimeout(() => {
  console.error('Script ran longer than 3 minutes — something is hanging. Exiting.');
  process.exit(1);
}, 3 * 60 * 1000).unref();
