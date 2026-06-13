(function() {
  var currentRecipe = null;
  var editMode = false;
  var imageBase64 = null;
  var mimeType = null;

  var statusEl = document.getElementById('status');
  var previewEl = document.getElementById('preview');
  var previewTitle = document.getElementById('preview-title');
  var previewJson = document.getElementById('preview-json');
  var previewImg = document.getElementById('preview-img');
  var previewImageWrap = document.getElementById('preview-image-wrap');
  var btnRegenImage = document.getElementById('btn-regen-image');
  var thumb = document.getElementById('thumb');
  var editSelect = document.getElementById('edit-select');
  var recipeList = [];

  function setStatus(msg, isErr) {
    statusEl.textContent = msg || '';
    statusEl.className = 'status' + (isErr ? ' err' : '');
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

  document.getElementById('image').addEventListener('change', function(e) {
    var file = e.target.files && e.target.files[0];
    if (!file) {
      imageBase64 = null;
      mimeType = null;
      thumb.classList.add('hidden');
      return;
    }
    readFileAsBase64(file).then(function(r) {
      imageBase64 = r.data;
      mimeType = r.mimeType;
      thumb.src = 'data:' + r.mimeType + ';base64,' + r.data;
      thumb.classList.remove('hidden');
    }).catch(function() { setStatus('Kunde inte läsa bilden', true); });
  });

  document.getElementById('tab-new').addEventListener('click', function() {
    editMode = false;
    document.getElementById('tab-new').classList.add('active');
    document.getElementById('tab-edit').classList.remove('active');
    document.getElementById('panel-new').classList.remove('hidden');
    document.getElementById('panel-edit').classList.add('hidden');
  });

  document.getElementById('tab-edit').addEventListener('click', function() {
    editMode = true;
    document.getElementById('tab-edit').classList.add('active');
    document.getElementById('tab-new').classList.remove('active');
    document.getElementById('panel-edit').classList.remove('hidden');
    document.getElementById('panel-new').classList.add('hidden');
  });

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
        setStatus('Redigera JSON i förhandsvisningen och spara.');
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

  function showPreview(recipe) {
    currentRecipe = recipe;
    previewTitle.textContent = recipe.title || recipe.id;
    previewJson.textContent = JSON.stringify(recipe, null, 2);
    previewEl.classList.add('visible');
    if (recipe.image) {
      previewImg.src = imageSrcForRecipe(recipe);
      previewImageWrap.classList.remove('hidden');
      previewImg.classList.remove('hidden');
      if (recipeExistsInDb(recipe.id)) {
        btnRegenImage.classList.remove('hidden');
      } else {
        btnRegenImage.classList.add('hidden');
      }
    } else {
      previewImageWrap.classList.add('hidden');
      previewImg.classList.add('hidden');
      btnRegenImage.classList.add('hidden');
    }
  }

  btnRegenImage.addEventListener('click', function() {
    var recipe;
    try {
      recipe = JSON.parse(previewJson.textContent);
    } catch (e) {
      setStatus('Ogiltig JSON i förhandsvisningen', true);
      return;
    }
    if (!recipeExistsInDb(recipe.id)) {
      setStatus('Spara receptet först innan du genererar ny bild.', true);
      return;
    }
    btnRegenImage.disabled = true;
    setStatus('Genererar ny bild med AI…');
    fetch('/api/recipes/' + encodeURIComponent(recipe.id), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        recipe: recipe,
        regenerateImage: true,
        featuredNew: document.getElementById('featured-new').checked
      })
    }).then(function(res) {
      return res.json().then(function(data) {
        if (!res.ok) throw new Error(data.error || 'Bildgenerering misslyckades');
        return data;
      });
    }).then(function(data) {
      editMode = true;
      showPreview(data.recipe);
      previewImg.src = imageSrcForRecipe(data.recipe, true);
      setStatus('Ny bild genererad och sparad.');
    }).catch(function(ex) {
      setStatus(ex.message, true);
    }).finally(function() { btnRegenImage.disabled = false; });
  });

  document.getElementById('btn-parse').addEventListener('click', function() {
    var btn = document.getElementById('btn-parse');
    btn.disabled = true;
    setStatus('Tolkar med Gemini…');
    fetch('/api/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        text: document.getElementById('text').value,
        sourceUrl: document.getElementById('sourceUrl').value,
        imageBase64: imageBase64,
        mimeType: mimeType
      })
    }).then(function(res) {
      return res.json().then(function(data) {
        if (!res.ok) throw new Error(data.error || 'Parse misslyckades');
        return data;
      });
    }).then(function(data) {
      editMode = false;
      showPreview(data.recipe);
      setStatus('Granska och spara när du är nöjd.');
    }).catch(function(ex) {
      setStatus(ex.message, true);
    }).finally(function() { btn.disabled = false; });
  });

  document.getElementById('btn-save').addEventListener('click', function() {
    if (!currentRecipe) return;
    var btn = document.getElementById('btn-save');
    btn.disabled = true;
    setStatus('Sparar och genererar bild…');

    var recipe;
    try {
      recipe = JSON.parse(previewJson.textContent);
    } catch (e) {
      setStatus('Ogiltig JSON i förhandsvisningen', true);
      btn.disabled = false;
      return;
    }

    var url = editMode
      ? '/api/recipes/' + encodeURIComponent(recipe.id)
      : '/api/recipes';
    var method = editMode ? 'PUT' : 'POST';

    fetch(url, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        recipe: recipe,
        imageBase64: imageBase64,
        mimeType: mimeType,
        featuredNew: document.getElementById('featured-new').checked,
        regenerateImage: editMode && !!imageBase64
      })
    }).then(function(res) {
      return res.json().then(function(data) {
        if (!res.ok) throw new Error((data.details && data.details.join(' · ')) || data.error || 'Sparning misslyckades');
        return data;
      });
    }).then(function(data) {
      showPreview(data.recipe);
      setStatus('Sparat! ' + (editMode ? 'Uppdaterat.' : 'Nytt recept tillagt.'));
      var saved = data.recipe;
      var ix = -1;
      for (var i = 0; i < recipeList.length; i++) {
        if (recipeList[i].id === saved.id) { ix = i; break; }
      }
      if (ix === -1) recipeList.push({ id: saved.id, title: saved.title });
      else recipeList[ix].title = saved.title;
      populateEditSelect(saved.id);
      if (!editMode) {
        document.getElementById('featured-new').checked = false;
        editMode = true;
      }
    }).catch(function(ex) {
      setStatus(ex.message, true);
    }).finally(function() { btn.disabled = false; });
  });

  function bootEditFromQuery() {
    var editId = new URLSearchParams(location.search).get('edit');
    if (!editId) return;
    document.getElementById('tab-edit').click();
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
