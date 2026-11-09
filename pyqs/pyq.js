(function () {
  var questions = document.querySelectorAll('.pyq-q');
  if (!questions.length) return;
  var answeredEl = document.getElementById('pyq-answered');
  var correctEl = document.getElementById('pyq-correct');
  var totalEl = document.getElementById('pyq-total');
  var barEl = document.getElementById('pyq-bar');

  function update() {
    var answered = document.querySelectorAll('.pyq-q.answered').length;
    var correct = document.querySelectorAll('.pyq-q.correct').length;
    if (answeredEl) answeredEl.textContent = answered;
    if (correctEl) correctEl.textContent = correct;
    if (totalEl) totalEl.textContent = questions.length;
    if (barEl) barEl.style.width = (questions.length ? (answered / questions.length * 100) : 0) + '%';
  }

  questions.forEach(function (q) {
    var answer = q.getAttribute('data-answer');
    var details = q.querySelector('details.pyq-feedback');
    q.querySelectorAll('.pyq-opt').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (q.classList.contains('answered')) return;
        var picked = btn.getAttribute('data-opt');
        q.classList.add('answered');
        if (picked === answer) {
          btn.classList.add('is-correct');
          q.classList.add('correct');
        } else {
          btn.classList.add('is-wrong');
          var right = q.querySelector('.pyq-opt[data-opt="' + answer + '"]');
          if (right) right.classList.add('is-correct');
        }
        if (details) details.open = true;
        update();
      });
    });
  });

  var showAll = document.getElementById('pyq-show-all');
  if (showAll) showAll.addEventListener('click', function () {
    document.querySelectorAll('details.pyq-feedback').forEach(function (d) { d.open = true; });
  });

  var reset = document.getElementById('pyq-reset');
  if (reset) reset.addEventListener('click', function () {
    questions.forEach(function (q) {
      q.classList.remove('answered', 'correct');
      q.querySelectorAll('.pyq-opt').forEach(function (b) { b.classList.remove('is-correct', 'is-wrong'); });
      var d = q.querySelector('details.pyq-feedback');
      if (d) d.open = false;
    });
    update();
  });

  update();

  // Context-aware CTA for individual PYQ paper/session pages.
  // The main app validates exam/year again and applies its existing auth/Pro gates.
  try {
    var pathParts = window.location.pathname.replace(/\\/$/, '').split('/').filter(Boolean);
    if (pathParts[0] === 'pyqs' && pathParts.length >= 3) {
      var examSlug = pathParts[1].toLowerCase();
      var yearSlug = pathParts[2].toLowerCase();
      var examMap = {
        'neet-pg': 'NEET PG',
        'ini-cet': 'INICET',
        'fmge': 'FMGE'
      };
      var examId = examMap[examSlug];
      var yearMap = {
        'jan-2025': 'Jan 2025', 'july-2025': 'July 2025',
        'jan-2024': 'Jan 2024', 'june-2024': 'June 2024',
        'jan-2023': 'Jan 2023', 'july-2023': 'July 2023',
        'june-2022': 'June 2022', 'june-2021': 'June 2021',
        'dec-2021': 'Dec 2021', 'dec-2020': 'Dec 2020',
        'may-2025': 'May 2025', 'nov-2024': 'Nov 2024',
        'may-2024': 'May 2024', 'nov-2023': 'Nov 2023',
        'may-2023': 'May 2023', 'nov-2022': 'Nov 2022',
        'may-2022': 'May 2022', 'nov-2021': 'Nov 2021',
        'may-2021': 'May 2021', 'nov-2020': 'Nov 2020',
        '2018': '2018', '2019': '2019', '2020': '2020',
        '2021': '2021', '2022': '2022', '2023': '2023',
        '2024': '2024', '2025': '2025'
      };
      var paperYear = yearMap[yearSlug];
      if (examId && paperYear) {
        var cta = document.createElement('a');
        cta.className = 'btn';
        cta.href = '/?openPyq=' + encodeURIComponent(examId) + '&year=' + encodeURIComponent(paperYear);
        cta.textContent = 'Explore Complete Question Bank — ' + examId + ' ' + paperYear;
        cta.setAttribute('aria-label', cta.textContent);
        cta.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;margin:18px auto;padding:13px 22px;text-decoration:none;font-weight:700;';
        var main = document.querySelector('main');
        if (main) {
          var wrap = document.createElement('div');
          wrap.style.cssText = 'display:flex;justify-content:center;flex-wrap:wrap;margin:8px 0 22px;';
          wrap.appendChild(cta);
          main.appendChild(wrap);
        }
      }
    }
  } catch (e) {}

})();
