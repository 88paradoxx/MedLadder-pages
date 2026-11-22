/* MedLadder admin: turn pasted plain text into Clinical Cases.
 *
 * Forgiving on purpose: works with text typed by hand, copied from Word, or
 * written by ChatGPT/Claude (markdown **bold**, ### headings, bullets).
 * Several cases can be pasted at once, separated by a line of --- .
 *
 *   Title: Crushing chest pain and a falling BP
 *   Region: Cardiovascular          (name, short name or id: cardio, CVS, heart…)
 *   Level: Core                     (Core / Advanced)
 *   Topic: Acute coronary syndromes (optional; the region's list or your own)
 *   Keywords: RV infarct, V4R       (optional; searchable, never shown)
 *   Tags: NEET PG, INI-CET, USMLE
 *   Summary: A 58-year-old smoker with chest pain.
 *   Minutes: 8          Free: yes   (optional)
 *
 *   Case:
 *   A 58-year-old man presents with…
 *
 *   Step 1
 *   Findings: (optional) new results shown before this question
 *   Q: Which coronary artery is most likely occluded?
 *   A. Left anterior descending
 *   B. Left circumflex
 *   C. Right coronary artery
 *   D. Left main stem
 *   Answer: C
 *   Explanation: ST elevation in III > II points to the RCA…
 *   Key point: Inferior STEMI with STE III > II → RCA.
 *
 * window.MLCaseParse.parse(text, regions) → [{ data, errors[], warnings[] }]
 * where data is the object admin_case_save expects (published: false). */
