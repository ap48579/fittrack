# The Agentic Research Engine

**FinTrack — Article 002 · June 30, 2026**

---

The most interesting part of FinTrack isn't the price charts or the fundamentals — those are table stakes for any stock research tool. What I'm actually building toward is a research agent that can take a question like *"what is driving sentiment around AI chip export controls?"* and produce a structured, cited, multi-source answer — with minimal latency and zero upfront data cost.

This article covers how the current pipeline works, how it streams progress to the UI, and where it's going next.

---

## Two Research Modes

The research pillar operates at two different cost points:

**Passive candidate scan (daily, keyless).** A lightweight Celery task runs every morning, pulling from GDELT's DOC 2.0 API — a global news index with pre-tagged themes, tone scores, and volume metrics. The task looks for unusual spikes in news volume or sentiment tone for watchlisted tickers. No LLM involved. Output is a candidate list: ticker or theme, reason flagged, and a heuristic confidence score. The cost is zero and the latency is a background job.

**On-demand deep research (user-triggered, agentic).** The user points the agent at a ticker or a free-text theme. The agent runs a multi-step research loop, assembles a structured context from multiple sources, calls an LLM to synthesize, and persists the report. This is where the interesting engineering lives.

---

## The Deep Research Pipeline

When a research request comes in, the pipeline assembles a `ResearchContext` before the LLM is ever called. The context is built from real, keyless sources:

1. **GDELT** — recent news articles related to the subject, with tone scores and source metadata
2. **Reddit** — posts from relevant finance subreddits (r/investing, r/stocks, sector-specific communities), fetched on-demand
3. **SEC EDGAR** — for ticker queries, the latest 10-K/10-Q filing summary and any recent 8-K disclosures
4. **Market snapshot** — for ticker queries, the current price, volume, recent capex trend from fundamentals, and any whale (institutional) activity

For ticker queries, the market snapshot is assembled *before* the LLM call so the model can reason about live conditions. For theme queries, exposed tickers are only known after the LLM synthesizes — so the snapshot is appended post-hoc to the report.

The assembled context is passed to a `ResearchAgentClient` — an abstract interface with two implementations:

- **Mock implementation** (current default): builds a deterministic, realistic report from the real GDELT/EDGAR data that was passed in. The sources listed in the output are actual articles from the context, not fabricated placeholders. Activated with `RESEARCH_AGENT_IMPL=mock`.
- **Anthropic implementation** (ready, unused): wraps the Claude Messages API with web search and tool use. Activated with `RESEARCH_AGENT_IMPL=anthropic`.

The swap is one environment variable. No call-site changes, no refactoring.

---

## Streaming Progress to the Frontend

Research runs can take 10–30 seconds when real LLM calls are involved. A loading spinner for that long is a bad experience — users don't know if something is happening or if the request is stuck.

The solution is server-sent events (SSE). The backend exposes a `POST /research/stream` endpoint that yields a `StreamingResponse` with `media_type="text/event-stream"`. As each step completes — GDELT fetch, Reddit fetch, EDGAR pull, LLM synthesis — the endpoint yields a progress event:

```
data: {"step": "Fetching GDELT news articles..."}
data: {"step": "Pulling Reddit sentiment..."}
data: {"step": "Reading SEC filings..."}
data: {"step": "Synthesizing report..."}
data: {"done": true, "report": {...}}
```

The frontend consumes this with a `ReadableStream` reader loop (not the native `EventSource` API, which doesn't support POST bodies). As each step event arrives, the UI renders it with a pulsing dot on the active step and a checkmark on completed steps — so the user sees the research happening in real time.

```
● Fetching GDELT news articles...    ← pulsing, active
✓ GDELT fetch complete
✓ Reddit sentiment pulled
✓ SEC filing assembled
● Synthesizing with LLM...           ← next step begins
```

The final event carries the full report object, and the frontend navigates to the persisted report page.

---

## What the Report Contains

Each research report is structured, not a wall of text:

- **Summary** — 2–3 sentence synthesis of the key finding
- **Sentiment direction** — bullish / bearish / neutral / mixed, as a machine-readable field
- **Full report** — detailed markdown synthesis with inline citations
- **Ticker links** — for theme queries, which tickers are exposed and whether the exposure is positive, negative, or neutral (with a confidence score)
- **Sources** — the actual articles, filings, and posts that informed the synthesis, each typed by source (news / reddit / edgar / web)

Reports are persisted to PostgreSQL and browsable as a historical feed, so you can see how the picture around a ticker or theme has changed over multiple research runs.

---

## The Cortex Extension

The current research agent is a single-pass synthesizer: assemble context, call LLM, write report. That's enough for the MVP, but it's not what I want the agent to eventually be.

I'm building a separate project called **Cortex** — a planning and reasoning layer for agentic systems. The intent is to plug Cortex into FinTrack's research pipeline to replace the single-pass synthesis with a multi-step reasoning loop:

1. **Decompose** the research question into sub-questions (e.g., *"what is the regulatory situation?"*, *"how do competitors compare?"*, *"what do institutional holders think?"*)
2. **Plan** a search and fetch strategy for each sub-question
3. **Execute** the sub-queries in parallel where possible
4. **Reason** over the assembled evidence, identifying contradictions and gaps
5. **Synthesize** a final report that reflects the multi-step reasoning chain, not just a single LLM pass over raw context

This turns the research agent from a retrieval-augmented generation (RAG) tool into something closer to a domain-specific research analyst — one that can decide what to look for, not just process what it's given.

The integration point is already designed: the `ResearchAgentClient` interface accepts a fully assembled context and returns a structured result. Cortex will slot in as a new implementation of that interface. From FinTrack's perspective, the swap is still one environment variable.

More on Cortex in its own build log. For now, the foundation is in place and the seam is clean.

---

## What's Next on the Research Pillar

Before Cortex integration, a few near-term improvements:

- **Real Anthropic client activation** — the implementation is written; it just needs an API key and a decision about which model to use for synthesis vs. sub-tasks
- **Research history comparison** — side-by-side view of two reports on the same subject from different dates, highlighting sentiment shifts
- **Cross-pillar research triggers** — automatically triggering a research run when a whale alert fires (e.g., Bridgewater opens a new position in a stock you're watching)

The passive-active divide between the daily scan and on-demand research will stay. LLM calls on a schedule are expensive and mostly unnecessary — the value is in having the agent available when a human decides something is worth investigating, not in having it run continuously and produce noise.
