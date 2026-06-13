/* Receptschema — delas mellan app (runtime) och scripts/validate-recipes.mjs */
var RecipeValidate = (function() {
  var VALID_CATEGORIES = ['middag', 'asiatisk', 'sallad', 'bakning'];
  var VALID_UNITS = ['g', 'msk', 'tsk', 'st', 'pinch', 'näve', 'strimlor'];
  var MACRO_TOLERANCE = 0.25;

  function isUrl(s) {
    return typeof s === 'string' && /^https?:\/\//i.test(s);
  }

  function sumIngredientMacros(groups) {
    var total = { kcal: 0, prot: 0, carb: 0, fat: 0 };
    var count = 0;
    if (!groups) return null;
    groups.forEach(function(g) {
      if (!g.ingredients) return;
      g.ingredients.forEach(function(ing) {
        if (!ing.macros) return;
        count++;
        total.kcal += ing.macros.kcal || 0;
        total.prot += ing.macros.prot || 0;
        total.carb += ing.macros.carb || 0;
        total.fat += ing.macros.fat || 0;
      });
    });
    return count > 0 ? total : null;
  }

  function macroDrift(stated, summed) {
    var keys = ['kcal', 'prot', 'carb', 'fat'];
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (!stated[k] || !summed[k]) continue;
      var diff = Math.abs(stated[k] - summed[k]) / stated[k];
      if (diff > MACRO_TOLERANCE) return { key: k, stated: stated[k], summed: summed[k] };
    }
    return null;
  }

  function validateRecipe(r, tagFilterOrder, categoryOrder, seenIds) {
    var errors = [];
    var prefix = r.id ? '[' + r.id + '] ' : '';

    if (!r.id || typeof r.id !== 'string') errors.push(prefix + 'saknar id');
    else if (seenIds[r.id]) errors.push(prefix + 'duplicerat id');
    else seenIds[r.id] = 1;

    if (!r.title) errors.push(prefix + 'saknar title');
    if (!r.emoji) errors.push(prefix + 'saknar emoji');
    if (!r.source) errors.push(prefix + 'saknar source');
    if (r.sourceUrl && r.sourceUrl !== '#' && !isUrl(r.sourceUrl)) {
      errors.push(prefix + 'sourceUrl är inte en giltig http(s)-URL');
    }
    if (VALID_CATEGORIES.indexOf(r.category) === -1) {
      errors.push(prefix + 'ogiltig category: ' + r.category);
    }
    if (!r.tags || !r.tags.length) errors.push(prefix + 'saknar tags');
    else {
      r.tags.forEach(function(t) {
        if (tagFilterOrder.indexOf(t) === -1) errors.push(prefix + 'okänd tag: ' + t);
      });
    }
    if (!r.badges || !r.badges.length) errors.push(prefix + 'saknar badges');
    if (!r.macros) errors.push(prefix + 'saknar macros');
    else {
      ['kcal', 'prot', 'carb', 'fat'].forEach(function(k) {
        if (typeof r.macros[k] !== 'number' || r.macros[k] < 0) {
          errors.push(prefix + 'macros.' + k + ' ogiltigt');
        }
      });
    }
    if (!r.baseServings || typeof r.baseServings !== 'number' || r.baseServings < 1) {
      errors.push(prefix + 'baseServings saknas eller är < 1');
    }
    if (!r.groups || !r.groups.length) errors.push(prefix + 'saknar groups');
    else {
      r.groups.forEach(function(g, gi) {
        if (!g.name) errors.push(prefix + 'group ' + gi + ' saknar name');
        if (!g.ingredients || !g.ingredients.length) errors.push(prefix + 'group ' + gi + ' saknar ingredients');
        else g.ingredients.forEach(function(ing, ii) {
          if (!ing.name) errors.push(prefix + 'ingrediens ' + gi + '/' + ii + ' saknar name');
          if (typeof ing.amount !== 'number') errors.push(prefix + 'ingrediens ' + ing.name + ' saknar amount');
          if (VALID_UNITS.indexOf(ing.unit) === -1) errors.push(prefix + 'ingrediens ' + ing.name + ' ogiltig unit: ' + ing.unit);
        });
      });
    }
    if (!r.steps || r.steps.length < 1) errors.push(prefix + 'saknar steps');
    if (!r.tips || r.tips.length !== 4) errors.push(prefix + 'tips ska ha exakt 4 poster (har ' + (r.tips ? r.tips.length : 0) + ')');
    else if (r.tips[0].title !== 'Seattle') errors.push(prefix + 'första tips ska ha title Seattle');

    var summed = sumIngredientMacros(r.groups);
    if (summed && r.macros) {
      var drift = macroDrift(r.macros, summed);
      if (drift) errors.push(prefix + 'macros.' + drift.key + ' (' + drift.stated + ') skiljer från ingredienssumma (' + Math.round(drift.summed) + ')');
    }

    return errors;
  }

  function validateAll(recipes, tagFilterOrder, categoryOrder) {
    var errors = [];
    var seenIds = {};
    if (!recipes || !recipes.length) errors.push('RECIPES är tom');
    recipes.forEach(function(r) {
      errors = errors.concat(validateRecipe(r, tagFilterOrder, categoryOrder, seenIds));
    });
    return errors;
  }

  function reportAtLoad(recipes, tagFilterOrder, categoryOrder) {
    var errors = validateAll(recipes, tagFilterOrder, categoryOrder);
    if (!errors.length) return;
    console.error('Receptvalidering:', errors);
    var banner = document.createElement('div');
    banner.className = 'recipe-validate-banner';
    banner.setAttribute('role', 'alert');
    var title = document.createElement('strong');
    title.textContent = 'Receptdata har fel — kontrollera konsolen.';
    banner.appendChild(title);
    var list = document.createElement('ul');
    errors.slice(0, 8).forEach(function(msg) {
      var li = document.createElement('li');
      li.textContent = msg;
      list.appendChild(li);
    });
    if (errors.length > 8) {
      var more = document.createElement('li');
      more.textContent = '… och ' + (errors.length - 8) + ' fler';
      list.appendChild(more);
    }
    banner.appendChild(list);
    document.body.insertBefore(banner, document.body.firstChild);
  }

  return {
    VALID_CATEGORIES: VALID_CATEGORIES,
    VALID_UNITS: VALID_UNITS,
    validateAll: validateAll,
    reportAtLoad: reportAtLoad,
    sumIngredientMacros: sumIngredientMacros
  };
})();