(function (root) {
  'use strict';

  var LABELS = [
    ['title', /^(?:case\s+)?title|^name$/],
    ['region', /^region|^system|^body\s*region|^speciality|^specialty/],
    ['level', /^level|^difficulty/],
    ['topic', /^topic$|^sub[\s-]*topic|^chapter$/],
    ['keywords', /^(?:search\s*)?key\s*words?$|^search\s*terms?$/],
    ['tags', /^(?:exam\s*)?tags?$|^exams?$|^exam\s*tags?/],
    ['summary', /^summary|^one[\s-]*line(?:\s*summary)?|^teaser|^subtitle/],
    ['minutes', /^minutes|^time|^duration|^est(?:imated)?\.?\s*(?:time|minutes)/],
    ['free', /^free/],
    ['vignette', /^case(?:\s*(?:presentation|stem|history|vignette|text))?$|^vignette|^presentation|^clinical\s*(?:scenario|vignette|case)|^scenario|^history$/],
    ['reveal', /^(?:new\s*)?findings?|^reveal|^update|^progress|^investigations?|^results?|^further\s*(?:info|information|findings)|^next|^later/],
    ['stem', /^q(?:uestion)?$|^stem$|^ques$/],
    ['answer', /^(?:correct\s*)?ans(?:wer)?|^correct(?:\s*option)?|^key$/],
    ['explanation', /^exp(?:lanation|l\.?)?$|^explain|^rationale|^discussion/],
    ['lp', /^key\s*(?:point|learning|message|takeaway)s?|^learning\s*points?|^take[\s-]*home|^pearl|^teaching\s*point|^high[\s-]*yield/]
  ];
  var HEADER_KEYS = { title: 1, region: 1, level: 1, topic: 1, keywords: 1, tags: 1, summary: 1, minutes: 1, free: 1 };

  var REGION_ALIASES = {
    cardio: ['cardio', 'cardiac', 'cardiology', 'cardiovascular', 'cvs', 'heart'],
    resp: ['resp', 'respiratory', 'pulmonology', 'pulmonary', 'pulm', 'chest', 'lung'],
    neuro: ['neuro', 'neurology', 'cns', 'nervous', 'brain', 'neurosurgery'],
    gi: ['gi', 'gastro', 'gastroenterology', 'hepatology', 'hepatobiliary', 'liver', 'git', 'abdomen'],
    renal: ['renal', 'nephrology', 'kidney', 'electrolytes', 'acid', 'urology', 'genitourinary'],
    endo: ['endo', 'endocrine', 'endocrinology', 'metabolic', 'diabetes', 'thyroid'],
    heme: ['heme', 'haem', 'hematology', 'haematology', 'oncology', 'onco', 'blood', 'cancer'],
    id: ['id', 'infectious', 'infection', 'infections', 'microbiology', 'tropical', 'sepsis'],
    msk: ['msk', 'musculoskeletal', 'rheumatology', 'rheum', 'orthopaedics', 'orthopedics', 'ortho', 'bone', 'joint'],
    obgyn: ['obgyn', 'obg', 'obs', 'obstetrics', 'gynaecology', 'gynecology', 'gynae', 'gyn', 'pregnancy'],
    peds: ['peds', 'paeds', 'pediatrics', 'paediatrics', 'pediatric', 'paediatric', 'neonatology', 'neonatal', 'child'],
    psych: ['psych', 'psychiatry', 'psychiatric', 'mental'],
    emerg: ['emerg', 'emergency', 'critical', 'icu', 'trauma', 'toxicology', 'resuscitation', 'casualty']
  };

  function trimBlank(lines) {
    var a = lines.slice();
    while (a.length && !a[0].trim()) a.shift();
    while (a.length && !a[a.length - 1].trim()) a.pop();
    return a;
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  // Markdown-ish inline: **bold**, __bold__, *italic*, _italic_; arrows and sub/superscripts stay as typed.
  function inline(s) {
    return esc(s)
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/__(.+?)__/g, '<b>$1</b>')
      .replace(/(^|[\s(])\*(?!\s)([^*]+?)\*(?=[\s).,;:!?]|$)/g, '$1<i>$2</i>')
      .replace(/(^|[\s(])_(?!\s)([^_]+?)_(?=[\s).,;:!?]|$)/g, '$1<i>$2</i>');
  }
  // Lines → HTML: blank lines make paragraphs, single line breaks stay; bullets keep a "• ".
  function toHtml(lines) {
    var a = trimBlank(lines || []);
    if (!a.length) return '';
    var paras = [], cur = [];
    a.forEach(function (l) {
      if (!l.trim()) { if (cur.length) { paras.push(cur); cur = []; } return; }
      var m = /^\s*(?:[-*•▪◦]|\d+[.)])\s+(.*)$/.exec(l);
      cur.push(m ? '• ' + inline(m[1]) : inline(l.trim()));
    });
    if (cur.length) paras.push(cur);
    return paras.map(function (p) { return '<p>' + p.join('<br>') + '</p>'; }).join('');
  }
  function plain(lines) { return trimBlank(lines || []).map(function (l) { return l.trim(); }).join(' ').replace(/\*\*|__/g, '').replace(/\s+/g, ' ').trim(); }

  // Strip markdown decoration from the start of a line so labels can be found.
  function clean(line) {
    return line.replace(/^\s*(?:#{1,6}\s*|>\s*|[-•▪]\s+)*/, '').replace(/^\*\*\s*/, '').replace(/^__\s*/, '');
  }
  // "**Answer:** C" / "Answer - C" / "ANSWER: c" → ['answer', 'C']
  function labelOf(line) {
    var c = clean(line);
    var m = /^([A-Za-z][A-Za-z .\-/']{0,40}?)\s*(?:\*\*|__)?\s*[:：\-–—]\s*(?:\*\*|__)?\s*(.*)$/.exec(c);
    if (!m) {
      // A label alone on its line, e.g. "Case" or "**Explanation**"
      var m2 = /^([A-Za-z][A-Za-z .\-/']{0,40}?)\s*(?:\*\*|__)?\s*:?\s*$/.exec(c);
      if (!m2) return null;
      m = [null, m2[1], ''];
    }
    var name = m[1].toLowerCase().replace(/[.']/g, '').replace(/\s+/g, ' ').trim();
    for (var i = 0; i < LABELS.length; i++) {
      if (LABELS[i][1].test(name)) {
        // "Case 1" style headings and "Q 2" are steps, handled elsewhere.
        return { key: LABELS[i][0], name: name, rest: (m[2] || '').replace(/(?:\*\*|__)\s*$/, '').trim() };
      }
    }
    return null;
  }
  // "Step 2", "**Step 2:**", "### Step 2 – Investigations", "Question 3: What…", "Q3. What…"
  function stepOf(line) {
    var c = clean(line).replace(/\*\*|__/g, '');
    var m = /^step\s*(\d+)\b\s*[:.)\-–—]?\s*(.*)$/i.exec(c);
    if (m) return { stem: '', title: m[2].trim() };
    m = /^(?:question|q)\s*(\d+)\s*[:.)\-–—]\s*(.*)$/i.exec(c) || /^(?:question|q)\s*(\d+)\s*$/i.exec(c);
    if (m) return { stem: (m[2] || '').trim(), title: '', q: true };
    return null;
  }
  // "A. text", "(b) text", "C) text", "d - text", "A: text"; a trailing ✓ / (correct) / * marks the answer.
  function optionOf(line) {
    var c = clean(line).replace(/^\*\*([A-Ea-e])\*\*/, '$1');
    var m = /^\(?([A-Ea-e])\s*[.):\]\-–]\s*(.+)$/.exec(c);
    if (!m) return null;
    var text = m[2].trim(), mark = false;
    // Options show as plain text: unwrap **bold** / *italic* / _italic_ first.
    text = text.replace(/^\*\*(.+)\*\*$/, '$1').replace(/^\*([^*].*[^*])\*$/, '$1').replace(/^_([^_].*[^_])_$/, '$1');
    var t2 = text.replace(/\s*(?:✓|✔|✅|\(correct(?: answer)?\)|\[correct\]|←\s*correct|\s\*)\s*$/i, '');
    if (t2 !== text) { mark = true; text = t2.trim(); }
    text = text.replace(/\*\*|__/g, '').replace(/^\*([^*].*[^*])\*$/, '$1');
    return { key: m[1].toUpperCase(), text: text, mark: mark };
  }

  function matchRegion(v, regions) {
    var s = String(v || '').toLowerCase().replace(/[^a-z&\s]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!s) return null;
    var ids = (regions || []).map(function (r) { return r.id; });
    for (var i = 0; i < (regions || []).length; i++) {
      var r = regions[i];
      if (s === r.id || s === r.name.toLowerCase()) return r.id;
    }
    var words = s.split(' ');
    for (var id in REGION_ALIASES) {
      if (ids.length && ids.indexOf(id) === -1) continue;
      if (REGION_ALIASES[id].some(function (a) { return words.indexOf(a) !== -1; })) return id;
    }
    for (var j = 0; j < (regions || []).length; j++) {
      if (regions[j].name.toLowerCase().indexOf(words[0]) === 0) return regions[j].id;
    }
    return null;
  }
  // Use the region's own spelling when the pasted topic matches one (case-insensitive,
  // "&" = "and"); otherwise keep the topic as typed.
  function matchTopic(v, regionId, regions) {
    var t = plain([v || '']);
    if (!t) return '';
    var norm = function (x) { return x.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim(); };
    var r = (regions || []).filter(function (x) { return x.id === regionId; })[0];
    var hit = r && r.topics ? r.topics.filter(function (x) { return norm(x) === norm(t) || norm(x).replace(/s$/, '') === norm(t).replace(/s$/, ''); })[0] : null;
    return hit || t;
  }
  function matchLevel(v) {
    var s = String(v || '').toLowerCase();
    if (/adv|super|\bss\b|hard|difficult|senior/.test(s)) return 'advanced';
    if (/core|basic|easy|standard|essential|beginner|ug|pg/.test(s)) return 'core';
    return null;
  }

  function parseOne(text, regions, n) {
    var lines = String(text).replace(/\r\n?/g, '\n').split('\n');
    var head = {}, vignette = [], steps = [], errors = [], warnings = [];
    var cur = null;            // current step
    var block = null;          // where free lines go: 'vignette' | 'reveal' | 'stem' | 'explanation' | 'lp' | 'summary' | 'pre'
    var preamble = [];         // text before any label (used as the case if no "Case:" label)
    function newStep() { cur = { reveal: [], stem: [], options: [], answer: '', explanation: [], lp: [], marked: '' }; steps.push(cur); return cur; }
    function target() {
      if (block === 'vignette') return vignette;
      if (block === 'pre') return preamble;
      if (block === 'summary') return (head.summaryLines = head.summaryLines || []);
      if (!cur) return preamble;
      return cur[block] || preamble;
    }

    lines.forEach(function (raw) {
      var line = raw.replace(/\s+$/, '');
      if (/^\s*(?:\*{3,}|_{3,}|={3,})\s*$/.test(line)) return;   // decorative rules
      var st = stepOf(line);
      // A markdown heading ("### Clinical Case: Fever…") is a heading, not case text.
      // Its text becomes the title when no "Title:" line is given.
      if (!st && /^\s*#{1,6}\s/.test(line)) {
        var hl = labelOf(line);
        if (!hl || !HEADER_KEYS[hl.key]) {
          var ht = clean(line).replace(/\*\*|__/g, '').trim();
          ht = ht.replace(/^(?:clinical\s*)?case(?:\s*(?:study|presentation|\d+))?\s*[:\-–—]\s*/i, '');
          if (!head.headingTitle && ht && !/^(?:clinical\s*)?case(?:\s*(?:study|presentation|\d+))?$/i.test(ht)) head.headingTitle = ht;
          if (!/^(?:case|vignette|presentation|clinical)/i.test(clean(line).replace(/\*\*|__/g, '')) || ht !== clean(line).replace(/\*\*|__/g, '').trim()) return;
        }
      }
      if (st) {
        // "Step 1" then "Question 1: …" is one step, not two.
        if (!(st.q && cur && !cur.stem.length && !cur.options.length && !cur.answer)) newStep();
        if (st.stem) cur.stem.push(st.stem);
        block = st.stem ? 'stem' : 'reveal';
        return;
      }
      var lb = labelOf(line);
      // "Time: 2 hours" or "Summary: …" inside the case or a step is text, not a header field.
      if (lb && HEADER_KEYS[lb.key] && (lb.key === 'minutes' || lb.key === 'free' || lb.key === 'summary' || lb.key === 'keywords') && (cur || vignette.length)) lb = null;
      if (lb && HEADER_KEYS[lb.key]) {
        if (lb.key === 'summary') { head.summaryLines = lb.rest ? [lb.rest] : []; block = 'summary'; }
        else { head[lb.key] = lb.rest; block = null; }
        return;
      }
      if (lb && lb.key === 'vignette') {
        block = 'vignette';
        // "Case:" opens the case; a later "History: …" line inside it is kept as written.
        if (vignette.length) vignette.push(line); else if (lb.rest) vignette.push(lb.rest);
        return;
      }
      // Before the first question, "Investigations: …" or "Results: …" are part of the case.
      if (lb && lb.key === 'reveal' && !cur && !/^(?:new\s*)?findings?$|^reveal/.test(lb.name)) {
        if (block !== 'vignette' && block !== 'pre') block = vignette.length ? 'vignette' : 'pre';
        target().push(line);
        return;
      }
      if (lb && (lb.key === 'reveal' || lb.key === 'stem')) {
        if (!cur || (lb.key === 'reveal' && (cur.stem.length || cur.options.length)) || (lb.key === 'stem' && (cur.options.length || cur.answer))) newStep();
        block = lb.key;
        // Keep labels like "Investigations:" in the findings; drop plain "Findings:" / "Q:".
        if (lb.key === 'reveal' && !/^(?:new\s*)?findings?$|^reveal/.test(lb.name)) cur.reveal.push(line);
        else if (lb.rest) cur[lb.key].push(lb.rest);
        return;
      }
      if (lb && lb.key === 'answer') {
        if (!cur) newStep();
        var am = /^\(?\s*(?:option\s*)?([A-Ea-e])\b/.exec(lb.rest.replace(/\*\*|__/g, ''));
        cur.answer = am ? am[1].toUpperCase() : '';
        cur.answerRaw = lb.rest;
        // "Answer: C — because …" : the rest becomes the start of the explanation
        var after = lb.rest.replace(/\*\*|__/g, '').replace(/^\(?\s*(?:option\s*)?[A-Ea-e]\b\)?\s*[.):\-–—]?\s*/, '');
        if (am && after && after.length > 2 && !/^[A-Za-z][^.]{0,60}$/.test(after) ) cur.explanation.push(after);
        block = 'explanation';
        return;
      }
      if (lb && (lb.key === 'explanation' || lb.key === 'lp')) {
        if (!cur) newStep();
        block = lb.key;
        if (lb.rest) cur[lb.key].push(lb.rest);
        return;
      }
      // Options belong to the question being written.
      var op = (cur && (block === 'stem' || block === 'options' || block === 'reveal')) || (!cur && (block === 'pre' || block === 'vignette')) ? optionOf(line) : null;
      // Options go A, B, C… in order, so "E. coli grew in culture" in a question is not option E.
      if (op) {
        var have = cur ? cur.options : [];
        var want = have.length ? String.fromCharCode(have[have.length - 1].key.charCodeAt(0) + 1) : 'A';
        if (op.key !== want && !(have.length && have.some(function (o) { return o.key === op.key; }))) op = null;
      }
      if (op) {
        if (!cur) newStep();
        if (!cur.stem.length && !cur.options.length && block !== 'stem') {
          // No "Q:" label: the last paragraph of findings / preamble is the question.
          var src = cur.reveal.length ? cur.reveal : (steps.length === 1 && vignette.length ? vignette : preamble);
          var tail = trimBlank(src), qi = tail.length - 1, start = qi;
          while (start > 0 && tail[start - 1].trim()) start--;
          // Within that paragraph, the question starts at its last line ending in "?" or ":".
          for (var k = tail.length - 1; k >= start; k--) { if (/[?:]\s*(?:\*\*)?\s*$/.test(tail[k])) { qi = k; break; } qi = start; }
          cur.stem = tail.slice(qi);
          src.length = 0; Array.prototype.push.apply(src, tail.slice(0, qi));
        }
        if (cur.options.some(function (o) { return o.key === op.key; })) warnings.push('Step ' + steps.length + ': option ' + op.key + ' appears twice; kept the first.');
        else cur.options.push(op);
        if (op.mark) cur.marked = op.key;
        block = 'options';
        return;
      }
      if (block === 'options') {
        if (!line.trim()) return;
        // A wrapped option line continues the last option.
        var last = cur.options[cur.options.length - 1];
        if (last && /^\s{2,}\S/.test(raw)) { last.text += ' ' + line.trim(); return; }
        block = 'explanation';
      }
      if (block === null && !line.trim()) return;
      if (block === null) block = cur ? 'explanation' : (vignette.length ? 'vignette' : 'pre');
      target().push(line);
    });

    // No "Case:" label: text before the first step is the case.
    if (!vignette.length && preamble.length) { vignette = preamble; preamble = []; }

    var regionId = matchRegion(head.region, regions);
    if (!head.region) errors.push('Region is missing (e.g. "Region: Cardiovascular").');
    else if (!regionId) errors.push('Region “' + head.region + '” not recognised. Use one of: ' + (regions || []).map(function (r) { return r.name; }).join(', ') + '.');
    var level = matchLevel(head.level);
    if (!head.level) { level = 'core'; warnings.push('No level given; set to Core.'); }
    else if (!level) { level = 'core'; warnings.push('Level “' + head.level + '” not recognised; set to Core.'); }
    var title = plain([head.title || head.headingTitle || '']);
    if (!title) errors.push('Title is missing (e.g. "Title: Crushing chest pain").');
    var vig = toHtml(vignette);
    if (vig.replace(/<[^>]+>/g, '').trim().length < 10) errors.push('Case presentation is missing (start it with "Case:").');
    if (!steps.length) errors.push('No question found. Start each one with "Step 1" or "Q:".');

    var outSteps = steps.map(function (s, i) {
      var n2 = i + 1, ans = s.answer || s.marked;
      var stem = toHtml(s.stem);
      if (!stem) errors.push('Step ' + n2 + ': question is missing (start it with "Q:").');
      if (s.options.length < 2) errors.push('Step ' + n2 + ': needs at least two options (A. … B. …).');
      if (!ans) errors.push('Step ' + n2 + ': answer is missing (e.g. "Answer: C").');
      else if (!s.options.some(function (o) { return o.key === ans; })) errors.push('Step ' + n2 + ': answer ' + ans + ' is not one of the options.');
      if (s.answer && s.marked && s.answer !== s.marked) warnings.push('Step ' + n2 + ': option ' + s.marked + ' is marked but the answer line says ' + s.answer + '; used ' + s.answer + '.');
      var exp = toHtml(s.explanation);
      if (!exp) warnings.push('Step ' + n2 + ': no explanation.');
      var lp = plain(s.lp);
      if (!lp) warnings.push('Step ' + n2 + ': no key point.');
      return {
        reveal: toHtml(s.reveal), stem: stem,
        options: s.options.map(function (o) { return { key: o.key, text: o.text.replace(/\*\*|__/g, '').trim() }; }),
        correct_key: ans || 'A', explanation: exp, learning_point: lp
      };
    });
    if (outSteps.length > 15) errors.push('A case can have at most 15 steps (this one has ' + outSteps.length + ').');

    var tags = String(head.tags || '').split(/[,;|/]/).map(function (t) { return t.replace(/\*\*|__/g, '').trim(); }).filter(Boolean);
    var minutes = parseInt(head.minutes, 10);
    return {
      index: n,
      data: {
        id: null, region_id: regionId || '', level: level, title: title,
        topic: matchTopic(head.topic, regionId, regions), keywords: plain([head.keywords || '']),
        summary: plain(head.summaryLines || []), exam_tags: tags,
        vignette: vig, est_minutes: minutes > 0 ? Math.min(minutes, 120) : Math.max(4, Math.min(30, outSteps.length * 2 + 2)),
        sort: 0, is_free: /^(y|yes|true|1|free)/i.test(String(head.free || '').trim()), published: false,
        steps: outSteps
      },
      errors: errors, warnings: warnings
    };
  }

  // Split on lines that are only --- (3 or more dashes, or ===), and also start
  // a new case at every further "Title:" line, so --- is optional.
  function parse(text, regions) {
    var parts = String(text || '').replace(/\r\n?/g, '\n').split(/\n[ \t]*(?:-{3,}|={3,})[ \t]*\n/);
    var out = [];
    parts.forEach(function (p) {
      var chunk = [], seenTitle = false;
      p.split('\n').forEach(function (line) {
        var lb = labelOf(line);
        if (lb && lb.key === 'title') {
          if (seenTitle) { out.push(chunk.join('\n')); chunk = []; }
          seenTitle = true;
        }
        chunk.push(line);
      });
      out.push(chunk.join('\n'));
    });
    return out.filter(function (p) { return p.trim(); }).map(function (p, i) { return parseOne(p, regions, i + 1); });
  }

  var EXAMPLE = [
    'Title: Crushing chest pain and a falling BP',
    'Region: Cardiovascular',
    'Level: Core',
    'Topic: Acute coronary syndromes',
    'Keywords: right ventricular infarction, RCA, V4R',
    'Tags: NEET PG, INI-CET, USMLE',
    'Summary: A 58-year-old smoker with 40 minutes of central chest pain.',
    'Free: no',
    '',
    'Case:',
    'A 58-year-old man presents with **40 minutes of crushing central chest pain** radiating to the jaw.',
    'Pulse 54/min, BP 108/70 mmHg. JVP raised, chest clear.',
    'ECG: 3 mm ST elevation in II, III and aVF.',
    '',
    'Step 1',
    'Q: Which coronary artery is most likely occluded?',
    'A. Left anterior descending artery',
    'B. Left circumflex artery',
    'C. Right coronary artery',
    'D. Left main stem',
    'Answer: C',
    'Explanation: ST elevation in III greater than II, with reciprocal change in I and aVL, points to the **right coronary artery**.',
    'Key point: Inferior STEMI with STE III > II → RCA.',
    '',
    'Step 2',
    'Findings: After sublingual nitroglycerin his BP falls to 78/50 mmHg. Lungs remain clear.',
    'Q: What is the best next step to confirm the cause?',
    'A. Right-sided chest leads (V4R)',
    'B. CT pulmonary angiogram',
    'C. Chest X-ray',
    'D. Repeat troponin',
    'Answer: A',
    'Explanation: Hypotension, raised JVP and clear lungs after a nitrate suggest **right ventricular infarction**.',
    'Key point: Inferior STEMI + hypotension + clear lungs → record V4R.',
    '',
    '---',
    '',
    'Title: (next case…)'
  ].join('\n');

  root.MLCaseParse = { parse: parse, example: EXAMPLE, _toHtml: toHtml, _matchRegion: matchRegion };
})(typeof window !== 'undefined' ? window : globalThis);
