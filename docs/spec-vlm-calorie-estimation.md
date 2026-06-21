# Spec: Fine-tuned VLM for Image → Calorie Estimation

## 1. Goal

Replace (or augment) the current `prithivMLmods/Food-101-93M` classifier + static
lookup-table approach in [api/analyze-food.js](../api/analyze-food.js) with a
fine-tuned vision-language model that estimates calories and macros directly
from a meal photo, without being limited to 101 fixed dish categories.

## 2. Current baseline (for comparison)

- Model: `prithivMLmods/Food-101-93M`, image classification over 101 Food-101
  categories.
- Nutrition: static per-100g lookup in `lib/food101-nutrition.json`, keyed by
  predicted label.
- Known limitations: fixed category set, no portion-size estimation from the
  image itself (user edits grams manually), no multi-item detection on a
  single plate.

## 3. Data

**Source:** [Nutrition5k](https://github.com/google-research-datasets/Nutrition5k)
(Google Research), CC BY 4.0.

- ~5,000 real cafeteria dishes, captured as RGB-D (3.5k images + 20k short
  videos), 250+ food categories.
- Per-dish ground truth: ingredient list with grams, total mass, calories,
  protein, carbs, fat (derived from the USDA Food and Nutrient Database).

**Acquisition**

1. `gsutil -m cp -r gs://nutrition5k_dataset/nutrition5k_dataset ./data/nutrition5k`
   (per the dataset repo's instructions), or pull the `.tar.gz` release.
2. Use only the top-down RGB image per dish for v1 (depth/video unused
   initially — adds complexity with limited payoff for a 2D-photo product).

**Transform into training format**

For each dish, build one instruction-tuning example:

```json
{
  "image": "dish_1556572657/rgb.png",
  "conversations": [
    { "from": "user", "value": "<image>\nEstimate the calories and macronutrients in this meal." },
    { "from": "assistant", "value": "About 480 kcal — 22g protein, 41g carbs, 24g fat. Likely ingredients: grilled chicken, rice, broccoli." }
  ]
}
```

Save as JSONL (LLaVA-style conversation format).

**Split:** use Nutrition5k's official dish-ID train/test split (avoids the
same physical dish appearing in both train and test from multiple camera
angles/sessions).

## 4. Model & training method

- **Base model:** `Qwen2-VL-2B-Instruct` (open weights, multimodal,
  small enough to LoRA-fine-tune on a single GPU). Revisit a 7B variant only
  if 2B accuracy is insufficient after evaluation.
- **Method:** QLoRA — 4-bit-quantized base weights + LoRA adapters, via
  `peft` + `trl` (`SFTTrainer`).
- **Starting hyperparameters:** LoRA rank 16–64, batch size 1–4 with gradient
  accumulation, 3–5 epochs over ~5k examples, learning rate ~1e-4 to 2e-4
  (standard LoRA SFT defaults; tune from there based on val loss).
- **Compute:** Google Colab (free T4 to start; move to Colab Pro / A100 if
  the base model OOMs at 4-bit).

## 5. Training schedule (rough)

| Phase | Effort |
|---|---|
| Download + JSONL conversion script | ~1 day |
| First LoRA training run + debug | ~1 day |
| Full training run (3–5 epochs) | hours, same-day on a single GPU |
| Evaluation + iteration | 1–2 days |

This is a small-scale fine-tune (~5k examples), not a from-scratch training
job — total elapsed time is days, not weeks, assuming no major data-pipeline
surprises.

## 6. Evaluation

- **Metric:** MAE and MAPE on predicted calories vs. ground truth, on the
  held-out test split (by dish ID).
- **Baseline comparison:** run the same test images through the current
  Food-101 + lookup-table pipeline where possible, to confirm the fine-tuned
  VLM is actually an improvement before replacing the production path.
- **Success criterion:** lower MAPE than the baseline on held-out dishes,
  and qualitatively sane behavior on dish types outside Food-101's 101
  categories.

## 7. Hosting & deployment

- **Primary (free):** Hugging Face **Spaces with ZeroGPU**. Wrap the
  fine-tuned model in a small Gradio or FastAPI Space; ZeroGPU's free quota
  (~3.5 GPU-minutes/day) should cover a single personal user's meal-logging
  volume.
- **Fallback (low-cost):** Hugging Face **Inference Endpoint**, smallest GPU
  tier, autoscale-to-zero — only bills for active compute seconds. Move here
  only if ZeroGPU proves too flaky/queued for daily use.

## 8. Integration with FitTrack

- Replace the model-call portion of `classifyImage()` in
  [api/analyze-food.js](../api/analyze-food.js): same request shape from the
  frontend (`imageBase64`, `mimeType`), but the endpoint now calls the
  Space/Endpoint URL instead of `api-inference.huggingface.co`.
- Response shape can stay close to today's `{ predictions: [...] }` contract,
  with `per100` replaced by a direct `calories`/`protein_g`/`carbs_g`/`fat_g`
  estimate for the photographed portion (no separate lookup-table join
  needed, since the model estimates the full plate directly).
- `js/food.js` UI flow (pick a prediction → review/edit amounts → save)
  should not need structural changes, only field-mapping updates.

## 9. Open questions / risks

- Nutrition5k is cafeteria-tray food (American/Western dishes) — may
  generalize poorly to home-cooked or non-Western meals; worth spot-checking
  after training.
- Portion-size accuracy from a single RGB photo (no depth) is inherently
  approximate; manual gram override in the UI should remain.
- ZeroGPU cold-start latency on the first call of the day is unverified for
  this specific model size — confirm during hosting setup before relying on
  it.
