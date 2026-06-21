(async () => {
  const session = await requireSession();
  if (!session) return;
  wireLogout();
  const userId = session.user.id;

  const photoInput = document.getElementById('photo-input');
  const previewImg = document.getElementById('photo-preview');
  const analyzeBtn = document.getElementById('analyze-btn');
  const foodStatusEl = document.getElementById('food-status');
  const predictionsEl = document.getElementById('predictions');

  const resultCard = document.getElementById('result-card');
  const sourceInput = document.getElementById('save-source');
  const nameInput = document.getElementById('save-food-name');
  const gramsInput = document.getElementById('save-grams');
  const caloriesInput = document.getElementById('save-calories');
  const proteinInput = document.getElementById('save-protein');
  const carbsInput = document.getElementById('save-carbs');
  const fatInput = document.getElementById('save-fat');
  const notesInput = document.getElementById('save-notes');

  let lastImage = null; // { base64, mimeType }
  let currentPer100 = null; // { calories, protein_g, carbs_g, fat_g } for live recompute

  // ---------- Photo capture ----------
  photoInput.addEventListener('change', () => {
    const file = photoInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      previewImg.src = dataUrl;
      previewImg.hidden = false;
      const [meta, base64] = dataUrl.split(',');
      const mimeType = (meta.match(/data:(.*);base64/) || [])[1] || file.type || 'image/jpeg';
      lastImage = { base64, mimeType };
      analyzeBtn.disabled = false;
      predictionsEl.hidden = true;
      predictionsEl.innerHTML = '';
      foodStatusEl.textContent = '';
    };
    reader.readAsDataURL(file);
  });

  analyzeBtn.addEventListener('click', async () => {
    if (!lastImage) return;
    analyzeBtn.disabled = true;
    foodStatusEl.textContent = 'Identifying food (this can take a few seconds the first time)...';
    try {
      const { data: sessionData } = await sb.auth.getSession();
      const token = sessionData.session.access_token;
      const resp = await fetch('/api/analyze-food', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ imageBase64: lastImage.base64, mimeType: lastImage.mimeType })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Analysis failed');
      renderPredictions(data.predictions || []);
      foodStatusEl.textContent = 'Pick the closest match below, then review the amounts.';
    } catch (err) {
      foodStatusEl.textContent = `Error: ${err.message}`;
    } finally {
      analyzeBtn.disabled = false;
    }
  });

  function renderPredictions(predictions) {
    predictionsEl.innerHTML = '';
    if (!predictions.length) {
      predictionsEl.hidden = true;
      return;
    }
    predictions.forEach((p, idx) => {
      const row = document.createElement('div');
      row.className = 'prediction-option';
      row.innerHTML = `<strong>${p.food_name}</strong><span class="score">${Math.round(p.score * 100)}% match</span>`;
      row.addEventListener('click', () => {
        sourceInput.value = 'photo';
        currentPer100 = p.per100;
        nameInput.value = p.food_name;
        gramsInput.value = p.typical_grams;
        recomputeFromGrams();
        notesInput.value = idx === 0 ? '' : 'manually picked from alternatives';
        showResultCard();
      });
      predictionsEl.appendChild(row);
    });
    predictionsEl.hidden = false;
    // Default to the top guess so the form is never empty.
    predictionsEl.firstChild.click();
  }

  // ---------- Live recompute when portion size changes ----------
  function recomputeFromGrams() {
    if (!currentPer100) return;
    const grams = parseFloat(gramsInput.value) || 0;
    const factor = grams / 100;
    caloriesInput.value = Math.round(currentPer100.calories * factor);
    proteinInput.value = Math.round(currentPer100.protein_g * factor);
    carbsInput.value = Math.round(currentPer100.carbs_g * factor);
    fatInput.value = Math.round(currentPer100.fat_g * factor);
  }
  gramsInput.addEventListener('input', recomputeFromGrams);

  function showResultCard() {
    resultCard.hidden = false;
    resultCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ---------- Barcode lookup ----------
  document.getElementById('barcode-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = document.getElementById('barcode-input').value.trim();
    if (!code) return;
    const statusBarcode = document.getElementById('barcode-status');
    statusBarcode.textContent = 'Looking up...';
    try {
      const resp = await fetch(`/api/barcode-lookup?code=${encodeURIComponent(code)}`);
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Not found');

      sourceInput.value = 'barcode';
      currentPer100 = {
        calories: data.calories || 0,
        protein_g: data.protein_g || 0,
        carbs_g: data.carbs_g || 0,
        fat_g: data.fat_g || 0
      };
      nameInput.value = `${data.food_name}${data.brand ? ' (' + data.brand + ')' : ''}`;
      gramsInput.value = 100;
      recomputeFromGrams();
      notesInput.value = `Open Food Facts, values ${data.per || 'per 100g'}`;
      showResultCard();
      statusBarcode.textContent = 'Found — review and save below.';
    } catch (err) {
      statusBarcode.textContent = `Error: ${err.message}`;
    }
  });

  // ---------- Manual entry ----------
  document.getElementById('manual-entry-btn').addEventListener('click', () => {
    sourceInput.value = 'manual';
    currentPer100 = null;
    nameInput.value = '';
    gramsInput.value = '';
    caloriesInput.value = '';
    proteinInput.value = '';
    carbsInput.value = '';
    fatInput.value = '';
    notesInput.value = '';
    showResultCard();
    nameInput.focus();
  });

  // ---------- Save ----------
  document.getElementById('save-food-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      user_id: userId,
      source: sourceInput.value || 'manual',
      food_name: nameInput.value.trim(),
      grams: parseFloat(gramsInput.value) || null,
      calories: parseFloat(caloriesInput.value) || null,
      protein_g: parseFloat(proteinInput.value) || null,
      carbs_g: parseFloat(carbsInput.value) || null,
      fat_g: parseFloat(fatInput.value) || null,
      notes: notesInput.value || null
    };
    if (!payload.food_name) return;

    const { error } = await sb.from('food_logs').insert(payload);
    const saveStatus = document.getElementById('food-save-status');
    saveStatus.textContent = error ? `Error: ${error.message}` : 'Saved to today’s log!';
    if (!error) {
      e.target.reset();
      resultCard.hidden = true;
      previewImg.hidden = true;
      predictionsEl.hidden = true;
      photoInput.value = '';
      analyzeBtn.disabled = true;
      lastImage = null;
      currentPer100 = null;
    }
  });
})();
