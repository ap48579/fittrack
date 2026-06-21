# Spec: Label Reader (OCR + Unhealthy-Ingredient & Calorie Analysis)

## 1. Goal

New feature: photograph a packaged food's nutrition/ingredients label and get
back (a) flagged unhealthy ingredients and (b) an estimated calorie value,
parsed from the label itself rather than guessed from a dish photo.

## 2. Why not train an OCR model from scratch

Training a raw OCR engine (pixel → characters) needs far more labeled
text-line data than exists for nutrition labels specifically — not a
tractable training target for this project. Existing open OCR models are
already strong at raw character recognition; the actual gap is turning noisy
raw OCR text into something a calorie tracker can use. That structuring +
reasoning step is what's worth fine-tuning, and it's tractable on a much
smaller custom dataset.

## 3. Architecture (two stages)

1. **OCR (no training needed):** run an existing open OCR model on the label
   photo as-is to get raw text.
   - Model: `zai-org/GLM-OCR` (0.9B params, MIT license, strong out-of-box
     on documents/tables — 94.62 on OmniDocBench v1.5).
   - Not available on Hugging Face's free Inference Providers today — must
     be self-hosted (see Hosting, below).
2. **Structuring + health reasoning (fine-tuned):** a small instruct LLM
   takes the raw OCR text and outputs a cleaned ingredients list, flagged
   unhealthy ingredients, and a parsed calorie value.

## 4. Data (for stage 2 fine-tuning)

**Source:** [Open Food Facts](https://world.openfoodfacts.org) bulk export
(free, millions of products, includes raw OCR text and human-cleaned fields).

**Supervision pairs**

- Input: OFF's raw/noisy OCR'd ingredient text for a product.
- Target: OFF's already-cleaned `ingredients_text` field, plus calorie value
  from `nutriments.energy-kcal_100g` (or `_serving`).
- No manual transcription needed — this pairing is free, already at scale.

**Unhealthy-ingredient labels (generated, not hand-labeled)**

Derive target health flags programmatically from fields OFF already
provides per product:

- `additives_tags` (e.g. flag specific additive codes of concern)
- `nutriscore_grade`
- `nova_group` (ultra-processed food indicator)
- Simple rule-based keyword list for things like high-fructose corn syrup,
  partially hydrogenated oils / trans fats, artificial sweeteners, excess
  sodium or added sugar per serving.

This turns "labeling" into a scripted ETL job against OFF's data export,
not manual annotation work.

**Split:** random product-level train/val/test split (e.g. 80/10/10),
de-duplicated by product ID.

## 5. Model & training method

- **Base model:** `Llama-3.2-3B-Instruct` or `Qwen2.5-3B-Instruct` (small,
  open, instruction-tuned starting point).
- **Method:** LoRA fine-tuning via `peft`/`trl`, text-only (cheaper and
  faster per-example than the VLM track).
- **Training input/output shape:**

```json
{
  "instruction": "Given this OCR'd label text, list the ingredients, flag any unhealthy ones with a short reason, and state the calories per serving.",
  "input": "<raw noisy OCR text>",
  "output": "{\"ingredients\": [...], \"flags\": [{\"ingredient\": \"high fructose corn syrup\", \"reason\": \"added sugar linked to metabolic issues\"}], \"calories_per_serving\": 210}"
}
```

## 6. Training schedule (rough)

| Phase | Effort |
|---|---|
| OFF bulk export download + ETL script (pairs + rule-based flags) | ~1–2 days |
| First LoRA training run + debug | ~1 day |
| Full training run over a 10k–20k sample subset | well under a day on one GPU (text-only, smaller/faster than the VLM track) |
| Evaluation + iteration | 1–2 days |

## 7. Evaluation

- **OCR cleanup quality:** held-out OFF products — compare model output
  ingredients list against OFF's cleaned `ingredients_text` (exact/fuzzy
  match rate).
- **Health-flag accuracy:** compare flagged ingredients against the
  rule-based ground truth used to generate training labels.
- **Calorie parsing accuracy:** compare parsed calorie value against OFF's
  labeled nutrient field.
- **Success criterion:** model output should be usably close to the
  rule-based ground truth on held-out products, and should degrade
  gracefully (not hallucinate ingredients) on real photographed labels with
  OCR noise.

## 8. Hosting & deployment

Both GLM-OCR (stage 1) and the fine-tuned LLM (stage 2) need self-hosting,
since neither is on Hugging Face's free Inference Providers list today.

- **Primary (free):** Hugging Face **Spaces with ZeroGPU**, one Space
  running both stages as a pipeline (OCR → structuring/health LLM),
  exposed as a single HTTP endpoint. ZeroGPU's ~3.5 GPU-minutes/day free
  quota should cover personal, low-volume label scans.
- **Fallback (low-cost):** Hugging Face **Inference Endpoint**, smallest
  GPU tier, autoscale-to-zero, if ZeroGPU proves unreliable for two
  sequential model calls per request.

## 9. Integration with FitTrack

- New serverless function, e.g. `api/analyze-label.js`, mirroring the auth
  + request pattern already used in
  [api/analyze-food.js](../api/analyze-food.js): verify the Supabase session,
  accept `imageBase64`/`mimeType`, call the hosted Space/Endpoint, return
  structured JSON.
- New UI flow in `food.html`/`js/food.js` (or a new page) for "scan a label"
  alongside the existing photo/barcode/manual entry options: photo capture →
  call `/api/analyze-label` → show ingredients + flagged items + calorie
  estimate → user reviews/edits → save to `food_logs`, same as the other
  entry paths.

## 10. Open questions / risks

- Two sequential model calls (OCR then LLM) per request doubles ZeroGPU
  time/latency versus the single-model VLM track — confirm this fits the
  daily free quota during hosting setup.
- Glare, curved packaging, and small print on real-world label photos will
  stress the OCR stage in ways OFF's own (likely cleaner/flatter) source
  images may not fully represent — worth testing on real phone photos early.
- "Unhealthy ingredient" rules are a simplification of real nutrition
  science; flag wording should read as informational, not medical advice.
