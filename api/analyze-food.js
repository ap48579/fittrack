// Identifies a food photo using a trained Hugging Face image-classification
// model (Food-101 fine-tune) -- not a multimodal LLM -- then looks up
// calories/macros from a local per-100g nutrition table. The image is never
// written to disk or to Supabase storage: it lives only in this function's
// memory for the duration of the request.
const { verifySupabaseUser } = require('../lib/verify-auth');
const nutritionTable = require('../lib/food101-nutrition.json');

function normalizeLabel(label) {
  return String(label).trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function lookupNutrition(label) {
  const key = normalizeLabel(label);
  return nutritionTable[key] || nutritionTable._fallback;
}

async function classifyImage(buffer, mimeType) {
  const modelId = process.env.HF_FOOD_MODEL_ID || 'prithivMLmods/Food-101-93M';
  const url = `https://api-inference.huggingface.co/models/${modelId}`;
  const headers = {
    Authorization: `Bearer ${process.env.HF_TOKEN}`,
    'Content-Type': mimeType || 'image/jpeg'
  };

  let resp = await fetch(url, { method: 'POST', headers, body: buffer });

  // Hugging Face's free serverless inference cold-starts models that haven't
  // been called recently. Wait the suggested time and retry once.
  if (resp.status === 503) {
    const info = await resp.json().catch(() => ({}));
    const waitMs = Math.min(Math.ceil(info.estimated_time || 5) * 1000, 8000);
    await new Promise((r) => setTimeout(r, waitMs));
    resp = await fetch(url, { method: 'POST', headers, body: buffer });
  }

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Classifier request failed (${resp.status}): ${errText}`);
  }

  const data = await resp.json();
  if (!Array.isArray(data)) {
    throw new Error('Unexpected response shape from classifier');
  }
  return data; // [{ label, score }, ...] sorted by score desc
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const user = await verifySupabaseUser(req);
    if (!user) {
      res.status(401).json({ error: 'Invalid or missing session' });
      return;
    }

    const { imageBase64, mimeType } = req.body || {};
    if (!imageBase64) {
      res.status(400).json({ error: 'imageBase64 is required' });
      return;
    }

    const buffer = Buffer.from(imageBase64, 'base64');
    const predictions = await classifyImage(buffer, mimeType);

    const top = predictions.slice(0, 3).map((p) => {
      const nutrition = lookupNutrition(p.label);
      return {
        food_name: String(p.label).replace(/_/g, ' '),
        score: p.score,
        per100: {
          calories: nutrition.calories,
          protein_g: nutrition.protein_g,
          carbs_g: nutrition.carbs_g,
          fat_g: nutrition.fat_g
        },
        typical_grams: nutrition.typical_grams
      };
    });

    res.status(200).json({
      predictions: top,
      model: process.env.HF_FOOD_MODEL_ID || 'prithivMLmods/Food-101-93M'
    });
  } catch (err) {
    res.status(500).json({ error: 'Analysis failed', details: String((err && err.message) || err) });
  }
};
