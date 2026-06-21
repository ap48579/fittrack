// Looks up a packaged-food barcode against Open Food Facts (free, no key
// required). Kept as a tiny server-side proxy so the frontend doesn't have
// to worry about CORS, and so this is easy to swap out later.
module.exports = async (req, res) => {
  const code = (req.query && req.query.code) || (req.body && req.body.code);
  if (!code) {
    res.status(400).json({ error: 'A barcode "code" query param or body field is required' });
    return;
  }

  try {
    const offResp = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json`
    );
    const offData = await offResp.json();

    if (offData.status !== 1 || !offData.product) {
      res.status(404).json({ error: 'Product not found for that barcode' });
      return;
    }

    const p = offData.product;
    const n = p.nutriments || {};
    const per100 = n['energy-kcal_100g'] != null;

    res.status(200).json({
      food_name: p.product_name || p.generic_name || 'Unknown product',
      brand: p.brands || null,
      per: per100 ? 'per 100g' : 'per serving',
      calories: n['energy-kcal_100g'] ?? n['energy-kcal_serving'] ?? null,
      protein_g: n['proteins_100g'] ?? n['proteins_serving'] ?? null,
      carbs_g: n['carbohydrates_100g'] ?? n['carbohydrates_serving'] ?? null,
      fat_g: n['fat_100g'] ?? n['fat_serving'] ?? null
    });
  } catch (err) {
    res.status(500).json({ error: 'Lookup failed', details: String((err && err.message) || err) });
  }
};
