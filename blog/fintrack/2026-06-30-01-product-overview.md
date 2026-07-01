# What I'm Building and Why

**FinTrack — Article 001 · June 30, 2026**

---

Retail investors have access to prices. Institutions have access to *context*. The gap between those two things is where most investment mistakes live — not in missing a number, but in missing what the number means, who else knows it, and what they're doing about it.

FinTrack is my attempt to close that gap for personal use. The ambition: build a self-hosted stock research platform that mirrors, in miniature, what a proprietary trading desk would use — without the proprietary data costs.

---

## What It Does

The platform is organized around four pillars, each pulling from a different layer of publicly available information:

**Pillar 1 — Price & Trends.** 15-minute delayed quotes, OHLCV candlestick charts with 50/200-day moving averages, and a personal watchlist. Data comes from `yfinance` (Yahoo Finance's unofficial wrapper), which is free and requires no API key. Not real-time, but sufficient for research purposes.

**Pillar 2 — SEC Fundamentals.** Revenue, net income, total debt, and margins over the last eight quarters, pulled directly from SEC EDGAR's XBRL company-facts API. Includes the full filing history (10-K, 10-Q) with links to the original documents. Refreshed automatically when new filings are detected — no polling costs, since the EDGAR submissions feed makes it easy to detect changes.

**Pillar 3 — Blue Whale Holdings.** Institutional 13F filings, parsed and diffed quarter-over-quarter. You can see which institutions hold a given stock, how their position has changed, and browse an institution's full portfolio with a holdings pie chart. The platform lets you search for and add any institution by name — it uses EDGAR's full-text search index to resolve the name to a CIK without needing to know the identifier in advance. One important caveat that the UI makes explicit: 13F data has up to a 45-day filing lag. This is regulatory, not a platform limitation.

**Pillar 4 — Research.** The most novel pillar and the one with the most room to grow. Described in detail in [Article 002](./2026-06-30-02-agentic-research-engine.md).

---

## Stack

The goal was a $0/month MVP that runs on free-tier infrastructure. The constraint is real — it forces good decisions about what actually needs to be dynamic and what can be a scheduled batch job.

| Layer | Choice | Why |
|---|---|---|
| Frontend | Next.js (App Router) + Tailwind CSS | App Router's streaming model pairs well with server-sent events from the research pipeline |
| Backend API | FastAPI (Python 3.12) | Strong data/science ecosystem; async-first |
| Database | PostgreSQL | Relational structure maps cleanly onto filings, holdings, and diffs |
| Background jobs | Celery + Redis | Scheduled ingestion (price every 15 min, EDGAR daily, 13F weekly) |
| Data sources | Yahoo Finance, SEC EDGAR, GDELT | All free, all official or widely-used |

Two separate database engine configurations co-exist by design: an async engine (`asyncpg`) for FastAPI routes, and a sync engine (`psycopg`, `NullPool`) for Celery workers. This avoids the class of bugs that come from running async database connections inside synchronous Celery task contexts — a non-obvious split that matters at the infrastructure level even when the two layers share the same SQLAlchemy models.

---

## Design Philosophy

A few principles drove the decisions:

**Thin slices over deep dives.** All four pillars shipped in their simplest useful form before any went deep. A working end-to-end system across four thin pillars is more useful — and more debuggable — than one polished pillar and three blank pages.

**Keyless where possible.** SEC EDGAR is entirely free and official. `yfinance` requires no key. GDELT requires no key. The only usage-based cost in the entire stack is the LLM API call during deep research — and even that is near-zero at personal-use volume.

**Swap seams, not rewrites.** The research pipeline's LLM client and Reddit client are both defined as abstract interfaces with swappable implementations. The mock implementations (which ship in the MVP) return realistic canned data built from real GDELT articles — so the full pipeline works end-to-end without any API keys. Switching to a real LLM or a real Reddit client means adding one implementation file and changing one environment variable. No call-site changes.

---

## Current State

As of this writing, the MVP is complete and running locally. The GitHub repository is at [ap48579/fintrack](https://github.com/ap48579/fintrack).

What works: live price charts, SEC fundamentals trend charts, institutional holdings with QoQ diffs, passive research candidate scanning via GDELT, on-demand deep research with streaming progress, alert rules, PWA install, and web push notifications.

What comes next: the research agent is where the most interesting work will happen. [Article 002](./2026-06-30-02-agentic-research-engine.md) goes into how it works and where it's going.
