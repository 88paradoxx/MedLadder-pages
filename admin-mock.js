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
        return '<img class="am-qimg" loading="lazy" src="' + src +
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
    ['gateView', 'testsView', 'editorView', 'bankView'].forEach(function (v) {
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
    sb.rpc('admin_add_bank_question', d).then(function (r) {
      if (r.error) { toast(rpcErr(r.error)); return; }
      var num = (r.data && r.data.question_num) || '';
      toast('Added to bank (question #' + num + ').');
      $('bankInfo').textContent = 'Last added: question #' + num + ' → ' +
        hit.subject + ' / ' + hit.name;
      // Keep the subject/topic: only the question fields are cleared, so the
      // next question goes to the same topic without re-picking.
      ['bqText', 'bqA', 'bqB', 'bqC', 'bqD', 'bqE', 'bqExpl'].forEach(function (id) {
        $(id).value = '';
      });
      $('bqAns').value = 'a';
    });
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

  function wireEditor() {
    $('backBtn').onclick = loadTests;
    $('newTestBtn').onclick = function () { openEditor(null); };
    $('bankBtn').onclick = function () { showView('bankView'); };
    $('bankBackBtn').onclick = loadTests;
    $('bankQForm').onsubmit = submitBankQuestion;
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

  /* ---------- init ---------- */
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
      loadTests();
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
