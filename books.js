/* /books: filters for the book list. The Worker writes the published books
   into the page (and #ml-books as JSON); without it, they are fetched here. */
(function () {
  var SUPABASE_URL = 'https://groeibwykzrliphzzruk.supabase.co';
  var KEY = 'sb_publishable_tXvgKaWrUfWlpy8SB3c1mQ_ZMrHxzVY';
  var EXAMS = { 'neet-pg': 'NEET PG', fmge: 'FMGE', 'ini-cet': 'INI-CET', 'neet-ss': 'NEET SS' };
  var list = document.getElementById('bookList');
  var books = null, exam = '', subject = '';

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function examKey(b) { return b.exam === 'custom' ? 'custom:' + (b.exam_label || '') : b.exam; }
  function examName(b) { return b.exam === 'custom' ? (b.exam_label || 'Other') : (EXAMS[b.exam] || b.exam); }
  function size(n) { return !n ? '' : n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; }
  // Same markup as bookCard() in worker.js.
  function renderBook(b) {
    var t = (b.file_type || 'pdf').toUpperCase(), s = b.subject || 'All subjects';
    return '<article class="bk-card" data-exam="' + esc(examKey(b)) + '" data-subject="' + esc(s) + '">' +
      '<div class="bk-cover bk-t-' + esc(b.file_type || 'pdf') + '" aria-hidden="true"><span>' + esc(t) + '</span></div>' +
      '<div class="bk-body"><div class="bk-tags"><span class="bk-tag">' + esc(examName(b)) + '</span><span class="bk-tag bk-tag-s">' + esc(s) + '</span></div>' +
      '<h2 class="bk-title">' + esc(b.title) + '</h2>' +
      (b.description ? '<p class="bk-desc">' + esc(b.description) + '</p>' : '') +
      '<p class="bk-meta">' + esc(t) + (b.file_size ? ' · ' + size(b.file_size) : '') + (b.pages ? ' · ' + b.pages + ' pages' : '') + '</p>' +
      '<a class="bk-dl" href="' + esc(b.file_url) + '" target="_blank" rel="noopener" download>Download ' + esc(t) + ' — free</a></div></article>';
  }
  function apply() {
    var shown = 0;
    Array.prototype.forEach.call(list.querySelectorAll('.bk-card'), function (c) {
      var s = c.getAttribute('data-subject');
      var ok = (!exam || c.getAttribute('data-exam') === exam) && (!subject || s === subject || s === 'All subjects');
      c.hidden = !ok; if (ok) shown++;
    });
    document.getElementById('bookCount').textContent = shown;
    document.getElementById('bookNone').hidden = shown > 0 || !books.length;
    Array.prototype.forEach.call(document.querySelectorAll('#bookExams button'), function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-x') === exam)); });
    try { history.replaceState(null, '', location.pathname + (exam || subject ? '?' + [exam ? 'exam=' + encodeURIComponent(exam) : '', subject ? 'subject=' + encodeURIComponent(subject) : ''].filter(Boolean).join('&') : '')); } catch (e) {}
  }
  function setup(rows) {
    books = rows || [];
    if (!list.querySelector('.bk-card') && books.length) list.innerHTML = books.map(renderBook).join('');
    if (!books.length) { list.innerHTML = '<p class="bk-empty">No books yet — check back soon.</p>'; document.getElementById('bookCount').textContent = '0'; return; }
    var seen = {}, chips = [['', 'All']];
    books.forEach(function (b) { var k = examKey(b); if (!seen[k]) { seen[k] = 1; chips.push([k, examName(b)]); } });
    var subs = {};
    books.forEach(function (b) { if (b.subject) subs[b.subject] = 1; });
    document.getElementById('bookExams').innerHTML = chips.map(function (c) { return '<button type="button" data-x="' + esc(c[0]) + '">' + esc(c[1]) + '</button>'; }).join('');
    var sel = document.getElementById('bookSubject');
    sel.innerHTML = '<option value="">All subjects</option>' + Object.keys(subs).sort().map(function (s) { return '<option>' + esc(s) + '</option>'; }).join('');
    var q = new URLSearchParams(location.search);
    exam = seen[q.get('exam') || ''] ? q.get('exam') : '';
    subject = subs[q.get('subject') || ''] ? q.get('subject') : '';
    sel.value = subject;
    document.getElementById('bookFilters').hidden = chips.length < 3 && Object.keys(subs).length < 2;
    document.getElementById('bookExams').onclick = function (e) { var b = e.target.closest('button'); if (b) { exam = b.getAttribute('data-x'); apply(); } };
    sel.onchange = function () { subject = sel.value; apply(); };
    apply();
  }
  var pre = document.getElementById('ml-books');
  if (pre) { try { setup(JSON.parse(pre.textContent)); return; } catch (e) {} }
  fetch(SUPABASE_URL + '/rest/v1/books?published=eq.true&select=id,title,description,exam,exam_label,subject,file_url,file_type,file_size,pages&order=sort.asc,created_at.desc', { headers: { apikey: KEY } })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(setup)
    .catch(function () { list.innerHTML = '<p class="bk-empty">Could not load the books. Refresh the page to try again.</p>'; });
})();
