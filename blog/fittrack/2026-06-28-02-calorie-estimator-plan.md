---
title: "Teaching a Small Vision-Language Model to Count Calories"
date: 2026-06-28
series: FitTrack Build Log #2
---

FitTrack's photo-logging feature currently works like this: an
image-classification model guesses which of 101 fixed Food-101 categories
your photo most resembles, and a static lookup table fills in the
calories. It works for pizza and sushi. It has nothing to say about
anything outside those 101 categories, and it has no idea how big your
portion actually is — that's still a number I type in by hand.

I want to fix both problems by training my own model. This post is the
plan, written before any training has happened.

## What the literature says

Before committing to an approach, I looked at how others have tackled
image-to-calorie estimation. The standard academic answer is a CNN
regression head on top of a pretrained vision backbone (ResNet,
EfficientNet) — predict a number directly from pixels. It works, but 2D
photos don't carry volume information, so accuracy is capped regardless of
the backbone.

More recent work — papers like *CalorieLLaVA* and *CaLoRAify* — fine-tune
vision-language models instead, and report beating both the CNN baselines
*and* zero-shot GPT-4V/4o. The reason given is intuitive once you see it:
a VLM can reason about what ingredients are on the plate and look up
nutrition data for them, rather than just regressing a single number from
raw pixels. Language-based reasoning turns out to be a real advantage
here, not just a nicer interface.

## The plan

- **Data:** [Nutrition5k](https://github.com/google-research-datasets/Nutrition5k),
  Google Research's dataset of ~5,000 real cafeteria dishes with
  ground-truth calories and macros computed from the USDA nutrient
  database. Free, CC-licensed, exactly the kind of grounded supervision a
  fixed classifier-plus-lookup-table approach doesn't have.
- **Base model:** `Qwen2-VL-2B-Instruct` — small enough to fine-tune with
  LoRA on a single free-tier GPU, rather than needing a cluster.
- **Method:** QLoRA (4-bit quantized base + LoRA adapters), a few epochs
  over the ~5k examples. This is a small fine-tune, not a from-scratch
  training run — the expectation is days, not weeks.
- **Evaluation:** mean absolute error on held-out dishes, benchmarked
  directly against the current Food-101-plus-lookup-table baseline. If it
  doesn't beat the thing it's replacing, it doesn't ship.
- **Hosting:** a free Hugging Face Space on ZeroGPU, sized to one person's
  daily meal-logging volume.

## Where it stands

The spec is written, and so is the end-to-end notebook — data download,
preprocessing, training loop, evaluation. Nothing has been trained yet.
Next post in this thread will be the actual numbers: does a fine-tuned 2B
VLM really beat a 101-category classifier on real food photos, and by how
much.
