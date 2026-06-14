(function() {
  var currentRecipe = null;
  var editMode = false;
  var pendingImageBase64 = null;
  var pendingMimeType = null;
  var createSubMode = 'text';

  var statusEl = document.getElementById('status');
  var previewEl = document.getElementById('preview');
  var previewTitle = document.getElementById('preview-title');
  var previewHint = document.getElementById('preview-hint');
  var previewImg = document.getElementById('preview-img');
  var previewImageWrap = document.getElementById('preview-image-wrap');
  var btnRegenImage = document.getElementById('btn-regen-image');
  var editSelect = document.getElementById('edit-select');
  var recipeList = [];
  var previewForm = document.getElementById('preview-form');
  var previewMetaFields = document.getElementById('preview-meta-fields');

  var CATEGORY_ORDER = ['frukost', 'lunch', 'middag', 'tillbehor', 'fika'];
  var CATEGORY_LABELS = {
    frukost: 'Frukost', lunch: 'Lunch', middag: 'Middag', tillbehor: 'Tillbehör', fika: 'Fika & bakning'
  };
  var TAG_FILTER_ORDER = [
    'hog-protein', 'snabb', 'laggkolhydrat', 'vegetarisk', 'meal-prep',
    'kyckling', 'notkott', 'flask', 'fisk', 'skaldjur'
  ];
  var TAG_LABELS = {
    'hog-protein': 'Hög protein', snabb: 'Snabbt', vegetarisk: 'Vegetariskt',
    'meal-prep': 'Meal prep', kyckling: 'Kyckling', notkott: 'Nötkött', flask: 'Fläsk',
    fisk: 'Fisk', skaldjur: 'Skaldjur', laggkolhydrat: 'Lågkolhydrat'
  };
  var VALID_UNITS = ['g', 'msk', 'tsk', 'st', 'pinch', 'näve', 'strimlor'];

  function mk(tag, cls) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    return e;
  }

  function fieldInput(id, label, value, type) {
    var wrap = mk('div', 'field');
    var lbl = mk('label');
    lbl.textContent = label;
    lbl.htmlFor = id;
    var input = document.createElement('input');
    input.id = id;
    input.type = type || 'text';
    input.value = value != null ? String(value) : '';
    wrap.appendChild(lbl);
    wrap.appendChild(input);
    return wrap;
  }

  function setStatus(msg, isErr) {
    statusEl.textContent = msg || '';
    statusEl.className = 'status' + (isErr ? ' err' : '');
  }

  function clearPendingImage() {
    pendingImageBase64 = null;
    pendingMimeType = null;
  }

  function clearImageDrop(dropId, thumbId, fileId) {
    var drop = document.getElementById(dropId);
    var thumb = document.getElementById(thumbId);
    var file = document.getElementById(fileId);
    if (thumb) {
      thumb.removeAttribute('src');
      thumb.classList.add('hidden');
    }
    if (drop) drop.classList.remove('has-image');
    if (file) file.value = '';
  }

  function setPendingImage(data, mime, dropId, thumbId) {
    pendingImageBase64 = data;
    pendingMimeType = mime;
    var thumb = document.getElementById(thumbId);
    var drop = document.getElementById(dropId);
    thumb.src = 'data:' + mime + ';base64,' + data;
    thumb.classList.remove('hidden');
    drop.classList.add('has-image');
  }

  function readFileAsBase64(file) {
    return new Promise(function(resolve, reject) {
      var reader = new FileReader();
      reader.onload = function() {
        var result = reader.result;
        if (typeof result !== 'string') return reject(new Error('Kunde inte läsa fil'));
        var comma = result.indexOf(',');
        resolve({ data: result.slice(comma + 1), mimeType: file.type || 'image/jpeg' });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function bindImageDrop(dropId, fileId, thumbId) {
    var drop = document.getElementById(dropId);
    var file = document.getElementById(fileId);
    var thumb = document.getElementById(thumbId);

    function applyFile(f) {
      if (!f || !f.type.startsWith('image/')) return;
      readFileAsBase64(f).then(function(r) {
        setPendingImage(r.data, r.mimeType, dropId, thumbId);
      }).catch(function() { setStatus('Kunde inte läsa bilden', true); });
    }

    drop.addEventListener('click', function() { file.click(); });
    file.addEventListener('change', function(e) {
      var f = e.target.files && e.target.files[0];
      if (f) applyFile(f);
    });
    drop.addEventListener('dragover', function(e) {
      e.preventDefault();
      drop.style.borderColor = 'var(--info)';
    });
    drop.addEventListener('dragleave', function() {
      drop.style.borderColor = '';
    });
    drop.addEventListener('drop', function(e) {
      e.preventDefault();
      drop.style.borderColor = '';
      var f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) applyFile(f);
    });
    drop.addEventListener('paste', function(e) {
      var items = e.clipboardData && e.clipboardData.items;
      if (!items) return;
      for (var i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image/') === 0) {
          e.preventDefault();
          var blob = items[i].getAsFile();
          if (blob) applyFile(blob);
          return;
        }
      }
    });
  }

  bindImageDrop('drop-text', 'file-text', 'thumb-text');
  bindImageDrop('drop-image', 'file-image', 'thumb-image');

  document.getElementById('btn-upload-image').addEventListener('click', function() {
    document.getElementById('file-preview').click();
  });
  document.getElementById('file-preview').addEventListener('change', function(e) {
    var f = e.target.files && e.target.files[0];
    if (!f) return;
    readFileAsBase64(f).then(function(r) {
      pendingImageBase64 = r.data;
      pendingMimeType = r.mimeType;
      if (currentRecipe) updatePreviewImage(currentRecipe);
      setStatus('Bild vald — sparas vid Spara recept.');
    }).catch(function() { setStatus('Kunde inte läsa bilden', true); });
  });

  function updatePageHeading() {
    var heading = document.getElementById('page-heading');
    if (!heading) return;
    heading.textContent = editMode ? 'Redigera recept' : 'Lägg till recept';
    document.title = (editMode ? 'Redigera recept' : 'Lägg till recept') + ' — Macro-friendly recipes';
  }

  function showCreatePanel() {
    editMode = false;
    document.getElementById('tab-create').classList.add('active');
    document.getElementById('tab-edit').classList.remove('active');
    document.getElementById('panel-create').classList.remove('hidden');
    document.getElementById('panel-edit').classList.add('hidden');
    updatePageHeading();
  }

  function showEditPanel() {
    editMode = true;
    document.getElementById('tab-edit').classList.add('active');
    document.getElementById('tab-create').classList.remove('active');
    document.getElementById('panel-edit').classList.remove('hidden');
    document.getElementById('panel-create').classList.add('hidden');
    updatePageHeading();
  }

  document.getElementById('tab-create').addEventListener('click', showCreatePanel);
  document.getElementById('tab-edit').addEventListener('click', showEditPanel);

  function setCreateSubMode(mode) {
    createSubMode = mode;
    document.getElementById('tab-text').classList.toggle('active', mode === 'text');
    document.getElementById('tab-url').classList.toggle('active', mode === 'url');
    document.getElementById('tab-from-image').classList.toggle('active', mode === 'image');
    document.getElementById('panel-text').classList.toggle('hidden', mode !== 'text');
    document.getElementById('panel-url').classList.toggle('hidden', mode !== 'url');
    document.getElementById('panel-from-image').classList.toggle('hidden', mode !== 'image');
  }

  document.getElementById('tab-text').addEventListener('click', function() { setCreateSubMode('text'); });
  document.getElementById('tab-url').addEventListener('click', function() { setCreateSubMode('url'); });
  document.getElementById('tab-from-image').addEventListener('click', function() { setCreateSubMode('image'); });

  function populateEditSelect(selectedId) {
    editSelect.replaceChildren();
    var placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Välj recept…';
    editSelect.appendChild(placeholder);
    recipeList.sort(function(a, b) {
      return (a.title || a.id).localeCompare(b.title || b.id, 'sv');
    }).forEach(function(r) {
      var opt = document.createElement('option');
      opt.value = r.id;
      opt.textContent = r.title || r.id;
      editSelect.appendChild(opt);
    });
    if (selectedId) editSelect.value = selectedId;
  }

  function loadRecipeById(id) {
    if (!id) return;
    setStatus('Hämtar…');
    clearPendingImage();
    fetch('/api/recipes/' + encodeURIComponent(id), { credentials: 'same-origin' })
      .then(function(res) {
        return res.json().then(function(data) {
          if (!res.ok) throw new Error(data.error || 'Hittades inte');
          return data.recipe;
        });
      })
      .then(function(recipe) {
        editMode = true;
        showPreview(recipe);
        setStatus('Redigera och spara, eller uppdatera bild.');
      })
      .catch(function(ex) { setStatus(ex.message, true); });
  }

  editSelect.addEventListener('change', function() {
    var id = editSelect.value;
    if (!id) {
      previewEl.classList.remove('visible');
      currentRecipe = null;
      setStatus('');
      return;
    }
    loadRecipeById(id);
  });

  function recipeExistsInDb(id) {
    for (var i = 0; i < recipeList.length; i++) {
      if (recipeList[i].id === id) return true;
    }
    return false;
  }

  function imageSrcForRecipe(recipe, bust) {
    if (!recipe.image) return '';
    var src;
    if (recipe.image.indexOf('/api/') === 0) src = recipe.image;
    else if (recipe.image.indexOf('http') === 0) src = recipe.image;
    else src = '/' + recipe.image.replace(/^\//, '');
    if (bust) src += (src.indexOf('?') === -1 ? '?' : '&') + 't=' + Date.now();
    return src;
  }

  function readRecipeFromForm() {
    var recipe = {
      id: document.getElementById('edit-id').value.trim(),
      title: document.getElementById('edit-title').value.trim(),
      category: document.getElementById('edit-category').value,
      baseServings: parseInt(document.getElementById('edit-servings').value, 10) || 1,
      source: document.getElementById('edit-source').value.trim(),
      sourceUrl: document.getElementById('edit-source-url').value.trim(),
      tags: [],
      macros: {
        kcal: parseFloat(document.getElementById('edit-kcal').value) || 0,
        prot: parseFloat(document.getElementById('edit-prot').value) || 0,
        carb: parseFloat(document.getElementById('edit-carb').value) || 0,
        fat: parseFloat(document.getElementById('edit-fat').value) || 0
      },
      groups: [],
      steps: [],
      tips: []
    };
    if (currentRecipe && currentRecipe.image) recipe.image = currentRecipe.image;
    previewForm.querySelectorAll('input[data-tag]:checked').forEach(function(cb) {
      recipe.tags.push(cb.getAttribute('data-tag'));
    });
    previewForm.querySelectorAll('.ing-grp').forEach(function(grpEl) {
      var groupName = grpEl.querySelector('.ing-grp-name-input').value.trim() || 'Ingredienser';
      var ingredients = [];
      grpEl.querySelectorAll('.ing-edit-row').forEach(function(row) {
        var name = row.querySelector('.ing-name').value.trim();
        if (!name) return;
        ingredients.push({
          name: name,
          amount: parseFloat(row.querySelector('.ing-amount').value) || 0,
          unit: row.querySelector('.ing-unit').value
        });
      });
      if (ingredients.length) recipe.groups.push({ name: groupName, ingredients: ingredients });
    });
    previewForm.querySelectorAll('.step-edit').forEach(function(stepEl) {
      var title = stepEl.querySelector('.step-title-input').value.trim();
      var text = stepEl.querySelector('.step-text-input').value.trim();
      if (title || text) recipe.steps.push({ title: title || 'Steg', text: text });
    });
    previewForm.querySelectorAll('.tip-edit').forEach(function(tipEl) {
      recipe.tips.push({
        title: tipEl.querySelector('.tip-title-input').value.trim(),
        text: tipEl.querySelector('.tip-text-input').value.trim()
      });
    });
    while (recipe.tips.length < 4) recipe.tips.push({ title: '', text: '' });
    recipe.tips = recipe.tips.slice(0, 4);
    if (currentRecipe && currentRecipe.badges) recipe.badges = currentRecipe.badges;
    return recipe;
  }

  function buildIngRow(ing) {
    var row = mk('div', 'ing-edit-row');
    var nameIn = document.createElement('input');
    nameIn.className = 'ing-name';
    nameIn.placeholder = 'ingrediens';
    nameIn.value = ing && ing.name ? ing.name : '';
    var amtIn = document.createElement('input');
    amtIn.className = 'ing-amount';
    amtIn.type = 'number';
    amtIn.step = 'any';
    amtIn.value = ing && ing.amount != null ? String(ing.amount) : '';
    var unitSel = document.createElement('select');
    unitSel.className = 'ing-unit';
    VALID_UNITS.forEach(function(u) {
      var opt = document.createElement('option');
      opt.value = u;
      opt.textContent = u;
      if (ing && ing.unit === u) opt.selected = true;
      unitSel.appendChild(opt);
    });
    var delBtn = mk('button', 'btn-ghost');
    delBtn.type = 'button';
    delBtn.textContent = '×';
    delBtn.addEventListener('click', function() { row.remove(); });
    row.appendChild(nameIn);
    row.appendChild(amtIn);
    row.appendChild(unitSel);
    row.appendChild(delBtn);
    return row;
  }

  function buildIngGroup(group) {
    var grp = mk('div', 'ing-grp');
    var head = mk('div', 'ing-grp-head');
    var nameIn = document.createElement('input');
    nameIn.className = 'ing-grp-name-input';
    nameIn.placeholder = 'Sektionsnamn';
    nameIn.value = group && group.name ? group.name : '';
    head.appendChild(nameIn);
    var addIngBtn = mk('button', 'btn-ghost');
    addIngBtn.type = 'button';
    addIngBtn.textContent = '+ rad';
    addIngBtn.addEventListener('click', function() {
      grp.appendChild(buildIngRow(null));
    });
    head.appendChild(addIngBtn);
    grp.appendChild(head);
    var ings = group && group.ingredients ? group.ingredients : [];
    if (!ings.length) ings = [{ name: '', amount: 0, unit: 'g' }];
    ings.forEach(function(ing) { grp.appendChild(buildIngRow(ing)); });
    return grp;
  }

  function renderPreviewForm(recipe) {
    previewMetaFields.replaceChildren();
    previewMetaFields.appendChild(fieldInput('edit-id', 'Id', recipe.id));
    previewMetaFields.appendChild(fieldInput('edit-title', 'Titel', recipe.title));
    var catWrap = mk('div', 'field');
    var catLbl = mk('label');
    catLbl.textContent = 'Måltid';
    catLbl.htmlFor = 'edit-category';
    var catSel = document.createElement('select');
    catSel.id = 'edit-category';
    CATEGORY_ORDER.forEach(function(c) {
      var opt = document.createElement('option');
      opt.value = c;
      opt.textContent = CATEGORY_LABELS[c] || c;
      if (recipe.category === c) opt.selected = true;
      catSel.appendChild(opt);
    });
    catWrap.appendChild(catLbl);
    catWrap.appendChild(catSel);
    previewMetaFields.appendChild(catWrap);
    previewMetaFields.appendChild(fieldInput('edit-servings', 'Portioner', recipe.baseServings || 1, 'number'));
    previewMetaFields.appendChild(fieldInput('edit-source', 'Källa', recipe.source));
    previewMetaFields.appendChild(fieldInput('edit-source-url', 'Källa-URL', recipe.sourceUrl || ''));

    previewForm.replaceChildren();

    var tagsTitle = mk('div', 'sec-title');
    tagsTitle.textContent = 'Taggar';
    previewForm.appendChild(tagsTitle);
    var tagsWrap = mk('div', 'recipe-edit-tags');
    TAG_FILTER_ORDER.forEach(function(tagId) {
      var lab = mk('label');
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.setAttribute('data-tag', tagId);
      if (recipe.tags && recipe.tags.indexOf(tagId) !== -1) cb.checked = true;
      lab.appendChild(cb);
      lab.appendChild(document.createTextNode(TAG_LABELS[tagId] || tagId));
      tagsWrap.appendChild(lab);
    });
    previewForm.appendChild(tagsWrap);

    var macrosTitle = mk('div', 'sec-title');
    macrosTitle.textContent = 'Makron (hela receptet)';
    previewForm.appendChild(macrosTitle);
    var macrosDiv = mk('div', 'macros');
    [
      { id: 'edit-kcal', key: 'kcal', lbl: 'kcal' },
      { id: 'edit-prot', key: 'prot', lbl: 'protein (g)' },
      { id: 'edit-carb', key: 'carb', lbl: 'kolhydrater (g)' },
      { id: 'edit-fat', key: 'fat', lbl: 'fett (g)' }
    ].forEach(function(m) {
      var mac = mk('div', 'mac');
      var inp = document.createElement('input');
      inp.id = m.id;
      inp.type = 'number';
      inp.step = 'any';
      inp.value = recipe.macros && recipe.macros[m.key] != null ? String(recipe.macros[m.key]) : '0';
      var lbl = mk('span', 'mac-lbl');
      lbl.textContent = m.lbl;
      mac.appendChild(inp);
      mac.appendChild(lbl);
      macrosDiv.appendChild(mac);
    });
    previewForm.appendChild(macrosDiv);

    var twoCol = mk('div', 'two-col');
    var ingCol = mk('div');
    var ingTitle = mk('div', 'sec-title');
    ingTitle.textContent = 'Ingredienser';
    ingCol.appendChild(ingTitle);
    var groupsWrap = mk('div', 'ing-groups');
    var groups = recipe.groups && recipe.groups.length ? recipe.groups : [{ name: 'Ingredienser', ingredients: [] }];
    groups.forEach(function(g) { groupsWrap.appendChild(buildIngGroup(g)); });
    ingCol.appendChild(groupsWrap);
    var addGrpBtn = mk('button', 'btn-ghost');
    addGrpBtn.type = 'button';
    addGrpBtn.textContent = '+ ingrediensgrupp';
    addGrpBtn.addEventListener('click', function() {
      groupsWrap.appendChild(buildIngGroup({ name: 'Ny sektion', ingredients: [] }));
    });
    ingCol.appendChild(addGrpBtn);
    twoCol.appendChild(ingCol);

    var stepsCol = mk('div');
    var stepsTitle = mk('div', 'sec-title');
    stepsTitle.textContent = 'Gör så här';
    stepsCol.appendChild(stepsTitle);
    var stepsWrap = mk('div', 'steps-wrap');
    var steps = recipe.steps && recipe.steps.length ? recipe.steps : [{ title: '', text: '' }];
    steps.forEach(function(s) {
      var stepEl = mk('div', 'step-edit');
      var stIn = document.createElement('input');
      stIn.className = 'step-title-input';
      stIn.placeholder = 'Stegnamn';
      stIn.value = s.title || '';
      var stText = document.createElement('textarea');
      stText.className = 'step-text-input';
      stText.placeholder = 'Beskrivning';
      stText.value = s.text || '';
      stepEl.appendChild(stIn);
      stepEl.appendChild(stText);
      stepsWrap.appendChild(stepEl);
    });
    stepsCol.appendChild(stepsWrap);
    var addStepBtn = mk('button', 'btn-ghost');
    addStepBtn.type = 'button';
    addStepBtn.textContent = '+ steg';
    addStepBtn.addEventListener('click', function() {
      var stepEl = mk('div', 'step-edit');
      var stIn = document.createElement('input');
      stIn.className = 'step-title-input';
      stIn.placeholder = 'Stegnamn';
      var stText = document.createElement('textarea');
      stText.className = 'step-text-input';
      stText.placeholder = 'Beskrivning';
      stepEl.appendChild(stIn);
      stepEl.appendChild(stText);
      stepsWrap.appendChild(stepEl);
    });
    stepsCol.appendChild(addStepBtn);
    twoCol.appendChild(stepsCol);
    previewForm.appendChild(twoCol);

    var tipsTitle = mk('div', 'sec-title');
    tipsTitle.textContent = 'Tips & variationer';
    previewForm.appendChild(tipsTitle);
    var tipsGrid = mk('div', 'tips-grid');
    var tips = recipe.tips && recipe.tips.length ? recipe.tips.slice(0, 4) : [];
    while (tips.length < 4) tips.push({ title: '', text: '' });
    tips.forEach(function(t) {
      var tipEl = mk('div', 'tip-edit');
      var ttIn = document.createElement('input');
      ttIn.className = 'tip-title-input';
      ttIn.placeholder = 'Rubrik';
      ttIn.value = t.title || '';
      var ttText = document.createElement('textarea');
      ttText.className = 'tip-text-input';
      ttText.placeholder = 'Text';
      ttText.value = t.text || '';
      tipEl.appendChild(ttIn);
      tipEl.appendChild(ttText);
      tipsGrid.appendChild(tipEl);
    });
    previewForm.appendChild(tipsGrid);
  }

  function updatePreviewImage(recipe) {
    var hasPending = pendingImageBase64 && pendingMimeType;
    var hasSaved = recipe.image && !hasPending;
    if (hasPending) {
      previewImg.src = 'data:' + pendingMimeType + ';base64,' + pendingImageBase64;
      previewImg.classList.remove('hidden');
      previewImageWrap.classList.remove('no-image');
    } else if (hasSaved) {
      previewImg.src = imageSrcForRecipe(recipe);
      previewImg.classList.remove('hidden');
      previewImageWrap.classList.remove('no-image');
    } else {
      previewImg.classList.add('hidden');
      previewImg.removeAttribute('src');
      previewImageWrap.classList.add('no-image');
    }
    btnRegenImage.classList.toggle('hidden', !hasSaved || !recipeExistsInDb(recipe.id));
  }

  function showPreview(recipe) {
    currentRecipe = recipe;
    previewTitle.textContent = recipe.title || 'Granska recept';
    renderPreviewForm(recipe);
    updatePreviewImage(recipe);
    previewEl.classList.add('visible');
    if (pendingImageBase64 && pendingMimeType) {
      previewHint.textContent = 'Uppladdad bild sparas vid Spara. Redigera fält nedan.';
    } else if (recipe.image && recipeExistsInDb(recipe.id)) {
      previewHint.textContent = 'Redigera receptet eller förbättra/ladda upp bild.';
    } else if (recipe.image) {
      previewHint.textContent = 'Redigera och spara receptet.';
    } else {
      previewHint.textContent = 'Ingen bild — ladda upp manuellt eller spara utan.';
    }
  }

  btnRegenImage.addEventListener('click', function() {
    var recipe = readRecipeFromForm();
    if (!recipe.id) {
      setStatus('Receptet saknar id.', true);
      return;
    }
    if (!recipeExistsInDb(recipe.id)) {
      setStatus('Spara receptet först innan du genererar ny bild.', true);
      return;
    }
    btnRegenImage.disabled = true;
      setStatus('Förbättrar befintlig bild med AI…');
    var regenBody = {
      recipe: recipe,
      regenerateImage: true,
      featuredNew: document.getElementById('featured-new').checked
    };
    if (pendingImageBase64 && pendingMimeType) {
      regenBody.imageBase64 = pendingImageBase64;
      regenBody.mimeType = pendingMimeType;
    }
    fetch('/api/recipes/' + encodeURIComponent(recipe.id), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(regenBody)
    }).then(function(res) {
      return res.json().then(function(data) {
        if (!res.ok) throw new Error(data.error || 'Bildgenerering misslyckades');
        return data;
      });
    }).then(function(data) {
      editMode = true;
      clearPendingImage();
      showPreview(data.recipe);
      previewImg.src = imageSrcForRecipe(data.recipe, true);
      setStatus('Bild förbättrad och sparad.');
    }).catch(function(ex) {
      setStatus(ex.message, true);
    }).finally(function() { btnRegenImage.disabled = false; });
  });

  document.getElementById('btn-parse-text').addEventListener('click', function() {
    var btn = document.getElementById('btn-parse-text');
    var text = document.getElementById('text').value.trim();
    var sourceHint = document.getElementById('source-hint').value.trim();
    if (!text && !pendingImageBase64) {
      setStatus('Klistra in text eller lägg till en bild.', true);
      return;
    }
    if (sourceHint) {
      text = (text ? text + '\n\n' : '') + 'Synlig originalkälla i caption/bild: ' + sourceHint;
    }
    btn.disabled = true;
    setStatus('Bygger recept…');
    fetch('/api/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        text: text,
        imageBase64: pendingImageBase64,
        mimeType: pendingMimeType
      })
    }).then(function(res) {
      return res.json().then(function(data) {
        if (!res.ok) throw new Error(data.error || 'Parse misslyckades');
        return data;
      });
    }).then(function(data) {
      editMode = false;
      showPreview(data.recipe);
      setStatus('Granska receptet och spara när du är nöjd.');
    }).catch(function(ex) {
      setStatus(ex.message, true);
    }).finally(function() { btn.disabled = false; });
  });

  document.getElementById('btn-parse-url').addEventListener('click', function() {
    var btn = document.getElementById('btn-parse-url');
    var url = document.getElementById('recipe-url').value.trim();
    if (!url) {
      setStatus('Ange en URL.', true);
      return;
    }
    btn.disabled = true;
    clearPendingImage();
    setStatus('Hämtar sida och tolkar…');
    fetch('/api/parse-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ url: url })
    }).then(function(res) {
      return res.json().then(function(data) {
        if (!res.ok) throw new Error(data.error || 'URL-tolkning misslyckades');
        return data;
      });
    }).then(function(data) {
      editMode = false;
      if (data.imageBase64 && data.mimeType) {
        setPendingImage(data.imageBase64, data.mimeType, 'drop-text', 'thumb-text');
      }
      showPreview(data.recipe);
      setStatus(
        data.imageFromUrl
          ? 'Matfoto från sidan ingår vid sparning. Granska och spara.'
          : 'Ingen matfoto på sidan — recept utan bild tills du lägger till en i Redigera.'
      );
    }).catch(function(ex) {
      setStatus(ex.message, true);
    }).finally(function() { btn.disabled = false; });
  });

  document.getElementById('btn-parse-image').addEventListener('click', function() {
    var btn = document.getElementById('btn-parse-image');
    if (!pendingImageBase64) {
      setStatus('Lägg till en bild först.', true);
      return;
    }
    btn.disabled = true;
    setStatus('Tolkar bild med Gemini…');
    fetch('/api/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        text: '',
        imageBase64: pendingImageBase64,
        mimeType: pendingMimeType
      })
    }).then(function(res) {
      return res.json().then(function(data) {
        if (!res.ok) throw new Error(data.error || 'Parse misslyckades');
        return data;
      });
    }).then(function(data) {
      editMode = false;
      if (!data.saveImage) {
        clearPendingImage();
        clearImageDrop('drop-image', 'thumb-image', 'file-image');
      }
      showPreview(data.recipe);
      setStatus(
        data.saveImage
          ? 'Granska och spara — matfotot sparas med receptet.'
          : 'Recept tolkat från bilden, men ingen matfoto sparas (lägg till i Redigera vid behov).'
      );
    }).catch(function(ex) {
      setStatus(ex.message, true);
    }).finally(function() { btn.disabled = false; });
  });

  function goToRecipe(id) {
    var path = '/';
    var p = location.pathname;
    var idx = p.indexOf('/recept');
    if (idx !== -1) {
      path = p.slice(0, idx + 7);
      if (!path.endsWith('/')) path += '/';
    }
    location.href = path + '#' + encodeURIComponent(id);
  }

  document.getElementById('btn-save').addEventListener('click', function() {
    if (!currentRecipe) return;
    var btn = document.getElementById('btn-save');
    btn.disabled = true;

    var recipe = readRecipeFromForm();
    if (!recipe.id || !recipe.title) {
      setStatus('Id och titel krävs.', true);
      btn.disabled = false;
      return;
    }

    var url = editMode
      ? '/api/recipes/' + encodeURIComponent(recipe.id)
      : '/api/recipes';
    var method = editMode ? 'PUT' : 'POST';

    var body = {
      recipe: recipe,
      featuredNew: document.getElementById('featured-new').checked
    };

    if (editMode) {
      setStatus('Sparar…');
      if (pendingImageBase64 && pendingMimeType) {
        body.uploadImage = true;
        body.imageBase64 = pendingImageBase64;
        body.mimeType = pendingMimeType;
      }
    } else {
      setStatus('Sparar recept…');
      body.skipImageGeneration = true;
      if (pendingImageBase64 && pendingMimeType) {
        body.uploadImage = true;
        body.imageBase64 = pendingImageBase64;
        body.mimeType = pendingMimeType;
      }
    }

    fetch(url, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(body)
    }).then(function(res) {
      return res.json().then(function(data) {
        if (!res.ok) throw new Error((data.details && data.details.join(' · ')) || data.error || 'Sparning misslyckades');
        return data;
      });
    }).then(function(data) {
      goToRecipe(data.recipe.id);
    }).catch(function(ex) {
      setStatus(ex.message, true);
    }).finally(function() { btn.disabled = false; });
  });

  function bootEditFromQuery() {
    var editId = new URLSearchParams(location.search).get('edit');
    if (!editId) return;
    showEditPanel();
    populateEditSelect(editId);
    editSelect.value = editId;
    loadRecipeById(editId);
  }

  fetch('/api/auth/check', { credentials: 'same-origin' })
    .then(function(res) { return res.json(); })
    .then(function(d) {
      if (!d.ok) { location.href = '/login.html'; return; }
      return fetch('/api/recipes', { credentials: 'same-origin' })
        .then(function(res) { return res.json(); })
        .then(function(data) {
          recipeList = (data.recipes || []).map(function(r) { return { id: r.id, title: r.title }; });
          populateEditSelect();
          bootEditFromQuery();
        });
    })
    .catch(function() { location.href = '/login.html'; });
})();
