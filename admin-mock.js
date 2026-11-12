/* MedLadder mock-test admin panel. Admin-only via app_metadata.role='admin'.
 * All writes go through role-gated RPCs (see supabase migration). */
(function () {
  'use strict';

  var SUPABASE_URL = 'https://groeibwykzrliphzzruk.supabase.co';
  var SUPABASE_ANON_KEY = 'sb_publishable_tXvgKaWrUfWlpy8SB3c1mQ_ZMrHxzVY';

  var sb = null;
  var editingTestId = null;
  var editingQId = null;
  var bulkParsed = [];
  var subjMenuState = null;
  var subjMenuBuilt = false;

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  /* Admin question list: escape everything, then restore whitelisted <img>
   * tags (https src only) so image questions show their images. */
  function renderAdminQText(t) {
    var html = esc(t);
    return html.replace(/&lt;img\s+src=&quot;(https?:\/\/[^&\s"]+)&quot;(\s+alt=&quot;([^&]*?)&quot;)?\s*\/?&gt;/gi,
      function (m, src, _a, alt) {
        return '<img class="am-qimg" loading="lazy" src="' + esc(adminImgUrl(src.replace(/&amp;/g, '&'))) +
          '" alt="' + (alt || 'Clinical exhibit') + '">';
      });
  }
  function toast(msg) {
    var t = $('toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(t._h); t._h = setTimeout(function () { t.hidden = true; }, 3200);
  }
  function rpcErr(e) {
    var m = (e && e.message) || '';
    if (m.indexOf('NOT_ADMIN') !== -1) return 'Not authorized as admin.';
    if (m.indexOf('BAD_ANSWER') !== -1) return 'Answer must be A–E.';
    if (m.indexOf('BAD_WINDOW') !== -1) return 'End time must be after start time.';
    if (m.indexOf('TEST_NOT_FOUND') !== -1) return 'Test not found.';
    // BAD_MODULES must be checked before BAD_MODULE (substring).
    if (m.indexOf('BAD_MODULES') !== -1) return 'Please select at least one topic.';
    if (m.indexOf('BAD_MODULE') !== -1) return 'Please pick a subject and topic first.';
    if (m.indexOf('BAD_QUESTION') !== -1) return 'Please enter the question text.';
    if (m.indexOf('BAD_OPTION') !== -1) return 'Options A–D are required.';
    if (m.indexOf('BAD_EXPLANATION') !== -1) return 'Please add an explanation.';
    if (m.indexOf('BAD_EXAM') !== -1) return 'Pick NEET PG, INICET or FMGE.';
    if (m.indexOf('BAD_SESSION') !== -1) return 'Session must look like 2026 or May 2026.';
    if (m.indexOf('NO_ROWS') !== -1) return 'There are no questions to save.';
    if (m.indexOf('TOO_MANY_ROWS') !== -1) return 'One save takes at most 300 questions.';
    if (m.indexOf('FLAG_NOT_FOUND') !== -1) return 'Flag not found — it may have been handled already.';
    if (m.indexOf('FLAG_CLOSED') !== -1) return 'This flag is already resolved or dismissed.';
    if (m.indexOf('QUESTION_NOT_FOUND') !== -1) return 'Bank question not found.';
    if (m.indexOf('BAD_STATUS') !== -1) return 'Unknown flag status.';
    var ml = m.toLowerCase();
    if (ml.indexOf('expired') !== -1)
      return 'Your session expired — please sign out and sign back in, then retry.';
    return 'Save failed: ' + (m || 'no response from server') + ' — please retry or share this message for support.';
  }
  function toLocalInput(iso) {
    var d = new Date(iso);
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
      'T' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function showView(id) {
    ['gateView', 'homeView', 'testsView', 'editorView', 'bankView', 'flaggedView', 'qotdView', 'editQView', 'proView', 'usageView'].forEach(function (v) {
      $(v).hidden = v !== id;
    });
    window.scrollTo(0, 0);
  }

  /* ---------- subject/topic picker menu ----------
   * Subjects come from window.SYLLABUS_DATA (same file the main site uses),
   * so subject/topic names and module ids match the bank exactly. Each
   * subject is a collapsible header; expanding it reveals its topics.
   * Single mode: clicking a topic selects it. Multi mode: topics are
   * checkboxes. Returns a state object whose .selected array the caller
   * reads at submit time. */
  function buildTopicMenu(container, multi, onChange) {
    container.innerHTML = '';
    var data = (window.SYLLABUS_DATA && window.SYLLABUS_DATA.length)
      ? window.SYLLABUS_DATA : [];
    if (!data.length) {
      container.innerHTML = '<p class="am-hint">Subject list failed to load. Refresh the page.</p>';
      return { selected: [] };
    }
    var state = { selected: [] };
    data.forEach(function (subj) {
      var wrap = document.createElement('div');
      wrap.className = 'am-card';
      var head = document.createElement('button');
      head.type = 'button';
      head.className = 'am-subj-head';
      head.textContent = subj.name + ' · ' + subj.modules.length + ' topics';
      var topicsDiv = document.createElement('div');
      topicsDiv.className = 'am-topics';
      topicsDiv.hidden = true;
      head.onclick = function () { topicsDiv.hidden = !topicsDiv.hidden; };
      subj.modules.forEach(function (mod) {
        if (multi) {
          var row = document.createElement('label');
          row.className = 'am-topic-row';
          var cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.onchange = function () {
            if (cb.checked) {
              state.selected.push({ id: mod.id, name: mod.name, subject: subj.name });
            } else {
              state.selected = state.selected.filter(function (s) { return s.id !== mod.id; });
            }
            onChange(state.selected);
          };
          row.appendChild(cb);
          row.appendChild(document.createTextNode(' ' + mod.name));
          topicsDiv.appendChild(row);
        } else {
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'am-topic-btn';
          btn.textContent = mod.name;
          btn.onclick = function () {
            Array.prototype.forEach.call(
              container.querySelectorAll('.am-topic-btn'),
              function (b) { b.classList.remove('selected'); });
            btn.classList.add('selected');
            state.selected = [{ id: mod.id, name: mod.name, subject: subj.name }];
            onChange(state.selected);
          };
          topicsDiv.appendChild(btn);
        }
      });
      wrap.appendChild(head);
      wrap.appendChild(topicsDiv);
      container.appendChild(wrap);
    });
    return state;
  }

  /* ---------- question bank authoring ---------- */
  function populateBqDefaults() {
    var subjSel = $('bqSubj'), topicSel = $('bqTopic');
    if (!subjSel || !topicSel) return;
    var idx = bulkBuildIndex();
    if (!idx.subjects.length) {
      subjSel.innerHTML = '<option value="">Subject list failed to load</option>';
      subjSel.disabled = true; topicSel.disabled = true;
      return;
    }
    subjSel.disabled = false;
    var curSubj = subjSel.value, curTopic = topicSel.value;
    subjSel.innerHTML = '<option value="">Select subject</option>';
    idx.subjects.forEach(function (s) {
      var o = document.createElement('option');
      o.value = s.name; o.textContent = s.name;
      subjSel.appendChild(o);
    });
    if (curSubj) subjSel.value = curSubj;
    rebuildBqTopics();
    if (curTopic) topicSel.value = curTopic;
  }

  function rebuildBqTopics() {
    var subjSel = $('bqSubj'), topicSel = $('bqTopic');
    if (!subjSel || !topicSel) return;
    var idx = bulkBuildIndex();
    var subj = idx.bySubject[(subjSel.value || '').toLowerCase()];
    topicSel.innerHTML = '<option value="">Select topic</option>';
    topicSel.disabled = !subj;
    if (!subj) return;
    subj.modules.forEach(function (m) {
      var o = document.createElement('option');
      o.value = m.name; o.textContent = m.name;
      topicSel.appendChild(o);
    });
  }

  /* ---------- bank question images (upload to R2, then insert) ---------- */
  var BANK_IMG_MAX = 768;

  function downscaleBankImage(file) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      var objUrl = URL.createObjectURL(file);
      img.onload = function () {
        var scale = Math.min(1, BANK_IMG_MAX / Math.max(img.naturalWidth, img.naturalHeight));
        var canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(objUrl);
        canvas.toBlob(function (blob) {
          blob ? resolve(blob) : reject(new Error('Could not process that image.'));
        }, 'image/webp', 0.8);
      };
      img.onerror = function () {
        URL.revokeObjectURL(objUrl);
        reject(new Error('That file is not a readable image.'));
      };
      img.src = objUrl;
    });
  }

  function uploadBankImage(blob) {
    return sb.auth.getSession().then(function (res) {
      var token = res.data && res.data.session && res.data.session.access_token;
      if (!token) throw new Error('Sign in again, then retry.');
      var fd = new FormData();
      fd.append('image', blob, 'question.webp');
      return fetch('/api/upload-image', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token },
        body: fd
      });
    }).then(function (r) {
      return r.json().then(function (j) { return { status: r.status, body: j }; });
    }).then(function (out) {
      if (!out.body || !out.body.ok || !out.body.url) {
        throw new Error('Image upload failed. Try again.');
      }
      return out.body.url;
    });
  }

  function bankImgTag(url) {
    return '<p><img src="' + url + '" alt="Question image" loading="lazy" decoding="async" style="max-width:100%;height:auto;object-fit:contain"></p>';
  }

  /* ---------- rich text field (question / explanation editor) ----------
   * Upgrades a <textarea> holding question or explanation HTML into a
   * visual editor: text shows formatted, images show as pictures, and the
   * toolbar can add an image (uploaded to R2 like the Add-question form).
   * "Edit HTML" switches back to the raw source. The textarea stays the
   * source of truth: it is updated on every change, so existing code that
   * reads textarea.value keeps working. Unedited content is never
   * re-serialised, so opening and saving changes nothing by accident.
   *
   * Allowed tags match sanitizeQuestionHtml() in app.js (what students see). */
  var RF_KEEP = { BR: 1, B: 1, STRONG: 1, I: 1, EM: 1, U: 1, S: 1, SUB: 1, SUP: 1, SMALL: 1, SPAN: 1, P: 1, DIV: 1, IMG: 1 };
  var RF_DROP = { SCRIPT: 1, STYLE: 1, IFRAME: 1, OBJECT: 1, EMBED: 1, LINK: 1, META: 1, FORM: 1, INPUT: 1, BUTTON: 1, SELECT: 1, TEXTAREA: 1, SVG: 1, MATH: 1, TEMPLATE: 1 };

  /* Question images moved from Supabase storage to R2; old Supabase links in
     question HTML no longer load, so point them at R2 (same as app.js). */
  var R2_IMAGES_BASE = 'https://pub-5e62ac2b4d1c43fcb7fb6b025a52e189.r2.dev';
  function adminImgUrl(src) {
    try {
      var u = new URL(String(src), location.href);
      if (/\.supabase\.co$/i.test(u.hostname)) {
        var m = u.pathname.match(/^\/storage\/v1\/(?:object|render\/image)\/public\/question-images\/(.+)$/);
        if (m) return R2_IMAGES_BASE + '/' + m[1];
      }
      return u.toString();
    } catch (e) { return String(src || ''); }
  }

  function rfIsHtml(s) { return /<\/?[a-z][^>]*>/i.test(s || ''); }

  function rfClean(html, forEditor) {
    var tpl = document.createElement('template');
    tpl.innerHTML = String(html || '');
    (function walk(parent) {
      Array.prototype.slice.call(parent.childNodes).forEach(function (n) {
        if (n.nodeType === 8) { n.remove(); return; }
        if (n.nodeType !== 1) return;
        var tag = n.tagName.toUpperCase();
        if (RF_DROP[tag]) { n.remove(); return; }
        if (!RF_KEEP[tag]) {
          walk(n);
          while (n.firstChild) parent.insertBefore(n.firstChild, n);
          n.remove();
          return;
        }
        if (tag === 'IMG') {
          var src = n.getAttribute('src') || '';
          if (!/^https?:\/\//i.test(src)) { n.remove(); return; }
          var alt = n.getAttribute('alt') || '';
          Array.prototype.slice.call(n.attributes).forEach(function (a) { n.removeAttribute(a.name); });
          n.setAttribute('src', adminImgUrl(src));
          if (alt) n.setAttribute('alt', alt);
          if (forEditor) n.setAttribute('contenteditable', 'false');
          return;
        }
        Array.prototype.slice.call(n.attributes).forEach(function (a) { n.removeAttribute(a.name); });
        walk(n);
      });
    })(tpl.content);
    return tpl.innerHTML;
  }

  function rfToEditor(v) {
    if (!v) return '';
    if (!rfIsHtml(v)) return esc(v).replace(/\r?\n/g, '<br>');
    return rfClean(v, true);
  }

  function rfFromEditor(ed) {
    var html = rfClean(ed.innerHTML, false)
      .replace(/(<br>\s*)+$/i, '')
      .replace(/<(p|div)>(\s|<br>)*<\/\1>/gi, '')
      .trim();
    return html;
  }

  function richField(ta, opts) {
    opts = opts || {};
    if (ta._rf) return ta._rf;
    var label = ta.parentNode && ta.parentNode.tagName === 'LABEL' ? ta.parentNode : null;
    var wrap = document.createElement('div');
    wrap.className = 'rf' + (label && label.classList.contains('am-wide') ? ' am-wide' : '');
    if (label) {
      /* A contenteditable inside a <label> hands every click to the label's
         control, so the label becomes a plain block. */
      var cap = document.createElement('span');
      cap.className = 'rf-cap';
      Array.prototype.slice.call(label.childNodes).forEach(function (c) {
        if (c !== ta && c.nodeType === 3) cap.appendChild(document.createTextNode(c.textContent.trim()));
      });
      label.parentNode.replaceChild(wrap, label);
      wrap.appendChild(cap);
    } else {
      ta.parentNode.insertBefore(wrap, ta);
    }
    var bar = document.createElement('div');
    bar.className = 'rf-bar';
    bar.innerHTML =
      '<button type="button" data-cmd="bold" title="Bold"><b>B</b></button>' +
      '<button type="button" data-cmd="italic" title="Italic"><i>I</i></button>' +
      '<button type="button" data-cmd="underline" title="Underline"><u>U</u></button>' +
      '<button type="button" data-cmd="superscript" title="Superscript">x<sup>2</sup></button>' +
      '<button type="button" data-cmd="subscript" title="Subscript">x<sub>2</sub></button>' +
      '<span class="rf-sep"></span>' +
      '<button type="button" data-act="img" class="rf-add">＋ Image</button>' +
      '<button type="button" data-act="rmimg" class="rf-rm" hidden>Remove image</button>' +
      '<span class="rf-sp"></span>' +
      '<button type="button" data-act="mode" class="rf-mode">Edit HTML</button>';
    var ed = document.createElement('div');
    ed.className = 'rf-ed';
    ed.contentEditable = 'true';
    ed.setAttribute('role', 'textbox');
    ed.setAttribute('aria-multiline', 'true');
    if (opts.placeholder) ed.setAttribute('data-ph', opts.placeholder);
    var file = document.createElement('input');
    file.type = 'file'; file.accept = 'image/*'; file.hidden = true;
    var status = document.createElement('p');
    status.className = 'am-hint rf-status';
    status.textContent = 'Paste or drop an image into the box, or use ＋ Image.';
    wrap.appendChild(bar); wrap.appendChild(ed); wrap.appendChild(ta); wrap.appendChild(file); wrap.appendChild(status);
    ta.classList.add('rf-src');
    ta.required = false;
    ta.hidden = true;

    var dirty = false, htmlMode = false, selImg = null, range = null;
    ed.innerHTML = rfToEditor(ta.value);

    function sync() { dirty = true; ta.value = rfFromEditor(ed); }
    function saveRange() {
      var s = window.getSelection();
      if (s.rangeCount && ed.contains(s.anchorNode)) range = s.getRangeAt(0).cloneRange();
    }
    function pick(img) {
      if (selImg) selImg.classList.remove('rf-sel');
      selImg = img;
      if (img) img.classList.add('rf-sel');
      bar.querySelector('.rf-rm').hidden = !img;
    }
    function insertNode(node) {
      var s = window.getSelection();
      if (!range || !ed.contains(range.startContainer)) {
        /* No caret placed yet: add the picture at the end. */
        ed.appendChild(node);
        range = document.createRange();
        range.setStartAfter(node); range.collapse(true);
      } else {
        ed.focus();
        s.removeAllRanges(); s.addRange(range);
        var r = s.getRangeAt(0);
        r.deleteContents();
        r.insertNode(node);
        r.setStartAfter(node); r.collapse(true);
        s.removeAllRanges(); s.addRange(r);
      }
      saveRange();
      sync();
    }
    function addImages(files) {
      var list = Array.prototype.filter.call(files || [], function (f) { return /^image\//.test(f.type); });
      if (!list.length) return;
      var n = list.length, done = 0;
      status.textContent = 'Uploading ' + (n === 1 ? 'image' : n + ' images') + '…';
      list.reduce(function (p, f) {
        return p.then(function () {
          return downscaleBankImage(f).then(uploadBankImage).then(function (url) {
            var img = document.createElement('img');
            img.src = url; img.alt = opts.alt || 'Explanation image';
            img.setAttribute('contenteditable', 'false');
            var p2 = document.createElement('p');
            p2.appendChild(img);
            insertNode(p2);
            done++;
          });
        });
      }, Promise.resolve()).then(function () {
        status.textContent = done === 1 ? 'Image added. Save changes to keep it.' : done + ' images added. Save changes to keep them.';
      }).catch(function (e) {
        status.textContent = (e && e.message) || 'Image upload failed.';
        toast(status.textContent);
      });
    }

    ed.addEventListener('input', function () { pick(null); sync(); });
    ed.addEventListener('keyup', saveRange);
    ed.addEventListener('mouseup', saveRange);
    ed.addEventListener('blur', saveRange);
    ed.addEventListener('click', function (e) {
      pick(e.target && e.target.tagName === 'IMG' ? e.target : null);
    });
    ed.addEventListener('keydown', function (e) {
      if (selImg && (e.key === 'Delete' || e.key === 'Backspace')) {
        e.preventDefault();
        bar.querySelector('.rf-rm').click();
      }
    });
    ed.addEventListener('paste', function (e) {
      var cd = e.clipboardData;
      if (!cd) return;
      if (cd.files && cd.files.length) { e.preventDefault(); addImages(cd.files); return; }
      var html = cd.getData('text/html');
      e.preventDefault();
      if (html) document.execCommand('insertHTML', false, rfClean(html, true));
      else document.execCommand('insertText', false, cd.getData('text/plain'));
    });
    ed.addEventListener('dragover', function (e) {
      if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') !== -1) e.preventDefault();
    });
    ed.addEventListener('drop', function (e) {
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
        e.preventDefault();
        addImages(e.dataTransfer.files);
      }
    });
    file.addEventListener('change', function () { addImages(file.files); file.value = ''; });
    ta.addEventListener('input', function () { dirty = true; });

    bar.addEventListener('mousedown', function (e) {
      if (e.target.closest('[data-cmd]')) e.preventDefault();
    });
    bar.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      var cmd = b.getAttribute('data-cmd'), act = b.getAttribute('data-act');
      if (cmd) {
        if (htmlMode) return;
        ed.focus();
        document.execCommand(cmd, false, null);
        sync();
      } else if (act === 'img') {
        saveRange();
        file.click();
      } else if (act === 'rmimg' && selImg) {
        var holder = selImg.parentNode;
        selImg.remove();
        if (holder && holder !== ed && !holder.textContent.trim() && !holder.querySelector('img')) holder.remove();
        pick(null);
        sync();
        status.textContent = 'Image removed. Save changes to keep this.';
      } else if (act === 'mode') {
        htmlMode = !htmlMode;
        if (htmlMode) {
          ta.hidden = false; ed.hidden = true;
          ta.style.minHeight = Math.max(160, ed.offsetHeight) + 'px';
          b.textContent = 'Visual editor';
          ta.focus();
        } else {
          ed.innerHTML = rfToEditor(ta.value);
          ta.hidden = true; ed.hidden = false;
          b.textContent = 'Edit HTML';
        }
        Array.prototype.forEach.call(bar.querySelectorAll('[data-cmd]'), function (x) { x.disabled = htmlMode; });
      }
    });
    try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch (e) { /* older browsers */ }

    ta._rf = {
      dirty: function () { return dirty; },
      refresh: function () { ed.innerHTML = rfToEditor(ta.value); dirty = false; }
    };
    return ta._rf;
  }

  /* Image URL field: a preview of the picture plus Upload / Remove buttons. */
  function imageUrlField(input) {
    var box = document.createElement('div');
    box.className = 'rf-urlbox';
    box.innerHTML = '<img class="rf-urlprev" alt="" hidden>' +
      '<div class="am-row"><button type="button" class="am-btn" data-act="up">Upload image</button>' +
      '<button type="button" class="am-btn" data-act="clear" hidden>Remove</button>' +
      '<span class="am-hint" data-st></span></div><input type="file" accept="image/*" hidden>';
    var host = input.parentNode;
    host.appendChild(box);
    var prev = box.querySelector('img'), fileIn = box.querySelector('input[type=file]');
    var clear = box.querySelector('[data-act=clear]'), st = box.querySelector('[data-st]');
    function show() {
      var v = input.value.trim();
      prev.hidden = !/^https?:\/\//i.test(v);
      if (!prev.hidden) prev.src = adminImgUrl(v);
      clear.hidden = !v;
    }
    prev.onerror = function () { prev.hidden = true; st.textContent = 'This link does not open as an image.'; };
    prev.onload = function () { st.textContent = ''; };
    input.addEventListener('input', show);
    box.querySelector('[data-act=up]').onclick = function () { fileIn.click(); };
    clear.onclick = function () { input.value = ''; show(); st.textContent = 'Image removed. Save changes to keep this.'; };
    fileIn.onchange = function () {
      var f = fileIn.files && fileIn.files[0];
      fileIn.value = '';
      if (!f) return;
      st.textContent = 'Uploading…';
      downscaleBankImage(f).then(uploadBankImage).then(function (url) {
        input.value = url; show();
        st.textContent = 'Uploaded. Save changes to keep it.';
      }).catch(function (e) { st.textContent = (e && e.message) || 'Upload failed.'; });
    };
    show();
  }

  function clearBankImageInput(fileId, prevId, clearId) {
    var input = $(fileId), prev = $(prevId), clearBtn = $(clearId);
    if (input) input.value = '';
    if (prev) { prev.hidden = true; prev.src = ''; }
    if (clearBtn) clearBtn.hidden = true;
  }

  function wireBankImageInput(fileId, prevId, clearId) {
    var input = $(fileId), prev = $(prevId), clearBtn = $(clearId);
    if (!input) return;
    input.addEventListener('change', function () {
      var f = input.files && input.files[0];
      if (!f) { clearBankImageInput(fileId, prevId, clearId); return; }
      prev.src = URL.createObjectURL(f);
      prev.hidden = false;
      clearBtn.hidden = false;
    });
    clearBtn.addEventListener('click', function () {
      clearBankImageInput(fileId, prevId, clearId);
    });
  }

  function submitBankQuestion(ev) {
    ev.preventDefault();
    var subj = $('bqSubj') ? $('bqSubj').value : '';
    var topic = $('bqTopic') ? $('bqTopic').value : '';
    var hit = subj && topic
      ? bulkBuildIndex().byKey[subj.toLowerCase() + '\n' + topic.toLowerCase()] : null;
    if (!hit) { toast('Pick a subject and topic first.'); return; }
    var d = {
      p_module_id: hit.id,
      p_subject: hit.subject,
      p_question_text: $('bqText').value.trim(),
      p_option_a: $('bqA').value.trim(), p_option_b: $('bqB').value.trim(),
      p_option_c: $('bqC').value.trim(), p_option_d: $('bqD').value.trim(),
      p_option_e: $('bqE').value.trim(),
      p_answer: $('bqAns').value, p_explanation: $('bqExpl').value.trim()
    };
    if (!d.p_question_text || !d.p_option_a || !d.p_option_b ||
        !d.p_option_c || !d.p_option_d || !d.p_explanation) {
      toast('Question, options A–D and explanation are required.'); return;
    }
    var submitBtn = document.querySelector('#bankQForm button[type="submit"]');
    var qFile = $('bqQImg') && $('bqQImg').files && $('bqQImg').files[0];
    var eFile = $('bqEImg') && $('bqEImg').files && $('bqEImg').files[0];
    if (submitBtn) submitBtn.disabled = true;
    if (qFile || eFile) $('bankInfo').textContent = 'Uploading image(s)…';
    /* Upload any picked images to R2 first; only then insert the question,
       with the returned URLs attached. If an upload fails, nothing is
       added to the bank. */
    Promise.resolve()
      .then(function () {
        return qFile ? downscaleBankImage(qFile).then(uploadBankImage) : null;
      })
      .then(function (qUrl) {
        if (qUrl) d.p_question_text += '\n' + bankImgTag(qUrl);
        return eFile ? downscaleBankImage(eFile).then(uploadBankImage) : null;
      })
      .then(function (eUrl) {
        if (eUrl) d.p_explanation += '\n' + bankImgTag(eUrl);
        return sb.rpc('admin_add_bank_question', d);
      })
      .then(function (r) {
        if (r.error) { toast(rpcErr(r.error)); $('bankInfo').textContent = ''; return; }
        var num = (r.data && r.data.question_num) || '';
        toast('Added to bank (question #' + num + ').');
        if ($('bqQotd') && $('bqQotd').checked && r.data && r.data.id && $('bqQotdDay').value) {
          var qday = $('bqQotdDay').value;
          sb.from('qotd').upsert({ day: qday, question_id: r.data.id }).then(function (qr) {
            if (qr.error) toast('Added, but could not set it as question of the day: ' + rpcErr(qr.error));
            else toast('Added and set as question of the day for ' + qotdLabel(qday) + '.');
          });
          $('bqQotd').checked = false;
        }
        $('bankInfo').textContent = 'Last added: question #' + num + ' → ' +
          hit.subject + ' / ' + hit.name;
        // Keep the subject/topic: only the question fields are cleared, so the
        // next question goes to the same topic without re-picking.
        ['bqText', 'bqA', 'bqB', 'bqC', 'bqD', 'bqE', 'bqExpl'].forEach(function (id) {
          $(id).value = '';
        });
        $('bqAns').value = 'a';
        clearBankImageInput('bqQImg', 'bqQImgPrev', 'bqQImgClear');
        clearBankImageInput('bqEImg', 'bqEImgPrev', 'bqEImgClear');
      })
      .catch(function (err) {
        toast(err && err.message ? err.message : 'Image upload failed.');
        $('bankInfo').textContent = '';
      })
      .then(function () { if (submitBtn) submitBtn.disabled = false; });
  }

  /* ---------- subject-mock draw ---------- */
  function drawFromTopics() {
    var sel = subjMenuState ? subjMenuState.selected : [];
    if (!sel.length) { toast('Select at least one topic first.'); return; }
    var n = parseInt($('subjFillCount').value, 10) || 50;
    if (!window.confirm('Draw ' + n + ' random questions from ' + sel.length +
        ' topic(s) into this test?')) return;
    sb.rpc('admin_fill_subject_bank', {
      p_test_id: editingTestId,
      p_module_ids: sel.map(function (s) { return s.id; }),
      p_count: n
    }).then(function (r) {
      if (r.error) { toast(rpcErr(r.error)); return; }
      toast('Added ' + (r.data && r.data.added) + ' questions.');
      loadQuestions();
    });
  }

  /* ---------- auth gate ---------- */
  function renderAuth(user) {
    var area = $('authArea');
    if (user) {
      area.innerHTML = '<span>' + esc(user.email || '') + '</span>' +
        '<button class="am-btn" id="signOutBtn">Sign out</button>';
      $('signOutBtn').onclick = function () {
        sb.auth.signOut().then(function () { location.reload(); });
      };
    } else {
      area.innerHTML = '<a class="am-btn" href="/">Sign in on main site first</a>';
    }
  }
  function isAdmin(user) {
    return !!(user && user.app_metadata && user.app_metadata.role === 'admin');
  }

  /* ---------- tests list ---------- */
  function loadTests() {
    showView('testsView');
    var list = $('testList');
    list.innerHTML = '<p class="am-hint">Loading…</p>';
    sb.rpc('admin_list_tests').then(function (res) {
      if (res.error) { toast(rpcErr(res.error)); return; }
      var tests = res.data || [];
      if (!tests.length) {
        list.innerHTML = '<div class="am-card">No tests yet. Create the first one.</div>';
        return;
      }
      list.innerHTML = '';
      tests.forEach(function (t) {
        var row = document.createElement('div');
        row.className = 'am-test-row';
        row.innerHTML =
          '<div class="info"><h3>' + esc(t.title) + '</h3>' +
          '<div class="meta">' + esc(t.exam) + ' · ' + t.question_count + '/' + t.total_questions +
          ' questions · ' + t.submissions + ' submissions<br>' +
          new Date(t.starts_at).toLocaleString() + ' → ' + new Date(t.ends_at).toLocaleString() +
          (t.is_free ? ' · FREE' : ' · PRO') + '</div></div>' +
          '<span class="am-badge ' + t.status + '">' + t.status.toUpperCase() + '</span>' +
          '<button class="am-btn" data-act="edit">Edit</button>' +
          '<button class="am-btn am-btn-danger" data-act="del">Delete</button>';
        row.querySelector('[data-act="edit"]').onclick = function () { openEditor(t.id); };
        row.querySelector('[data-act="del"]').onclick = function () {
          if (window.confirm('Delete "' + t.title + '" and all its questions/attempts?')) {
            sb.rpc('admin_delete_test', { p_test_id: t.id }).then(function (r) {
              if (r.error) toast(rpcErr(r.error)); else { toast('Deleted.'); loadTests(); }
            });
          }
        };
        list.appendChild(row);
      });
    });
  }

  /* ---------- editor ---------- */
  function fillTestForm(t) {
    $('fTitle').value = t.title || '';
    $('fExam').value = t.exam || 'NEET PG';
    $('fDesc').value = t.description || '';
    $('fStarts').value = toLocalInput(t.starts_at);
    $('fEnds').value = toLocalInput(t.ends_at);
    $('fDur').value = t.duration_minutes;
    $('fTotal').value = t.total_questions;
    $('fPos').value = t.positive_marks;
    $('fNeg').value = t.negative_marks;
    $('fFree').value = t.is_free ? 'true' : 'false';
    $('fStatus').value = t.status;
  }

  function openEditor(testId) {
    editingTestId = testId || null;
    editingQId = null;
    $('editorTitle').textContent = testId ? 'Edit test' : 'New test';
    $('testForm').reset();
    $('qSection').hidden = true;
    showView('editorView');
    if (!subjMenuBuilt) {
      subjMenuBuilt = true;
      subjMenuState = buildTopicMenu($('subjMenu'), true, function (sel) {
        $('subjSelInfo').textContent = sel.length
          ? sel.length + ' topic(s) selected.'
          : 'No topics selected.';
      });
    } else {
      // Fresh selection per test: never carry another test's ticks over.
      subjMenuState.selected = [];
      Array.prototype.forEach.call(
        $('subjMenu').querySelectorAll('input[type="checkbox"]'),
        function (cb) { cb.checked = false; });
      $('subjSelInfo').textContent = 'No topics selected.';
    }
    if (testId) {
      // Show the questions UI immediately; fill the form when the fetch lands.
      $('qSection').hidden = false;
      loadQuestions();
      sb.rpc('admin_list_tests').then(function (res) {
        if (res.error) { toast(rpcErr(res.error)); return; }
        var t = (res.data || []).filter(function (x) { return x.id === testId; })[0];
        if (!t) { toast('Test not found — it may have been deleted.'); return; }
        fillTestForm(t);
      });
    }
  }

  function parseDt(v) {
    if (!v) return null;
    var t = new Date(v).getTime();
    return isNaN(t) ? null : new Date(t).toISOString();
  }
  function collectTest() {
    var starts = parseDt($('fStarts').value);
    var ends = parseDt($('fEnds').value);
    var dur = parseInt($('fDur').value, 10);
    var total = parseInt($('fTotal').value, 10);
    var pos = parseFloat($('fPos').value);
    var neg = parseFloat($('fNeg').value);
    if (!starts || !ends) throw new Error('BAD_DATES');
    if (ends <= starts) throw new Error('BAD_WINDOW');
    if (!(dur >= 5 && dur <= 600)) throw new Error('BAD_NUM');
    if (!(total >= 1 && total <= 500)) throw new Error('BAD_NUM');
    if (isNaN(pos) || isNaN(neg)) throw new Error('BAD_NUM');
    return {
      p_title: $('fTitle').value.trim(),
      p_exam: $('fExam').value,
      p_description: $('fDesc').value.trim(),
      p_starts_at: starts,
      p_ends_at: ends,
      p_duration_minutes: dur,
      p_total_questions: total,
      p_positive_marks: pos,
      p_negative_marks: neg,
      p_is_free: $('fFree').value === 'true',
      p_status: $('fStatus').value
    };
  }

  /* ---------- question of the day ---------- */
  function isoDay(d) {
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  function addDays(iso, n) { var d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return isoDay(d); }
  function qotdLabel(iso) {
    var today = isoDay(new Date());
    var d = new Date(iso + 'T12:00:00');
    var nice = d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
    return iso === today ? 'Today, ' + nice : iso === addDays(today, 1) ? 'Tomorrow, ' + nice : nice;
  }
  function plain(t, n) {
    var s = String(t || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    return n && s.length > n ? s.slice(0, n - 1) + '…' : s;
  }
  function hasImage(q) {
    return !!(q && (q.has_image || /<img/i.test(q.question_text || '') ||
      /\b(image|picture|photo|figure|x-?ray|radiograph|ecg|shown|marked|arrow|identify the)\b/i.test(q.question_text || '')));
  }
  function populateQdSubjects() {
    var subjSel = $('qdSubj'), topicSel = $('qdTopic');
    var idx = bulkBuildIndex();
    subjSel.innerHTML = '<option value="">Any subject</option>' + idx.subjects.map(function (s) {
      return '<option>' + esc(s.name) + '</option>';
    }).join('');
    var rebuild = function () {
      var subj = idx.bySubject[(subjSel.value || '').toLowerCase()];
      topicSel.innerHTML = '<option value="">Any topic</option>' + (subj ? subj.modules.map(function (m) {
        return '<option value="' + m.id + '">' + esc(m.name) + '</option>';
      }).join('') : '');
      topicSel.disabled = !subj;
    };
    subjSel.onchange = rebuild;
    rebuild();
  }
  function moduleName(id) {
    var idx = bulkBuildIndex(), hit = null;
    idx.subjects.some(function (s) {
      return s.modules.some(function (m) { if (m.id === id) { hit = s.name + ' / ' + m.name; return true; } return false; });
    });
    return hit || '';
  }
  function loadQotd() {
    showView('qotdView');
    if (!$('qdSubj').options.length) populateQdSubjects();
    var today = isoDay(new Date());
    if (!$('qdDay').value) $('qdDay').value = today;
    $('qdDay').min = today;
    var box = $('qotdSchedule');
    sb.rpc('admin_qotd_schedule', { p_from: today, p_to: addDays(today, 13) }).then(function (res) {
      if (res.error) { box.innerHTML = '<p class="am-hint">' + esc(rpcErr(res.error)) + '</p>'; return; }
      var byDay = {};
      (res.data || []).forEach(function (r) { byDay[r.day] = r; });
      var rows = '';
      for (var i = 0; i < 14; i++) {
        var day = addDays(today, i), r = byDay[day];
        rows += '<div class="am-q qd-day' + (r ? ' set' : '') + '"><div class="qd-day-head"><strong>' + esc(qotdLabel(day)) + '</strong>' +
          (r ? '<span class="am-badge published">Chosen</span>' : '<span class="am-badge draft">Keeps previous</span>') + '</div>' +
          (r ? '<div class="qt">' + esc(plain(r.question_text, 180)) + '</div><div class="am-hint">#' + r.question_id + ' · ' + esc((r.subject || '') + (r.topic ? ' / ' + r.topic : '')) + ' · answer ' + esc(r.answer || '') + '</div>'
             : '<div class="am-hint">Shows the last question you chose before this day.</div>') +
          '<div class="am-row" style="margin:8px 0 0"><button class="am-btn" data-qd-pick="' + day + '">' + (r ? 'Change' : 'Choose') + '</button>' +
          (r ? '<button class="am-btn am-btn-danger" data-qd-clear="' + day + '">Clear</button>' : '') + '</div></div>';
      }
      box.innerHTML = rows;
      Array.prototype.forEach.call(box.querySelectorAll('[data-qd-pick]'), function (b) {
        b.onclick = function () {
          $('qdDay').value = b.getAttribute('data-qd-pick');
          $('qotdPickTitle').textContent = 'Choose a question for ' + qotdLabel($('qdDay').value);
          $('qotdPickTitle').scrollIntoView({ behavior: 'smooth', block: 'start' });
          $('qdSearch').focus();
        };
      });
      Array.prototype.forEach.call(box.querySelectorAll('[data-qd-clear]'), function (b) {
        b.onclick = function () {
          var day2 = b.getAttribute('data-qd-clear');
          sb.from('qotd').delete().eq('day', day2).then(function (r2) {
            if (r2.error) { toast(rpcErr(r2.error)); return; }
            toast(qotdLabel(day2) + ' cleared: it will show the last question chosen before it.');
            loadQotd();
          });
        };
      });
    });
  }
  function searchQotd(recent) {
    var term = recent === true ? '' : ($('qdSearch').value || '').trim();
    var topic = $('qdTopic').value ? parseInt($('qdTopic').value, 10) : null;
    var subjName = $('qdSubj').value;
    var out = $('qdResults');
    var q = sb.from('questions').select('id,question_num,module_id,question_text,option_a,option_b,option_c,option_d,option_e,answer,explanation,has_image,is_pyq');
    if (recent === true) q = q.eq('is_pyq', false);
    else if (/^\d+$/.test(term)) q = q.eq('id', parseInt(term, 10));
    else {
      if (term.length < 3 && !topic) { $('qdInfo').textContent = 'Type at least 3 letters, or pick a topic.'; return; }
      if (term) q = q.ilike('question_text', '%' + term.replace(/[%_]/g, '') + '%');
      if (topic) q = q.eq('module_id', topic);
      else if (subjName) {
        var subj = bulkBuildIndex().bySubject[subjName.toLowerCase()];
        if (subj) q = q.in('module_id', subj.modules.map(function (m) { return m.id; }));
      }
    }
    $('qdInfo').textContent = 'Searching…';
    q.order('id', { ascending: recent !== true }).limit(25).then(function (res) {
      if (res.error) { $('qdInfo').textContent = rpcErr(res.error); return; }
      var rows = res.data || [];
      $('qdInfo').textContent = recent === true ? 'The ' + rows.length + ' questions added to the bank most recently, newest first.'
        : (rows.length ? rows.length + (rows.length === 25 ? '+' : '') + ' found' : 'No questions found.');
      var dayLabel = qotdLabel($('qdDay').value || isoDay(new Date()));
      out.innerHTML = rows.map(function (r) {
        var opts = ['a', 'b', 'c', 'd', 'e'].filter(function (L) { return r['option_' + L]; }).map(function (L) {
          var right = String(r.answer || '').toLowerCase() === L;
          return '<div>' + (right ? '<b>' : '') + L.toUpperCase() + '. ' + esc(plain(r['option_' + L], 120)) + (right ? '</b>' : '') + '</div>';
        }).join('');
        return '<div class="am-q"><div class="am-hint">#' + r.id + ' · ' + esc(moduleName(r.module_id) || (r.is_pyq ? 'Past paper' : '')) +
          (hasImage(r) ? ' · <span style="color:var(--red)">needs an image</span>' : '') + '</div>' +
          '<div class="qt">' + esc(plain(r.question_text, 400)) + '</div><div class="opts">' + opts + '</div>' +
          '<details><summary class="am-hint">Explanation</summary><div class="expl">' + esc(plain(r.explanation, 600)) + '</div></details>' +
          '<div class="am-row" style="margin:8px 0 0"><button class="am-btn am-btn-primary" data-qd-use="' + r.id + '">Use for ' + esc(dayLabel) + '</button></div></div>';
      }).join('');
      Array.prototype.forEach.call(out.querySelectorAll('[data-qd-use]'), function (b) {
        b.onclick = function () {
          var day = $('qdDay').value || isoDay(new Date());
          sb.from('qotd').upsert({ day: day, question_id: parseInt(b.getAttribute('data-qd-use'), 10) }).then(function (r2) {
            if (r2.error) { toast(rpcErr(r2.error)); return; }
            toast('Set as question of the day for ' + qotdLabel(day) + '.');
            loadQotd();
          });
        };
      });
    });
  }

  function wireEditor() {
    $('backBtn').onclick = loadTests;
    $('newTestBtn').onclick = function () { openEditor(null); };
    $('bankBtn').onclick = function () { showView('bankView'); };
    $('flaggedBtn').onclick = function () { loadFlags('open'); };
    $('editQBtn').onclick = openEditQ;
    $('testsBackBtn').onclick = loadHome;
    $('proBackBtn').onclick = loadHome;
    $('usageBackBtn').onclick = loadHome;
    $('proGrantBtn').onclick = function () { proCall('grant'); };
    $('proRevokeBtn').onclick = function () { proCall('revoke'); };
    Array.prototype.forEach.call(document.querySelectorAll('[data-go]'), function (b) {
      b.onclick = function () { homeGo(b.getAttribute('data-go')); };
    });
    $('editQBackBtn').onclick = loadHome;
    $('eqLoadBtn').onclick = function () { eqLoad(0); };
    $('eqSearch').onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); eqLoad(0); } };
    $('eqPrev').onclick = function () { eqLoad(Math.max(0, eqState.offset - eqState.limit)); };
    $('eqNext').onclick = function () { eqLoad(eqState.offset + eqState.limit); };
    $('flaggedBackBtn').onclick = loadHome;
    Array.prototype.forEach.call(document.querySelectorAll('.flag-filter'), function (b) {
      b.onclick = function () { loadFlags(b.getAttribute('data-status')); };
    });
    $('bankBackBtn').onclick = loadHome;
    $('qotdBtn').onclick = loadQotd;
    $('qotdBackBtn').onclick = loadHome;
    $('qdSearchBtn').onclick = function () { searchQotd(false); };
    $('qdRecentBtn').onclick = function () { searchQotd(true); };
    $('qdSearch').onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); searchQotd(false); } };
    $('qdDay').onchange = function () { $('qotdPickTitle').textContent = 'Choose a question for ' + qotdLabel($('qdDay').value); };
    $('qotdToBank').onclick = function (e) {
      e.preventDefault(); showView('bankView');
      if ($('bqQotd')) { $('bqQotd').checked = true; $('bqQotdDay').value = $('qdDay').value || isoDay(new Date()); }
    };
    if ($('bqQotdDay')) $('bqQotdDay').value = isoDay(new Date());
    $('bankQForm').onsubmit = submitBankQuestion;
    wireBankImageInput('bqQImg', 'bqQImgPrev', 'bqQImgClear');
    wireBankImageInput('bqEImg', 'bqEImgPrev', 'bqEImgClear');
    if ($('bqSubj')) $('bqSubj').onchange = rebuildBqTopics;
    populateBqDefaults();
    $('bankBulkParseBtn').onclick = previewBankBulk;
    $('bankBulkImportBtn').onclick = importBankBulk;
    if ($('bankBulkSubj')) $('bankBulkSubj').onchange = rebuildBankBulkTopics;
    populateBankBulkDefaults();
    $('subjFillBtn').onclick = drawFromTopics;
    // Auto-fill the end time when a start time is picked (start + duration),
    // and always derive the duration from the start/end window.
    function syncDuration() {
      var s = new Date($('fStarts').value).getTime();
      var e = new Date($('fEnds').value).getTime();
      if (isNaN(s) || isNaN(e) || e <= s) return;
      $('fDur').value = Math.round((e - s) / 60000);
    }
    $('fStarts').addEventListener('change', function () {
      var s = new Date($('fStarts').value).getTime();
      if (isNaN(s)) return;
      if (!$('fEnds').value) {
        var dur = parseInt($('fDur').value, 10) || 180;
        $('fEnds').value = toLocalInput(new Date(s + dur * 60000).toISOString());
      } else {
        syncDuration();
      }
    });
    $('fEnds').addEventListener('change', syncDuration);
    $('testForm').onsubmit = function (ev) {
      ev.preventDefault();
      var d;
      try {
        d = collectTest();
      } catch (e) {
        if (e.message === 'BAD_DATES') toast('Please set both start and end date/time.');
        else if (e.message === 'BAD_WINDOW') toast('End time must be after start time.');
        else toast('Please check the duration, question count and marks fields.');
        return;
      }
      if (!d.p_title) { toast('Please give the test a title.'); return; }
      if (editingTestId) {
        d.p_test_id = editingTestId;
        sb.rpc('admin_update_test', d).then(function (r) {
          if (r.error) toast(rpcErr(r.error)); else toast('Test saved.');
        });
      } else {
        // admin_create_test has no p_status param (always creates a draft):
        // create first, then apply the chosen status via admin_update_test.
        var createData = {};
        Object.keys(d).forEach(function (k) { if (k !== 'p_status') createData[k] = d[k]; });
        sb.rpc('admin_create_test', createData).then(function (r) {
          if (r.error) { toast(rpcErr(r.error)); return; }
          var newId = r.data.id;
          var afterCreate = function () {
            toast('Test created. Now add questions.');
            openEditor(newId);
          };
          if (d.p_status && d.p_status !== 'draft') {
            var upd = { p_test_id: newId };
            Object.keys(d).forEach(function (k) { upd[k] = d[k]; });
            sb.rpc('admin_update_test', upd).then(function (u) {
              if (u.error) toast(rpcErr(u.error) + ' (status not applied — test saved as draft)');
              afterCreate();
            });
          } else {
            afterCreate();
          }
        });
      }
    };
    $('fillBtn').onclick = function () {
      var n = parseInt($('fillCount').value, 10) || 50;
      if (!window.confirm('Snapshot ' + n + ' random bank questions into this test?')) return;
      sb.rpc('admin_fill_from_bank', { p_test_id: editingTestId, p_count: n })
        .then(function (r) {
          if (r.error) toast(rpcErr(r.error));
          else { toast('Added ' + n + ' questions.'); loadQuestions(); }
        });
    };
    $('qForm').onsubmit = submitQuestion;
    $('bulkParseBtn').onclick = previewBulk;
    $('bulkImportBtn').onclick = importBulk;
    if ($('bulkSubj')) $('bulkSubj').onchange = rebuildBulkTopics;
    populateBulkDefaults();
  }

  /* ---------- questions ---------- */
  function loadQuestions() {
    var list = $('qList');
    list.innerHTML = '<p class="am-hint">Loading…</p>';
    sb.rpc('admin_list_questions', { p_test_id: editingTestId }).then(function (res) {
      if (res.error) { toast(rpcErr(res.error)); return; }
      var qs = res.data || [];
      $('qCount').textContent = qs.length;
      if (!qs.length) { list.innerHTML = '<div class="am-card">No questions yet.</div>'; return; }
      list.innerHTML = '';
      qs.forEach(function (q) {
        var div = document.createElement('div');
        div.className = 'am-q';
        var opts = '';
        ['a', 'b', 'c', 'd', 'e'].forEach(function (k) {
          if (q['option_' + k]) {
            opts += '<div>' + (k === q.answer ? '<b>[' + k.toUpperCase() + ']</b> ' : k.toUpperCase() + '. ') +
              esc(q['option_' + k]) + '</div>';
          }
        });
        div.innerHTML =
          '<div class="qhead"><span class="n">Q' + q.sort_order + '</span>' +
          (q.subject ? '<span class="am-hint">' + esc(q.subject) + '</span>' : '') +
          '<span class="sp"></span>' +
          '<button class="am-btn" data-act="edit">Edit</button>' +
          '<button class="am-btn am-btn-danger" data-act="del">Delete</button></div>' +
          '<div class="qt">' + renderAdminQText(q.question_text) + '</div>' +
          '<div class="opts">' + opts + '</div>' +
          (q.explanation ? '<div class="expl"><strong>Explanation:</strong> ' + esc(q.explanation) + '</div>' : '');
        div.querySelector('[data-act="edit"]').onclick = function () {
          editingQId = q.id;
          $('qText').value = q.question_text || '';
          $('qA').value = q.option_a || ''; $('qB').value = q.option_b || '';
          $('qC').value = q.option_c || ''; $('qD').value = q.option_d || '';
          $('qE').value = q.option_e || '';
          $('qAns').value = (q.answer || 'a').toLowerCase();
          $('qSubj').value = q.subject || '';
          $('qExpl').value = q.explanation || '';
          $('qForm').querySelector('[type="submit"]').textContent = 'Update question';
          $('qForm').scrollIntoView({ behavior: 'smooth' });
        };
        div.querySelector('[data-act="del"]').onclick = function () {
          if (!window.confirm('Delete question ' + q.sort_order + '?')) return;
          sb.rpc('admin_delete_question', { p_question_id: q.id }).then(function (r) {
            if (r.error) toast(rpcErr(r.error)); else { toast('Deleted.'); loadQuestions(); }
          });
        };
        list.appendChild(div);
      });
    });
  }

  function submitQuestion(ev) {
    ev.preventDefault();
    var d = {
      p_question_text: $('qText').value.trim(),
      p_option_a: $('qA').value.trim(), p_option_b: $('qB').value.trim(),
      p_option_c: $('qC').value.trim(), p_option_d: $('qD').value.trim(),
      p_option_e: $('qE').value.trim(),
      p_answer: $('qAns').value, p_explanation: $('qExpl').value.trim(),
      p_subject: $('qSubj').value.trim()
    };
    function done(r) {
      if (r.error) { toast(rpcErr(r.error)); return; }
      toast(editingQId ? 'Question updated.' : 'Question added.');
      editingQId = null;
      $('qForm').reset();
      $('qForm').querySelector('[type="submit"]').textContent = 'Add question';
      loadQuestions();
    }
    if (editingQId) {
      d.p_question_id = editingQId;
      sb.rpc('admin_update_question', d).then(done);
    } else {
      d.p_test_id = editingTestId;
      sb.rpc('admin_add_question', d).then(done);
    }
  }

  /* ---------- bulk paste ----------
   * One block per question, separated by a line of ---. Labels (case
   * insensitive): Q:, A:, B:, C:, D:, E:, Answer:, Explanation:,
   * Subject:, Topic:. Q text and Explanation may span lines; other
   * labels are single-line. A block is valid for the mock when it has
   * Q + A + B + an answer.
   * Batch selects (the two dropdowns above the box) override a block's
   * own Subject:/Topic: labels when set; leave them unset to route
   * each block from its own labels. Topic names resolve against
   * window.SYLLABUS_DATA: inside the effective subject when one is
   * given, otherwise globally when the name is unique
   * (19 topics share the name "Mixed / Miscellaneous Topics", so a
   * bare topic name is ambiguous without its subject).
   * Every valid question is saved to the mock. Questions with a
   * resolved topic AND options C + D AND an explanation are ALSO
   * written to the bank (live immediately, server-assigned global
   * question number). One bad block never stops the batch: failures
   * are collected, and failed blocks are put back in the box for
   * fixing instead of being lost. */
  var bulkSkipped = 0;
  var bulkIndex = null;

  function bulkBuildIndex() {
    if (bulkIndex) return bulkIndex;
    var idx = { subjects: [], byKey: {}, bySubject: {} };
    var data = (window.SYLLABUS_DATA && window.SYLLABUS_DATA.length)
      ? window.SYLLABUS_DATA : [];
    data.forEach(function (subj) {
      idx.subjects.push(subj);
      idx.bySubject[subj.name.toLowerCase()] = subj;
      subj.modules.forEach(function (mod) {
        idx.byKey[subj.name.toLowerCase() + '\n' + mod.name.toLowerCase()] = {
          id: mod.id, name: mod.name, subject: subj.name
        };
      });
    });
    bulkIndex = idx;
    return idx;
  }

  function populateBulkDefaults() {
    var subjSel = $('bulkSubj'), topicSel = $('bulkTopic');
    if (!subjSel || !topicSel) return;
    var idx = bulkBuildIndex();
    if (!idx.subjects.length) {
      subjSel.innerHTML = '<option value="">Subject list failed to load</option>';
      subjSel.disabled = true; topicSel.disabled = true;
      return;
    }
    subjSel.disabled = false;
    var curSubj = subjSel.value, curTopic = topicSel.value;
    subjSel.innerHTML = '<option value="">No default subject</option>';
    idx.subjects.forEach(function (s) {
      var o = document.createElement('option');
      o.value = s.name; o.textContent = s.name;
      subjSel.appendChild(o);
    });
    if (curSubj) subjSel.value = curSubj;
    rebuildBulkTopics();
    if (curTopic) topicSel.value = curTopic;
  }

  function rebuildBulkTopics() {
    var subjSel = $('bulkSubj'), topicSel = $('bulkTopic');
    if (!subjSel || !topicSel) return;
    var idx = bulkBuildIndex();
    var subj = idx.bySubject[(subjSel.value || '').toLowerCase()];
    topicSel.innerHTML = '<option value="">No default topic</option>';
    topicSel.disabled = !subj;
    if (!subj) return;
    subj.modules.forEach(function (m) {
      var o = document.createElement('option');
      o.value = m.name; o.textContent = m.name;
      topicSel.appendChild(o);
    });
  }

  function resolveBulkTopic(q, defSubj, defTopic) {
    // The batch selects override the block's own labels when set: the
    // user only picks them when they know the source, so the pasted
    // text is never second-guessed. Unset selects fall back to the
    // block's Subject:/Topic: labels.
    var subj = (defSubj || q.subject || '').trim();
    var topic = (defTopic || q.topic || '').trim();
    if (!topic) {
      return { moduleId: null, subject: subj, topicName: '', status: 'no-topic', note: '' };
    }
    var idx = bulkBuildIndex();
    if (subj) {
      var hit = idx.byKey[subj.toLowerCase() + '\n' + topic.toLowerCase()];
      if (hit) {
        return { moduleId: hit.id, subject: hit.subject, topicName: hit.name, status: 'ok', note: '' };
      }
      return { moduleId: null, subject: subj, topicName: topic, status: 'unmatched',
        note: 'no topic "' + topic + '" under ' + subj };
    }
    var matches = [];
    idx.subjects.forEach(function (s) {
      s.modules.forEach(function (mod) {
        if (mod.name.toLowerCase() === topic.toLowerCase()) {
          matches.push({ id: mod.id, name: mod.name, subject: s.name });
        }
      });
    });
    if (matches.length === 1) {
      return { moduleId: matches[0].id, subject: matches[0].subject,
        topicName: matches[0].name, status: 'ok', note: '' };
    }
    if (!matches.length) {
      return { moduleId: null, subject: '', topicName: topic, status: 'unmatched',
        note: 'no topic "' + topic + '" anywhere' };
    }
    return { moduleId: null, subject: '', topicName: topic, status: 'ambiguous',
      note: '"' + topic + '" matches ' + matches.length + ' topics — add its Subject:' };
  }

  function parseBulk(text) {
    var out = [], skipped = 0;
    text.split(/^\s*---+\s*$/m).forEach(function (block) {
      block = block.trim();
      if (!block) return;
      var q = { text: '', a: '', b: '', c: '', d: '', e: '', answer: '',
        explanation: '', subject: '', topic: '', _raw: block };
      var cur = null;
      block.split('\n').forEach(function (line) {
        var m = line.match(/^(Q|A|B|C|D|E|Answer|Explanation|Subject|Topic)\s*:\s*(.*)$/i);
        if (m) {
          var k = m[1].toLowerCase();
          cur = (k === 'q') ? 'text' : k;
          q[cur] = m[2].trim();
        } else if (cur === 'explanation' || cur === 'text') {
          q[cur] += '\n' + line;
        }
      });
      q.answer = q.answer.toLowerCase().replace(/[^a-e]/g, '').charAt(0);
      if (q.text && q.a && q.b && q.answer) out.push(q); else skipped++;
    });
    return { questions: out, skipped: skipped };
  }

  function previewBulk() {
    if ($('bulkSubj') && !$('bulkSubj').options.length) populateBulkDefaults();
    var parsed = parseBulk($('bulkText').value);
    var defSubj = $('bulkSubj') ? $('bulkSubj').value : '';
    var defTopic = $('bulkTopic') ? $('bulkTopic').value : '';
    bulkParsed = parsed.questions;
    bulkSkipped = parsed.skipped;
    var bankCount = 0, mockOnly = 0;
    bulkParsed.forEach(function (q) {
      var r = resolveBulkTopic(q, defSubj, defTopic);
      q._moduleId = r.moduleId; q._subject = r.subject; q._topicName = r.topicName;
      q._topicStatus = r.status; q._note = r.note;
      q._bankOk = r.status === 'ok' && !!q.c && !!q.d && !!q.explanation;
      if (q._bankOk) bankCount++; else mockOnly++;
    });
    var pv = $('bulkPreview');
    $('bulkInfo').textContent = bulkParsed.length + ' valid question(s) · ' +
      bankCount + ' to bank · ' + mockOnly + ' mock-only' +
      (bulkSkipped ? ' · ' + bulkSkipped + ' block(s) skipped (need Q + A + B + answer).' : '');
    $('bulkImportBtn').disabled = !bulkParsed.length;
    pv.innerHTML = '';
    bulkParsed.slice(0, 5).forEach(function (q, i) {
      var div = document.createElement('div');
      div.className = 'am-q';
      var loc = q._topicStatus === 'ok'
        ? esc(q._subject) + ' / ' + esc(q._topicName)
        : (q._subject ? esc(q._subject) + ' · ' : '') + esc(q._note || 'no topic');
      var bank = q._bankOk ? ' + bank'
        : ' · mock only' + (q._topicStatus === 'ok' ? ' (needs C + D + explanation for bank)' : '');
      div.innerHTML = '<div class="qhead"><span class="n">#' + (i + 1) + '</span></div>' +
        '<div class="qt">' + esc(q.text.slice(0, 160)) + (q.text.length > 160 ? '…' : '') + '</div>' +
        '<div class="opts">Answer: <b>' + q.answer.toUpperCase() + '</b> · ' + loc + bank + '</div>';
      pv.appendChild(div);
    });
    if (bulkParsed.length > 5) {
      pv.innerHTML += '<p class="am-hint">…and ' + (bulkParsed.length - 5) + ' more.</p>';
    }
  }

  function importBulk() {
    if (!bulkParsed.length) return;
    $('bulkImportBtn').disabled = true;
    $('bulkInfo').textContent = 'Importing…';
    var i = 0, mockDone = 0, bankDone = 0, failures = [];
    function finish() {
      var msg = 'Imported ' + mockDone + ' to mock, ' + bankDone + ' to bank.';
      if (failures.length) {
        msg += ' Failed: ' + failures.map(function (f) {
          return '#' + f.n + ' ' + f.stage + ' (' + f.reason + ')';
        }).join('; ') + '. Failed blocks are back in the box — fix and re-preview.';
        $('bulkText').value = failures.map(function (f) { return f.q._raw; }).join('\n---\n');
      } else {
        $('bulkText').value = '';
      }
      bulkParsed = [];
      $('bulkInfo').textContent = msg;
      loadQuestions();
    }
    function next() {
      if (i >= bulkParsed.length) { finish(); return; }
      var n = i + 1;
      var q = bulkParsed[i++];
      $('bulkInfo').textContent = 'Importing… ' + i + '/' + bulkParsed.length;
      sb.rpc('admin_add_question', {
        p_test_id: editingTestId,
        p_question_text: q.text, p_option_a: q.a, p_option_b: q.b,
        p_option_c: q.c, p_option_d: q.d, p_option_e: q.e,
        p_answer: q.answer, p_explanation: q.explanation,
        p_subject: q._subject || null, p_module_id: q._moduleId
      }).then(function (r) {
        if (r.error) {
          failures.push({ n: n, stage: 'mock', reason: rpcErr(r.error), q: q });
          next(); return;
        }
        mockDone++;
        if (!q._bankOk) { next(); return; }
        sb.rpc('admin_add_bank_question', {
          p_module_id: q._moduleId, p_subject: q._subject,
          p_question_text: q.text, p_option_a: q.a, p_option_b: q.b,
          p_option_c: q.c, p_option_d: q.d, p_option_e: q.e,
          p_answer: q.answer, p_explanation: q.explanation
        }).then(function (br) {
          if (br.error) {
            failures.push({ n: n, stage: 'bank', reason: rpcErr(br.error), q: q });
          } else {
            bankDone++;
          }
          next();
        });
      });
    }
    next();
  }

  /* ---------- bank-tab bulk paste ----------
   * Same block format and topic resolution as the editor's bulk paste,
   * but bank-only: no mock is involved. Batch subject/topic selects
   * above the box (same as the editor) override a block's own labels
   * when set; leave them unset to route each block from its own
   * labels. A block is importable
   * only with a resolved topic AND options C + D AND an explanation
   * (bank rules) — the rest are listed as skipped in preview, never
   * imported silently. Failures are collected per question and failed
   * blocks are put back in the box, exactly like the editor import. */
  var bankBulkParsed = [];

  function populateBankBulkDefaults() {
    var subjSel = $('bankBulkSubj'), topicSel = $('bankBulkTopic');
    if (!subjSel || !topicSel) return;
    var idx = bulkBuildIndex();
    if (!idx.subjects.length) {
      subjSel.innerHTML = '<option value="">Subject list failed to load</option>';
      subjSel.disabled = true; topicSel.disabled = true;
      return;
    }
    subjSel.disabled = false;
    var curSubj = subjSel.value, curTopic = topicSel.value;
    subjSel.innerHTML = '<option value="">No default subject</option>';
    idx.subjects.forEach(function (s) {
      var o = document.createElement('option');
      o.value = s.name; o.textContent = s.name;
      subjSel.appendChild(o);
    });
    if (curSubj) subjSel.value = curSubj;
    rebuildBankBulkTopics();
    if (curTopic) topicSel.value = curTopic;
  }

  function rebuildBankBulkTopics() {
    var subjSel = $('bankBulkSubj'), topicSel = $('bankBulkTopic');
    if (!subjSel || !topicSel) return;
    var idx = bulkBuildIndex();
    var subj = idx.bySubject[(subjSel.value || '').toLowerCase()];
    topicSel.innerHTML = '<option value="">No default topic</option>';
    topicSel.disabled = !subj;
    if (!subj) return;
    subj.modules.forEach(function (m) {
      var o = document.createElement('option');
      o.value = m.name; o.textContent = m.name;
      topicSel.appendChild(o);
    });
  }

  function previewBankBulk() {
    if ($('bankBulkSubj') && !$('bankBulkSubj').options.length) populateBankBulkDefaults();
    var parsed = parseBulk($('bankBulkText').value);
    var defSubj = $('bankBulkSubj') ? $('bankBulkSubj').value : '';
    var defTopic = $('bankBulkTopic') ? $('bankBulkTopic').value : '';
    bankBulkParsed = parsed.questions;
    var willImport = 0;
    bankBulkParsed.forEach(function (q) {
      var r = resolveBulkTopic(q, defSubj, defTopic);
      q._moduleId = r.moduleId; q._subject = r.subject; q._topicName = r.topicName;
      q._topicStatus = r.status; q._note = r.note;
      q._bankOk = r.status === 'ok' && !!q.c && !!q.d && !!q.explanation;
      if (q._bankOk) willImport++;
    });
    var pv = $('bankBulkPreview');
    $('bankBulkInfo').textContent = bankBulkParsed.length + ' valid question(s) · ' +
      willImport + ' will import · ' + (bankBulkParsed.length - willImport) + ' skipped' +
      (parsed.skipped ? ' · ' + parsed.skipped + ' block(s) dropped (need Q + A + B + answer).' : '');
    $('bankBulkImportBtn').disabled = !willImport;
    pv.innerHTML = '';
    bankBulkParsed.slice(0, 5).forEach(function (q, i) {
      var div = document.createElement('div');
      div.className = 'am-q';
      var loc = q._topicStatus === 'ok'
        ? esc(q._subject) + ' / ' + esc(q._topicName)
        : (q._subject ? esc(q._subject) + ' · ' : '') + esc(q._note || 'no topic');
      var verdict = q._bankOk ? 'will import'
        : 'skipped' + (q._topicStatus === 'ok' ? ' (needs C + D + explanation)' : '');
      div.innerHTML = '<div class="qhead"><span class="n">#' + (i + 1) + '</span></div>' +
        '<div class="qt">' + esc(q.text.slice(0, 160)) + (q.text.length > 160 ? '…' : '') + '</div>' +
        '<div class="opts">Answer: <b>' + q.answer.toUpperCase() + '</b> · ' + loc + ' · ' + verdict + '</div>';
      pv.appendChild(div);
    });
    if (bankBulkParsed.length > 5) {
      pv.innerHTML += '<p class="am-hint">…and ' + (bankBulkParsed.length - 5) + ' more.</p>';
    }
  }

  function importBankBulk() {
    var queue = [];
    bankBulkParsed.forEach(function (q, k) {
      if (q._bankOk) queue.push({ q: q, n: k + 1 });
    });
    if (!queue.length) return;
    $('bankBulkImportBtn').disabled = true;
    $('bankBulkInfo').textContent = 'Importing…';
    var i = 0, done = 0, failures = [];
    function finish() {
      var msg = 'Imported ' + done + ' to bank.';
      var skipped = bankBulkParsed.length - queue.length;
      if (skipped) msg += ' ' + skipped + ' skipped (see preview).';
      if (failures.length) {
        msg += ' Failed: ' + failures.map(function (f) {
          return '#' + f.n + ' (' + f.reason + ')';
        }).join('; ') + '. Failed blocks are back in the box — fix and re-preview.';
        $('bankBulkText').value = failures.map(function (f) { return f.q._raw; }).join('\n---\n');
      } else {
        $('bankBulkText').value = '';
      }
      bankBulkParsed = [];
      $('bankBulkInfo').textContent = msg;
    }
    function next() {
      if (i >= queue.length) { finish(); return; }
      var item = queue[i++];
      var q = item.q;
      $('bankBulkInfo').textContent = 'Importing… ' + i + '/' + queue.length;
      sb.rpc('admin_add_bank_question', {
        p_module_id: q._moduleId, p_subject: q._subject,
        p_question_text: q.text, p_option_a: q.a, p_option_b: q.b,
        p_option_c: q.c, p_option_d: q.d, p_option_e: q.e,
        p_answer: q.answer, p_explanation: q.explanation
      }).then(function (br) {
        if (br.error) failures.push({ n: item.n, reason: rpcErr(br.error), q: q });
        else done++;
        next();
      });
    }
    next();
  }

  /* ---------- admin home: one card per function ---------- */
  var EDGE_ADMIN_GRANT_URL = SUPABASE_URL + '/functions/v1/admin-grant-pro';
  function fmt(n) { return Number(n || 0).toLocaleString(); }
  function setChip(k, text, tone) {
    var c = $('ahChip-' + k);
    if (!c) return;
    c.textContent = text;
    c.className = 'ah-chip' + (tone ? ' ' + tone : '');
  }
  function loadHome() {
    showView('homeView');
    var h = new Date().getHours();
    $('ahHello').textContent = (h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening');
    sb.rpc('admin_overview').then(function (res) {
      var d = res && !res.error && res.data;
      if (!d) return;
      $('ahStats').innerHTML =
        '<div class="ah-stat"><strong>' + fmt(d.students) + '</strong><span>Accounts · +' + fmt(d.new_7d) + ' this week</span></div>' +
        '<div class="ah-stat"><strong>' + fmt(d.active_7d) + '</strong><span>Active this week · ' + fmt(d.active_1d) + ' today</span></div>' +
        '<div class="ah-stat"><strong>' + fmt(d.answers_7d) + '</strong><span>Answers this week' + (d.accuracy_7d != null ? ' · ' + d.accuracy_7d + '% right' : '') + '</span></div>' +
        '<div class="ah-stat"><strong>' + fmt(d.pro_active) + '</strong><span>Pro students</span></div>';
      setChip('pro', fmt(d.pro_active) + ' active');
      setChip('usage', fmt(d.active_7d) + ' active this week');
    });
    sb.rpc('admin_home_counts').then(function (res) {
      var c = res && !res.error && res.data;
      if (!c) return;
      setChip('tests', fmt(c.tests_total) + ' test' + (c.tests_total === 1 ? '' : 's') + (c.tests_live ? ' · ' + c.tests_live + ' live' : ''), c.tests_live ? 'live' : '');
      setChip('add', fmt(c.bank) + ' questions');
      setChip('edit', fmt(c.short_expl) + ' thin explanations', c.short_expl ? 'warn' : '');
      setChip('review', c.review ? fmt(c.review) + ' to fix' : 'All clear', c.review ? 'bad' : 'ok');
      setChip('reports', c.open_flags ? fmt(c.open_flags) + ' open' : 'None open', c.open_flags ? 'bad' : 'ok');
      setChip('qotd', (c.qotd_today ? 'Today set' : 'Today not set') + (c.qotd_days_ahead ? ' · +' + c.qotd_days_ahead : ''), c.qotd_today ? 'ok' : 'warn');
    });
  }
  function homeGo(k) {
    if (k === 'tests') loadTests();
    else if (k === 'add') openAddView();
    else if (k === 'edit') { openEditQ(); $('eqFilter').value = 'all'; }
    else if (k === 'review') { openEditQ(); $('eqSubj').value = ''; $('eqSubj').onchange(); $('eqFilter').value = 'review'; $('eqSearch').value = ''; eqLoad(0); }
    else if (k === 'reports') loadFlags('open');
    else if (k === 'qotd') loadQotd();
    else if (k === 'pro') { showView('proView'); $('proMsg').textContent = ''; }
    else if (k === 'usage') loadUsage();
  }
  function proCall(action) {
    var email = ($('proEmail').value || '').trim().toLowerCase();
    var days = parseInt($('proDays').value, 10) || 365;
    if (!email || email.indexOf('@') === -1) { $('proMsg').textContent = 'Enter the student’s email address.'; return; }
    if (action === 'revoke' && !window.confirm('Cancel all active Pro access for ' + email + '?')) return;
    $('proGrantBtn').disabled = $('proRevokeBtn').disabled = true;
    $('proMsg').textContent = action === 'revoke' ? 'Revoking…' : 'Granting…';
    sb.auth.getSession().then(function (s) {
      var token = s && s.data && s.data.session ? s.data.session.access_token : null;
      if (!token) throw new Error('Session expired, sign in again.');
      return fetch(EDGE_ADMIN_GRANT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ action: action, target_email: email, days: days })
      });
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, status: r.status, d: d }; });
    }).then(function (x) {
      if (!x.ok || !x.d.success) { $('proMsg').textContent = (action === 'revoke' ? 'Revoke' : 'Grant') + ' failed: ' + (x.d.error || x.status); return; }
      $('proMsg').textContent = action === 'revoke' ? 'Pro access cancelled for ' + email + '.'
        : 'Pro granted to ' + email + (x.d.expires_at ? ' until ' + new Date(x.d.expires_at).toLocaleDateString() : '') + '.';
      $('proEmail').value = '';
    }).catch(function (e) {
      $('proMsg').textContent = 'Request failed: ' + e.message;
    }).then(function () {
      $('proGrantBtn').disabled = $('proRevokeBtn').disabled = false;
    });
  }
  function loadUsage() {
    showView('usageView');
    $('usageStats').innerHTML = '<p class="am-hint">Loading…</p>';
    $('usageHard').innerHTML = '';
    sb.rpc('admin_overview').then(function (res) {
      var d = res && !res.error && res.data;
      if (!d) { $('usageStats').innerHTML = '<p class="am-hint">' + esc(res && res.error ? rpcErr(res.error) : 'Could not load.') + '</p>'; return; }
      var t = function (num, label, sub) { return '<div class="ah-u"><strong>' + num + '</strong><span>' + label + '</span>' + (sub ? '<small>' + sub + '</small>' : '') + '</div>'; };
      $('usageStats').innerHTML =
        t(fmt(d.students), 'Accounts', '+' + fmt(d.new_7d) + ' in the last 7 days') +
        t(fmt(d.active_7d), 'Practised this week', fmt(d.active_1d) + ' today') +
        t(fmt(d.answers_7d), 'Answers this week', fmt(d.answers_1d) + ' today' + (d.accuracy_7d != null ? ' · ' + d.accuracy_7d + '% correct' : '')) +
        t(fmt(d.pro_active), 'Active Pro students', '') +
        t(fmt(d.questions), 'Bank questions', fmt(d.pyq_questions) + ' past-paper questions besides') +
        t(fmt(d.flags_open), 'Open student reports', '');
      var hard = d.hard_questions || [];
      $('usageHard').innerHTML = hard.length ? hard.map(function (h) {
        return '<div class="am-q"><div class="qhead"><span class="n">#' + h.id + '</span><span class="am-hint">' + esc(h.topic || '') + '</span><span class="sp"></span>' +
          '<span class="am-badge draft">' + h.pct + '% of ' + h.n + ' correct</span></div>' +
          '<div class="qt">' + esc(h.text || '') + '</div>' +
          '<button class="am-btn" type="button" data-hard="' + h.id + '">Open in editor</button></div>';
      }).join('') : '<div class="am-card">Not enough answers yet.</div>';
      Array.prototype.forEach.call($('usageHard').querySelectorAll('[data-hard]'), function (b) {
        b.onclick = function () {
          openEditQ(); $('eqSubj').value = ''; $('eqSubj').onchange(); $('eqFilter').value = 'all';
          $('eqSearch').value = b.getAttribute('data-hard'); eqLoad(0);
        };
      });
    });
  }

  /* ---------- edit any bank question ----------
   * Browse the bank by subject / topic (or search), open a question, and
   * change its text, options, key, explanation, image or topic, or delete it. */
  var eqState = { offset: 0, total: 0, limit: 50, source: 'bank' };

  /* Past-paper sessions (exam + year/session) with question counts. */
  var pyqSessions = null;
  var PYQ_EXAM_IDS = ['NEET PG', 'INICET', 'FMGE'];
  var PYQ_MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  function pyqKey(y) {
    var m = String(y || '').match(/^([A-Za-z]+)?\s*(\d{4})$/);
    return m ? Number(m[2]) * 100 + (m[1] ? PYQ_MON[m[1].toLowerCase().slice(0, 3)] || 0 : 0) : 0;
  }
  function loadPyqSessions(force) {
    if (pyqSessions && !force) return Promise.resolve(pyqSessions);
    return sb.rpc('admin_pyq_sessions').then(function (res) {
      if (res.error) { toast(rpcErr(res.error)); return pyqSessions || []; }
      pyqSessions = res.data || [];
      return pyqSessions;
    });
  }
  function pyqYearsFor(exam) {
    return (pyqSessions || []).filter(function (r) { return r.pyq_exam === exam; })
      .sort(function (a, b) { return pyqKey(b.pyq_year) - pyqKey(a.pyq_year); });
  }
  function fillPyqYearSelect(sel, exam, opts) {
    opts = opts || {};
    var cur = sel.value;
    var rows = pyqYearsFor(exam);
    sel.innerHTML = (opts.all ? '<option value="">All sessions</option>' : '') +
      rows.map(function (r) {
        return '<option value="' + esc(r.pyq_year) + '">' + esc(r.pyq_year) + (opts.counts !== false ? ' · ' + r.n + ' questions' : '') + '</option>';
      }).join('') +
      (opts.extra || []).filter(function (y) { return !rows.some(function (r) { return r.pyq_year === y; }); })
        .map(function (y) { return '<option value="' + esc(y) + '">' + esc(y) + ' · new</option>'; }).join('') +
      (opts.allowNew ? '<option value="__new">＋ New session…</option>' : '');
    if (opts.value != null) sel.value = opts.value;
    else if (cur && Array.prototype.some.call(sel.options, function (o) { return o.value === cur; })) sel.value = cur;
  }
  function eqSetSource(src) {
    eqState.source = src;
    Array.prototype.forEach.call(document.querySelectorAll('[data-eqsrc]'), function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-eqsrc') === src));
    });
    Array.prototype.forEach.call(document.querySelectorAll('#editQView .eq-bank'), function (el) { el.hidden = src !== 'bank'; });
    Array.prototype.forEach.call(document.querySelectorAll('#editQView .eq-pyq'), function (el) { el.hidden = src !== 'pyq'; });
    if (src === 'pyq') loadPyqSessions().then(function () { fillPyqYearSelect($('eqYear'), $('eqExam').value, { all: true }); });
  }

  function eqFillSubjects() {
    var subjSel = $('eqSubj'), topicSel = $('eqTopic');
    var idx = bulkBuildIndex();
    subjSel.innerHTML = '<option value="">Any subject</option>' + idx.subjects.map(function (s) {
      return '<option>' + esc(s.name) + '</option>';
    }).join('');
    subjSel.onchange = function () {
      var subj = idx.bySubject[(subjSel.value || '').toLowerCase()];
      topicSel.innerHTML = '<option value="">' + (subj ? 'All topics in ' + esc(subj.name) : 'Pick a subject first') + '</option>' +
        (subj ? subj.modules.map(function (m) { return '<option value="' + m.id + '">' + esc(m.name) + '</option>'; }).join('') : '');
      topicSel.disabled = !subj;
    };
    subjSel.onchange();
  }

  function openEditQ() {
    showView('editQView');
    if (!$('eqSubj').options.length) eqFillSubjects();
    if (!$('editQView')._wired) {
      $('editQView')._wired = true;
      Array.prototype.forEach.call(document.querySelectorAll('[data-eqsrc]'), function (b) {
        b.onclick = function () { eqSetSource(b.getAttribute('data-eqsrc')); $('eqList').innerHTML = ''; $('eqInfo').textContent = ''; $('eqPager').hidden = true; };
      });
      $('eqExam').onchange = function () { fillPyqYearSelect($('eqYear'), $('eqExam').value, { all: true, value: '' }); };
    }
  }
  /* Open Edit questions on one past-paper session (used after adding PYQs). */
  function openEditPyq(exam, year) {
    openEditQ();
    eqSetSource('pyq');
    $('eqExam').value = exam;
    loadPyqSessions(true).then(function () {
      fillPyqYearSelect($('eqYear'), exam, { all: true, value: year });
      $('eqFilter').value = 'all'; $('eqSearch').value = '';
      eqLoad(0);
    });
  }

  function eqModuleIds() {
    var topic = $('eqTopic').value;
    if (topic) return [parseInt(topic, 10)];
    var subj = bulkBuildIndex().bySubject[($('eqSubj').value || '').toLowerCase()];
    return subj ? subj.modules.map(function (m) { return m.id; }) : null;
  }

  function eqLoad(offset) {
    eqState.offset = offset || 0;
    var list = $('eqList');
    var term = ($('eqSearch').value || '').trim();
    $('eqInfo').textContent = 'Loading…';
    list.innerHTML = '';
    var pyq = eqState.source === 'pyq';
    sb.rpc('admin_list_questions', {
      p_module_ids: pyq ? null : eqModuleIds(), p_search: term || null, p_filter: $('eqFilter').value,
      p_limit: eqState.limit, p_offset: eqState.offset, p_source: eqState.source,
      p_pyq_exam: pyq ? $('eqExam').value : null, p_pyq_year: pyq ? ($('eqYear').value || null) : null
    }).then(function (res) {
      if (res.error) { $('eqInfo').textContent = rpcErr(res.error); return; }
      var rows = res.data || [];
      var total = rows[0] ? Number(rows[0].total_count) : 0;
      eqState.total = total;
      $('eqInfo').textContent = total ? total + ' question' + (total === 1 ? '' : 's') + ' found' : 'No questions found.';
      $('eqPager').hidden = total <= eqState.limit;
      $('eqPage').textContent = (eqState.offset + 1) + '–' + Math.min(total, eqState.offset + eqState.limit) + ' of ' + total;
      $('eqPrev').disabled = eqState.offset === 0;
      $('eqNext').disabled = eqState.offset + eqState.limit >= total;
      list.innerHTML = rows.map(function (r) {
        var t = plain(r.question_text, 170);
        return '<div class="am-q eq-row" data-eq="' + r.id + '"><div class="qhead">' +
          '<span class="n">#' + r.id + '</span>' +
          '<span class="am-hint">' + esc(r.is_pyq ? (r.pyq_exam || 'PYQ') + ' · ' + (r.pyq_year || '?') : (r.subject || '?') + ' / ' + (r.topic || '?')) + '</span>' +
          '<span class="sp"></span>' +
          (r.review_reason ? '<span class="am-badge draft">Needs review</span>' : '') +
          (r.has_image ? '<span class="am-badge">Has image</span>' : '') +
          '<span class="am-badge ' + (r.expl_len < 40 ? 'draft' : r.expl_len < 100 ? '' : 'published') + '">Explanation ' + r.expl_len + '</span>' +
          '</div><div class="qt">' + esc(t) + '</div>' +
          (r.review_reason ? '<div class="am-hint" style="color:var(--red)">' + esc(r.review_reason) + '</div>' : '') +
          '<button class="am-btn eq-open" type="button">Edit</button>' +
          '<div class="eq-edit" hidden></div></div>';
      }).join('');
      var byId = {};
      rows.forEach(function (r) { byId[r.id] = r; });
      Array.prototype.forEach.call(list.querySelectorAll('[data-eq]'), function (row) {
        row.querySelector('.eq-open').onclick = function () { eqOpen(row, byId[row.getAttribute('data-eq')]); };
      });
    });
  }

  function eqOpen(row, r) {
    var box = row.querySelector('.eq-edit');
    if (!box.hidden) { box.hidden = true; box.innerHTML = ''; return; }
    var idx = bulkBuildIndex();
    var subjOpts = idx.subjects.map(function (s) {
      return '<option' + (s.name === r.subject ? ' selected' : '') + '>' + esc(s.name) + '</option>';
    }).join('');
    var ans = String(r.answer || 'A').toUpperCase();
    box.innerHTML = '<form class="am-form eq-form">' +
      '<label class="am-wide">Question <textarea name="q" rows="4" required></textarea></label>' +
      ['a', 'b', 'c', 'd', 'e'].map(function (L) {
        return '<label>' + L.toUpperCase() + ' <input name="' + L + '"' + (L === 'a' || L === 'b' ? ' required' : '') + '></label>';
      }).join('') +
      '<label>Correct answer <select name="ans">' + ['A', 'B', 'C', 'D', 'E'].map(function (L) {
        return '<option' + (L === ans ? ' selected' : '') + '>' + L + '</option>';
      }).join('') + '</select></label>' +
      '<label class="am-wide">Explanation <textarea name="ex" rows="8"></textarea></label>' +
      (r.is_pyq
        ? '<label>Exam <select name="exam">' + PYQ_EXAM_IDS.map(function (x) { return '<option' + (x === r.pyq_exam ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '</select></label>' +
          '<label>Session <select name="year"></select></label>'
        : '<label>Subject <select name="subj">' + subjOpts + '</select></label>' +
          '<label>Topic <select name="topic"></select></label>') +
      '<div class="am-wide am-row">' +
      '<button class="am-btn am-btn-primary" type="submit">Save changes</button>' +
      (r.review_reason ? '<button class="am-btn" type="button" data-act="reviewed">Mark reviewed</button>' : '') +
      '<button class="am-btn am-btn-danger" type="button" data-act="delete">Delete question</button>' +
      '<button class="am-btn" type="button" data-act="close">Close</button>' +
      '</div></form>';
    box.hidden = false;
    var f = box.querySelector('form');
    f.q.value = r.question_text || '';
    ['a', 'b', 'c', 'd', 'e'].forEach(function (L) { f[L].value = r['option_' + L] || ''; });
    f.ex.value = r.explanation || '';
    richField(f.q, { alt: 'Question image', placeholder: 'Question text' });
    richField(f.ex, { alt: 'Explanation image', placeholder: 'Write the explanation…' });
    if (r.is_pyq) {
      var fillYears = function (val) { fillPyqYearSelect(f.year, f.exam.value, { counts: false, value: val }); };
      loadPyqSessions().then(function () { fillYears(r.pyq_year); });
      f.exam.onchange = function () { fillYears(null); };
    }
    var fillTopics = function () {
      if (r.is_pyq) return;
      var subj = idx.bySubject[(f.subj.value || '').toLowerCase()];
      f.topic.innerHTML = subj ? subj.modules.map(function (m) {
        return '<option value="' + m.id + '"' + (m.id === r.module_id ? ' selected' : '') + '>' + esc(m.name) + '</option>';
      }).join('') : '';
    };
    if (f.subj) f.subj.onchange = fillTopics;
    fillTopics();
    f.onsubmit = function (ev) {
      ev.preventDefault();
      var newMod = r.is_pyq ? null : (parseInt(f.topic.value, 10) || null);
      var exam = r.is_pyq ? f.exam.value : null, year = r.is_pyq ? f.year.value : null;
      var moved = r.is_pyq ? (exam !== r.pyq_exam || year !== r.pyq_year) : (newMod && newMod !== r.module_id);
      if (moved && !window.confirm('Move this question to ' + (r.is_pyq ? exam + ' ' + year : f.subj.value + ' / ' + f.topic.options[f.topic.selectedIndex].text) + '?')) return;
      sb.rpc('admin_save_question', {
        p_question_id: r.id, p_question_text: f.q.value, p_option_a: f.a.value, p_option_b: f.b.value,
        p_option_c: f.c.value, p_option_d: f.d.value, p_option_e: f.e.value,
        p_answer: f.ans.value, p_explanation: f.ex.value, p_module_id: newMod,
        p_pyq_exam: exam, p_pyq_year: year
      }).then(function (res) {
        if (res.error) { toast(rpcErr(res.error)); return; }
        toast('Question #' + r.id + ' saved' + (moved ? ' and moved.' : '.'));
        if (moved && r.is_pyq) pyqSessions = null;
        eqLoad(eqState.offset);
      });
    };
    box.querySelector('[data-act="close"]').onclick = function () { box.hidden = true; box.innerHTML = ''; };
    var rv = box.querySelector('[data-act="reviewed"]');
    if (rv) rv.onclick = function () {
      sb.rpc('admin_clear_review_flag', { p_question_id: r.id }).then(function (res) {
        if (res.error) { toast(rpcErr(res.error)); return; }
        toast('Marked as reviewed.');
        eqLoad(eqState.offset);
      });
    };
    box.querySelector('[data-act="delete"]').onclick = function () {
      if (!window.confirm('Delete question #' + r.id + ' permanently? Students’ answers to it are removed too. (A copy is kept in the archive.)')) return;
      sb.rpc('admin_delete_bank_question', { p_question_id: r.id }).then(function (res) {
        if (res.error) { toast(rpcErr(res.error)); return; }
        toast('Question #' + r.id + ' deleted.');
        eqLoad(eqState.offset);
      });
    };
  }

  /* ---------- flagged questions review queue ----------
   * User reports from the practice quiz land here. Per flag the admin can
   * move the bank question to its correct subject/topic (resolving the
   * flag), fix the question's content (flag stays open until explicitly
   * resolved or dismissed), resolve it, or dismiss it. */
  var flagStatus = 'open';
  var flagDetailId = null;
  var flagDetailQ = null;

  var FLAG_REASONS = {
    wrong_key: 'Wrong answer key',
    wrong_explanation: 'Wrong explanation',
    wrong_location: 'Wrong subject/topic',
    unclear: 'Unclear question',
    other: 'Other'
  };

  function loadFlags(status) {
    flagStatus = status || 'open';
    flagDetailId = null;
    showView('flaggedView');
    $('flagDetail').hidden = true;
    var list = $('flagList');
    list.innerHTML = '<p class="am-hint">Loading…</p>';
    sb.rpc('admin_list_flags', { p_status: flagStatus }).then(function (res) {
      if (res.error) { toast(rpcErr(res.error)); return; }
      var flags = res.data || [];
      $('flagCount').textContent = flags.length + ' ' + flagStatus;
      if (!flags.length) {
        list.innerHTML = '<div class="am-card">No ' + flagStatus + ' flags.</div>';
        return;
      }
      list.innerHTML = '';
      flags.forEach(function (f) {
        var plain = String(f.question_text || '')
          .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        var loc = (f.current_subject ? esc(f.current_subject) : 'Question bank') +
          (f.current_topic ? ' / ' + esc(f.current_topic) : '');
        var row = document.createElement('div');
        row.className = 'am-card';
        row.style.cursor = 'pointer';
        row.innerHTML = '<div class="qhead"><span class="am-badge">' +
          esc(FLAG_REASONS[f.reason] || f.reason) + '</span>' +
          '<span class="am-hint">' + loc + ' · Q#' + f.question_num + '</span>' +
          '<span class="sp"></span>' +
          '<span class="am-hint">' + new Date(f.created_at).toLocaleString() + '</span></div>' +
          '<div class="qt">' + esc(plain.slice(0, 160)) + (plain.length > 160 ? '…' : '') + '</div>' +
          (f.open_flag_count > 1
            ? '<div class="am-hint">' + f.open_flag_count + ' open flags on this question</div>' : '') +
          (f.admin_note ? '<div class="am-hint">Note: ' + esc(f.admin_note) + '</div>' : '');
        row.onclick = function () { openFlagDetail(f); };
        list.appendChild(row);
      });
    });
  }

  function populateFlagSubj() {
    var subjSel = $('flagSubj');
    if (!subjSel) return;
    var idx = bulkBuildIndex();
    subjSel.innerHTML = '<option value="">Select subject</option>';
    idx.subjects.forEach(function (s) {
      var o = document.createElement('option');
      o.value = s.name; o.textContent = s.name;
      subjSel.appendChild(o);
    });
    var cur = (flagDetailQ && flagDetailQ.current_subject) || '';
    if (cur) subjSel.value = cur;
  }

  function rebuildFlagTopics() {
    var subjSel = $('flagSubj'), topicSel = $('flagTopic');
    if (!subjSel || !topicSel) return;
    var idx = bulkBuildIndex();
    var subj = idx.bySubject[(subjSel.value || '').toLowerCase()];
    topicSel.innerHTML = '<option value="">Select topic</option>';
    topicSel.disabled = !subj;
    if (!subj) return;
    subj.modules.forEach(function (m) {
      var o = document.createElement('option');
      o.value = m.name; o.textContent = m.name;
      topicSel.appendChild(o);
    });
    var cur = (flagDetailQ && flagDetailQ.current_topic) || '';
    if (cur) topicSel.value = cur;
  }

  function openFlagDetail(f) {
    flagDetailId = f.id;
    flagDetailQ = f;
    var detail = $('flagDetail');
    detail.hidden = false;
    var opts = '';
    ['a', 'b', 'c', 'd', 'e'].forEach(function (k) {
      if (f['option_' + k]) {
        opts += '<div>' + (k === (f.answer || '').toLowerCase()
          ? '<b>[' + k.toUpperCase() + ']</b> ' : k.toUpperCase() + '. ') +
          esc(f['option_' + k]) + '</div>';
      }
    });
    var loc = (f.current_subject ? esc(f.current_subject) : 'Question bank') +
      (f.current_topic ? ' / ' + esc(f.current_topic) : '');
    detail.innerHTML =
      '<div class="qhead"><span class="n">Q#' + f.question_num + '</span>' +
      '<span class="am-badge">' + esc(FLAG_REASONS[f.reason] || f.reason) + '</span>' +
      '<span class="sp"></span>' +
      '<span class="am-hint">' + new Date(f.created_at).toLocaleString() + '</span></div>' +
      '<div class="qt rf-view">' + rfToEditor(f.question_text).replace(/ contenteditable="false"/g, '') + '</div>' +
      '<div class="opts">' + opts + '</div>' +
      (f.explanation ? '<div class="expl rf-view"><strong>Explanation:</strong> ' + rfToEditor(f.explanation).replace(/ contenteditable="false"/g, '') + '</div>' : '') +
      '<div class="am-hint">Currently: ' + loc +
      (f.open_flag_count > 1 ? ' · ' + f.open_flag_count + ' open flags on this question' : '') + '</div>' +
      (f.detail ? '<div class="am-hint">User note: ' + esc(f.detail) + '</div>' : '') +
      (f.status !== 'open'
        ? '<div class="am-hint">Status: ' + esc(f.status) +
          (f.resolved_subject ? ' → ' + esc(f.resolved_subject) +
            (f.resolved_topic ? ' / ' + esc(f.resolved_topic) : '') : '') +
          (f.admin_note ? ' · Note: ' + esc(f.admin_note) : '') + '</div>'
        : '') +
      '<div class="am-row" style="margin-top:10px">' +
      '<label>Move to subject <select id="flagSubj"></select></label>' +
      '<label>Topic <select id="flagTopic"></select></label>' +
      '</div>' +
      '<div class="am-row"><label class="am-wide">Admin note <input id="flagNote" maxlength="300"></label></div>' +
      '<div class="am-row">' +
      '<button id="flagMoveBtn" class="am-btn am-btn-primary">Move + resolve</button>' +
      '<button id="flagResolveBtn" class="am-btn">Resolve</button>' +
      '<button id="flagDismissBtn" class="am-btn">Dismiss</button>' +
      '<button id="flagEditBtn" class="am-btn">Edit question</button>' +
      '</div>' +
      '<form id="flagEditForm" class="am-form" hidden>' +
      '<label class="am-wide">Question <textarea id="flagQText" rows="3" required></textarea></label>' +
      '<label>A <input id="flagQA" required></label>' +
      '<label>B <input id="flagQB" required></label>' +
      '<label>C <input id="flagQC" required></label>' +
      '<label>D <input id="flagQD" required></label>' +
      '<label>E <input id="flagQE"></label>' +
      '<label>Answer <select id="flagQAns"><option value="a">A</option><option value="b">B</option><option value="c">C</option><option value="d">D</option><option value="e">E</option></select></label>' +
      '<label class="am-wide">Explanation <textarea id="flagQExpl" rows="2" required></textarea></label>' +
      '<div class="am-wide"><button class="am-btn am-btn-primary" type="submit">Save changes</button></div>' +
      '</form>';
    populateFlagSubj();
    rebuildFlagTopics();
    $('flagSubj').onchange = rebuildFlagTopics;
    $('flagNote').value = '';
    $('flagQText').value = f.question_text || '';
    $('flagQA').value = f.option_a || ''; $('flagQB').value = f.option_b || '';
    $('flagQC').value = f.option_c || ''; $('flagQD').value = f.option_d || '';
    $('flagQE').value = f.option_e || '';
    $('flagQAns').value = (f.answer || 'a').toLowerCase();
    $('flagQExpl').value = f.explanation || '';
    richField($('flagQText'), { alt: 'Question image', placeholder: 'Question text' });
    richField($('flagQExpl'), { alt: 'Explanation image', placeholder: 'Write the explanation…' });
    var openOnly = f.status === 'open';
    ['flagMoveBtn', 'flagResolveBtn', 'flagDismissBtn'].forEach(function (id) {
      $(id).disabled = !openOnly;
    });
    $('flagMoveBtn').onclick = function () {
      var subj = $('flagSubj').value, topic = $('flagTopic').value;
      var hit = subj && topic
        ? bulkBuildIndex().byKey[subj.toLowerCase() + '\n' + topic.toLowerCase()] : null;
      if (!hit) { toast('Pick a subject and topic first.'); return; }
      if (!window.confirm('Move this question to ' + hit.subject + ' / ' + hit.name +
          ' and resolve the flag?')) return;
      sb.rpc('admin_resolve_flag', {
        p_flag_id: f.id, p_module_id: hit.id, p_admin_note: $('flagNote').value.trim()
      }).then(function (r) {
        if (r.error) { toast(rpcErr(r.error)); return; }
        toast('Moved to ' + hit.subject + ' / ' + hit.name + ' and resolved.');
        loadFlags(flagStatus);
      });
    };
    $('flagResolveBtn').onclick = function () {
      sb.rpc('admin_resolve_flag', {
        p_flag_id: f.id, p_module_id: null, p_admin_note: $('flagNote').value.trim()
      }).then(function (r) {
        if (r.error) { toast(rpcErr(r.error)); return; }
        toast('Flag resolved.');
        loadFlags(flagStatus);
      });
    };
    $('flagDismissBtn').onclick = function () {
      sb.rpc('admin_dismiss_flag', {
        p_flag_id: f.id, p_admin_note: $('flagNote').value.trim()
      }).then(function (r) {
        if (r.error) { toast(rpcErr(r.error)); return; }
        toast('Flag dismissed.');
        loadFlags(flagStatus);
      });
    };
    $('flagEditBtn').onclick = function () {
      $('flagEditForm').hidden = !$('flagEditForm').hidden;
    };
    $('flagEditForm').onsubmit = function (ev) {
      ev.preventDefault();
      sb.rpc('admin_update_bank_question', {
        p_question_id: f.question_id,
        p_question_text: $('flagQText').value.trim(),
        p_option_a: $('flagQA').value.trim(), p_option_b: $('flagQB').value.trim(),
        p_option_c: $('flagQC').value.trim(), p_option_d: $('flagQD').value.trim(),
        p_option_e: $('flagQE').value.trim(),
        p_answer: $('flagQAns').value, p_explanation: $('flagQExpl').value.trim()
      }).then(function (r) {
        if (r.error) { toast(rpcErr(r.error)); return; }
        toast('Bank question updated.');
        sb.rpc('admin_list_flags', { p_status: flagStatus }).then(function (lr) {
          var updated = !lr.error && (lr.data || [])
            .filter(function (x) { return x.id === flagDetailId; })[0];
          if (updated) openFlagDetail(updated); else loadFlags(flagStatus);
        });
      });
    };
    detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ---------- init ---------- */
  /* ---------- add past-paper (PYQ) questions ----------
   * Pick exam + session, then paste a whole paper or add questions one at a
   * time. Everything lands in a preview first (kept in localStorage so a
   * 200-question paste survives a reload); each card can be edited, with
   * pictures in the question and the explanation. "Save" sends the whole
   * set to admin_add_pyq_questions in one transaction. */
  var PA_KEY = 'ml_admin_pyq_draft';
  var pa = { rows: [], exam: 'NEET PG', year: '', mode: 'paste', wired: false, open: -1, show: 100 };
  var PA_PAGE = 100, PA_MAX = 300, PA_BATCH = PA_MAX;

  function paLoadDraft() {
    try {
      var d = JSON.parse(localStorage.getItem(PA_KEY) || 'null');
      if (d && Array.isArray(d.rows)) { pa.rows = d.rows; pa.exam = d.exam || pa.exam; pa.year = d.year || ''; }
    } catch (e) { /* ignore */ }
  }
  function paSaveDraft() {
    try {
      if (pa.rows.length) localStorage.setItem(PA_KEY, JSON.stringify({ exam: pa.exam, year: pa.year, rows: pa.rows }));
      else localStorage.removeItem(PA_KEY);
    } catch (e) { /* storage full or blocked: preview still works this session */ }
  }

  function paHtml(text) {
    text = String(text || '').trim();
    return rfIsHtml(text) ? text : esc(text).replace(/\n/g, '<br>');
  }

  var PA_QSTART = /^\s*(?:(?:Q(?:uestion)?|Que?s?)\s*(?:no\.?\s*)?\.?\s*(\d{1,3})?\s*[.):\-]|(\d{1,3})\s*[.)])\s*/i;
  var PA_OPT = /^\s*\(?([A-Ea-e])\s*[).:\]]\s+(.*)$/;
  var PA_ANS = /^\s*(?:Ans(?:wer)?|Correct\s*(?:answer|option|ans)?|Key|Right\s*answer)\s*(?:is)?\s*[:.\-–)]?\s*(?:option)?\s*\(?\s*([A-Ea-e])\s*\)?(?:\s*[.:)\-–]\s*|\s+|$)(.*)$/i;
  var PA_EXP = /^\s*(?:Explanation|Expl?n?|Solution|Rationale|Reason|Discussion)\s*[:.\-–]\s*(.*)$/i;
  var PA_SUBJ = /^\s*Subject\s*:\s*(.*)$/i;

  function paParse(text) {
    text = String(text || '').replace(/\r/g, '').replace(/ /g, ' ');
    var keyMap = {};
    var km = text.match(/^\s*answer\s*key\s*:?\s*$/im);
    if (km) {
      var keyPart = text.slice(km.index + km[0].length);
      text = text.slice(0, km.index);
      keyPart.replace(/(\d{1,3})\s*[-.):=]\s*\(?([A-Ea-e])\)?/g, function (_m, n, L) { keyMap[n] = L.toUpperCase(); return _m; });
    }
    var lines = text.split('\n');
    var blocks = [], cur = [];
    var sepMode = /^\s*-{3,}\s*$/m.test(text);
    function hasOpts(arr) { return arr.some(function (l) { return PA_OPT.test(l); }); }
    lines.forEach(function (line) {
      if (sepMode) {
        if (/^\s*-{3,}\s*$/.test(line)) { blocks.push(cur); cur = []; return; }
      } else if (PA_QSTART.test(line) && !PA_OPT.test(line) && !PA_ANS.test(line) && hasOpts(cur)) {
        blocks.push(cur); cur = [];
      }
      cur.push(line);
    });
    blocks.push(cur);
    var out = [];
    blocks.forEach(function (bl) {
      if (!bl.join('').trim()) return;
      var r = { num: '', q: '', a: '', b: '', c: '', d: '', e: '', ans: '', ex: '', subject: '' };
      var state = 'q', lastOpt = null;
      bl.forEach(function (line, i) {
        var m;
        if (state !== 'ex' && (m = line.match(PA_SUBJ))) { r.subject = m[1].trim(); return; }
        if (state === 'q' && !r.q.trim()) {
          m = line.match(PA_QSTART);
          if (m) { r.num = m[1] || m[2] || ''; line = line.slice(m[0].length); }
          if (/^\s*Q\s*:\s*/i.test(line)) line = line.replace(/^\s*Q\s*:\s*/i, '');
        }
        if (state !== 'ex' && (m = line.match(PA_ANS))) {
          r.ans = m[1].toUpperCase(); state = 'ex';
          if (m[2] && m[2].trim()) r.ex += m[2].trim() + '\n';
          return;
        }
        if ((m = line.match(PA_EXP))) { state = 'ex'; r.ex += m[1] + '\n'; return; }
        if (state === 'ex') { r.ex += line + '\n'; return; }
        // Several options on one line: "(a) X (b) Y (c) Z (d) W"
        var inl = line.match(/\(([a-eA-E])\)\s*[^()]+/g);
        if (inl && inl.length >= 2 && /^\s*\(/.test(line)) {
          inl.forEach(function (part) { var mm = part.match(/\(([a-eA-E])\)\s*(.*)$/); r[mm[1].toLowerCase()] = mm[2].trim(); });
          state = 'opt'; return;
        }
        if ((m = line.match(PA_OPT)) && (state === 'opt' || r.q.trim())) {
          lastOpt = m[1].toLowerCase(); r[lastOpt] = m[2].trim(); state = 'opt'; return;
        }
        if (state === 'opt') {
          if (line.trim() && lastOpt) r[lastOpt] += ' ' + line.trim();
          return;
        }
        r.q += line + '\n';
      });
      if (!r.ans && r.num && keyMap[r.num]) r.ans = keyMap[r.num];
      var row = { q: paHtml(r.q), a: r.a, b: r.b, c: r.c, d: r.d, e: r.e, ans: r.ans, ex: paHtml(r.ex), subject: r.subject };
      out.push(row);
    });
    return out;
  }

  function paProblems(r) {
    var p = [];
    if (!String(r.q || '').replace(/<(?!img)[^>]*>/gi, '').trim()) p.push('No question text');
    if (!r.a || !r.b) p.push('Needs at least options A and B');
    if (!/^[A-E]$/.test(r.ans || '')) p.push('No correct answer');
    else if (!r[r.ans.toLowerCase()]) p.push('Answer ' + r.ans + ' has no option text');
    return p;
  }
  function paWarnings(r) {
    var w = [];
    if (!r.c || !r.d) w.push('Fewer than 4 options');
    if (!String(r.ex || '').replace(/<(?!img)[^>]*>/gi, '').trim()) w.push('No explanation');
    return w;
  }
  function paView(html) { return rfToEditor(html).replace(/ contenteditable="false"/g, ''); }

  function paRender() {
    var list = $('paList');
    var n = pa.rows.length, bad = 0, warn = 0;
    pa.rows.forEach(function (r) { if (paProblems(r).length) bad++; else if (paWarnings(r).length) warn++; });
    $('paCount').textContent = n ? n + (n === 1 ? ' question' : ' questions') : 'empty';
    $('paClearBtn').hidden = !n;
    var year = paYearValue();
    var btn = $('paSaveBtn');
    btn.disabled = !n || bad > 0 || !year;
    btn.textContent = n ? 'Save ' + n + ' to ' + pa.exam + (year ? ' ' + year : '') : 'Save';
    $('paSaveInfo').textContent = !n ? '' : bad ? bad + ' need fixing before you can save.' : !year ? 'Pick or type the session first.' : warn ? warn + ' have a warning (you can still save).' : 'All good.';
    var iss = $('paIssues');
    iss.hidden = !bad;
    iss.innerHTML = bad ? '<b>' + bad + ' to fix:</b> ' + pa.rows.map(function (r, i) {
      return paProblems(r).length ? '<button type="button" class="pa-jump" data-jump="' + i + '">Q' + (i + 1) + '</button>' : '';
    }).join('') : '';
    if (!n) {
      list.innerHTML = pa.done
        ? '<div class="am-card pa-done"><b>Saved ' + pa.done.added + ' questions to ' + esc(pa.done.exam + ' ' + pa.done.year) + '.</b> They are live in the app now.' +
          '<div class="am-row" style="margin-top:10px"><button type="button" class="am-btn am-btn-primary" id="paOpenEdit">Open them in Edit questions</button></div></div>'
        : '<p class="am-hint">Nothing here yet. Paste questions or add one above.</p>';
      if (pa.done) { var d = pa.done; $('paOpenEdit').onclick = function () { openEditPyq(d.exam, d.year); }; }
      return;
    }
    pa.done = null;
    var shown = Math.min(n, Math.max(pa.show, PA_PAGE));
    list.innerHTML = pa.rows.slice(0, shown).map(function (r, i) {
      var probs = paProblems(r), warns = paWarnings(r);
      var opts = ['a', 'b', 'c', 'd', 'e'].filter(function (L) { return r[L]; }).map(function (L) {
        var ok = r.ans === L.toUpperCase();
        return '<li class="' + (ok ? 'ok' : '') + '"><b>' + L.toUpperCase() + '</b> ' + esc(r[L]) + (ok ? ' <span class="pa-tick">✓ answer</span>' : '') + '</li>';
      }).join('');
      return '<div class="am-q pa-card' + (probs.length ? ' bad' : '') + '" data-pa="' + i + '" id="pa-' + i + '">' +
        '<div class="qhead"><span class="n">Q' + (i + 1) + '</span>' +
        (r.subject ? '<span class="am-hint">' + esc(r.subject) + '</span>' : '') + '<span class="sp"></span>' +
        probs.map(function (t) { return '<span class="am-badge pa-bad">' + esc(t) + '</span>'; }).join('') +
        warns.map(function (t) { return '<span class="am-badge pa-warn">' + esc(t) + '</span>'; }).join('') + '</div>' +
        '<div class="qt rf-view">' + paView(r.q) + '</div>' +
        '<ol class="pa-opts">' + opts + '</ol>' +
        (String(r.ex || '').trim() ? '<details class="pa-ex"><summary>Explanation</summary><div class="rf-view">' + paView(r.ex) + '</div></details>' : '') +
        '<div class="am-row pa-acts"><button type="button" class="am-btn" data-act="edit">Edit</button>' +
        '<button type="button" class="am-btn" data-act="up" ' + (i ? '' : 'disabled') + ' aria-label="Move up">↑</button>' +
        '<button type="button" class="am-btn" data-act="down" ' + (i < n - 1 ? '' : 'disabled') + ' aria-label="Move down">↓</button>' +
        '<button type="button" class="am-btn am-btn-danger" data-act="del">Remove</button></div>' +
        '<div class="pa-edit" hidden></div></div>';
    }).join('') + (shown < n
      ? '<div class="am-row pa-more"><button type="button" class="am-btn" data-more="1">Show next ' + Math.min(PA_PAGE, n - shown) + ' (' + (n - shown) + ' more)</button>' +
        '<button type="button" class="am-btn" data-more="all">Show all ' + n + '</button></div>'
      : '');
  }
  function paReveal(i) {
    if (i >= pa.show) { pa.show = Math.ceil((i + 1) / PA_PAGE) * PA_PAGE; paRender(); }
    var el = $('pa-' + i); if (el) el.scrollIntoView({ block: 'center' });
  }

  function paEdit(card, i) {
    var box = card.querySelector('.pa-edit');
    if (!box.hidden) { box.hidden = true; box.innerHTML = ''; return; }
    var r = pa.rows[i];
    box.innerHTML = '<form class="am-form">' +
      '<label class="am-wide">Question <textarea name="q" rows="3"></textarea></label>' +
      ['a', 'b', 'c', 'd', 'e'].map(function (L) { return '<label>' + L.toUpperCase() + ' <input name="' + L + '"></label>'; }).join('') +
      '<label>Correct answer <select name="ans"><option value="">Pick…</option><option>A</option><option>B</option><option>C</option><option>D</option><option>E</option></select></label>' +
      '<label class="am-wide">Explanation <textarea name="ex" rows="4"></textarea></label>' +
      '<div class="am-wide am-row"><button class="am-btn am-btn-primary" type="submit">Done</button>' +
      '<button class="am-btn" type="button" data-act="cancel">Cancel</button></div></form>';
    box.hidden = false;
    var f = box.querySelector('form');
    f.q.value = r.q; f.ex.value = r.ex; f.ans.value = r.ans || '';
    ['a', 'b', 'c', 'd', 'e'].forEach(function (L) { f[L].value = r[L] || ''; });
    richField(f.q, { alt: 'Question image', placeholder: 'Question text' });
    richField(f.ex, { alt: 'Explanation image', placeholder: 'Write the explanation…' });
    f.onsubmit = function (ev) {
      ev.preventDefault();
      r.q = f.q.value.trim(); r.ex = f.ex.value.trim(); r.ans = f.ans.value;
      ['a', 'b', 'c', 'd', 'e'].forEach(function (L) { r[L] = f[L].value.trim(); });
      paSaveDraft(); paRender();
      var el = $('pa-' + i); if (el) el.scrollIntoView({ block: 'center' });
    };
    box.querySelector('[data-act="cancel"]').onclick = function () { box.hidden = true; box.innerHTML = ''; };
  }

  function paYearValue() {
    var v = $('paYear').value;
    if (v === '__new') v = ($('paNew').value || '').trim().replace(/\s+/g, ' ');
    if (v && /^[a-z]/.test(v)) v = v.charAt(0).toUpperCase() + v.slice(1);
    return /^([A-Z][a-z]{2,8} )?(19|20)\d\d$/.test(v) ? v : '';
  }
  function paFillYears(value) {
    fillPyqYearSelect($('paYear'), pa.exam, { allowNew: true, value: value, extra: [] });
    if (!$('paYear').value && $('paYear').options.length) $('paYear').selectedIndex = 0;
    paYearChanged();
  }
  function paYearChanged() {
    var isNew = $('paYear').value === '__new';
    $('paNewWrap').hidden = !isNew;
    var y = paYearValue();
    var hit = (pyqSessions || []).filter(function (r) { return r.pyq_exam === pa.exam && r.pyq_year === y; })[0];
    $('paSessInfo').textContent = isNew && !y
      ? 'Type the session the way the app lists it: a year (2026) or month and year (May 2026).'
      : hit ? pa.exam + ' ' + y + ' already has ' + hit.n + ' questions; new ones are added after them.'
        : y ? pa.exam + ' ' + y + ' is a new session. It appears in the app once you save.' : '';
    pa.year = y;
    paSaveDraft();
    paRender();
  }

  function paSetMode(m) {
    pa.mode = m;
    Array.prototype.forEach.call(document.querySelectorAll('[data-pamode]'), function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-pamode') === m)); });
    $('paPastePane').hidden = m !== 'paste';
    $('paOneForm').hidden = m !== 'one';
    if (m === 'one' && !$('paOneForm')._rf) {
      $('paOneForm')._rf = true;
      richField($('paOneForm').q, { alt: 'Question image', placeholder: 'Question text' });
      richField($('paOneForm').ex, { alt: 'Explanation image', placeholder: 'Write the explanation…' });
    }
  }

  function paSave() {
    var year = paYearValue();
    if (!year || !pa.rows.length) return;
    if (!window.confirm('Save ' + pa.rows.length + ' questions to ' + pa.exam + ' ' + year + '? They go live in the app straight away.')) return;
    var btn = $('paSaveBtn');
    btn.disabled = true;
    $('paSaveInfo').textContent = 'Saving…';
    var rows = pa.rows.map(function (r) {
      return { question_text: r.q, option_a: r.a, option_b: r.b, option_c: r.c, option_d: r.d, option_e: r.e,
        answer: r.ans, explanation: r.ex, subject: r.subject || '' };
    });
    /* Up to PA_MAX (300) questions per save, the server's limit too, so
       this is one request. Every row was checked above with the same rules
       the server uses; if the save still fails, nothing is saved. */
    var exam = pa.exam, saved = 0, total = rows.length;
    function next() {
      if (saved >= total) return done();
      $('paSaveInfo').textContent = total > PA_BATCH ? 'Saving… ' + saved + ' of ' + total : 'Saving…';
      var chunk = rows.slice(saved, saved + PA_BATCH);
      sb.rpc('admin_add_pyq_questions', { p_exam: exam, p_year: year, p_rows: chunk }).then(function (res) {
        if (res.error) return fail(res.error);
        saved += (res.data && res.data.added) || chunk.length;
        next();
      }, fail);
    }
    function fail(err) {
      var m = ((err && err.message) || '').match(/BAD_ROW:(\d+):(\w+)/);
      var badIdx = m ? Number(m[1]) - 1 : -1;
      pa.rows = pa.rows.slice(saved);
      paSaveDraft();
      pyqSessions = null;
      loadPyqSessions(true);
      paRender();
      var why = m ? 'Q' + (badIdx + 1) + ': ' + rpcErr({ message: m[2] }) : rpcErr(err || {}) || 'Could not save.';
      $('paSaveInfo').textContent = (saved ? saved + ' saved. ' : 'Nothing was saved. ') + why + ' The rest are still here; fix and save again.';
      btn.disabled = false;
      if (badIdx >= 0) paReveal(badIdx);
    }
    function done() {
      pa.rows = []; paSaveDraft();
      pa.show = PA_PAGE;
      pa.done = { added: saved, exam: exam, year: year };
      paRender();
      pyqSessions = null;
      loadPyqSessions(true).then(function () { paFillYears(year); });
      $('paSaveInfo').textContent = '';
      toast('Saved ' + saved + ' questions.');
    }
    next();
  }

  function openAddView(src) {
    showView('bankView');
    if (!pa.wired) {
      pa.wired = true;
      paLoadDraft();
      Array.prototype.forEach.call(document.querySelectorAll('[data-addsrc]'), function (b) {
        b.onclick = function () { paShowSrc(b.getAttribute('data-addsrc')); };
      });
      Array.prototype.forEach.call(document.querySelectorAll('[data-pamode]'), function (b) {
        b.onclick = function () { paSetMode(b.getAttribute('data-pamode')); };
      });
      $('paExam').value = pa.exam;
      $('paExam').onchange = function () { pa.exam = $('paExam').value; paFillYears(null); };
      $('paYear').onchange = paYearChanged;
      $('paNew').oninput = paYearChanged;
      $('paParseBtn').onclick = function () {
        var got = paParse($('paText').value);
        if (!got.length) { $('paParseInfo').textContent = 'No questions found in that text.'; return; }
        var room = PA_MAX - pa.rows.length;
        if (room <= 0) { $('paParseInfo').textContent = 'The preview already has ' + PA_MAX + ' questions, the most one save can take. Save these first.'; return; }
        var start = pa.rows.length;
        var take = got.slice(0, room), left = got.length - take.length;
        pa.rows = pa.rows.concat(take);
        paSaveDraft(); paRender();
        var bad = take.filter(function (r) { return paProblems(r).length; }).length;
        $('paParseInfo').textContent = take.length + ' added to the preview' + (bad ? ', ' + bad + ' need fixing' : '') + '.' +
          (left ? ' ' + left + ' more were found but one save takes at most ' + PA_MAX + ': save these, then paste the rest.' : '');
        $('paText').value = '';
        var el = $('pa-' + start); if (el) el.scrollIntoView({ block: 'start' });
      };
      $('paOneForm').onsubmit = function (ev) {
        ev.preventDefault();
        var f = $('paOneForm');
        var r = { q: f.q.value.trim(), a: f.a.value.trim(), b: f.b.value.trim(), c: f.c.value.trim(), d: f.d.value.trim(), e: f.e.value.trim(), ans: f.ans.value, ex: f.ex.value.trim(), subject: '' };
        var probs = paProblems(r);
        if (pa.rows.length >= PA_MAX) probs = ['The preview already has ' + PA_MAX + ' questions; save them first'];
        if (probs.length) { $('paOneInfo').textContent = probs.join(' · '); return; }
        pa.rows.push(r); paSaveDraft(); paRender();
        f.reset(); f.q.value = ''; f.ex.value = '';
        if (f.q._rf) f.q._rf.refresh();
        if (f.ex._rf) f.ex._rf.refresh();
        $('paOneInfo').textContent = 'Added as Q' + pa.rows.length + '. Add the next one.';
      };
      $('paClearBtn').onclick = function () {
        if (!window.confirm('Remove all ' + pa.rows.length + ' questions from the preview? Nothing has been saved yet.')) return;
        pa.rows = []; paSaveDraft(); paRender();
      };
      $('paSaveBtn').onclick = paSave;
      $('paIssues').onclick = function (e) {
        var b = e.target.closest('[data-jump]'); if (!b) return;
        paReveal(Number(b.getAttribute('data-jump')));
      };
      $('paList').onclick = function (e) {
        var mb = e.target.closest('[data-more]');
        if (mb) { pa.show = mb.getAttribute('data-more') === 'all' ? pa.rows.length : pa.show + PA_PAGE; paRender(); return; }
        var b = e.target.closest('[data-act]'); if (!b) return;
        var card = b.closest('[data-pa]'); if (!card || b.closest('.pa-edit')) return;
        var i = Number(card.getAttribute('data-pa')), act = b.getAttribute('data-act');
        if (act === 'edit') paEdit(card, i);
        else if (act === 'del') { pa.rows.splice(i, 1); paSaveDraft(); paRender(); }
        else if (act === 'up' && i > 0) { var t = pa.rows[i - 1]; pa.rows[i - 1] = pa.rows[i]; pa.rows[i] = t; paSaveDraft(); paRender(); }
        else if (act === 'down' && i < pa.rows.length - 1) { var t2 = pa.rows[i + 1]; pa.rows[i + 1] = pa.rows[i]; pa.rows[i] = t2; paSaveDraft(); paRender(); }
      };
    }
    paShowSrc(src || (pa.rows.length ? 'pyq' : 'bank'));
  }
  function paShowSrc(src) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-addsrc]'), function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-addsrc') === src)); });
    $('pyqAddPanel').hidden = src !== 'pyq';
    $('bankAddPanel').hidden = src !== 'bank';
    if (src === 'pyq') {
      $('paExam').value = pa.exam;
      paSetMode(pa.mode);
      loadPyqSessions().then(function () {
        var known = pyqYearsFor(pa.exam).some(function (r) { return r.pyq_year === pa.year; });
        paFillYears(known ? pa.year : null);
        if (pa.year && !known) { $('paYear').value = '__new'; $('paNew').value = pa.year; paYearChanged(); }
      });
      paRender();
    }
  }

  function init() {
    if (!window.supabase) {
      $('gateMsg').textContent = 'Failed to load. Check your connection and refresh.';
      showView('gateView');
      return;
    }
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    wireEditor();
    sb.auth.getSession().then(function (res) {
      var user = res.data.session ? res.data.session.user : null;
      renderAuth(user);
      if (!user) {
        $('gateMsg').textContent = 'Please sign in on the main site first, then return here.';
        showView('gateView');
        return;
      }
      if (!isAdmin(user)) {
        $('gateMsg').textContent = 'This area is for admins only.';
        showView('gateView');
        return;
      }
      loadHome();
    });
    sb.auth.onAuthStateChange(function (_ev, session) {
      var u = session ? session.user : null;
      renderAuth(u);
      if (u && isAdmin(u) && !$('testsView').hidden) loadTests();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
