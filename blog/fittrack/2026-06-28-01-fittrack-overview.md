---
title: "FitTrack: A Personal Nutrition Tracker, Built on Free-Tier Infrastructure"
date: 2026-06-28
series: FitTrack Build Log #1
---

I track what I eat. Every tracker I've tried wants a subscription, a login
wall, or a dozen permissions I don't want to grant — so I'm building my
own. FitTrack is a single-user calorie and food log, and the constraint I
set for myself going in was: **everything runs on free-tier infrastructure,
and the frontend has zero npm dependencies.**

## The shape of it

The frontend is plain HTML/CSS/JS — no framework, no build step. It talks
to a handful of Vercel serverless functions, which in turn talk to
Supabase for auth and storage (Postgres, with row-level security so the
single account's data stays scoped to itself). Logging in is passwordless
— a magic link emailed to me, no password to forget.

There are three ways to log a meal:

- **Snap a photo.** An image-classification model (a Food-101 fine-tune)
  guesses the dish, and a local nutrition table fills in calories and
  macros for a typical portion. I review and adjust before saving.
- **Scan a barcode.** A packaged product's barcode gets looked up against
  Open Food Facts' free, open database.
- **Type it in manually.** Sometimes that's just faster.

Once a week, a scheduled job emails me a summary of the week's eating —
nothing fancier than a cron-triggered serverless function and a free email
API.

## Why this matters to me

None of this is novel engineering — it's a personal tool, deliberately
small. What I find interesting is treating "free tier only" as a real
design constraint rather than an afterthought: it forces decisions about
where AI inference actually needs to happen, what can be a static lookup
table instead of a model call, and when "good enough" beats "technically
correct."

That tension is exactly what the next two posts are about. The
photo-to-calories step currently leans on a small, fixed-category
classifier — it works, but it's limited. I'm now planning to train my own
vision-language model on real nutrition data to replace it, and separately
building a feature to read packaged-food labels and flag ingredients worth
a second look. Neither exists yet. Both start as plans, written up as
specs before a line of training code runs — which is the point of this
series: showing the project as it actually evolves, not just the parts
that already work.
