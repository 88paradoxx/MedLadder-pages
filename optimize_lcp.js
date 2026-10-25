const fs = require('fs');
const path = require('path');

const BASE_DIR = __dirname;

// 1. Read syllabus
eval(fs.readFileSync(path.join(BASE_DIR, 'syllabus.js'), 'utf8').replace('window.', 'global.'));
const syllabus = global.SYLLABUS_DATA;

const SUBJECT_META = {
  'Anatomy': { cat: 'pre', catLabel: 'Pre-Clinical', icon: '🦴' },
  'Physiology': { cat: 'pre', catLabel: 'Pre-Clinical', icon: '🫀' },
  'Biochemistry': { cat: 'pre', catLabel: 'Pre-Clinical', icon: '🧪' },
  'Pathology': { cat: 'para', catLabel: 'Para-Clinical', icon: '🔬' },
  'Microbiology': { cat: 'para', catLabel: 'Para-Clinical', icon: '🧫' },
  'Pharmacology': { cat: 'para', catLabel: 'Para-Clinical', icon: '💊' },
  'Forensic Medicine': { cat: 'para', catLabel: 'Para-Clinical', icon: '⚖️' },
  'ENT': { cat: 'clinical', catLabel: 'Clinical', icon: '👂' },
  'Ophthalmology': { cat: 'clinical', catLabel: 'Clinical', icon: '👁️' },
  'PSM': { cat: 'clinical', catLabel: 'Clinical', icon: '🌐' },
  'Medicine': { cat: 'clinical', catLabel: 'Clinical', icon: '🩺' },
  'Surgery': { cat: 'clinical', catLabel: 'Clinical', icon: '✂️' },
  'OB & G': { cat: 'clinical', catLabel: 'Clinical', icon: '🤰' },
  'Pediatrics': { cat: 'clinical', catLabel: 'Clinical', icon: '👶' },
  'Anaesthesia': { cat: 'clinical', catLabel: 'Clinical', icon: '💉' },
  'Dermatology': { cat: 'clinical', catLabel: 'Clinical', icon: '🧴' },
  'Orthopaedics': { cat: 'clinical', catLabel: 'Clinical', icon: '🩻' },
  'Psychiatry': { cat: 'clinical', catLabel: 'Clinical', icon: '🧠' },
  'Radiology': { cat: 'clinical', catLabel: 'Clinical', icon: '⚡' }
};

