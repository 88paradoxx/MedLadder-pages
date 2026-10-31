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
})();
