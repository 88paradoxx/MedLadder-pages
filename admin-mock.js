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
    ['gateView', 'testsView', 'editorView'].forEach(function (v) {
      $(v).hidden = v !== id;
    });
    window.scrollTo(0, 0);
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

  /* ---------- bulk paste ---------- */
  function parseBulk(text) {
    var out = [];
    text.split(/^\s*---+\s*$/m).forEach(function (block) {
      block = block.trim();
      if (!block) return;
      var q = { text: '', a: '', b: '', c: '', d: '', e: '', answer: '', explanation: '', subject: '' };
      var cur = null;
      block.split('\n').forEach(function (line) {
        var m = line.match(/^(Q|A|B|C|D|E|Answer|Explanation|Subject)\s*:\s*(.*)$/i);
        if (m) {
          var k = m[1].toLowerCase();
          cur = (k === 'q') ? 'text' : k;
          q[cur] = m[2].trim();
        } else if (cur === 'explanation' || cur === 'text') {
          q[cur] += '\n' + line;
        }
      });
      q.answer = q.answer.toLowerCase().replace(/[^a-e]/g, '').charAt(0);
      if (q.text && q.a && q.b && q.answer) out.push(q);
    });
    return out;
  }

  function previewBulk() {
    bulkParsed = parseBulk($('bulkText').value);
    var pv = $('bulkPreview');
    $('bulkInfo').textContent = bulkParsed.length + ' valid question(s) found.';
    $('bulkImportBtn').disabled = !bulkParsed.length;
    pv.innerHTML = '';
    bulkParsed.slice(0, 5).forEach(function (q, i) {
      var div = document.createElement('div');
      div.className = 'am-q';
      div.innerHTML = '<div class="qhead"><span class="n">#' + (i + 1) + '</span></div>' +
        '<div class="qt">' + esc(q.text.slice(0, 160)) + (q.text.length > 160 ? '…' : '') + '</div>' +
        '<div class="opts">Answer: <b>' + q.answer.toUpperCase() + '</b>' +
        (q.subject ? ' · ' + esc(q.subject) : '') + '</div>';
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
    var i = 0;
    function next() {
      if (i >= bulkParsed.length) {
        $('bulkInfo').textContent = 'Imported ' + bulkParsed.length + ' questions.';
        $('bulkText').value = ''; bulkParsed = [];
        loadQuestions();
        return;
      }
      var q = bulkParsed[i++];
      sb.rpc('admin_add_question', {
        p_test_id: editingTestId,
        p_question_text: q.text, p_option_a: q.a, p_option_b: q.b,
        p_option_c: q.c, p_option_d: q.d, p_option_e: q.e,
        p_answer: q.answer, p_explanation: q.explanation, p_subject: q.subject
      }).then(function (r) {
        if (r.error) { toast('Import stopped: ' + rpcErr(r.error)); return; }
        $('bulkInfo').textContent = 'Importing… ' + i + '/' + bulkParsed.length;
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
