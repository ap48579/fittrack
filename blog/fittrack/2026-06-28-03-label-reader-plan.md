---
title: "Reading Nutrition Labels So You Don't Have To"
date: 2026-06-28
series: FitTrack Build Log #3
---

Not everything I eat is a plate of food I can photograph and classify.
A lot of it comes wrapped in packaging, with a tiny-print ingredients list
I never actually read. I want to point my phone at that label and get back
two things: an estimated calorie count, and a flag on any ingredients
worth knowing about — high-fructose corn syrup, trans fats, artificial
dyes, that kind of thing.

This is a different problem from the photo-to-calories case in the
previous post: it needs to *read text*, not classify a dish. Here's the
plan, again written before any training has happened.

## Why I'm not training an OCR model

My first instinct was: train an OCR model on photos of nutrition labels.
I talked myself out of it. Raw pixel-to-character OCR needs an enormous
amount of labeled text-line data to do well, and that data doesn't exist
for nutrition labels specifically — building it from scratch isn't a
reasonable scope for a side project. Meanwhile, general-purpose open OCR
models are already quite good at raw text recognition out of the box.

The actual gap isn't reading the text. It's doing something useful with
text that's noisy, dense, and full of chemical-sounding ingredient names.
That's a much more tractable thing to fine-tune.

## The plan: two stages, one trained

1. **OCR (untrained):** an existing open model, `GLM-OCR`, reads the raw
   text off the label photo as-is.
2. **Structuring + reasoning (fine-tuned):** a small instruction-tuned LLM
   (`Qwen2.5-3B-Instruct`) takes that raw, possibly messy text and outputs
   a clean ingredients list, flagged unhealthy ingredients with short
   reasons, and a parsed calorie value.

Only the second stage gets trained. The training data comes from
[Open Food Facts](https://world.openfoodfacts.org)' public database — millions
of products, each with both a cleaned ingredients list and structured
fields (additive tags, Nutri-Score, NOVA processing group) I can use to
*generate* unhealthy-ingredient labels with rules, rather than hand-labeling
thousands of products myself.

One honest gap in this plan: Open Food Facts doesn't expose the *raw,
noisy* OCR text paired with the clean version in its bulk export — that
pairing lives per-image on their servers, not in the dataset I'm pulling
from. As a first pass, I'm synthesizing OCR noise on the clean text
instead (character swaps, dropped spaces, the usual OCR error patterns)
rather than collecting real noisy/clean pairs at this stage. It's a
deliberate simplification, not a final answer — if the model struggles on
real photographed labels later, this is the first thing I'll revisit.

## Where it stands

Spec and pipeline notebook are both written. No training run yet. The
next post in this thread will say whether the synthetic-noise shortcut
held up against real label photos, or whether it's time to go collect real
OCR pairs the harder way.
