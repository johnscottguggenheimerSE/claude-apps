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
  var previewJson = document.getElementById('preview-json');
  var previewImg = document.getElementById('preview-img');
  var previewImageWrap = document.getElementById('preview-image-wrap');
  var btnRegenImage = document.getElementById('btn-regen-image');
  var editSelect = document.getElementById('edit-select');
  var recipeList = [];

  function setStatus(msg, isErr) {
    statusEl.textContent = msg || '';
    statusEl.className = 'status' + (isErr ? ' err' : '');
  }

  function clearPendingImage() {
    pendingImageBase64 = null;
    pendingMimeType = null;
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

  function showCreatePanel() {
    editMode = false;
    document.getElementById('tab-create').classList.add('active');
    document.getElementById('tab-edit').classList.remove('active');
    document.getElementById('panel-create').classList.remove('hidden');
    document.getElementById('panel-edit').classList.add('hidden');
  }

  function showEditPanel() {
    editMode = true;
    document.getElementById('tab-edit').classList.add('active');
    document.getElementById('tab-create').classList.remove('active');
    document.getElementById('panel-edit').classList.remove('hidden');
    document.getElementById('panel-create').classList.add('hidden');
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
        setStatus('Redigera JSON och spara, eller generera ny bild med AI.');
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

    if (pendingImageBase64 && pendingMimeType) {
      previewImg.src = 'data:' + pendingMimeType + ';base64,' + pendingImageBase64;
      previewImageWrap.classList.remove('hidden');
      previewImg.classList.remove('hidden');
      btnRegenImage.classList.add('hidden');
      previewHint.textContent = 'Uppladdad bild sparas utan AI. Justera JSON om du vill, sedan spara.';
    } else if (recipe.image) {
      previewImg.src = imageSrcForRecipe(recipe);
      previewImageWrap.classList.remove('hidden');
      previewImg.classList.remove('hidden');
      if (recipeExistsInDb(recipe.id)) {
        btnRegenImage.classList.remove('hidden');
        previewHint.textContent = 'Justera JSON eller generera ny bild med AI.';
      } else {
        btnRegenImage.classList.add('hidden');
        previewHint.textContent = 'Justera JSON om du vill, sedan spara.';
      }
    } else {
      previewImageWrap.classList.add('hidden');
      previewImg.classList.add('hidden');
      btnRegenImage.classList.add('hidden');
      previewHint.textContent = 'Ingen bild än — lägg till i Redigera efter sparning, eller generera med AI där.';
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
    var sourceLabel = document.getElementById('source-label').value.trim();
    if (!text && !pendingImageBase64) {
      setStatus('Klistra in text eller lägg till en bild.', true);
      return;
    }
    if (sourceLabel) text = (text ? text + '\n\n' : '') + 'Källa: ' + sourceLabel;
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
      if (sourceLabel && (!data.recipe.source || data.recipe.source === 'Okänd källa')) {
        data.recipe.source = sourceLabel;
      }
      showPreview(data.recipe);
      setStatus('Granska JSON nedan och spara när du är nöjd.');
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
          ? 'Bild från sidan ingår vid sparning. Granska och spara.'
          : 'Ingen bild hittades på sidan — lägg till i Redigera efter sparning.'
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
      showPreview(data.recipe);
      setStatus('Granska och spara. Samma bild sparas utan AI om du vill.');
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