function esc(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const totalQuestions = 37076;
const totalQStr = '37,076';

const subjectRows = syllabus.map((s, i) => {
  const meta = SUBJECT_META[s.name] || { cat: 'clinical', catLabel: 'Clinical', icon: '📚' };
  const delay = Math.min(i, 12) * 0.02;
  const qFmt = (s.questionCount || 0).toLocaleString();
  const mCount = s.moduleCount || 0;
  return `      <button class="item" data-sid="${s.subjectId}" data-cat="${meta.cat}" data-name="${esc(s.name.toLowerCase())}" style="animation-delay:${delay.toFixed(2)}s">
        <div class="item-icon-box">${meta.icon}</div>
        <div class="info">
          <span class="item-category-tag">${meta.catLabel}</span>
          <span class="cname">${esc(s.name)}</span>
          <span class="cmeta">${qFmt} questions · ${mCount} topics</span>
        </div>
        <span class="arrow">›</span>
      </button>`;
}).join('\n');

const PYQ_EXAMS = [
  { id: 'NEET PG', icon: '🏥', name: 'NEET PG', label: 'National Eligibility cum Entrance Test PG', coverage: '2018 – 2025 · 8 Years (1,640+ MCQs)' },
  { id: 'INICET', icon: '🔬', name: 'INICET', label: 'Institute of National Importance CET', coverage: '2020 – 2025 · 10 Sessions (1,460+ MCQs)' },
  { id: 'FMGE', icon: '🌐', name: 'FMGE', label: 'Foreign Medical Graduate Examination', coverage: '2020 – 2025 · 10 Sessions (2,430+ MCQs)' },
  { id: 'AIIMS', icon: '🏛️', name: 'AIIMS PG', label: 'All India Institute of Medical Sciences', coverage: '2019 – 2020 Recalls · High-Yield' },
  { id: 'NEET SS', icon: '⚕️', name: 'NEET SS', label: 'Super Speciality Entrance Test', coverage: '2022 – 2024 Exam Question Papers' }
];

const pyqCards = PYQ_EXAMS.map(exam => {
  const covHtml = exam.coverage ? `<span class="pyq-year-badge">📅 ${esc(exam.coverage)}</span>` : '';
  return `        <button class="pyq-exam-card" data-pyq-exam="${esc(exam.id)}" title="${esc(exam.label)}">
          <span class="pyq-exam-icon">${exam.icon}</span>
          <span class="pyq-exam-info">
            <strong>${esc(exam.name)}</strong>
            <span>${esc(exam.label)}</span>
            ${covHtml}
          </span>
          <span class="pyq-exam-lock">🔒 PRO</span>
        </button>`;
}).join('\n');

const pyqSectionHtml = `    <div class="pyq-section-wrap">
      <button class="pyq-section-header" id="pyqBankToggle" aria-expanded="false">
        <div class="pyq-header-left">
          <span class="pyq-header-icon">📚</span>
          <div class="pyq-header-text">
            <strong>Previous Year Questions (PYQ Bank)</strong>
            <span>NEET PG · INICET · AIIMS · NEET SS · FMGE — Pro Feature</span>
          </div>
        </div>
        <div class="pyq-header-right">
          <span class="pyq-pro-badge">⭐ PRO</span>
          <span class="pyq-chevron">▾</span>
        </div>
      </button>
      <div class="pyq-cards-wrap" id="pyqCardsWrap">
        <div class="pyq-cards-grid">
${pyqCards}
        </div>
      </div>
    </div>`;

const prerenderedHome = `    <header class="masthead glass" role="banner">
      <a href="/" class="brand" style="text-decoration:none;"><span class="brand-icon">⚡</span><span>MedLadder</span></a>
      <span class="right">
        <span class="stat"><span class="stat-dot"></span>${totalQStr} MCQs</span>
        <button class="btn-go-pro" id="headerGoProBtn" title="Upgrade to MedLadder Pro (₹199)">⚡ Pro</button>
        <button class="auth-btn" id="authTriggerBtn" title="Sign in or create account"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg><span>Sign In</span></button>
        <button class="theme-toggle" id="themeToggle" title="Switch to light mode" aria-label="Toggle theme">☀</button>
      </span>
    </header>
    <main id="mainContent" role="main">
    <div class="hero-wrap">
      <div class="hero-eyebrow">⚡ FMGE · NEET PG · INI-CET · NEET SS</div>
      <h1 class="title">Med<span class="brand-gradient">Ladder</span></h1>
      <p class="subtitle">Your climb through FMGE, NEET PG, INICET &amp; NEET SS — 19 subjects, ${totalQStr} MCQs including Previous Year Questions. Pick a subject or launch a PYQ test.</p>
      <div class="bento-bar">
        <div class="bento-stat"><div class="bento-stat-num">19</div><div class="bento-stat-lbl">Subjects</div></div>
        <div class="bento-stat"><div class="bento-stat-num">739</div><div class="bento-stat-lbl">Topics</div></div>
        <div class="bento-stat"><div class="bento-stat-num">${totalQStr}</div><div class="bento-stat-lbl">Total MCQs</div></div>
        <div class="bento-stat"><div class="bento-stat-num">5 Exams</div><div class="bento-stat-lbl">PYQ Papers</div></div>
      </div>
      <div class="home-controls">
        <div class="home-search-wrap">
          <span class="home-search-icon">🔍</span>
          <input type="text" id="homeSearchInput" class="home-search-input" placeholder="Search 19 subjects or keywords (e.g. Anatomy, Cardiology, Surgery)..." autocomplete="off" />
          <button class="home-search-clear hidden" id="homeSearchClear">✕</button>
        </div>
        <div class="category-tabs">
          <button class="cat-tab active" data-filter="all">All (19)</button>
          <button class="cat-tab" data-filter="pre">Pre-Clinical (3)</button>
          <button class="cat-tab" data-filter="para">Para-Clinical (4)</button>
          <button class="cat-tab" data-filter="clinical">Clinical (12)</button>
          <button class="cat-tab" data-filter="pyq">⭐ PYQ Banks (5)</button>
        </div>
      </div>
    </div>
    <div class="subject-grid" id="subjectGrid">
${subjectRows}
    </div>
    <div id="homeNoMatch" class="no-match-card hidden">No subjects match your search.</div>
${pyqSectionHtml}
    <div class="mode-note" id="homeModeNote">
      <span>Progress is kept for this session only.</span> <button class="auth-link" id="noteSignInBtn" style="font-weight:600;">Sign in to save progress</button> <span class="mode-note-sep" aria-hidden="true">·</span> <button class="reset-link" id="resetAll">Reset all progress</button>
    </div>
    </main>
    <footer class="credit">
      <div class="footer-content">
        <div class="footer-social-row">
          <a href="https://www.facebook.com/profile.php?id=61568903965858" target="_blank" rel="noopener noreferrer" class="footer-social-btn fb" aria-label="Facebook" title="MedLadder on Facebook">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
          </a>
          <a href="https://www.instagram.com/medladder2026/" target="_blank" rel="noopener noreferrer" class="footer-social-btn insta" aria-label="Instagram" title="MedLadder on Instagram">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
          </a>
          <a href="https://x.com/medladder2026" target="_blank" rel="noopener noreferrer" class="footer-social-btn x-tw" aria-label="X (formerly Twitter)" title="MedLadder on X">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 23.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
          </a>
        </div>
        <div class="footer-links-row">
          <a href="/privacy" class="footer-link">Privacy Policy</a>
          <span class="footer-dot" aria-hidden="true">·</span>
          <a href="/terms" class="footer-link">Terms of Service</a>
          <span class="footer-dot" aria-hidden="true">·</span>
          <a href="/terms#cancellation-refund" class="footer-link">Refund Policy</a>
        </div>
        <div class="footer-copy">
          <strong>MedLadder</strong> · Medical Entrance Exam Question Bank
        </div>
        <div class="footer-subcopy">
          FMGE, NEET PG, INICET &amp; NEET SS · Main QBank, QRP &amp; PYQs
        </div>
      </div>
    </footer>
`;

console.log('Generated prerendered home body (length:', prerenderedHome.length, ')');

// 2. Read full authoritative stylesheet and extract complete Critical Home Viewport CSS
const appCss = fs.readFileSync(path.join(BASE_DIR, 'app.css'), 'utf8');

const part1End = appCss.indexOf('.qmeta-row');
const part1 = appCss.substring(0, part1End);

const pyqStart = appCss.indexOf('.pyq-section-wrap');
const pyqEnd = appCss.indexOf('.pyq-year-pill');
const pyqPart = appCss.substring(pyqStart, pyqEnd);

const noMatchStart = appCss.indexOf('.no-match-card');
const noMatchEnd = appCss.indexOf('.timer-badge');
const noMatchPart = appCss.substring(noMatchStart, noMatchEnd);

const hiddenStart = appCss.indexOf('.hidden{');
const hiddenEnd = appCss.indexOf('footer.credit');
const hiddenPart = appCss.substring(hiddenStart, hiddenEnd);

const authBtnStart = appCss.indexOf('.auth-btn{');
const authBtnEnd = appCss.indexOf('.auth-dropdown');
const authBtnPart = appCss.substring(authBtnStart, authBtnEnd);

const authLinkStart = appCss.indexOf('.auth-link{');
const authLinkEnd = appCss.indexOf('.auth-spinner');
const authLinkPart = appCss.substring(authLinkStart, authLinkEnd);

const pyqBadgeStart = appCss.indexOf('.pyq-year-badge{');
const pyqBadgeEnd = appCss.indexOf('.pyq-source-note');
const pyqBadgePart = appCss.substring(pyqBadgeStart, pyqBadgeEnd);

const footerStart = appCss.indexOf('.mode-note-sep');
const footerPart = appCss.substring(footerStart);

const criticalCss = [
  part1,
  noMatchPart,
  hiddenPart,
  authBtnPart,
  authLinkPart,
  pyqPart,
  pyqBadgePart,
  footerPart,
  '.admin-footer-link { cursor: pointer; }'
].join('\n').trim();

console.log('Assembled complete Critical Home CSS (length:', criticalCss.length, 'bytes)');

// 3. Assemble optimized index.html
const indexHtml = `<!DOCTYPE html>
<html lang="en" class="dark">

<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MedLadder — FMGE, NEET PG, INI-CET &amp; NEET SS QBank</title>
  <meta name="description" content="Prepare for FMGE, NEET PG, INI-CET and NEET SS with MedLadder. Practice 37,076 medical MCQs, previous-year questions, detailed explanations and track your performance.">
  <meta name="robots" content="index, follow, max-image-preview:large">
  <link rel="canonical" href="https://medladder.top/">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="MedLadder">
  <meta property="og:title" content="MedLadder — FMGE, NEET PG, INI-CET &amp; NEET SS QBank">
  <meta property="og:description" content="Prepare for FMGE, NEET PG, INI-CET and NEET SS with MedLadder. Practice 37,076 medical MCQs, previous-year questions, detailed explanations and track your performance.">
  <meta property="og:url" content="https://medladder.top/">
  <meta property="og:image" content="https://medladder.top/og-image.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="MedLadder — FMGE, NEET PG, INI-CET &amp; NEET SS QBank">
  <meta name="twitter:description" content="Prepare for FMGE, NEET PG, INI-CET and NEET SS with MedLadder. Practice 37,076 medical MCQs, previous-year questions, detailed explanations and track your performance.">
  <meta name="twitter:image" content="https://medladder.top/og-image.png">

  <!-- PWA Support -->
  <link rel="manifest" href="/manifest.json">
  <meta name="theme-color" content="#7B2FF7">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="MedLadder">
  <link rel="apple-touch-icon" href="/icons/icon-192.png">
  <link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192.png">
  <link rel="icon" type="image/png" sizes="512x512" href="/icons/icon-512.png">
  <link rel="icon" href="/favicon.ico" sizes="any">

  <!-- Structured Data -->
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "name": "MedLadder",
    "url": "https://medladder.top/",
    "description": "Medical entrance and postgraduate exam question bank for FMGE, NEET PG, INI-CET and NEET SS."
  }
  </script>
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "EducationalOrganization",
    "name": "MedLadder",
    "url": "https://medladder.top/"
  }
  </script>
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": "What medical entrance exams does MedLadder cover?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "MedLadder is specifically built for FMGE, NEET PG, INI-CET, AIIMS, and NEET SS preparation, covering 19 subjects and 37,076 MCQs."
        }
      },
      {
        "@type": "Question",
        "name": "Are previous-year question papers (PYQs) included?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Yes! MedLadder contains verified PYQ banks covering NEET PG (2018–2025), INI-CET (2020–2025), FMGE (2020–2025), AIIMS PG, and NEET SS."
        }
      },
      {
        "@type": "Question",
        "name": "How many modules can I practice for free?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "The first 8 modules in every single subject are completely free, with full access to questions, answer keys, and detailed explanations."
        }
      },
      {
        "@type": "Question",
        "name": "Can I practice questions in timed test mode?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Yes. MedLadder supports both Practice Mode (instant answer feedback) and Exam Mode (timed tests with customizable question limits and end-of-test review)."
        }
      }
    ]
  }
  </script>

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@500;600;700;800&display=optional" media="print" id="gfonts-css">
  <noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@500;600;700;800&display=optional"></noscript>

  <link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
  <style id="critical-css">${criticalCss}</style>
  <link rel="stylesheet" href="/app.css" media="print" id="full-app-css">
  <noscript><link rel="stylesheet" href="/app.css"></noscript>
</head>

<body>

  <div class="app" id="app">
${prerenderedHome}
  </div>

  <!-- Deferred Scripts -->
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js" crossorigin="anonymous" integrity="sha384-0w2KAL2YHP6wKOkUDzkCDGgVvfmHnj02DHeQ6XcHOgTfFsGyonKOpShMH1x6nk9o" defer></script>
  <script src="/syllabus.js" defer></script>
  <script src="/gtag-init.js" defer></script>
  <script src="/app.js" defer></script>
  <script src="/analytics-loader.js" defer></script>
</body>

</html>
`;

fs.writeFileSync(path.join(BASE_DIR, 'index.html'), indexHtml, 'utf8');
console.log('✓ Successfully wrote optimized index.html (size:', indexHtml.length, 'bytes)');
