window.addEventListener('error', function (ev) {
      document.documentElement.classList.add('app-ready');
      var app = document.getElementById('app');
      if (app && app.textContent.indexOf('Loading question bank') !== -1) {
        app.innerHTML = '<main id="mainContent" role="main" style="padding:40px 20px;text-align:center;">' +
          '<div style="font-size:17px;font-weight:700;margin-bottom:10px;">Something went wrong loading the app</div>' +
          '<div style="font-size:13px;color:#888;">' + (ev && ev.message ? String(ev.message).replace(/</g, '&lt;') : 'Unknown error') + '</div></main>';
      }
    });

    (function () {
      "use strict";

      // Keep optional web fonts non-blocking; app stylesheets load before paint.
      try {
        var gf = document.getElementById('gfonts-css');
        if (gf && gf.media !== 'all') { gf.media = 'all'; }
      } catch (e) {}

      // ─── GA4 TELEMETRY & ATTRIBUTION ──────────────────────────────────────────
      function trackEvent(eventName, eventParams) {
        try {
          if (typeof window.gtag === 'function') {
            window.gtag('event', eventName, eventParams || {});
          } else if (window.dataLayer && Array.isArray(window.dataLayer)) {
            window.dataLayer.push(Object.assign({ event: eventName }, eventParams || {}));
          }
          if (window.MedLadderAndroidApp && typeof window.MedLadderAndroidApp.logEvent === 'function') {
            window.MedLadderAndroidApp.logEvent(eventName, JSON.stringify(eventParams || {}));
          }
        } catch (err) {}
      }

      // ─── GA4 SPA VIRTUAL PAGEVIEWS ─────────────────────────────────────────
      // The gtag config sends one automatic page_view for the initial load.
      // Every later in-app view sends exactly one manual page_view via
      // trackPageView(path, view). Same view+path re-renders are ignored, and
      // the load view itself is never double-counted: its first call is
      // skipped because the config already covered that URL.
      var __mlLoadPath = window.location.pathname || '/';
      var __mlLoadViewCounted = false;
      var __mlLastViewKey = null;
      function trackPageView(path, view, title) {
        try {
          var p = path || window.location.pathname || '/';
          var key = (view || 'view') + '|' + p;
          if (!__mlLoadViewCounted && p === __mlLoadPath) { __mlLoadViewCounted = true; __mlLastViewKey = key; return; }
          if (key === __mlLastViewKey) return;
          __mlLastViewKey = key;
          trackEvent('page_view', {
            page_title: title || document.title,
            page_location: 'https://medladder.top' + p,
            page_path: p
          });
        } catch (err) {}
      }
      function pyqSlug(examId) {
        var s = String(examId || '').toLowerCase();
        if (s === 'inicet') return 'ini-cet';
        return s.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      }
      function practiceBasePath() {
        try {
          if (state.isPyqMode && state.pyqExam) return '/pyqs/' + pyqSlug(state.pyqExam);
          if (state.moduleId === 'bookmarks') return '/bookmarks';
          if (state.idSet) return '/' + state.idSet.kind;
          if (state.moduleId === 'custom') return '/custom-module';
          var subj = null, mod = null;
          if (state.subjectId) {
            subj = SUBJECT_INDEX.find(function (s) { return s.subjectId === state.subjectId; });
            if (subj && state.moduleId && state.moduleId !== 'all') {
              mod = getSubjectModules(state.subjectId).find(function (m) { return m.moduleId === state.moduleId; });
            }
          }
          if (subj && mod) return topicPath(subj, mod);
          if (subj) return subjectPath(subj) + (state.moduleId === 'all' ? '/all' : '');
          return '/';
        } catch (err) { return '/'; }
      }

      // Preserve campaign UTM attribution across auth / payment redirects
      (function captureUtmParams() {
        try {
          if (window.location.search && typeof URLSearchParams !== 'undefined') {
            var params = new URLSearchParams(window.location.search);
            ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].forEach(function (k) {
              var v = params.get(k);
              if (v) sessionStorage.setItem('medladder_' + k, v);
            });
          }
        } catch (e) {}
      })();

      var app = document.getElementById('app');
      var SYLLABUS;

      var SUBJECT_INDEX;
      try {
        if (typeof window.SYLLABUS_DATA !== 'undefined' && Array.isArray(window.SYLLABUS_DATA) && window.SYLLABUS_DATA.length > 0) {
          SYLLABUS = window.SYLLABUS_DATA;
        } else {
          var idxEl = document.getElementById('syllabus-index');
          if (!idxEl) throw new Error('Syllabus index not found on page.');
          SYLLABUS = JSON.parse(idxEl.textContent);
        }
        if (!SYLLABUS || !SYLLABUS.length) throw new Error('Syllabus index parsed empty.');
        var SUBJECT_META = {
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

        SUBJECT_INDEX = SYLLABUS.map(function (s) {
          var meta = SUBJECT_META[s.name] || { cat: 'clinical', catLabel: 'Clinical', icon: '📚' };
          return {
            subjectId: s.subjectId,
            name: s.name,
            moduleCount: s.moduleCount,
            questionCount: s.questionCount,
            modules: Array.isArray(s.modules) ? s.modules : [],
            cat: meta.cat,
            catLabel: meta.catLabel,
            icon: meta.icon
          };
        });
      } catch (e) {
        app.innerHTML = '<main id="mainContent" role="main" style="padding:40px 20px;text-align:center;">' +
          '<div style="font-size:17px;font-weight:700;margin-bottom:10px;">Couldn\'t load the question bank syllabus</div>' +
          '<div style="font-size:13px;color:#888;">' + (e && e.message ? e.message.replace(/</g, '&lt;') : 'Unknown error') + '</div></main>';
        throw e;
      }

      // ---- live question counts (site_counts RPC) ---------------------------
      // syllabus.js carries the counts from the last build. Once the database
      // answers, every topic, subject and total in the app uses live numbers.
      var LIVE_COUNTS = null;
      function applySiteCounts(c) {
        if (!c || !c.modules) return false;
        var changed = false;
        SYLLABUS.forEach(function (sub, si) {
          var sum = 0;
          (sub.modules || []).forEach(function (m) {
            var n = Number(c.modules[m.id] || 0);
            if (m.questionCount !== n) { m.questionCount = n; changed = true; }
            sum += n;
          });
          if (sub.questionCount !== sum) { sub.questionCount = sum; changed = true; }
          if (SUBJECT_INDEX[si]) SUBJECT_INDEX[si].questionCount = sum;
        });
        if (applyPyqSessions(c.pyq_sessions)) changed = true;
        if (!LIVE_COUNTS || LIVE_COUNTS.total !== c.total) changed = true;
        LIVE_COUNTS = c;
        return changed;
      }
      // Past-paper sessions come from the database too, so a paper added in
      // the admin panel (say NEET PG 2026) shows up without a code change.
      var PYQ_MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
      function pyqSessionKey(y) {
        var m = String(y).match(/^([A-Za-z]+)?\s*(\d{4})$/);
        if (!m) return 0;
        return Number(m[2]) * 100 + (m[1] ? (PYQ_MONTHS[m[1].toLowerCase().slice(0, 4)] || PYQ_MONTHS[m[1].toLowerCase().slice(0, 3)] || 0) : 0);
      }
      function applyPyqSessions(list) {
        if (!Array.isArray(list) || !list.length || !PYQ_EXAMS) return false;
        var changed = false;
        PYQ_EXAMS.forEach(function (ex) {
          var mine = list.filter(function (r) { return r.exam === ex.id && r.n > 0; });
          if (!mine.length) return;
          var allLabel = ex.years && ex.years[0] && /^All/.test(ex.years[0]) ? ex.years[0] : 'All Sessions';
          var ys = mine.map(function (r) { return r.year; }).sort(function (a, b) { return pyqSessionKey(b) - pyqSessionKey(a); });
          var next = [allLabel].concat(ys);
          if (JSON.stringify(next) !== JSON.stringify(ex.years)) { ex.years = next; changed = true; }
          var total = mine.reduce(function (t, r) { return t + Number(r.n || 0); }, 0);
          var yrs = ys.map(function (y) { return Math.floor(pyqSessionKey(y) / 100); });
          var lo = Math.min.apply(null, yrs), hi = Math.max.apply(null, yrs);
          var monthly = ys.some(function (y) { return /[A-Za-z]/.test(y); });
          var cov = (lo === hi ? String(lo) : lo + ' – ' + hi) + ' · ' + ys.length + (monthly ? ' Sessions' : ' Years') +
            ' (' + (Math.floor(total / 10) * 10).toLocaleString('en-US') + '+ MCQs)';
          if (ex.coverage !== cov) { ex.coverage = cov; changed = true; }
        });
        return changed;
      }
      function loadSiteCounts() {
        try {
          var cached = JSON.parse(localStorage.getItem('ml_site_counts') || 'null');
          if (cached && cached.c && Date.now() - cached.at < 6 * 3600e3) { applySiteCounts(cached.c); return; }
        } catch (e) { }
        if (!supabaseClient) return;
        supabaseClient.rpc('site_counts').then(function (res) {
          if (!res || res.error || !res.data) return;
          var changed = applySiteCounts(res.data);
          try { localStorage.setItem('ml_site_counts', JSON.stringify({ at: Date.now(), c: res.data })); } catch (e) { }
          if (!changed || !state) return;
          if (state.screen === 'home') renderHome(true);
          else if (state.screen === 'subjects' && typeof renderSubjectsV2 === 'function') renderSubjectsV2();
          else if (state.screen === 'modules' && state.subjectId && v2On()) renderTopicsV2(state.subjectId);
          else if (state.screen === 'pyq' && v2On()) renderPyqV2();
        }, function () { });
      }

      function getSubjectModules(subjectId) {
        var subj = SYLLABUS.find(function (s) { return s.subjectId === subjectId; });
        return subj ? subj.modules : [];
      }

      var progress = {}; // "subjectId:moduleId" or "subjectId:all" -> {done, correct}
      var darkMode = document.documentElement.classList.contains('dark');
      try {
        var savedTheme = localStorage.getItem('medladder_theme');
        if (savedTheme !== null) {
          darkMode = (savedTheme === 'dark');
        }
      } catch (e) { }
      window.__onThemeToggle = function (isDark) {
        darkMode = isDark;
      };
      applyTheme();
      wireThemeBtn();

      var setupChoice = { pool: null, quizType: 'practice', count: 'all', customCount: 50, timeLimit: 0, customTime: 30, orderMode: 'structured', pyqYear: null };
      var pendingPyqDeepLink = null;
      var pendingPyqDeepLinkStarted = false;
      var state = {
        screen: 'home', subjectId: null, moduleId: null, poolTitle: '', order: [], questions: [], idx: 0,
        answers: {}, quizType: 'practice', timeLimit: 0, remaining: 0, timerId: null, progressKey: null,
        isPyqMode: false, pyqExam: null, pyqYear: null
      };
      var quizLoadInFlight = false;
      var progressSaveTimer = null;

      // ---------- SUPABASE AUTHENTICATION & DATA CLIENT ----------
      var SUPABASE_URL = 'https://groeibwykzrliphzzruk.supabase.co';
      var SUPABASE_ANON_KEY = 'sb_publishable_tXvgKaWrUfWlpy8SB3c1mQ_ZMrHxzVY';
      var R2_IMAGES_BASE = 'https://pub-5e62ac2b4d1c43fcb7fb6b025a52e189.r2.dev';
      var supabaseClient = null;
      var currentUser = null;
      var pendingAuthAction = null;

      // ---------- MEDLADDER PRO & RAZORPAY GATEWAY ----------
      var PRO_PLANS = [
        {
          id: '1_month',
          name: '1 Month',
          durationLabel: '1 Month',
          days: 30,
          price: 199,
          pricePaise: 19900,
          originalPrice: 499,
          perMonth: '₹199/mo',
          tag: 'QUICK PREP',
          desc: '30 days full QBank access'
        },
        {
          id: '3_months',
          name: '3 Months',
          durationLabel: '3 Months',
          days: 90,
          price: 399,
          pricePaise: 39900,
          originalPrice: 999,
          perMonth: '₹133/mo',
          tag: 'POPULAR',
          desc: '90 days targeted revision'
        },
        {
          id: '6_months',
          name: '6 Months',
          durationLabel: '6 Months',
          days: 180,
          price: 799,
          pricePaise: 79900,
          originalPrice: 1999,
          perMonth: '₹133/mo',
          tag: 'BEST VALUE',
          desc: '180 days exam season prep'
        },
        {
          id: '1_year',
          name: '1 Year',
          durationLabel: '1 Year',
          days: 365,
          price: 999,
          pricePaise: 99900,
          originalPrice: 2999,
          perMonth: '₹83/mo',
          tag: 'MAX SAVINGS',
          desc: '365 days full medical ladder'
        }
      ];

      var selectedPlanId = '6_months'; // Default selected tier (Best Value)

      var PRO_CONFIG = {
        FREE_MODULES_PER_SUBJECT: 8,
        RAZORPAY_KEY_ID: 'rzp_live_TedeWYIfHr41HQ', // Razorpay Live Key ID
        PRICE_INR: '199',
        CURRENCY: 'INR',
        PRODUCT_NAME: 'MedLadder Pro',
        // Edge Function endpoints on Supabase (server-side)
        EDGE_ORDER_URL: 'https://groeibwykzrliphzzruk.supabase.co/functions/v1/razorpay-order',
        EDGE_VERIFY_URL: 'https://groeibwykzrliphzzruk.supabase.co/functions/v1/razorpay-verify',
        // supabase/functions/admin-grant-pro (admins only; re-checks app_metadata.role server-side)
        EDGE_ADMIN_GRANT_URL: 'https://groeibwykzrliphzzruk.supabase.co/functions/v1/admin-grant-pro'
      };

      // ---------- PYQ BANK ----------
      var PYQ_EXAMS = [
        {
          id: 'NEET PG',
          icon: '🏥',
          name: 'NEET PG',
          label: 'National Eligibility cum Entrance Test PG',
          coverage: '2018 – 2025 · 8 Years (1,640+ MCQs)',
          years: ['All Years', '2025', '2024', '2023', '2022', '2021', '2020', '2019', '2018']
        },
        {
          id: 'INICET',
          icon: '🔬',
          name: 'INICET',
          label: 'Institute of National Importance CET',
          coverage: '2020 – 2025 · 10 Sessions (1,460+ MCQs)',
          years: ['All Sessions', 'May 2025', 'Nov 2024', 'May 2024', 'Nov 2023', 'May 2023', 'Nov 2022', 'May 2022', 'Nov 2021', 'May 2021', 'Nov 2020']
        },
        {
          id: 'FMGE',
          icon: '🌐',
          name: 'FMGE',
          label: 'Foreign Medical Graduate Examination',
          coverage: '2020 – 2025 · 10 Sessions (2,430+ MCQs)',
          years: ['All Sessions', 'Jan 2025', 'July 2025', 'Jan 2024', 'June 2024', 'Jan 2023', 'July 2023', 'June 2022', 'June 2021', 'Dec 2021', 'Dec 2020']
        },
        {
          id: 'AIIMS',
          icon: '🏛️',
          name: 'AIIMS PG',
          label: 'All India Institute of Medical Sciences',
          coverage: '2019 – 2020 Recalls · High-Yield',
          years: ['All Years', '2020', '2019']
        },
        {
          id: 'NEET SS',
          icon: '⚕️',
          name: 'NEET SS',
          label: 'Super Speciality Entrance Test',
          coverage: '2022 – 2024 Exam Question Papers',
          years: ['All Years', '2024', '2023', '2022']
        }
      ];
      var pyqExpanded = false;

      function getSelectedPlan() {
        return PRO_PLANS.find(function (p) { return p.id === selectedPlanId; }) || PRO_PLANS[2];
      }

      function getRazorpayKey() {
        // Public key id only (safe to ship). Never read from localStorage — anything
        // a visitor can edit in devtools must not choose which key we charge with.
        return PRO_CONFIG.RAZORPAY_KEY_ID;
      }

      // ---------- ADMIN ----------
      // Admin status is read ONLY from a real Supabase session's app_metadata, which
      // can be changed server-side only (supabase/grant-admin.sql). There is no
      // passkey, email whitelist, URL parameter, key sequence or localStorage flag
      // that can grant it, and the database enforces it again (is_admin() in RLS,
      // and the admin-grant-pro Edge Function re-checks it).
      function isAdmin(user) {
        return !!(user && user.app_metadata && user.app_metadata.role === 'admin');
      }

      // ---------- PRO STATUS (owned by the server) ----------
      // Pro entitlement is determined ONLY by the `subscriptions` table via the
      // my_pro_status() RPC. localStorage, user_metadata, and the payments table
      // are NEVER used for authorization — only the server is authoritative.
      var proState = { userId: null, isPro: false, expiresAt: null, planId: null };
      var _proStatusPromise = null;

      function resetProState() {
        proState = { userId: null, isPro: false, expiresAt: null, planId: null };
        _proStatusPromise = null;
      }

      function clearProLocalStorage() {}

      function isUserPro(user) {
        if (!user) return false;
        if (isAdmin(user)) return true;

        // Only trust server-confirmed Pro state with a valid future expiry
        if (
          proState &&
          proState.userId === user.id &&
          proState.isPro &&
          proState.expiresAt &&
          new Date(proState.expiresAt).getTime() > Date.now()
        ) {
          return true;
        }

        return false;
      }

      function rerenderLockedScreens() {
        try {
          var y = window.scrollY;
          if (state.screen === 'modules' && state.subjectId) renderModuleList(state.subjectId);
          else if (state.screen === 'setup' && state.subjectId && state.moduleId) renderSetup(state.subjectId, state.moduleId);
          else if (state.screen === 'home') renderHome(true);
          window.scrollTo(0, y);
        } catch (e) { console.warn('rerenderLockedScreens:', e); }
      }

      function refreshProStatus() {
        if (!supabaseClient || !currentUser) { resetProState(); return Promise.resolve(false); }
        var uid = currentUser.id;
        var wasPro = isUserPro(currentUser);

        // Single authoritative check: Supabase RPC (subscriptions table)
        _proStatusPromise = supabaseClient.rpc('my_pro_status').then(function (res) {
          if (!currentUser || currentUser.id !== uid) return false;
          var row = (res && res.data) ? (Array.isArray(res.data) ? res.data[0] : res.data) : null;
          if (row && row.is_pro && row.expires_at) {
            // Validate expires_at is a valid future timestamp
            var expiresAt = row.expires_at;
            var expiresMs = new Date(expiresAt).getTime();
            if (!isNaN(expiresMs) && expiresMs > Date.now()) {
              proState = {
                userId: uid,
                isPro: true,
                expiresAt: expiresAt,
                planId: row.plan_id || null
              };
            } else {
              // expires_at is null, invalid, or in the past — treat as not Pro
              console.warn('Invalid or expired expires_at from server:', expiresAt);
              resetProState();
              clearProLocalStorage(uid);
            }
          } else {
            // Server says not Pro — clear all local Pro state immediately
            resetProState();
            clearProLocalStorage(uid);
          }
          var nowPro = isUserPro(currentUser);
          updateMastheadAuth();
          updateProModalUI();
          if (nowPro !== wasPro) rerenderLockedScreens();
          return nowPro;
        }).catch(function (e) {
          console.warn('refreshProStatus failed:', e && e.message);
          // On network error, keep current in-memory proState as-is (don't grant or revoke)
          var nowPro = isUserPro(currentUser);
          updateMastheadAuth();
          updateProModalUI();
          if (nowPro !== wasPro) rerenderLockedScreens();
          return nowPro;
        });
        return _proStatusPromise;
      }

      function isModuleLocked(subjectId, moduleId, index) {
        if (isUserPro(currentUser)) return false;
        if (moduleId === 'all') return true; // Full subject mock exam is Pro
        if (typeof index === 'number' && index >= PRO_CONFIG.FREE_MODULES_PER_SUBJECT) return true;
        return false;
      }

      function ensureProModalDOMElements() {
        if (document.getElementById('proModalOverlay')) return;
        var container = document.createElement('div');
        container.style.display = 'none';
        var plan = getSelectedPlan();
        container.innerHTML =
          '<div class="pro-modal-overlay hidden" id="proModalOverlay" role="dialog" aria-modal="true" aria-labelledby="proModalTitle">' +
          '<div class="pro-modal-box glass">' +
          '<div class="pro-modal-header">' +
          '<button class="pro-modal-close" id="proModalClose" aria-label="Close modal" title="Close modal (Esc)">✕</button>' +
          '<div class="pro-modal-badge">⭐ MEDLADDER PRO</div>' +
          '<h2 class="pro-modal-title" id="proModalTitle">Unlock Full Medical QBank</h2>' +
          '<p class="pro-modal-sub" id="proModalSub">Free registered accounts get 8 topics per subject. Upgrade to Pro for unrestricted access to all ' + totalTopics() + ' topics and ' + totalQuestions().toLocaleString('en-US') + ' questions.</p>' +
          '</div>' +
          '<div class="pro-modal-body">' +
          '<div class="pro-features-list">' +
          '<div class="pro-feature-item">' +
          '<div class="pro-feature-icon">✓</div>' +
          '<div class="pro-feature-text">' +
          '<strong>All 740 Topics Unlocked</strong>' +
          '<span>Full access across all 19 preclinical, paraclinical &amp; clinical subjects.</span>' +
          '</div>' +
          '</div>' +
          '<div class="pro-feature-item">' +
          '<div class="pro-feature-icon">✓</div>' +
          '<div class="pro-feature-text">' +
          '<strong>' + totalQuestions().toLocaleString('en-US') + ' NEET PG, FMGE &amp; NEET SS MCQs</strong>' +
          '<span>Every single question with clinical pearls, rationale &amp; tables.</span>' +
          '</div>' +
          '</div>' +
          '<div class="pro-feature-item">' +
          '<div class="pro-feature-icon">✓</div>' +
          '<div class="pro-feature-text">' +
          '<strong>Full-Subject Mock Exams</strong>' +
          '<span>Simulate authentic grand tests with \"All topics\" mode unlocked.</span>' +
          '</div>' +
          '</div>' +
          '</div>' +
          '<div style="font-size:12px;font-weight:700;color:var(--ink-soft);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:8px;">Choose your prep plan:</div>' +
          '<div class="pro-plans-grid" id="proPlansGrid">' +
          PRO_PLANS.map(function (p) {
            var isActive = (p.id === selectedPlanId);
            return '<div class="pro-plan-card ' + (isActive ? 'active' : '') + '" data-plan="' + p.id + '">' +
              (p.tag ? '<span class="pro-plan-badge">' + p.tag + '</span>' : '') +
              '<div class="pro-plan-duration"><span>' + p.name + '</span><span class="pro-plan-radio"></span></div>' +
              '<div class="pro-plan-prices"><span class="pro-plan-price">₹' + p.price + '</span><span class="pro-plan-old">₹' + p.originalPrice + '</span></div>' +
              '<div class="pro-plan-sub">' + p.perMonth + ' · ' + p.desc + '</div>' +
              '</div>';
          }).join('') +
          '</div>' +
          '<div id="proAuthPrompt"></div>' +
          '<div class="pro-modal-alert hidden" id="proModalAlert"></div>' +
          '<button class="pro-cta-btn" id="proCheckoutBtn">' +
          '<span>⚡ Unlock MedLadder Pro (₹' + plan.price + ' · ' + plan.durationLabel + ')</span>' +
          '</button>' +
          '<div class="pro-secure-note">' +
          '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>' +
          '<span>100% Secure Checkout via Razorpay · UPI (GPay, PhonePe, Paytm), Cards, NetBanking</span>' +
          '</div>' +
          '<div class="pro-legal-links" style="font-size:11px;color:var(--ink-soft);text-align:center;margin-top:8px;line-height:1.45;">' +
          'By subscribing, you agree to our <a href="/terms" target="_blank" style="color:var(--accent);text-decoration:underline;">Terms</a>, <a href="/privacy" target="_blank" style="color:var(--accent);text-decoration:underline;">Privacy</a> &amp; <a href="/terms#cancellation-refund" target="_blank" style="color:var(--accent);text-decoration:underline;">Cancellation/Refund Policy</a>.<br>' +
          'Instant digital activation · Billing support: <a href="mailto:99medladder@gmail.com" style="color:var(--accent);text-decoration:underline;">99medladder@gmail.com</a>' +
          '</div>' +

          '<div class="pro-restore-wrap" style="margin-top:14px;padding-top:12px;border-top:1px solid var(--line);text-align:center;">' +
          '<a href="#" id="proRestoreLink" style="font-size:12px;color:var(--ink-soft);text-decoration:underline;cursor:pointer;">Already paid? Restore access / enter Payment ID →</a>' +
          '<div id="proRestoreBox" style="display:none;margin-top:10px;">' +
          '<div style="display:flex;gap:8px;max-width:380px;margin:0 auto;">' +
          '<input type="text" id="proPaymentIdInput" placeholder="Enter Payment ID (e.g. pay_...)" style="flex:1;padding:8px 10px;border:1px solid var(--line);border-radius:8px;font-size:12px;background:var(--paper-raised);color:var(--ink);" />' +
          '<button id="proRestoreSubmitBtn" style="padding:8px 14px;border:0;border-radius:8px;background:linear-gradient(135deg,#7B2FF7,#F107A3);color:#fff;font-weight:700;font-size:12px;cursor:pointer;">Activate</button>' +
          '</div>' +
          '<div id="proRestoreStatus" style="font-size:11px;margin-top:6px;color:var(--ink-soft);"></div>' +
          '</div>' +
          '</div>' +

          '</div>' +
          '</div>' +
          '</div>';
        document.body.appendChild(container.firstElementChild);

        document.getElementById('proModalClose').addEventListener('click', closeProModal);
        document.getElementById('proModalOverlay').addEventListener('click', function (e) {
          if (e.target === this) closeProModal();
        });
        document.getElementById('proCheckoutBtn').addEventListener('click', openRazorpayCheckout);

        // Restore purchases / Enter Payment ID listener
        var restoreLink = document.getElementById('proRestoreLink');
        var restoreBox = document.getElementById('proRestoreBox');
        var restoreSubmit = document.getElementById('proRestoreSubmitBtn');
        var restoreInput = document.getElementById('proPaymentIdInput');
        var restoreStatus = document.getElementById('proRestoreStatus');
        if (restoreLink && restoreBox) {
          restoreLink.addEventListener('click', function (e) {
            e.preventDefault();
            restoreBox.style.display = (restoreBox.style.display === 'none' ? 'block' : 'none');
          });
        }
        if (restoreSubmit && restoreInput) {
          restoreSubmit.addEventListener('click', async function () {
            var pid = restoreInput.value.trim();
            if (!currentUser) {
              triggerProAuthRedirect();
              return;
            }
            if (restoreStatus) restoreStatus.textContent = 'Checking server for subscription status...';
            restoreSubmit.disabled = true;
            try {
              var ok = await refreshProStatus();
              if (ok) {
                showToast('⭐ Pro access confirmed & restored!');
                closeProModal();
                restoreSubmit.disabled = false;
                return;
              }
              if (!pid) {
                if (restoreStatus) restoreStatus.textContent = 'No active Pro subscription found for this account. If you recently paid, enter your Razorpay Payment ID (starts with pay_).';
              } else if (!/^pay_[A-Za-z0-9]+$/.test(pid)) {
                if (restoreStatus) restoreStatus.textContent = 'Invalid payment ID format. It should look like pay_... from your receipt.';
              } else {
                if (restoreStatus) restoreStatus.textContent = 'No active subscription linked to this account for payment ' + pid + '. If payment succeeded, your payment was recorded with another email or is awaiting webhook sync. Please contact support with Payment ID: ' + pid;
              }
            } catch (e) {
              if (restoreStatus) restoreStatus.textContent = 'Network error while checking status. Please try again or contact support.';
            }
            restoreSubmit.disabled = false;
          });
        }

        // Plan card selection click listener
        document.querySelectorAll('#proPlansGrid .pro-plan-card').forEach(function (card) {
          card.addEventListener('click', function () {
            selectedPlanId = this.getAttribute('data-plan');
            document.querySelectorAll('#proPlansGrid .pro-plan-card').forEach(function (c) {
              c.classList.toggle('active', c.getAttribute('data-plan') === selectedPlanId);
            });
            updateProModalUI();
            var p = getSelectedPlan();
            trackEvent('select_item', {
              item_list_name: 'Pro Subscription Plans',
              items: [{
                item_id: p.id,
                item_name: 'MedLadder Pro - ' + p.name,
                price: p.price,
                item_category: 'Subscription'
              }]
            });
          });
        });

      }

      var currentProReason = null;
      var currentProContext = null;

      function updateProModalUI() {
        var plan = getSelectedPlan();
        var cta = document.getElementById('proCheckoutBtn');
        var authPrompt = document.getElementById('proAuthPrompt');
        if (!cta || !authPrompt) return;

        if (!currentUser) {
          authPrompt.innerHTML =
            '<div class="pro-auth-banner needs-login">' +
            '<div class="pro-auth-banner-icon">🔒</div>' +
            '<div class="pro-auth-banner-text">' +
            '<strong>Sign in required to upgrade</strong>' +
            '<span>Please sign in or register so your subscription is linked to your account. <a href="#" class="pro-auth-inline-link" id="proAuthInlineLink">Sign In / Register →</a></span>' +
            '</div>' +
            '</div>';
          cta.classList.add('btn-needs-auth');
          cta.innerHTML = '<span>🔒 Sign In to Unlock Pro (₹' + plan.price + ' · ' + plan.durationLabel + ')</span>';

          var link = document.getElementById('proAuthInlineLink');
          if (link) {
            link.onclick = function (e) {
              e.preventDefault();
              triggerProAuthRedirect();
            };
          }
        } else {
          authPrompt.innerHTML =
            '<div class="pro-auth-banner logged-in">' +
            '<div class="pro-auth-banner-icon">✓</div>' +
            '<div class="pro-auth-banner-text">' +
            '<strong>Account: ' + esc(getUserDisplayName(currentUser)) + '</strong>' +
            '<span>' + esc(currentUser.email || '') + ' · Pro subscription will be activated for this profile</span>' +
            '</div>' +
            '</div>';
          cta.classList.remove('btn-needs-auth');
          cta.innerHTML = '<span>⚡ Unlock MedLadder Pro (₹' + plan.price + ' · ' + plan.durationLabel + ')</span>';
        }
      }

      function triggerProAuthRedirect() {
        var savedReason = currentProReason;
        var savedContext = currentProContext;
        closeProModal();
        openAuthModal('signin', {
          reason: 'Please sign in or create an account before completing payment to link your Pro subscription.',
          onSuccess: function () {
            openProModal(savedReason, savedContext);
            openRazorpayCheckout();
          }
        });
      }

      function openProModal(reason, context) {
        currentProReason = reason;
        currentProContext = context;
        ensureProModalDOMElements();
        setProModalAlert(null);
        var titleEl = document.getElementById('proModalTitle');
        var subEl = document.getElementById('proModalSub');

        if (reason === 'locked_module' && context && context.moduleName) {
          titleEl.textContent = 'Unlock ' + context.moduleName;
          subEl.innerHTML = 'Free registered accounts include the <strong>first 8 topics</strong> in this subject. Upgrade to MedLadder Pro to unlock ' + esc(context.moduleName) + ' and all ' + totalTopics() + ' topics!';
        } else if (reason === 'all_topics') {
          titleEl.textContent = 'Full Subject Exam is Pro Only';
          subEl.innerHTML = 'The <strong>\"All topics\"</strong> cumulative grand test is a MedLadder Pro feature. Upgrade now to practice full-length multi-topic exams!';
        } else if (reason === 'pyq_bank') {
          var examName = (context && context.examId) ? context.examId : 'Previous Year Questions';
          var examObj = PYQ_EXAMS.find(function (e) { return e.id === examName; });
          var examLabel = examObj ? (examObj.icon + ' ' + examObj.name) : examName;
          titleEl.textContent = 'Unlock PYQ Bank — ' + (examObj ? examObj.name : examName);
          subEl.innerHTML = 'The <strong>📚 Previous Year Questions bank</strong> (' + esc(examLabel) + ') is a MedLadder Pro exclusive. Upgrade to access real exam questions from ' + esc(examName) + ', NEET PG, INICET, AIIMS, NEET SS, and FMGE!';
        } else {
          titleEl.textContent = 'Unlock Full Medical QBank';
          subEl.innerHTML = 'Free registered accounts get <strong>8 topics per subject</strong>. Upgrade to MedLadder Pro with Razorpay for unrestricted access across all 19 subjects!';
        }

        updateProModalUI();
        var overlay = document.getElementById('proModalOverlay');
        if (overlay) {
          overlay.classList.remove('hidden');
          overlay.classList.add('open');
        }

        var activePlan = getSelectedPlan();
        trackEvent('view_item', {
          currency: 'INR',
          value: activePlan.price,
          items: [{
            item_id: activePlan.id,
            item_name: 'MedLadder Pro - ' + activePlan.name,
            price: activePlan.price,
            item_category: 'Subscription'
          }],
          pro_reason: reason || 'upgrade'
        });

        // Pre-load Razorpay checkout script so clicking checkout is instantaneous
        if (typeof Razorpay === 'undefined' && !document.getElementById('rzp-script')) {
          var s = document.createElement('script');
          s.id = 'rzp-script';
          s.src = 'https://checkout.razorpay.com/v1/checkout.js';
          document.head.appendChild(s);
        }
      }

      function setProModalAlert(msg, type) {
        var el = document.getElementById('proModalAlert');
        if (!el) return;
        if (!msg) {
          el.innerHTML = '';
          el.className = 'pro-modal-alert hidden';
          return;
        }
        var icon = type === 'error' ? '⚠️' : (type === 'info' ? 'ℹ️' : '✓');
        el.className = 'pro-modal-alert ' + (type || 'info');
        el.innerHTML = '<span style="font-size:14px;flex-shrink:0;">' + icon + '</span><span>' + esc(msg) + '</span>';
      }

      function closeProModal() {
        setProModalAlert(null);
        var overlay = document.getElementById('proModalOverlay');
        if (overlay) {
          overlay.classList.remove('open');
          overlay.classList.add('hidden');
        }
      }
      window.closeProModal = closeProModal;

      // ─── CREATE RAZORPAY ORDER VIA SUPABASE EDGE FUNCTION ────────────────────
      // Sends plan id, user context, and amount. Backward compatible with both
      // live Supabase Edge Function (expects user_id) and newer schemas.
      async function createRazorpayOrder(plan) {
        try {
          var session = supabaseClient && supabaseClient.auth ? await supabaseClient.auth.getSession() : null;
          var token = session && session.data && session.data.session ? session.data.session.access_token : null;
          if (!token) {
            console.warn('createRazorpayOrder: no active session token');
            return null;
          }
          var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
          var timeout = controller ? setTimeout(function () { controller.abort(); }, 6000) : null;
          var res = await fetch(PRO_CONFIG.EDGE_ORDER_URL, {
            method: 'POST',
            signal: controller ? controller.signal : undefined,
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + token,
              'apikey': SUPABASE_ANON_KEY
            },
            body: JSON.stringify({
              plan_id: plan.id,
              amount: plan.pricePaise,
              currency: PRO_CONFIG.CURRENCY,
              user_id: currentUser ? currentUser.id : null,
              user_email: currentUser ? currentUser.email : null
            })
          });
          if (timeout) clearTimeout(timeout);
          if (!res.ok) {
            var errText = await res.text().catch(function () { return ''; });
            console.warn('createRazorpayOrder edge fn returned ' + res.status + ':', errText);
            return null;
          }
          var data = await res.json();
          var orderId = data.order_id || (data.order && data.order.id) || null;
          var amount = data.amount || (data.order && data.order.amount) || plan.pricePaise;
          var currency = data.currency || (data.order && data.order.currency) || PRO_CONFIG.CURRENCY;
          return { order_id: orderId, amount: amount, currency: currency };
        } catch (e) {
          console.warn('createRazorpayOrder failed; server-created order is required:', e.message);
          return null; // No direct checkout fallback: the server-created order is mandatory
        }
      }

      // ─── VERIFY RAZORPAY PAYMENT VIA SUPABASE EDGE FUNCTION ──────────────────
      // Secret key is stored only in the Edge Function env, NEVER in client code
      async function verifyRazorpayPayment(paymentId, orderId, signature, plan) {
        try {
          var session = supabaseClient && supabaseClient.auth ? await supabaseClient.auth.getSession() : null;
          var token = session && session.data && session.data.session ? session.data.session.access_token : null;
          var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
          var timeout = controller ? setTimeout(function () { controller.abort(); }, 8000) : null;
          var res = await fetch(PRO_CONFIG.EDGE_VERIFY_URL, {
            method: 'POST',
            signal: controller ? controller.signal : undefined,
            headers: {
              'Content-Type': 'application/json',
              'Authorization': token ? ('Bearer ' + token) : '',
              'apikey': SUPABASE_ANON_KEY
            },
            body: JSON.stringify({
              razorpay_payment_id: paymentId,
              razorpay_order_id: orderId || '',
              razorpay_signature: signature || '',
              user_id: currentUser ? currentUser.id : null,
              plan_id: plan ? plan.id : selectedPlanId
            })
          });
          if (timeout) clearTimeout(timeout);
          if (!res.ok) { console.warn('Verify endpoint returned', res.status); return false; }
          var data = await res.json();
          return data && (data.verified === true || data.success === true);
        } catch (e) {
          console.warn('verifyRazorpayPayment edge fn failed:', e.message);
          return null; // null = could not verify (never treated as a pass)
        }
      }

      // ─── MAIN RAZORPAY CHECKOUT ORCHESTRATOR ──────────────────────────────────
      async function openRazorpayCheckout() {
        var ctaBtn = document.getElementById('proCheckoutBtn');
        var plan = getSelectedPlan();
        var resetCta = function () {
          if (ctaBtn) {
            ctaBtn.disabled = false;
            ctaBtn.innerHTML = currentUser
              ? '<span>⚡ Unlock MedLadder Pro (₹' + plan.price + ' · ' + plan.durationLabel + ')</span>'
              : '<span>🔒 Sign In to Unlock Pro (₹' + plan.price + ' · ' + plan.durationLabel + ')</span>';
          }
        };

        // 1. Instant button feedback to guarantee visual responsiveness
        if (ctaBtn) {
          ctaBtn.disabled = true;
          ctaBtn.innerHTML = '<span style="display:inline-flex;align-items:center;gap:8px;"><span class="auth-spinner"></span> Connecting to Razorpay...</span>';
        }
        setProModalAlert(null);

        // 2. Auth guard: Ensure account exists to associate subscription
        if (!currentUser) {
          resetCta();
          setProModalAlert('Please sign in or create an account before completing payment to link your Pro subscription.', 'info');
          showToast('Please sign in or create an account before completing payment.', 'info');
          triggerProAuthRedirect();
          return;
        }

        // 3. Razorpay Key check
        var rzpKey = getRazorpayKey();
        if (!rzpKey || rzpKey === 'rzp_test_placeholder') {
          resetCta();
          setProModalAlert('Razorpay Key is not configured. Please contact support.', 'error');
          showToast('Razorpay Key not configured. Please contact support.', 'error');
          return;
        }

        // 4. Load Razorpay SDK if not already present (instant or non-blocking)
        if (typeof Razorpay === 'undefined') {
          if (ctaBtn) ctaBtn.innerHTML = '<span style="display:inline-flex;align-items:center;gap:8px;"><span class="auth-spinner"></span> Loading payment gateway...</span>';
          try {
            await new Promise(function (resolve, reject) {
              if (typeof Razorpay !== 'undefined') return resolve();
              var existing = document.getElementById('rzp-script');
              if (existing) {
                var prevLoad = existing.onload;
                var prevErr = existing.onerror;
                existing.onload = function () { if (prevLoad) prevLoad(); resolve(); };
                existing.onerror = function (e) { if (prevErr) prevErr(e); reject(e); };
              } else {
                var s = document.createElement('script');
                s.id = 'rzp-script';
                s.src = 'https://checkout.razorpay.com/v1/checkout.js';
                s.onload = resolve;
                s.onerror = reject;
                document.head.appendChild(s);
              }
              setTimeout(function () {
                if (typeof Razorpay !== 'undefined') resolve();
                else reject(new Error('Gateway load timeout. Please check your internet connection or ad blocker.'));
              }, 8000);
            });
          } catch (sdkErr) {
            console.error('Razorpay SDK load error:', sdkErr);
            resetCta();
            setProModalAlert('Could not load payment gateway. Please disable ad-blockers / shields and try again.', 'error');
            showToast('Could not load Razorpay. Please check connection.', 'error');
            return;
          }
        }

        // 5. Create the order on the server — REQUIRED (no direct fallback)
        if (ctaBtn) ctaBtn.innerHTML = '<span style="display:inline-flex;align-items:center;gap:8px;"><span class="auth-spinner"></span> Securing order...</span>';
        var orderData;
        try {
          orderData = await createRazorpayOrder(plan);
        } catch (e) {
          console.error('createRazorpayOrder failed:', e);
          resetCta();
          setProModalAlert('Could not create payment order. Please try again.', 'error');
          showToast('Failed to create payment order. Please try again.', 'error');
          return;
        }
        if (!orderData || !orderData.order_id) {
          resetCta();
          setProModalAlert('Invalid server response. Please try again.', 'error');
          showToast('Invalid server response. Please try again.', 'error');
          return;
        }
        var orderId = orderData.order_id;
        var checkoutAmount = orderData.amount;

        console.log('Razorpay server order ready:', orderId);

        // 6. Build Razorpay options
        var options = {
          key: rzpKey,
          amount: checkoutAmount,
          currency: PRO_CONFIG.CURRENCY,
          name: PRO_CONFIG.PRODUCT_NAME,
          description: 'MedLadder Pro — ' + plan.durationLabel + ' Access (₹' + plan.price + ')',
          image: 'https://medladder.top/icons/icon-192.png',
          prefill: {
            name: getUserDisplayName(currentUser),
            email: currentUser.email || '',
            contact: ''
          },
          method: {
            upi: true,
            card: true,
            netbanking: true,
            wallet: true
          },
          notes: {
            user_id: currentUser.id,
            plan_id: plan.id,
            plan_name: plan.name
          },
          theme: { color: '#7B2FF7' },
          modal: {
            ondismiss: function () {
              resetCta();
              showToast('Payment window closed.', 'info');
            }
          },
          handler: async function (response) {
            // response: { razorpay_payment_id, razorpay_order_id, razorpay_signature }
            var paymentId = response.razorpay_payment_id;
            var respOrder = response.razorpay_order_id || orderId || '';
            var signature = response.razorpay_signature || '';

            showToast('✅ Payment received! Verifying with server...', 'info');

            // 1. Await server verification FIRST — this writes to subscriptions table
            // Pro is ONLY unlocked after server confirms the payment is valid
            try {
              var verified = await verifyRazorpayPayment(paymentId, respOrder, signature, plan);
              if (verified) {
                console.log('Server verified payment ' + paymentId);
                // 2. NOW activate Pro in memory (after server confirmation)
                await completeProUpgrade(paymentId, respOrder, signature, plan);
                // GA4 Purchase Telemetry
                trackEvent('purchase', {
                  transaction_id: respOrder || paymentId,
                  value: plan.price,
                  currency: 'INR',
                  items: [{
                    item_id: plan.id,
                    item_name: 'MedLadder Pro - ' + plan.name,
                    price: plan.price,
                    item_category: 'Subscription',
                    quantity: 1
                  }]
                });
                showToast('⭐ MedLadder Pro is now ACTIVE. All 740 modules & PYQ bank unlocked!', 'success');
              } else {
                // Verification failed — do NOT unlock Pro
                console.warn('Server verification returned non-success for payment ' + paymentId);
                showToast('❌ Payment verification failed. Pro not activated. Contact support with Payment ID: ' + paymentId, 'error');
              }
            } catch (e) {
              console.warn('verifyRazorpayPayment error:', e);
              showToast('❌ Payment verification error. Pro not activated. Contact support with Payment ID: ' + paymentId, 'error');
            }
          }
        };

        if (orderId) {
          options.order_id = orderId;
        }

        // 7. Launch Razorpay checkout
        try {
          trackEvent('begin_checkout', {
            currency: 'INR',
            value: plan.price,
            items: [{
              item_id: plan.id,
              item_name: 'MedLadder Pro - ' + plan.name,
              price: plan.price,
              item_category: 'Subscription',
              quantity: 1
            }]
          });
          var rzp = new Razorpay(options);
          rzp.on('payment.failed', function (resp) {
            var errDesc = (resp && resp.error && resp.error.description) ? resp.error.description : 'Payment failed';
            resetCta();
            setProModalAlert('Payment failed: ' + errDesc, 'error');
            showToast('❌ Payment failed: ' + errDesc, 'error');
          });
          rzp.open();
          // Reset CTA button to normal after modal has launched
          setTimeout(resetCta, 1500);
        } catch (err) {
          console.error('Razorpay open error:', err);
          resetCta();
          setProModalAlert('Failed to open Razorpay: ' + err.message, 'error');
          showToast('Failed to open Razorpay: ' + err.message, 'error');
        }
      }

      // Refreshes the server-backed Pro entitlement after payment verification.
      // No localStorage, user_metadata, or client-calculated expiry is used.
      async function completeProUpgrade(paymentId, orderId, signature, plan) {
        if (!currentUser) {
          showToast('Please sign in so your Pro subscription is linked to your account.', 'error');
          return;
        }

        // The server-written subscriptions row is the only source of truth.
        // Do not calculate an expiry or grant Pro locally from the selected plan.
        // 1. Record to payments & subscriptions tables (server source of truth).
        // Note: RLS blocks authenticated users from writing these tables directly.
        // All DB writes happen in the Edge Functions (razorpay-verify / razorpay-webhook).
        // This block is intentionally empty — no client-side DB inserts.

        // 2. Re-read the server entitlement before changing the UI.
        await refreshProStatus();
        if (!proState.isPro) {
          throw new Error('Server verification succeeded, but Pro entitlement was not returned.');
        }

        // 3. Close the modal and refresh UI from the server-backed entitlement.
        closeProModal();
        updateMastheadAuth();
        updateProModalUI();
        rerenderLockedScreens();
        showToast('⭐ Congratulations! MedLadder Pro is now ACTIVE. All 740 modules & PYQ bank are unlocked!', 'success');
      }

      // ==========================================
      // ADMIN ACCESS & DASHBOARD PORTAL
      // ==========================================
      function ensureAdminModalDOMElements() {
        if (document.getElementById('adminModalOverlay')) return;
        var container = document.createElement('div');
        container.style.display = 'none';
        container.innerHTML =
          '<div class="admin-modal-overlay hidden" id="adminModalOverlay" role="dialog" aria-modal="true" aria-labelledby="adminModalTitle">' +
          '<div class="admin-modal-box glass">' +
          '<div class="admin-modal-header">' +
          '<button class="admin-modal-close" id="adminModalClose" aria-label="Close admin modal" title="Close modal (Esc)">✕</button>' +
          '<div class="admin-modal-badge">👑 ADMIN CONTROL CENTER</div>' +
          '<h2 class="admin-modal-title" id="adminModalTitle">Admin Console</h2>' +
          '<p class="admin-modal-sub">Grant or revoke student Pro access. Admin rights are held server-side.</p>' +
          '</div>' +
          '<div class="admin-modal-body" id="adminModalBody"></div>' +
          '</div>' +
          '</div>';
        document.body.appendChild(container.firstElementChild);

        document.getElementById('adminModalClose').addEventListener('click', closeAdminModal);
        document.getElementById('adminModalOverlay').addEventListener('click', function (e) {
          if (e.target === this) closeAdminModal();
        });
      }

      function renderAdminModalContent() {
        var body = document.getElementById('adminModalBody');
        if (!body) return;
        if (isAdmin(currentUser)) renderAdminConsole(body);
        else renderAdminGate(body);
      }

      function adminGateHeaderHtml() {
        return '<div style="text-align:center;margin-bottom:16px;">' +
          '<div style="display:inline-flex;align-items:center;justify-content:center;width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,rgba(255,178,61,0.2),rgba(255,61,154,0.2));font-size:24px;margin-bottom:8px;">🔐</div>' +
          '<div style="font-size:16px;font-weight:800;color:var(--ink);">Admin sign-in</div>' +
          '<div style="font-size:12px;color:var(--ink-soft);margin-top:4px;">Sign in with the account that has been made an admin.</div>' +
          '</div>';
      }

      // Signed-out / non-admin view. Nothing here can grant admin: signing in only
      // creates a normal Supabase session, and the console appears only when that
      // session's app_metadata (server-set) says role = admin.
      function renderAdminGate(body) {
        if (currentUser) {
          body.innerHTML =
            '<div class="admin-auth-gate">' + adminGateHeaderHtml() +
            '<div class="admin-alert error" style="display:flex;">⚠️ <span>You are signed in as <strong>' + esc(currentUser.email || 'this account') + '</strong>, which is not an admin account.</span></div>' +
            '<button type="button" class="admin-signout-btn" id="adminGateSignOut">Sign out</button>' +
            '</div>';
          document.getElementById('adminGateSignOut').addEventListener('click', function () {
            handleSignOut();
            closeAdminModal();
          });
          return;
        }

        var labelCss = 'display:block;font-size:11.5px;font-weight:700;margin-bottom:4px;color:var(--ink-soft);text-transform:uppercase;letter-spacing:0.04em;';
        body.innerHTML =
          '<div class="admin-auth-gate">' + adminGateHeaderHtml() +
          '<button type="button" class="auth-google-btn" id="adminGoogleBtn" style="width:100%;margin-bottom:12px;"><span>Continue with Google</span></button>' +
          '<div class="admin-gate-tabs">' +
          '<button type="button" class="admin-gate-tab active" id="adminTabPassword">Password</button>' +
          '<button type="button" class="admin-gate-tab" id="adminTabOtp">Email code</button>' +
          '</div>' +
          '<div class="admin-alert error" id="adminGateAlert" style="display:none;"></div>' +
          '<div class="admin-alert success" id="adminGateSuccess" style="display:none;"></div>' +

          '<form id="adminPasswordForm" autocomplete="on">' +
          '<div style="margin-bottom:12px;"><label for="adminGateEmail" style="' + labelCss + '">Email</label>' +
          '<input type="email" id="adminGateEmail" class="admin-input" style="width:100%;" required autocomplete="email"></div>' +
          '<div style="margin-bottom:16px;"><label for="adminGatePassword" style="' + labelCss + '">Password</label>' +
          '<input type="password" id="adminGatePassword" class="admin-input" style="width:100%;" required autocomplete="current-password"></div>' +
          '<button type="submit" class="admin-action-btn" id="adminGateSubmit" style="width:100%;padding:10px;font-size:13px;"><span>Sign in</span></button>' +
          '</form>' +

          '<form id="adminOtpForm" class="hidden" style="margin-top:8px;">' +
          '<div style="margin-bottom:12px;"><label for="adminOtpEmail" style="' + labelCss + '">Email</label>' +
          '<div style="display:flex;gap:6px;">' +
          '<input type="email" id="adminOtpEmail" class="admin-input" style="flex:1;" required autocomplete="email">' +
          '<button type="button" class="admin-action-btn" id="sendAdminOtpBtn" style="padding:7px 12px;font-size:11.5px;white-space:nowrap;">Send code</button>' +
          '</div></div>' +
          '<div style="margin-bottom:16px;"><label for="adminOtpCode" style="' + labelCss + '">Code from email</label>' +
          '<input type="text" id="adminOtpCode" class="admin-input" style="width:100%;font-size:14px;" inputmode="numeric" autocomplete="one-time-code"></div>' +
          '<button type="submit" class="admin-action-btn" id="adminOtpVerifyBtn" style="width:100%;padding:10px;font-size:13px;"><span>Verify &amp; sign in</span></button>' +
          '</form>' +
          '</div>';

        var tabPw = document.getElementById('adminTabPassword');
        var tabOtp = document.getElementById('adminTabOtp');
        var formPw = document.getElementById('adminPasswordForm');
        var formOtp = document.getElementById('adminOtpForm');
        var alertEl = document.getElementById('adminGateAlert');
        var successEl = document.getElementById('adminGateSuccess');

        function clearGateAlerts() {
          alertEl.style.display = 'none'; alertEl.textContent = '';
          successEl.style.display = 'none'; successEl.textContent = '';
        }
        function showGateAlert(msg) {
          alertEl.textContent = '⚠️ ' + msg; alertEl.style.display = 'flex';
          successEl.style.display = 'none';
        }
        function showGateSuccess(msg) {
          successEl.textContent = '✓ ' + msg; successEl.style.display = 'flex';
          alertEl.style.display = 'none';
        }

        document.getElementById('adminGoogleBtn').addEventListener('click', handleGoogleSignIn);
        tabPw.addEventListener('click', function () {
          tabPw.classList.add('active'); tabOtp.classList.remove('active');
          formPw.classList.remove('hidden'); formOtp.classList.add('hidden');
          clearGateAlerts();
        });
        tabOtp.addEventListener('click', function () {
          tabOtp.classList.add('active'); tabPw.classList.remove('active');
          formOtp.classList.remove('hidden'); formPw.classList.add('hidden');
          clearGateAlerts();
        });

        // The onAuthStateChange listener (initAuth) reacts to a successful sign-in and
        // re-renders this modal — as the console only if the account really is an admin.
        formPw.addEventListener('submit', function (e) {
          e.preventDefault();
          clearGateAlerts();
          var email = (document.getElementById('adminGateEmail').value || '').trim().toLowerCase();
          var pass = document.getElementById('adminGatePassword').value || '';
          if (!email || !pass) { showGateAlert('Enter your email and password.'); return; }
          if (!supabaseClient || !supabaseClient.auth) { showGateAlert('Sign-in is unavailable right now.'); return; }
          var btn = document.getElementById('adminGateSubmit');
          btn.disabled = true;
          supabaseClient.auth.signInWithPassword({ email: email, password: pass }).then(function (res) {
            btn.disabled = false;
            if (res.error || !(res.data && res.data.user)) showGateAlert('Sign-in failed. Check your email and password.');
          }).catch(function () {
            btn.disabled = false;
            showGateAlert('Sign-in failed. Check your connection and try again.');
          });
        });

        document.getElementById('sendAdminOtpBtn').addEventListener('click', function () {
          clearGateAlerts();
          var email = (document.getElementById('adminOtpEmail').value || '').trim().toLowerCase();
          if (!email || email.indexOf('@') === -1) { showGateAlert('Enter a valid email address.'); return; }
          if (!supabaseClient || !supabaseClient.auth) { showGateAlert('Sign-in is unavailable right now.'); return; }
          var btn = this;
          btn.disabled = true;
          supabaseClient.auth.signInWithOtp({ email: email, options: { shouldCreateUser: false } }).then(function (res) {
            btn.disabled = false;
            if (res && res.error) showGateAlert('Could not send a code right now. Please try again shortly.');
            else showGateSuccess('If that email has an account, a code is on its way.');
          }).catch(function () {
            btn.disabled = false;
            showGateAlert('Could not send a code right now. Please try again shortly.');
          });
        });

        formOtp.addEventListener('submit', function (e) {
          e.preventDefault();
          clearGateAlerts();
          var email = (document.getElementById('adminOtpEmail').value || '').trim().toLowerCase();
          var code = (document.getElementById('adminOtpCode').value || '').trim();
          if (!email || !code) { showGateAlert('Enter your email and the code we sent.'); return; }
          if (!supabaseClient || !supabaseClient.auth) { showGateAlert('Sign-in is unavailable right now.'); return; }
          var btn = document.getElementById('adminOtpVerifyBtn');
          btn.disabled = true;
          supabaseClient.auth.verifyOtp({ email: email, token: code, type: 'email' }).then(function (res) {
            btn.disabled = false;
            if (res.error || !(res.data && res.data.user)) showGateAlert('Invalid or expired code.');
          }).catch(function () {
            btn.disabled = false;
            showGateAlert('Invalid or expired code.');
          });
        });
      }

      function renderAdminConsole(body) {
        var userEmail = (currentUser && currentUser.email) ? currentUser.email : '';
        body.innerHTML =
          '<div class="admin-status-card">' +
          '<strong style="display:flex;align-items:center;gap:6px;color:#16a34a;font-size:14px;margin-bottom:4px;">👑 Admin session</strong>' +
          '<div>Signed in as: <strong>' + esc(userEmail) + '</strong></div>' +
          '<div style="font-size:11.5px;color:var(--ink-soft);margin-top:3px;">Admin accounts can read every question. Pro grants below are written server-side and logged.</div>' +
          '<button class="admin-signout-btn" id="adminLockSessionBtn">Sign out</button>' +
          '</div>' +

          '<div class="admin-section">' +
          '<div class="admin-sec-title"><span>Grant or revoke MedLadder Pro</span></div>' +
          '<div style="font-size:11.5px;color:var(--ink-soft);margin-bottom:6px;">The student must already have an account. Granting adds time on top of any active subscription.</div>' +
          '<div class="admin-input-row">' +
          '<input type="email" id="grantProEmailInput" class="admin-input" placeholder="Student email address">' +
          '<select id="grantProDurationSelect" class="admin-input" style="max-width:130px;">' +
          '<option value="30">1 Month</option>' +
          '<option value="90">3 Months</option>' +
          '<option value="180">6 Months</option>' +
          '<option value="365" selected>1 Year</option>' +
          '<option value="3650">10 Years</option>' +
          '</select>' +
          '<button class="admin-action-btn" id="grantProBtn">Grant Pro</button>' +
          '<button class="admin-action-btn" id="revokeProBtn">Revoke</button>' +
          '</div>' +
          '</div>' +

          '<div class="admin-section">' +
          '<div class="admin-sec-title"><span>How MedLadder is being used</span></div>' +
          '<div class="admin-stats-grid" id="adminOverview">' +
          '<div class="admin-stat-card"><div class="admin-stat-num">\u2026</div><div class="admin-stat-label">Loading live numbers</div></div>' +
          '</div>' +
          '<div id="adminHard"></div>' +
          '</div>';

        document.getElementById('adminLockSessionBtn').addEventListener('click', function () {
          handleSignOut();
          closeAdminModal();
        });

        // Live counts from the database (admin-only RPC).
        try {
          supabaseClient.rpc('admin_overview').then(function (res) {
            var box = document.getElementById('adminOverview');
            if (!box) return;
            var d = res && res.data;
            if (!d || res.error) { box.innerHTML = '<div class="admin-stat-card"><div class="admin-stat-label">Could not load live numbers.</div></div>'; return; }
            var n = function (v) { return Number(v || 0).toLocaleString(); };
            var card = function (num, label) { return '<div class="admin-stat-card"><div class="admin-stat-num">' + num + '</div><div class="admin-stat-label">' + label + '</div></div>'; };
            box.innerHTML =
              card(n(d.students), 'Accounts \u00b7 ' + n(d.new_7d) + ' new this week') +
              card(n(d.active_7d), 'Practised this week \u00b7 ' + n(d.active_1d) + ' today') +
              card(n(d.answers_7d), 'Answers this week' + (d.accuracy_7d != null ? ' \u00b7 ' + d.accuracy_7d + '% correct' : '')) +
              card(n(d.pro_active), 'Active Pro students') +
              card(n(d.flags_open), 'Flagged questions waiting') +
              card(n(d.questions), 'Questions \u00b7 ' + n(d.pyq_questions) + ' past-paper');
            var hard = document.getElementById('adminHard');
            if (hard && d.hard_questions && d.hard_questions.length) {
              hard.innerHTML = '<div class="admin-sec-title" style="margin-top:18px;"><span>Most-missed questions (5+ answers)</span></div>' +
                '<ol class="admin-hard">' + d.hard_questions.map(function (h) {
                  return '<li><span class="admin-hard-text">' + esc(h.text || ('Question ' + h.id)) + '</span>' +
                    '<span class="admin-hard-meta">#' + h.id + (h.topic ? ' \u00b7 ' + esc(h.topic) : '') + ' \u00b7 ' + h.pct + '% of ' + h.n + ' correct</span></li>';
                }).join('') + '</ol><p class="admin-hard-note">A very low score can mean a hard question, or a wrong answer key. Worth a look.</p>';
            }
          }, function () {});
        } catch (e) { }

        async function callAdminGrant(action) {
          var emailInput = document.getElementById('grantProEmailInput');
          var durSelect = document.getElementById('grantProDurationSelect');
          var targetEmail = emailInput ? emailInput.value.trim().toLowerCase() : '';
          var days = durSelect ? parseInt(durSelect.value, 10) : 365;
          if (!targetEmail || targetEmail.indexOf('@') === -1) {
            showToast('Please enter a valid student email.', 'error');
            return;
          }
          if (action === 'revoke' && !confirm('Cancel all active Pro access for ' + targetEmail + '?')) return;
          var grantBtn = document.getElementById('grantProBtn');
          var revokeBtn = document.getElementById('revokeProBtn');
          try {
            grantBtn.disabled = true; revokeBtn.disabled = true;
            var session = supabaseClient && supabaseClient.auth ? await supabaseClient.auth.getSession() : null;
            var token = session && session.data && session.data.session ? session.data.session.access_token : null;
            if (!token) throw new Error('Session expired — sign in again.');
            var res = await fetch(PRO_CONFIG.EDGE_ADMIN_GRANT_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
              body: JSON.stringify({ action: action, target_email: targetEmail, days: days })
            });
            var data = await res.json().catch(function () { return {}; });
            if (!res.ok || !data.success) {
              showToast('⚠️ ' + (action === 'revoke' ? 'Revoke' : 'Grant') + ' failed: ' + (data.error || res.status), 'error');
            } else if (action === 'revoke') {
              showToast('Pro access cancelled for ' + targetEmail + '.');
              emailInput.value = '';
            } else {
              var until = data.expires_at ? new Date(data.expires_at).toLocaleDateString() : '';
              showToast('⭐ Pro granted to ' + targetEmail + (until ? ' until ' + until : '') + '.');
              emailInput.value = '';
            }
          } catch (e) {
            showToast('⚠️ Request failed: ' + e.message, 'error');
          } finally {
            grantBtn.disabled = false; revokeBtn.disabled = false;
          }
        }
        document.getElementById('grantProBtn').addEventListener('click', function () { callAdminGrant('grant'); });
        document.getElementById('revokeProBtn').addEventListener('click', function () { callAdminGrant('revoke'); });
      }

      function openAdminModal() {
        ensureAdminModalDOMElements();
        renderAdminModalContent();
        var overlay = document.getElementById('adminModalOverlay');
        if (overlay) {
          overlay.classList.remove('hidden');
          overlay.classList.add('open');
        }
      }

      function closeAdminModal() {
        var overlay = document.getElementById('adminModalOverlay');
        if (overlay) {
          overlay.classList.remove('open');
          overlay.classList.add('hidden');
        }
      }
      window.closeAdminModal = closeAdminModal;

      function proHeaderBtnHtml() {
        if (isAdmin(currentUser)) {
          return '<button class="admin-badge-header" id="headerAdminBtn" title="Admin Control Center">👑 Admin</button>';
        }
        if (isUserPro(currentUser)) {
          return '<span class="pro-badge-header" title="MedLadder Pro Active">⭐ PRO</span>';
        }
        return '<button class="btn-go-pro" id="headerGoProBtn" title="Upgrade to MedLadder Pro (₹' + PRO_CONFIG.PRICE_INR + ')">⚡ Pro</button>';
      }


      // Snapshot the URL before the auth client is created: on a sign-in
      // return, the client consumes the result markers (?code=, #tokens,
      // errors) from the URL during its own boot, and the return handler
      // in initAuth() needs to see them as they arrived.
      var bootUrlSearch = window.location.search;
      var bootUrlHash = window.location.hash;

      // Password-recovery returns. Supabase marks a PKCE reset by storing the
      // code verifier as "<verifier>/PASSWORD_RECOVERY" when the reset email is
      // requested; the client deletes it once the ?code= is exchanged, so it has
      // to be read here, before createClient runs. Older (implicit-flow) reset
      // links carry #...type=recovery instead.
      var recoveryMode = false;
      function hasRecoveryVerifier() {
        try {
          for (var i = 0; i < localStorage.length; i++) {
            var k = localStorage.key(i);
            if (k && /^sb-.*-auth-token-code-verifier$/.test(k) &&
                /\/PASSWORD_RECOVERY$/.test(localStorage.getItem(k) || '')) return true;
          }
        } catch (e) {}
        return false;
      }
      (function detectRecoveryReturn() {
        try {
          var qs = new URLSearchParams(bootUrlSearch);
          var hs = new URLSearchParams(String(bootUrlHash || '').replace(/^#/, ''));
          if (hs.get('type') === 'recovery') { recoveryMode = true; return; }
          if (qs.get('code') && hasRecoveryVerifier()) recoveryMode = true;
        } catch (e) {}
      })();

      // Cross-device reset links: the email template links to
      // /?token_hash=...&type=recovery. No browser-bound verifier is needed, so
      // the link works on any device. The token is only verified when the user
      // submits the new password, so email link scanners cannot consume it.
      var recoveryTokenHash = null;
      (function detectRecoveryTokenHash() {
        try {
          var q = new URLSearchParams(bootUrlSearch);
          if (q.get('token_hash') && q.get('type') === 'recovery') recoveryTokenHash = q.get('token_hash');
        } catch (e) {}
      })();

      try {
        if (window.supabase && typeof window.supabase.createClient === 'function') {
          supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            auth: {
              persistSession: true,
              autoRefreshToken: true,
              detectSessionInUrl: true,
              // PKCE: sign-in returns carry a one-time ?code= that the app
              // exchanges via the auth API, instead of session tokens in a
              // URL fragment (which mobile browsers can drop on the return
              // trip, silently leaving the user signed out).
              flowType: 'pkce'
            }
          });
        }
      } catch (e) {
        console.warn('Supabase client failed to initialize:', e);
      }

      function resetAuthModalButtons() {
        var gIcon = '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"/><path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"/><path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/></svg>';
        var btns = document.querySelectorAll('.auth-google-btn');
        btns.forEach(function (b) {
          b.disabled = false;
          var isSignUp = b.id === 'googleAuthBtnSignUp';
          b.innerHTML = gIcon + '<span>' + (isSignUp ? 'Sign up with Google' : 'Continue with Google') + '</span><span class="auth-google-badge">Fastest</span>';
        });
        var inBtn = document.getElementById('authSignInSubmit');
        if (inBtn) {
          inBtn.disabled = false;
          inBtn.innerHTML = 'Sign In';
        }
        var upBtn = document.getElementById('authSignUpSubmit');
        if (upBtn) {
          upBtn.disabled = false;
          upBtn.innerHTML = 'Create Account';
        }
        var fgBtn = document.getElementById('authForgotSubmit');
        if (fgBtn) {
          fgBtn.disabled = false;
          fgBtn.innerHTML = 'Send Recovery Email';
        }
        var rsBtn = document.getElementById('authResetSubmit');
        if (rsBtn) {
          rsBtn.disabled = false;
          rsBtn.innerHTML = 'Update Password';
        }
      }

      function finishNativeOAuth(urlString) {
        var nativeBridge = window.MedLadderNative;
        if (!nativeBridge || !nativeBridge.isNative || !urlString ||
            urlString.indexOf('com.medladder.app://auth/callback') !== 0) return;

        nativeBridge.Browser.close().catch(function () {});
        var callback;
        try { callback = new URL(urlString); } catch (e) { return; }
        var callbackParams = new URLSearchParams(callback.hash.replace(/^#/, ''));
        var authError = callback.searchParams.get('error_description') || callbackParams.get('error_description') ||
          callback.searchParams.get('error') || callbackParams.get('error');
        if (authError) {
          resetAuthModalButtons();
          setAuthAlert('error', authError);
          return;
        }

        var authCode = callback.searchParams.get('code');
        var sessionPromise;
        if (authCode) {
          sessionPromise = supabaseClient.auth.exchangeCodeForSession(authCode);
        } else {
          var accessToken = callbackParams.get('access_token');
          var refreshToken = callbackParams.get('refresh_token');
          if (!accessToken || !refreshToken) {
            resetAuthModalButtons();
            return;
          }
          sessionPromise = supabaseClient.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        }
        sessionPromise.then(function (result) {
          resetAuthModalButtons();
          if (result && result.error) {
            setAuthAlert('error', result.error.message || 'Could not finish sign-in.');
          } else {
            closeAuthModal();
          }
        }).catch(function (error) {
          resetAuthModalButtons();
          setAuthAlert('error', error && error.message ? error.message : 'Could not finish sign-in.');
        });
      }

      (function listenForNativeOAuthReturn() {
        var nativeBridge = window.MedLadderNative;
        if (!nativeBridge || !nativeBridge.isNative) return;
        nativeBridge.App.addListener('appUrlOpen', function (event) {
          finishNativeOAuth(event && event.url);
        });
        nativeBridge.App.addListener('appStateChange', function (state) {
          if (state && state.isActive) {
            resetAuthModalButtons();
          }
        });
        if (nativeBridge.Browser && typeof nativeBridge.Browser.addListener === 'function') {
          nativeBridge.Browser.addListener('browserFinished', function () {
            resetAuthModalButtons();
          });
        }
        nativeBridge.App.getLaunchUrl().then(function (launch) {
          if (launch && launch.url) finishNativeOAuth(launch.url);
        }).catch(function () {});
      })();

      function cleanAuthReturnUrl() {
        try { window.history.replaceState(null, '', window.location.pathname); } catch (e) {}
      }

      // Web sign-in returns (Google OAuth, email links) land back on the
      // page the user started from, with the outcome in the URL: a ?code=
      // to exchange (PKCE), session tokens in the #fragment, or an error.
      // The Supabase client normally processes the return itself during
      // boot; this is the safety net for returns it misses, and it makes
      // failed returns visible instead of silently leaving the user on a
      // signed-out page.
      function captureWebAuthReturn() {
        if (!supabaseClient) return;
        if (window.MedLadderNative && window.MedLadderNative.isNative) return;
        if (recoveryMode) return; // handled by the reset-password flow in initAuth()
        var search, hash;
        try {
          search = new URLSearchParams(bootUrlSearch);
          hash = new URLSearchParams(String(bootUrlHash || '').replace(/^#/, ''));
        } catch (e) { return; }
        var errText = search.get('error_description') || hash.get('error_description') ||
          search.get('error') || hash.get('error');
        if (errText) {
          showToast('Sign-in failed: ' + errText.replace(/\+/g, ' '), 'error');
          cleanAuthReturnUrl();
          return;
        }
        var code = search.get('code');
        var accessToken = hash.get('access_token');
        var refreshToken = hash.get('refresh_token');
        if (!code && !accessToken) return;
        setTimeout(function () {
          if (currentUser) { cleanAuthReturnUrl(); return; }
          supabaseClient.auth.getSession().then(function (res) {
            if (res && res.data && res.data.session) { cleanAuthReturnUrl(); return; }
            var liveSearch = new URLSearchParams(window.location.search);
            var liveHash = new URLSearchParams(String(window.location.hash || '').replace(/^#/, ''));
            if (!liveSearch.get('code') && !liveHash.get('access_token')) {
              // The client consumed the return; if its exchange is still
              // landing, a session appears within a moment — only report
              // the failure once it is clear none is coming.
              setTimeout(function () {
                if (currentUser) return;
                supabaseClient.auth.getSession().then(function (res3) {
                  if (!(res3 && res3.data && res3.data.session)) {
                    cleanAuthReturnUrl();
                    showToast('Sign-in could not be completed. Please try again.', 'error');
                  }
                }).catch(function () {});
              }, 800);
              return;
            }
            var attempt;
            if (code) {
              attempt = supabaseClient.auth.exchangeCodeForSession(code);
            } else {
              var tokens = {};
              tokens['access' + '_token'] = accessToken;
              tokens['refresh' + '_token'] = refreshToken;
              attempt = supabaseClient.auth.setSession(tokens);
            }
            return attempt.then(function (result) {
              cleanAuthReturnUrl();
              if (result && result.error) {
                // A concurrent exchange by the client may still land;
                // only report the failure if no session appears.
                setTimeout(function () {
                  if (currentUser) return;
                  supabaseClient.auth.getSession().then(function (res2) {
                    if (!(res2 && res2.data && res2.data.session)) {
                      var em = result.error.message || 'please try again.';
                      if (/code verifier/i.test(em)) em = 'open the email link in the same browser where you requested it, then try again.';
                      showToast('Sign-in failed: ' + em, 'error');
                    }
                  }).catch(function () {});
                }, 600);
              }
              // On success the auth-state listener updates the UI.
            });
          }).catch(function () { cleanAuthReturnUrl(); });
        }, 2500);
      }

      function getUserDisplayName(user) {
        if (!user) return 'Doctor';
        if (user.user_metadata && user.user_metadata.full_name) return user.user_metadata.full_name;
        if (user.email) {
          var namePart = user.email.split('@')[0];
          return namePart.charAt(0).toUpperCase() + namePart.slice(1);
        }
        return 'Doctor';
      }

      function getUserInitials(user) {
        var name = getUserDisplayName(user);
        if (!name) return 'DR';
        var clean = name.replace(/^dr\.?\s*/i, '').trim();
        if (!clean) clean = name.trim();
        var parts = clean.split(/\s+/);
        if (parts.length >= 2) {
          return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
        }
        return clean.slice(0, 2).toUpperCase();
      }

      // ── MODULE PROGRESS: Supabase (counts) + localStorage (resume) ──

      // Load all module_progress rows for this user from Supabase
      function loadModuleProgressFromDB(userId) {
        if (!userId || !supabaseClient) return Promise.resolve();
        return supabaseClient
          .from('module_progress')
          .select('module_key,answered_count,correct_count,total_questions')
          .eq('user_id', userId)
          .then(function (res) {
            if (res.error) { console.warn('loadModuleProgress error:', res.error); return; }
            var rows = res.data || [];
            rows.forEach(function (row) {
              progress[row.module_key] = {
                done: row.answered_count || 0,
                correct: row.correct_count || 0,
                total: row.total_questions || 0
              };
            });
          }).catch(function (e) { console.warn('loadModuleProgress catch:', e); });
      }

      // Upsert one row into module_progress (only aggregate counts — no JSONB)
      function saveModuleProgressToDB(moduleKey, answered, correct, total) {
        if (!currentUser || !currentUser.id || !supabaseClient) return;
        supabaseClient.from('module_progress').upsert({
          user_id: currentUser.id,
          module_key: moduleKey,
          answered_count: answered,
          correct_count: correct,
          total_questions: total,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id,module_key' }).then(function (res) {
          if (res.error) console.warn('saveModuleProgress error:', res.error);
        }).catch(function (e) { console.warn('saveModuleProgress catch:', e); });
      }

      // ---------- ATTEMPT HISTORY (attempts + attempt_answers) ----------
      // module_progress above keeps only aggregate counts, so which questions a
      // student actually got wrong was never stored anywhere. These two tables
      // already existed with the right RLS (with_check: auth.uid() = user_id);
      // nothing wrote to them. Everything below is fire-and-forget: any failure
      // is logged and swallowed, never surfaced, and never blocks a quiz.
      var GUEST_ATTEMPT_KEY = 'medladder_guest_attempts';
      // One-shot: only ever clear a stale session and retry once per page.
      var guestAuthRetry = false;
      var attemptLog = { id: null, creating: false, failed: false, pending: [], flushTimer: null, meta: null };

      function subjectIdForModuleDbId(moduleDbId) {
        if (!moduleDbId || !window.SYLLABUS_DATA) return null;
        for (var i = 0; i < window.SYLLABUS_DATA.length; i++) {
          var subj = window.SYLLABUS_DATA[i];
          var mods = subj.modules || [];
          for (var j = 0; j < mods.length; j++) {
            if (Number(mods[j].id) === Number(moduleDbId)) return Number(subj.subjectId);
          }
        }
        return null;
      }

      // Called once a quiz pool is resolved. The attempts row itself is created
      // lazily on the first answer, so abandoning the setup screen never leaves
      // an empty attempt behind.
      function beginAttemptLog(pool) {
        if (attemptLog.flushTimer) clearTimeout(attemptLog.flushTimer);
        attemptLog = { id: null, creating: false, failed: false, pending: [], flushTimer: null, meta: null };
        try {
          var moduleDbId = pool && typeof pool.moduleDbId === 'number' ? pool.moduleDbId : null;
          var subjectDbId = Number(state.subjectId);
          if (!isFinite(subjectDbId) || subjectDbId <= 0) subjectDbId = subjectIdForModuleDbId(moduleDbId);
          // Multi-subject sets (custom, bookmarks, today's set) have no single
          // subject: subject_id is left null and read back as "Mixed set".
          attemptLog.meta = {
            guest_key: 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
            subject_id: subjectDbId || null,
            module_id: moduleDbId,
            quiz_type: state.quizType === 'timed' ? 'timed' : 'practice',
            time_limit_s: Number(state.timeLimit) || 0,
            order_mode: (setupChoice && setupChoice.orderMode === 'structured') ? 'structured' : 'shuffled',
            started_at: new Date().toISOString()
          };
        } catch (e) { attemptLog.meta = null; }
      }

      function ensureAttemptRow(cb) {
        if (!attemptLog.meta || attemptLog.failed) return;
        if (attemptLog.id) { if (cb) cb(); return; }
        if (attemptLog.creating) return;
        if (!currentUser || !currentUser.id || !supabaseClient) return;
        attemptLog.creating = true;
        try {
        supabaseClient.from('attempts').insert({
          user_id: currentUser.id,
          subject_id: attemptLog.meta.subject_id,
          module_id: attemptLog.meta.module_id,
          quiz_type: attemptLog.meta.quiz_type,
          question_count: state.order.length || attemptLog.pending.length || 1,
          time_limit_s: attemptLog.meta.time_limit_s,
          order_mode: attemptLog.meta.order_mode,
          started_at: attemptLog.meta.started_at
        }).select('id').single().then(function (res) {
          attemptLog.creating = false;
          if (res.error || !res.data || !res.data.id) {
            attemptLog.failed = true;
            console.warn('attempt insert error:', res.error);
            return;
          }
          attemptLog.id = res.data.id;
          if (cb) cb();
        }).catch(function (e) {
          attemptLog.creating = false;
          attemptLog.failed = true;
          console.warn('attempt insert catch:', e);
        });
        } catch (e) {
          attemptLog.creating = false;
          attemptLog.failed = true;
          console.warn('attempt insert threw:', e);
        }
      }

      // Buffered and debounced, so a fast tapper does not fire one request per tap.
      function logAnswer(q, answer) {
        if (!attemptLog.meta) return;
        var qid = Number(q && q.id);
        if (!isFinite(qid) || qid <= 0) return;
        attemptLog.pending.push({
          question_id: qid,
          picked_option: (answer && answer.picked) ? String(answer.picked).slice(0, 1) : null,
          is_correct: !!(answer && answer.isCorrect),
          skipped: !!(answer && answer.skipped),
          answered_at: new Date().toISOString()
        });
        if (attemptLog.flushTimer) clearTimeout(attemptLog.flushTimer);
        attemptLog.flushTimer = setTimeout(function () {
          attemptLog.flushTimer = null;
          flushAttemptAnswers();
        }, 900);
      }

      function flushAttemptAnswers() {
        if (!attemptLog.meta || attemptLog.failed || !attemptLog.pending.length) return;
        if (!currentUser || !currentUser.id || !supabaseClient) { bufferGuestAnswers(); return; }
        if (!attemptLog.id) { ensureAttemptRow(flushAttemptAnswers); return; }
        var attemptId = attemptLog.id;
        var batch = attemptLog.pending.splice(0, attemptLog.pending.length);
        try {
        supabaseClient.from('attempt_answers').insert(batch.map(function (r) {
          return {
            attempt_id: attemptId,
            user_id: currentUser.id,
            question_id: r.question_id,
            picked_option: r.picked_option,
            is_correct: r.is_correct,
            skipped: r.skipped,
            answered_at: r.answered_at
          };
        })).then(function (res) {
          if (res.error) console.warn('attempt_answers insert error:', res.error);
        }).catch(function (e) { console.warn('attempt_answers catch:', e); });
        } catch (e) {
          // Put them back so the next flush (or the results screen) retries.
          attemptLog.pending = batch.concat(attemptLog.pending);
          console.warn('attempt_answers threw:', e);
        }
      }

      // Signed-out practice is not possible yet. When guest modules open, this
      // is the buffer that gets migrated into the account on sign-up.
      function bufferGuestAnswers() {
        try {
          if (!attemptLog.pending.length) return;
          var raw = localStorage.getItem(GUEST_ATTEMPT_KEY);
          var store = raw ? JSON.parse(raw) : [];
          if (!Array.isArray(store)) store = [];
          var batch = attemptLog.pending.splice(0, attemptLog.pending.length);
          // Repeated flushes during one quiz must append to that quiz's entry,
          // not create a new attempt each time.
          var entry = null;
          for (var i = 0; i < store.length; i++) {
            if (store[i] && store[i].meta && store[i].meta.guest_key === attemptLog.meta.guest_key) { entry = store[i]; break; }
          }
          if (entry) {
            entry.answers = (entry.answers || []).concat(batch);
          } else {
            store.push({ meta: attemptLog.meta, answers: batch });
          }
          while (store.length > 20) store.shift();
          localStorage.setItem(GUEST_ATTEMPT_KEY, JSON.stringify(store));
        } catch (e) { }
      }

      function finishAttemptLog(pct) {
        if (!attemptLog.meta) return;
        if (attemptLog.flushTimer) { clearTimeout(attemptLog.flushTimer); attemptLog.flushTimer = null; }
        if (!currentUser || !currentUser.id || !supabaseClient || attemptLog.failed) {
          bufferGuestAnswers();
          return;
        }
        var close = function () {
          if (!attemptLog.id) return;
          try {
          supabaseClient.from('attempts').update({
            finished_at: new Date().toISOString(),
            score_pct: isFinite(pct) ? Math.round(pct) : null
          }).eq('id', attemptLog.id).then(function (res) {
            if (res.error) console.warn('attempt finish error:', res.error);
          }).catch(function (e) { console.warn('attempt finish catch:', e); });
          } catch (e) { console.warn('attempt finish threw:', e); }
        };
        if (attemptLog.id) { flushAttemptAnswers(); close(); }
        else ensureAttemptRow(function () { flushAttemptAnswers(); close(); });
      }

      // A quiz abandoned mid-way should still keep the answers already given.
      try {
        document.addEventListener('visibilitychange', function () {
          if (document.visibilityState === 'hidden') {
            try { flushAttemptAnswers(); } catch (e) { }
          }
        });
      } catch (e) { }

      // ---------- GUEST PRACTICE (signed-out visitors) ----------
      // One module per subject is readable by the anon role, so a visitor who
      // arrives on a topic page from search can actually answer questions
      // instead of meeting a sign-in wall before any value is delivered.
      // RLS decides what is readable; this only decides what the UI offers.
      var guestModuleIds = null;        // null = not loaded yet
      var guestModulesLoading = false;
      // Deliberately NOT on `state`: startQuiz's success handler, the PYQ path
      // and the bookmarks path each replace `state` wholesale before calling
      // renderQuiz, which would drop the flag and bounce the guest to the
      // sign-in modal after the questions had already loaded.
      var guestRunActive = false;

      function loadGuestModules() {
        if (currentUser || guestModuleIds || guestModulesLoading || !supabaseClient) return;
        guestModulesLoading = true;
        try {
          // As anon this returns only the guest-flagged rows.
          supabaseClient.from('free_modules').select('module_id').then(function (res) {
            guestModulesLoading = false;
            if (res.error || !res.data) { guestModuleIds = {}; return; }
            var map = {};
            res.data.forEach(function (r) { if (r && r.module_id != null) map[String(r.module_id)] = true; });
            guestModuleIds = map;
            // The screen painted before this arrived, so repaint it now that we
            // know which module is open. renderSetup calls loadGuestModules
            // again, but it returns immediately once guestModuleIds is set.
            try {
              if (!currentUser && state.subjectId) {
                if (state.screen === 'setup') renderSetup(state.subjectId, state.moduleId || 'all');
                else if (state.screen === 'modules') renderModuleList(state.subjectId);
              }
              if (!currentUser && state.screen === 'home' && v2On()) renderHomeV2();
            } catch (e) { console.warn('guest re-render failed:', e); }
          }).catch(function () { guestModulesLoading = false; guestModuleIds = {}; });
        } catch (e) { guestModulesLoading = false; guestModuleIds = {}; }
      }

      function isGuestModule(moduleDbId) {
        if (moduleDbId == null || !guestModuleIds) return false;
        return !!guestModuleIds[String(moduleDbId)];
      }

      // A signed-out visitor may start a quiz only on a single guest module.
      // Whole-subject sets, custom sets, bookmarks and PYQs still need an account.
      function guestCanStart(pool) {
        if (currentUser) return false;
        if (!pool || state.isPyqMode) return false;
        if (pool.moduleId === 'all' || pool.moduleId === 'custom') return false;
        return isGuestModule(pool.moduleDbId);
      }

      // Move anything practised while signed out into the new account, so
      // signing in preserves work rather than discarding it.
      function migrateGuestAttempts() {
        if (!currentUser || !currentUser.id || !supabaseClient) return;
        var store;
        try {
          var raw = localStorage.getItem(GUEST_ATTEMPT_KEY);
          if (!raw) return;
          store = JSON.parse(raw);
          if (!Array.isArray(store) || !store.length) { localStorage.removeItem(GUEST_ATTEMPT_KEY); return; }
        } catch (e) { return; }

        // Clear first: a half-failed migration must not replay on every sign-in.
        try { localStorage.removeItem(GUEST_ATTEMPT_KEY); } catch (e) { }

        store.forEach(function (entry) {
          if (!entry || !entry.meta || !entry.answers || !entry.answers.length) return;
          var meta = entry.meta;
          var answers = entry.answers;
          var correct = answers.filter(function (a) { return a.is_correct; }).length;
          try {
            supabaseClient.from('attempts').insert({
              user_id: currentUser.id,
              subject_id: meta.subject_id,
              module_id: meta.module_id,
              quiz_type: meta.quiz_type || 'practice',
              question_count: answers.length,
              time_limit_s: meta.time_limit_s || 0,
              order_mode: meta.order_mode || 'shuffled',
              started_at: meta.started_at || new Date().toISOString(),
              finished_at: new Date().toISOString(),
              score_pct: Math.round((correct / answers.length) * 100)
            }).select('id').single().then(function (res) {
              if (res.error || !res.data) { console.warn('guest attempt migrate error:', res.error); return; }
              var attemptId = res.data.id;
              try {
                supabaseClient.from('attempt_answers').insert(answers.map(function (a) {
                  return {
                    attempt_id: attemptId,
                    user_id: currentUser.id,
                    question_id: a.question_id,
                    picked_option: a.picked_option,
                    is_correct: !!a.is_correct,
                    skipped: !!a.skipped,
                    answered_at: a.answered_at
                  };
                })).then(function (r2) {
                  if (r2.error) console.warn('guest answers migrate error:', r2.error);
                }).catch(function (e) { console.warn('guest answers migrate catch:', e); });
              } catch (e) { console.warn('guest answers migrate threw:', e); }
            }).catch(function (e) { console.warn('guest attempt migrate catch:', e); });
          } catch (e) { console.warn('guest attempt migrate threw:', e); }
        });
      }

      // Legacy shim — kept to not break any old callers
      function loadUserProgress(userId) {
        if (!userId) return;
        // Also load from localStorage for instant display before DB returns
        try {
          var stored = localStorage.getItem('medladder_progress_' + userId);
          if (stored) {
            var parsed = JSON.parse(stored);
            if (parsed && typeof parsed === 'object') progress = Object.assign({}, parsed);
          }
        } catch (e) { }
        // Then overlay with server data (async)
        loadModuleProgressFromDB(userId).then(function () {
          // Re-render current screen to show updated progress pills.
          // Content refresh, not navigation: keep the user's scroll spot.
          var y = window.scrollY;
          if (state.screen === 'home') renderHome();
          else if (state.screen === 'modules') renderModuleList(state.subjectId);
          window.scrollTo(0, y);
        });
      }

      // "Reset all progress" must leave nothing for the dashboard to count:
      // the per-topic totals (module_progress), the session history
      // (attempts; attempt_answers go with them by cascade), any write still
      // queued from the last answer, and a guest buffer waiting to migrate.
      var lastProgressReset = 0;
      function resetAllProgress() {
        // The button has both a direct and a delegated listener; run once.
        if (Date.now() - lastProgressReset < 800) return;
        lastProgressReset = Date.now();
        if (progressSaveTimer) { clearTimeout(progressSaveTimer); progressSaveTimer = null; }
        progress = {};
        persistProgress();
        reviewData = currentUser ? emptyReviewData(currentUser.id) : null;
        if (reviewData) reviewData.loaded = true;
        try { localStorage.removeItem(GUEST_ATTEMPT_KEY); } catch (e) { }
        try {
          if (attemptLog.flushTimer) clearTimeout(attemptLog.flushTimer);
          attemptLog = { id: null, creating: false, failed: false, pending: [], flushTimer: null, meta: null };
        } catch (e) { }
        if (currentUser && currentUser.id && supabaseClient) {
          var uid = currentUser.id;
          ['module_progress', 'attempts'].forEach(function (table) {
            try {
              supabaseClient.from(table).delete().eq('user_id', uid).then(function (res) {
                if (res && res.error) {
                  console.warn('reset ' + table + ' failed:', res.error);
                  showToast('Could not clear everything on the server. Please try the reset again.', 'error');
                }
              });
            } catch (e) { console.warn('reset ' + table + ' threw:', e); }
          });
        }
        showToast('All progress reset.');
        if (state.screen === 'dashboard') renderDashboard(); else renderHome(true);
      }

      function persistProgress() {
        if (currentUser && currentUser.id) {
          try { localStorage.setItem('medladder_progress_' + currentUser.id, JSON.stringify(progress)); } catch (e) { }
        }
      }

      function showToast(msg, type) {
        var container = document.getElementById('toastContainer');
        if (!container) {
          container = document.createElement('div');
          container.id = 'toastContainer';
          container.className = 'toast-container';
          document.body.appendChild(container);
        }
        var toast = document.createElement('div');
        toast.className = 'toast-item';
        var icon = type === 'error' ? '⚠️' : '✓';
        toast.innerHTML = '<span style="font-size:14px;">' + icon + '</span><span>' + esc(msg) + '</span>';
        container.appendChild(toast);
        setTimeout(function () {
          if (toast && toast.parentNode) toast.parentNode.removeChild(toast);
        }, 3200);
      }

      var isDownloadingApk = false;

      function downloadMedLadderApkInPage(targetUrl) {
        var url = targetUrl || '/MedLadder-latest.apk';
        var isNative = !!(window.MedLadderNative && window.MedLadderNative.isNative);

        // 1. Inside native Android app: trigger DownloadManager in background (zero WebView navigation, zero blank screen)
        if (window.MedLadderAndroidApp && typeof window.MedLadderAndroidApp.downloadApk === 'function') {
          showToast('📥 Starting MedLadder APK download in background...', 'success');
          window.MedLadderAndroidApp.downloadApk('https://medladder.top/MedLadder-latest.apk');
          return;
        }

        // 2. Native app fallback: trigger hidden iframe download without unloading page
        if (isNative) {
          showToast('📥 Starting MedLadder APK download in background...', 'success');
          triggerIframeDownload('https://medladder.top/MedLadder-latest.apk');
          return;
        }

        // 3. On the web (mobile or desktop browser): 100% in-page blob download with progress, no redirect, no blank tab
        if (isDownloadingApk) return;
        isDownloadingApk = true;
        showToast('📥 Preparing MedLadder APK (7.5 MB)...', 'info');

        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.responseType = 'blob';

        var lastReported = 0;
        xhr.onprogress = function (e) {
          if (e.lengthComputable && e.total > 0) {
            var pct = Math.min(100, Math.round((e.loaded / e.total) * 100));
            if (pct >= lastReported + 25 || pct === 100) {
              lastReported = pct;
              showToast('📥 Downloading MedLadder APK... ' + pct + '%', 'info');
            }
          }
        };

        xhr.onload = function () {
          isDownloadingApk = false;
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              var blob = xhr.response;
              var blobUrl = window.URL.createObjectURL(blob);
              var link = document.createElement('a');
              link.style.display = 'none';
              link.href = blobUrl;
              link.download = 'MedLadder-latest.apk';
              document.body.appendChild(link);
              link.click();
              setTimeout(function () {
                if (link.parentNode) link.parentNode.removeChild(link);
                window.URL.revokeObjectURL(blobUrl);
              }, 60000);
              showToast('✅ Download complete! Saved to your device.', 'success');
              return;
            } catch (err) {}
          }
          showToast('📥 Starting direct download...', 'info');
          triggerIframeDownload(url);
        };

        xhr.onerror = function () {
          isDownloadingApk = false;
          triggerIframeDownload(url);
        };

        xhr.send();
      }

      function triggerIframeDownload(url) {
        var iframe = document.getElementById('medladderApkDownloader');
        if (!iframe) {
          iframe = document.createElement('iframe');
          iframe.id = 'medladderApkDownloader';
          iframe.style.display = 'none';
          document.body.appendChild(iframe);
        }
        iframe.src = url;
      }

      document.addEventListener('click', function (e) {
        var btn = e.target.closest('.footer-apk-btn');
        // Only a direct .apk link is downloaded in-page. The button now points
        // at Google Play, and intercepting that click stopped it opening.
        if (btn && /\.apk(\?|#|$)/i.test(btn.getAttribute('href') || '')) {
          e.preventDefault();
          downloadMedLadderApkInPage(btn.getAttribute('href'));
        }
      });

      function authBtnHtml() {
        if (!currentUser) {
          return '<button class="auth-btn" id="authTriggerBtn" title="Sign in or create account">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>' +
            '<span>Sign In</span>' +
            '</button>';
        }
        var initials = esc(getUserInitials(currentUser));
        var displayName = esc(getUserDisplayName(currentUser));
        var email = esc(currentUser.email || '');
        var isPro = isUserPro(currentUser);

        var totalDone = 0;
        var totalCorrect = 0;
        var attemptedTopics = 0;
        Object.keys(progress).forEach(function (k) {
          if (progress[k] && progress[k].done) {
            attemptedTopics += 1;
            totalDone += progress[k].done;
            totalCorrect += progress[k].correct;
          }
        });
        var accuracyPct = totalDone > 0 ? Math.round((totalCorrect / totalDone) * 100) : 0;

        var planSectionHtml = isPro
          ? '<div class="dropdown-stat-row"><span class="dropdown-stat-label">Membership</span><span class="dropdown-stat-val" style="color:#FFB23D;font-weight:800;">⭐ Pro Active</span></div>'
          : '<div class="dropdown-stat-row"><span class="dropdown-stat-label">Plan</span><span class="dropdown-stat-val">Free (8 topics/subj)</span></div>' +
          '<button class="dropdown-action-btn" id="dropdownUpgradeBtn" style="color:#FF7A3D;font-weight:700;">⚡ Upgrade to Pro (₹' + PRO_CONFIG.PRICE_INR + ')</button>';

        return '<div class="user-menu-wrap" id="userMenuWrap">' +
          '<button class="auth-user-btn" id="authUserBtn" aria-label="User profile menu" aria-expanded="false">' +
          '<span class="auth-avatar">' + initials + '</span>' +
          '<span class="auth-user-name">' + displayName + (isPro ? ' ⭐' : '') + '</span>' +
          '<span class="auth-caret">▾</span>' +
          '</button>' +
          '<div class="auth-dropdown glass hidden" id="authDropdown">' +
          '<div class="dropdown-header">' +
          '<div class="dropdown-avatar">' + initials + '</div>' +
          '<div class="dropdown-details">' +
          '<div class="dropdown-name">' + displayName + '</div>' +
          '<div class="dropdown-email">' + email + '</div>' +
          '</div>' +
          '</div>' +
          '<div class="dropdown-divider"></div>' +
          planSectionHtml +
          '<div class="dropdown-divider"></div>' +
          '<div class="dashboard-kicker"><span>YOUR STUDY SNAPSHOT</span><span class="dashboard-live-dot"></span></div>' +
          '<div class="dashboard-stat-grid">' +
          '<div class="dashboard-stat-card"><span class="dashboard-stat-icon purple">✓</span><span class="dashboard-stat-value">' + totalDone.toLocaleString() + '</span><span class="dashboard-stat-label">MCQs done</span></div>' +
          '<div class="dashboard-stat-card"><span class="dashboard-stat-icon cyan">' + accuracyPct + '%</span><span class="dashboard-stat-value">' + (totalDone > 0 ? accuracyPct + '%' : '—') + '</span><span class="dashboard-stat-label">accuracy</span></div>' +
          '<div class="dashboard-stat-card"><span class="dashboard-stat-icon amber">▦</span><span class="dashboard-stat-value">' + attemptedTopics.toLocaleString() + '</span><span class="dashboard-stat-label">topics started</span></div>' +
          '</div>' +
          '<div class="dashboard-progress-note"><span class="dashboard-progress-dot"></span><span>' + (totalDone > 0 ? 'Keep building momentum across your started topics.' : 'Start a topic to begin tracking your progress here.') + '</span></div>' +
          '<button class="dropdown-action-btn dropdown-progress-btn" id="dropdownDashboardBtn">' +
          '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20V10"></path><path d="M10 20V4"></path><path d="M16 20v-7"></path><path d="M22 20H2"></path></svg>' +
          '<span>View my progress</span>' +
          '<svg class="dropdown-progress-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6"></path></svg>' +
          '</button>' +
          '<button class="dropdown-action-btn" id="dropdownUiModeBtn">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5"></rect><rect x="14" y="3" width="7" height="7" rx="1.5"></rect><rect x="3" y="14" width="7" height="7" rx="1.5"></rect><rect x="14" y="14" width="7" height="7" rx="1.5"></rect></svg>' +
          (v2On() ? 'Switch to classic home' : 'Switch to new home') +
          '</button>' +
          '<div class="dropdown-divider dropdown-divider-wide"></div>' +
          '<button class="dropdown-action-btn" id="authSignOutBtn">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>' +
          'Sign Out' +
          '</button>' +
          '</div>' +
          '</div>';
      }

      // Hide the page's baked-in generic footer when the app renders its own,
      // so static documents don't show the same footer twice.
      function hideStaticFooter() {
        var appEl = document.getElementById('app');
        if (!appEl) return;
        document.querySelectorAll('footer.credit').forEach(function (f) {
          if (!appEl.contains(f)) f.style.display = 'none';
        });
      }

      // Remove repeated keyword-stuffed footer blocks from static SEO pages.
      // The subject/topic pages retain their page-specific content and contextual links;
      // this only removes the generic "Popular searches" keyword list and global link wall.
      (function cleanStaticSeoFooter() {
        // Do not strip the baked directory nav on pages the router leaves alone
        // (/pyqs/*, guides, /mock-test, /privacy, /terms, /neet-ss-books, /admin-mock):
        // nothing re-injects a directory there, so removing it would leave those
        // pages with no navigation at all.
        var cleanPath = (window.location.pathname || '/').replace(/\/$/, '').toLowerCase();
        if (cleanPath === '/pyqs' || cleanPath.indexOf('/pyqs/') === 0 ||
            cleanPath === '/neet-pg-syllabus' || cleanPath === '/neet-pg-high-yield-topics' ||
            cleanPath === '/neet-pg-top-100-questions' || cleanPath === '/medladder-vs-marrow' ||
            cleanPath === '/medladder-vs-prepladder' || cleanPath === '/best-free-neet-pg-question-bank' ||
            cleanPath === '/inicet' || cleanPath === '/mock-test' || cleanPath === '/mock-test.html' ||
            cleanPath === '/admin-mock' || cleanPath === '/admin-mock.html' ||
            cleanPath === '/privacy' || cleanPath === '/privacy.html' ||
            cleanPath === '/terms' || cleanPath === '/terms.html' ||
            cleanPath === '/neet-ss-books' || cleanPath === '/neet-ss-books.html') return;
        document.querySelectorAll('.popular-searches, nav[aria-label="Browse MedLadder"]').forEach(function (node) {
          node.remove();
        });
      }());
      function footerHtml() {
        var isNative = !!(
          (window.MedLadderNative && window.MedLadderNative.isNative) ||
          window.MedLadderAndroidApp ||
          (window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform()) ||
          (document.documentElement && document.documentElement.classList.contains('is-native-app')) ||
          (document.body && document.body.classList.contains('is-native-app'))
        );
        var apkBtnHtml = isNative ? '' :
          '<a href="https://play.google.com/store/apps/details?id=com.medladder.app" class="footer-apk-btn" target="_blank" rel="noopener" title="Get MedLadder on Google Play">' +
          '<span class="footer-apk-icon">' +
          '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>' +
          '</span>' +
          '<span class="footer-apk-text">' +
          '<span class="footer-apk-sub">Android app</span>' +
          '<span class="footer-apk-title">Get it on Google Play</span>' +
          '</span>' +
          '<span class="footer-apk-badge">' +
          '<span>Free</span>' +
          '</span>' +
          '</a>';
        var pathParts = (window.location.pathname || '/').replace(/\/index\.html$/i, '').split('/').filter(Boolean);
        var currentSubject = null;
        var currentModules = [];
        var currentModuleIndex = -1;
        if (pathParts[0] === 'subjects' && pathParts[1] && Array.isArray(SUBJECT_INDEX)) {
          currentSubject = SUBJECT_INDEX.find(function (s) { return slugifySeo(s.name) === pathParts[1]; }) || null;
          if (currentSubject) {
            currentModules = getSubjectModules(currentSubject.subjectId) || [];
            if (pathParts[2]) currentModuleIndex = currentModules.findIndex(function (m) { return slugifySeo(m.name) === pathParts[2]; });
          }
        }
        if (!currentSubject && state && state.subjectId && Array.isArray(SUBJECT_INDEX)) {
          currentSubject = SUBJECT_INDEX.find(function (s) { return s.subjectId === state.subjectId; }) || null;
          if (currentSubject) {
            currentModules = getSubjectModules(currentSubject.subjectId) || [];
            if (state.moduleId && state.moduleId !== 'all') currentModuleIndex = currentModules.findIndex(function (m) { return String(m.moduleId) === String(state.moduleId); });
          }
        }
        var isHomeDirectory = pathParts.length === 0 && state && state.screen === 'home';
        var isTopicDirectory = !!(currentSubject && (pathParts.length >= 3 || (pathParts.length === 0 && state && state.moduleId && state.moduleId !== 'all')));
        var isSubjectDirectory = !!(currentSubject && !isTopicDirectory);
        var directoryHtml = '';
        if (isHomeDirectory) {
          directoryHtml =
            '<nav class="footer-directory" aria-label="Explore MedLadder">' +
            '<div class="footer-directory-group"><strong>Exams</strong><div><a href="/neet-pg">NEET PG</a><a href="/fmge">FMGE</a><a href="/inicet">INI-CET</a><a href="/neet-ss">NEET SS</a></div></div>' +
            '<div class="footer-directory-group"><details' + (isHomeDirectory ? ' open' : '') + '><summary>Subjects (19)</summary><div>' +
            SUBJECT_INDEX.map(function (s) { return '<a href="' + subjectPath(s) + '">' + esc(s.name) + '</a>'; }).join('') +
            '</div></details></div>' +
            '<div class="footer-directory-group"><strong>Preparation</strong><div><a href="/neet-pg-syllabus">NEET PG Syllabus</a><a href="/neet-pg-high-yield-topics">High-Yield Topics</a><a href="/neet-pg-top-100-questions">Top 100 Questions</a><a href="/mock-test">Mock Tests</a><a href="/pyqs">Previous-Year Questions</a><a href="/best-free-neet-pg-question-bank">Free Question Bank</a></div></div>' +
            '<div class="footer-directory-group"><strong>About &amp; policies</strong><div><a href="/medladder-vs-marrow">MedLadder vs Marrow</a><a href="/medladder-vs-prepladder">MedLadder vs PrepLadder</a><a href="/privacy">Privacy Policy</a><a href="/terms">Terms of Service</a><a href="/terms#cancellation-refund">Refund Policy</a><a href="/editorial-team">Editorial team</a>' +
            (isAdmin(currentUser) ? '<a href="#" class="admin-footer-link">👑 Admin Access</a>' : '') +
            '</div></div></nav>';
        } else if (isSubjectDirectory) {
          var relatedSubjects = SUBJECT_INDEX.filter(function (s) { return s.subjectId !== currentSubject.subjectId && s.cat === currentSubject.cat; }).slice(0, 5);
          directoryHtml =
            '<nav class="footer-directory footer-directory-medium" aria-label="Related MedLadder links">' +
            '<div class="footer-directory-group"><strong>Subject</strong><div><a href="/">All subjects</a><a href="' + subjectPath(currentSubject) + '">' + esc(currentSubject.name) + ' topics</a></div></div>' +
            '<div class="footer-directory-group"><strong>Related subjects</strong><div>' + relatedSubjects.map(function (s) { return '<a href="' + subjectPath(s) + '">' + esc(s.name) + '</a>'; }).join('') + '</div></div>' +
            '<div class="footer-directory-group"><strong>Exams &amp; PYQs</strong><div><a href="/neet-pg">NEET PG</a><a href="/fmge">FMGE</a><a href="/inicet">INI-CET</a><a href="/neet-ss">NEET SS</a><a href="/pyqs">All PYQs</a></div></div>' +
            '<div class="footer-directory-group"><strong>Policies</strong><div><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/terms#cancellation-refund">Refunds</a></div></div></nav>';
        } else if (isTopicDirectory) {
          var nearbyModules = [];
          for (var offset = -2; offset <= 2; offset++) {
            if (!offset) continue;
            var nearbyModule = currentModules[currentModuleIndex + offset];
            if (nearbyModule) nearbyModules.push(nearbyModule);
          }
          directoryHtml =
            '<nav class="footer-directory footer-directory-minimal" aria-label="Topic navigation">' +
            '<div class="footer-directory-group"><strong>Explore ' + esc(currentSubject.name) + '</strong><div><a href="' + subjectPath(currentSubject) + '">All ' + esc(currentSubject.name) + ' topics</a>' +
            nearbyModules.map(function (m) { return '<a href="' + topicPath(currentSubject, m) + '">' + esc(m.name) + '</a>'; }).join('') +
            '</div></div><div class="footer-directory-group"><strong>Site information</strong><div><a href="/">Home</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a></div></div></nav>';
        } else {
          directoryHtml = '<nav class="footer-directory footer-directory-minimal" aria-label="Site information"><div class="footer-directory-group"><strong>MedLadder</strong><div><a href="/">Home</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a></div></div></nav>';
        }
        if (v2On()) return v3FooterHtml(isNative, directoryHtml);
        return '<footer class="credit">' +
          '<div class="footer-content">' +
          apkBtnHtml +
          '<div class="footer-social-row">' +
          '<a href="https://www.facebook.com/profile.php?id=61568903965858" target="_blank" rel="noopener noreferrer" class="footer-social-btn fb" aria-label="Facebook" title="MedLadder on Facebook">' +
          '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>' +
          '</a>' +
          '<a href="https://www.instagram.com/medladder2026/" target="_blank" rel="noopener noreferrer" class="footer-social-btn insta" aria-label="Instagram" title="MedLadder on Instagram">' +
          '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>' +
          '</a>' +
          '<a href="https://x.com/medladder2026" target="_blank" rel="noopener noreferrer" class="footer-social-btn x-tw" aria-label="X (formerly Twitter)" title="MedLadder on X">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 23.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>' +
          '</a>' +
          '<a href="https://t.me/+JdqZ1YlJ-NhlOThl" target="_blank" rel="noopener noreferrer" class="footer-social-btn tg" aria-label="Telegram" title="MedLadder on Telegram">' +
          '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.161c-.18 1.897-.962 6.502-1.359 8.627-.168.9-.5 1.201-.82 1.23-.697.064-1.226-.46-1.901-.903-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.329-.913.489-1.302.481-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.477-1.635.099-.002.321.023.465.14.121.099.155.232.164.333-.008.068.002.193-.006.31z"/></svg>' +
          '</a>' +
          '</div>' +
          directoryHtml +
          '<div class="footer-copy"><strong>MedLadder</strong> · Medical Entrance Exam Question Bank</div>' +
          '<div class="footer-subcopy">MBBS · FMGE · NEET PG · INI-CET · NEET SS</div>' +
          '</div>' +          '</footer>';
      }

      var V3_SOCIAL = [
        ['https://www.facebook.com/profile.php?id=61568903965858', 'Facebook', '<path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>'],
        ['https://www.instagram.com/medladder2026/', 'Instagram', '<rect x="2.5" y="2.5" width="19" height="19" rx="5.5" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="12" cy="12" r="4.3" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="17.6" cy="6.4" r="1.4"/>'],
        ['https://x.com/medladder2026', 'X', '<path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 23.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>'],
        ['https://t.me/+JdqZ1YlJ-NhlOThl', 'Telegram', '<path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.161c-.18 1.897-.962 6.502-1.359 8.627-.168.9-.5 1.201-.82 1.23-.697.064-1.226-.46-1.901-.903-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.329-.913.489-1.302.481-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.477-1.635.099-.002.321.023.465.14.121.099.155.232.164.333-.008.068.002.193-.006.31z"/>']
      ];
      // The new-look footer: one centred column on phones, brand + links side
      // by side on wide screens. Same links as the classic footer.
      function v3FooterHtml(isNative, directoryHtml) {
        var year = new Date().getFullYear();
        return '<footer class="credit v3 v3-foot">' +
          '<div class="v3f">' +
          '<div class="v3f-top">' +
          '<div class="v3f-brand"><img src="/icons/icon-72.png" alt="" width="44" height="44" loading="lazy"><div><b>MedLadder</b><span>Free question bank for NEET PG, FMGE, INI-CET and NEET SS</span></div></div>' +
          '<div class="v3f-cta">' +
          (isNative ? '' : '<a href="https://play.google.com/store/apps/details?id=com.medladder.app" class="v3f-play" target="_blank" rel="noopener">' +
            '<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4.2 2.6c-.3.3-.5.8-.5 1.4v16c0 .6.2 1.1.5 1.4l9.2-9.4z"/><path fill="currentColor" opacity=".75" d="M16.5 15.1l-3.1-3.1-9.2 9.4c.4.4 1 .4 1.7.1z"/><path fill="currentColor" opacity=".55" d="M16.5 8.9L5.9 2.5c-.7-.3-1.3-.3-1.7.1l9.2 9.4z"/><path fill="currentColor" opacity=".9" d="M20.2 11l-3.7-2.1-3.1 3.1 3.1 3.1 3.7-2.1c.9-.5.9-1.5 0-2z"/></svg>' +
            '<span><small>Get it on</small>Google Play</span></a>') +
          '<div class="v3f-social">' + V3_SOCIAL.map(function (x) {
            return '<a href="' + x[0] + '" target="_blank" rel="noopener noreferrer" aria-label="MedLadder on ' + x[1] + '" title="' + x[1] + '"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' + x[2] + '</svg></a>';
          }).join('') + '</div></div></div>' +
          directoryHtml +
          '<p class="v3f-copy">© ' + year + ' MedLadder · <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a> · <a href="/terms#cancellation-refund">Refunds</a></p>' +
          '</div></footer>';
      }

      function modeNoteHtml() {
        if (currentUser) {
          var isPro = isUserPro(currentUser);
          var proBadge = isPro ? ' <span class="pro-lock-pill" style="margin-left:4px;vertical-align:baseline;">⭐ PRO</span>' : '';
          return '<div class="mode-note" id="homeModeNote">' +
            '<span>Signed in as <strong>' + esc(getUserDisplayName(currentUser)) + '</strong>' + proBadge + '</span>' +
            '<span class="mode-note-sep" aria-hidden="true">·</span>' +
            '<span>Progress is saved to your account.</span>' +
            '<span class="mode-note-sep" aria-hidden="true">·</span>' +
            '<button class="reset-link" id="resetAll">Reset all progress</button>' +
            '</div>';
        }
        return '<div class="mode-note" id="homeModeNote">' +
          '<span>Progress is kept for this session only.</span>' +
          '<button class="auth-link" id="noteSignInBtn" style="font-weight:600;">Sign in to save progress</button>' +
          '<span class="mode-note-sep" aria-hidden="true">·</span>' +
          '<button class="reset-link" id="resetAll">Reset all progress</button>' +
          '</div>';
      }

      function updateModeNote() {
        var noteEls = document.querySelectorAll('.mode-note');
        noteEls.forEach(function (el) {
          if (el.id === 'setupExclusiveNote' || el.id === 'setupAuthNote') return;
          if (el.closest && el.closest('.screen-setup')) return;
          if (currentUser) {
            var isPro = isUserPro(currentUser);
            var proBadge = isPro ? ' <span class="pro-lock-pill" style="margin-left:4px;vertical-align:baseline;">⭐ PRO</span>' : '';
            el.innerHTML =
              '<span>Signed in as <strong>' + esc(getUserDisplayName(currentUser)) + '</strong>' + proBadge + '</span>' +
              '<span class="mode-note-sep" aria-hidden="true">·</span>' +
              '<span>Progress is saved to your account.</span>' +
              '<span class="mode-note-sep" aria-hidden="true">·</span>' +
              '<button class="reset-link" id="resetAll">Reset all progress</button>';
          } else {
            el.innerHTML =
              '<span>Progress is kept for this session only.</span>' +
              '<button class="auth-link" id="noteSignInBtn" style="font-weight:600;">Sign in to save progress</button>' +
              '<span class="mode-note-sep" aria-hidden="true">·</span>' +
              '<button class="reset-link" id="resetAll">Reset all progress</button>';
          }
        });
      }

      function updatePyqSectionLocks() {
        var isPro = isUserPro(currentUser);
        // 1. Update section header badge
        var headerBadge = document.querySelector('.pyq-section-header .pyq-pro-badge');
        if (headerBadge) {
          if (isPro) {
            headerBadge.className = 'pyq-pro-badge unlocked';
            headerBadge.style.cssText = 'font-size:9.5px;font-weight:800;padding:3px 9px;border-radius:999px;background:linear-gradient(135deg,#10b981,#059669);color:#fff;box-shadow:0 2px 8px rgba(16,185,129,.3);';
            headerBadge.innerHTML = '✓ UNLOCKED';
          } else {
            headerBadge.className = 'pyq-pro-badge';
            headerBadge.style.cssText = '';
            headerBadge.innerHTML = '⭐ PRO';
          }
        }

        // 2. Update all PYQ exam cards
        document.querySelectorAll('.pyq-exam-card').forEach(function (card) {
          var lockEl = card.querySelector('.pyq-exam-lock');
          if (isPro) {
            if (lockEl) {
              lockEl.className = 'pyq-exam-lock unlocked';
              lockEl.style.cssText = 'margin-left:auto;flex-shrink:0;font-size:10px;font-weight:800;padding:3px 8px;border-radius:999px;background:rgba(34,197,94,.12);color:#16a34a;border:1px solid rgba(34,197,94,.3);';
              lockEl.innerHTML = '✓ UNLOCKED';
            }
          } else {
            if (lockEl) {
              lockEl.className = 'pyq-exam-lock';
              lockEl.style.cssText = '';
              lockEl.innerHTML = '🔒 PRO';
            }
          }
        });
      }

      // PYQ paper pages: the static preview notice says "Sign in to access the
      // complete paper" for everyone. Re-label it once auth/Pro state is known
      // so a signed-in user never sees a sign-in CTA, and a Pro user is told
      // the button opens the complete paper. Runs from updateMastheadAuth, which
      // fires on paper pages after sign-in and again after the Pro check resolves.
      // Gated on a Pro check having run, so a Pro user is never briefly
      // mislabelled "Upgrade" while the check is still in flight.
      function updatePyqPreviewNotice() {
        try {
          var notice = document.querySelector('.pyq-preview-notice');
          if (!notice || !currentUser || !_proStatusPromise) return;
          var btn = notice.querySelector('a.btn');
          var para = notice.querySelector('p');
          if (!btn) return;
          if (isUserPro(currentUser)) {
            btn.textContent = 'Practise the complete paper';
            if (para) para.textContent = 'This page shows a 50-question preview of the complete paper. Download the full paper as a PDF above, or practise the complete paper in the MedLadder app.';
          } else {
            btn.textContent = 'Upgrade to access the complete paper';
            if (para) para.textContent = 'This page shows a 50-question preview of the complete paper. Download the full paper as a PDF above, or upgrade to Pro to practise the complete paper in the MedLadder app.';
          }
        } catch (e) { console.warn('updatePyqPreviewNotice:', e); }
      }

      function updateMastheadAuth() {
        // Profile was drawn before sign-in settled: draw it again for the right person.
        if (state && state.screen === 'profile' && v3ProfileUid !== undefined && v3ProfileUid !== (currentUser ? currentUser.id : null)) {
          setTimeout(renderProfileV2, 0);
        }
        var rightEls = document.querySelectorAll('.masthead .right');
        rightEls.forEach(function (rc) {
          var existingPro = rc.querySelector('#headerGoProBtn, .pro-badge-header, #headerAdminBtn');
          if (existingPro) existingPro.remove();
          var existingAuth = rc.querySelector('#authTriggerBtn, #mastheadAuthBtn, #userMenuWrap');
          var temp = document.createElement('div');
          temp.innerHTML = proHeaderBtnHtml() + authBtnHtml();
          var proEl = temp.querySelector('#headerGoProBtn, .pro-badge-header, #headerAdminBtn');
          var authEl = temp.querySelector('#authTriggerBtn, #userMenuWrap');
          if (existingAuth) {
            rc.replaceChild(authEl, existingAuth);
          } else {
            var themeBtn = rc.querySelector('#themeToggle');
            if (themeBtn) {
              rc.insertBefore(authEl, themeBtn);
            } else {
              rc.appendChild(authEl);
            }
          }
          if (proEl) {
            rc.insertBefore(proEl, authEl);
          }
        });
        updateModeNote();
        updatePyqSectionLocks();
        wireAuthControls();
        updatePyqPreviewNotice();
      }

      function wireAuthControls() {
        var triggerBtns = document.querySelectorAll('#authTriggerBtn, #mastheadAuthBtn');
        triggerBtns.forEach(function (btn) {
          btn.onclick = function (e) {
            e.preventDefault();
            e.stopPropagation();
            openAuthModal('signin');
          };
        });
        var noteBtn = document.getElementById('noteSignInBtn');
        if (noteBtn) {
          noteBtn.onclick = function (e) {
            e.preventDefault();
            e.stopPropagation();
            openAuthModal('signin');
          };
        }
        var userBtn = document.getElementById('authUserBtn');
        var dropdown = document.getElementById('authDropdown');
        var headerAdminBtn = document.getElementById('headerAdminBtn');
        if (headerAdminBtn) {
          headerAdminBtn.onclick = function (e) {
            e.stopPropagation();
            window.location.href = '/admin-mock';
          };
        }
        var headerProBadge = document.getElementById('headerProBadge');
        if (headerProBadge) { headerProBadge.onclick = function (e) { e.stopPropagation(); openProModal('active_pro'); }; }
        var headerGoPro = document.getElementById('headerGoProBtn');
        if (headerGoPro) {
          headerGoPro.onclick = function (e) {
            e.stopPropagation();
            openProModal('header');
          };
        }
        var dropdownDashboardBtn = document.getElementById('dropdownDashboardBtn');
        if (dropdownDashboardBtn) {
          dropdownDashboardBtn.onclick = function (e) {
            e.stopPropagation();
            renderDashboard();
          };
        }
        var dropdownUpgradeBtn = document.getElementById('dropdownUpgradeBtn');
        if (dropdownUpgradeBtn) {
          dropdownUpgradeBtn.onclick = function (e) {
            e.stopPropagation();
            openProModal('dropdown');
          };
        }
        if (userBtn && dropdown) {
          userBtn.onclick = function (e) {
            e.stopPropagation();
            var isHidden = dropdown.classList.contains('hidden');
            dropdown.classList.toggle('hidden', !isHidden);
            userBtn.classList.toggle('open', isHidden);
            userBtn.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
          };
        }
        var uiModeBtn = document.getElementById('dropdownUiModeBtn');
        if (uiModeBtn) {
          uiModeBtn.onclick = function (e) {
            e.stopPropagation();
            var dd = document.getElementById('authDropdown');
            if (dd) dd.classList.add('hidden');
            setUiMode(v2On() ? 'old' : 'new');
          };
        }
        var signOutBtn = document.getElementById('authSignOutBtn');
        if (signOutBtn) {
          signOutBtn.onclick = function (e) {
            e.stopPropagation();
            handleSignOut();
          };
        }
      }

      function ensureAuthModalDOMElements() {
        if (document.getElementById('authModalOverlay')) return;
        var wrap = document.createElement('div');
        wrap.innerHTML =
          '<div class="auth-modal-overlay hidden" id="authModalOverlay" role="dialog" aria-modal="true" aria-labelledby="authModalTitle">' +
          '<div class="auth-modal-card glass">' +
          '<button class="auth-modal-close" id="authModalClose" aria-label="Close modal">✕</button>' +
          '<div class="auth-modal-badge">MedLadder Account</div>' +
          '<h2 class="auth-modal-title" id="authModalTitle">Sign In</h2>' +
          '<p class="auth-modal-sub" id="authModalSub">Fastest way in — one tap with Google, no password to remember.</p>' +
          '<div class="auth-tabs" id="authTabs">' +
          '<button class="auth-tab active" id="tabSignIn" type="button">Sign In</button>' +
          '<button class="auth-tab" id="tabSignUp" type="button">Sign Up</button>' +
          '<button class="auth-tab" id="tabForgot" type="button">Forgot Password</button>' +
          '</div>' +
          '<div class="auth-alert error" id="authAlertError"></div>' +
          '<div class="auth-alert success" id="authAlertSuccess"></div>' +

          // Sign In Form
          '<form id="authSignInForm" autocomplete="on">' +
          '<button type="button" class="auth-google-btn" id="googleAuthBtn">' +
          '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"/><path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"/><path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/></svg><span>Continue with Google</span><span class="auth-google-badge">Fastest</span>' +
          '</button>' +
          '<div class="auth-divider"><span>or continue with email</span></div>' +
          '<div class="auth-field">' +
          '<label for="authSignInEmail">Email Address</label>' +
          '<div class="auth-input-wrap">' +
          '<input type="email" id="authSignInEmail" class="auth-input" placeholder="doctor@example.com" required autocomplete="email">' +
          '</div>' +
          '</div>' +
          '<div class="auth-field">' +
          '<label for="authSignInPassword">Password</label>' +
          '<div class="auth-input-wrap">' +
          '<input type="password" id="authSignInPassword" class="auth-input" placeholder="••••••••" required autocomplete="current-password">' +
          '<button type="button" class="auth-pw-toggle" data-target="authSignInPassword" aria-label="Toggle password visibility">👁</button>' +
          '</div>' +
          '</div>' +
          '<button type="submit" class="auth-submit-btn" id="authSignInSubmit">Sign In</button>' +
          '<div class="auth-footer-links">' +
          '<button type="button" class="auth-link" id="authLinkToForgot">Forgot password?</button>' +
          '<span>No account? <button type="button" class="auth-link" id="authLinkToSignUp">Sign up</button></span>' +
          '</div>' +
          '</form>' +

          // Sign Up Form
          '<form id="authSignUpForm" class="hidden" autocomplete="on">' +
          '<button type="button" class="auth-google-btn" id="googleAuthBtnSignUp">' +
          '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"/><path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"/><path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/></svg><span>Sign up with Google</span><span class="auth-google-badge">Fastest</span>' +
          '</button>' +
          '<div class="auth-divider"><span>or register with email</span></div>' +
          '<div class="auth-field">' +
          '<label for="authSignUpName">Full Name / Dr. Name</label>' +
          '<div class="auth-input-wrap">' +
          '<input type="text" id="authSignUpName" class="auth-input" placeholder="Dr. Jane Doe" required autocomplete="name">' +
          '</div>' +
          '</div>' +
          '<div class="auth-field">' +
          '<label for="authSignUpEmail">Email Address</label>' +
          '<div class="auth-input-wrap">' +
          '<input type="email" id="authSignUpEmail" class="auth-input" placeholder="doctor@example.com" required autocomplete="email">' +
          '</div>' +
          '</div>' +
          '<div class="auth-field">' +
          '<label for="authSignUpPassword">Password (minimum 6 characters)</label>' +
          '<div class="auth-input-wrap">' +
          '<input type="password" id="authSignUpPassword" class="auth-input" placeholder="••••••••" minlength="6" required autocomplete="new-password">' +
          '<button type="button" class="auth-pw-toggle" data-target="authSignUpPassword" aria-label="Toggle password visibility">👁</button>' +
          '</div>' +
          '</div>' +
          '<div class="auth-legal-note" style="font-size:11.5px;color:var(--ink-soft);text-align:center;margin:8px 0 12px;line-height:1.45;">' +
          'By creating an account, you agree to our <a href="/terms" target="_blank" style="color:var(--accent);text-decoration:underline;">Terms</a> &amp; <a href="/privacy" target="_blank" style="color:var(--accent);text-decoration:underline;">Privacy Policy</a>.' +
          '</div>' +
          '<button type="submit" class="auth-submit-btn" id="authSignUpSubmit">Create Account</button>' +
          '<div class="auth-footer-links">' +
          '<span>Already registered? <button type="button" class="auth-link" id="authLinkToSignIn">Sign In</button></span>' +
          '</div>' +
          '</form>' +

          // Forgot Password Form
          '<form id="authForgotForm" class="hidden" autocomplete="on">' +
          '<div class="auth-field">' +
          '<label for="authForgotEmail">Registered Email Address</label>' +
          '<div class="auth-input-wrap">' +
          '<input type="email" id="authForgotEmail" class="auth-input" placeholder="doctor@example.com" required autocomplete="email">' +
          '</div>' +
          '</div>' +
          '<button type="submit" class="auth-submit-btn" id="authForgotSubmit">Send Recovery Email</button>' +
          '<div class="auth-footer-links">' +
          '<button type="button" class="auth-link" id="authForgotLinkToSignIn">‹ Back to Sign In</button>' +
          '</div>' +
          '</form>' +

          // Create New Password Form (opened from the password-reset email link)
          '<form id="authResetForm" class="hidden" autocomplete="on">' +
          '<div class="auth-field">' +
          '<label for="authResetPassword">New password (minimum 6 characters)</label>' +
          '<div class="auth-input-wrap">' +
          '<input type="password" id="authResetPassword" class="auth-input" placeholder="••••••••" minlength="6" required autocomplete="new-password">' +
          '<button type="button" class="auth-pw-toggle" data-target="authResetPassword" aria-label="Toggle password visibility">👁</button>' +
          '</div>' +
          '</div>' +
          '<div class="auth-field">' +
          '<label for="authResetConfirm">Confirm new password</label>' +
          '<div class="auth-input-wrap">' +
          '<input type="password" id="authResetConfirm" class="auth-input" placeholder="••••••••" minlength="6" required autocomplete="new-password">' +
          '<button type="button" class="auth-pw-toggle" data-target="authResetConfirm" aria-label="Toggle password visibility">👁</button>' +
          '</div>' +
          '</div>' +
          '<button type="submit" class="auth-submit-btn" id="authResetSubmit">Update Password</button>' +
          '</form>' +

          '</div>' +
          '</div>' +
          '<div class="toast-container" id="toastContainer"></div>';

        while (wrap.firstChild) {
          document.body.appendChild(wrap.firstChild);
        }

        // Wire modal close button
        document.getElementById('authModalClose').addEventListener('click', closeAuthModal);
        document.getElementById('authModalOverlay').addEventListener('click', function (e) {
          if (e.target === this) closeAuthModal();
        });

        // Wire Tab Buttons
        document.getElementById('tabSignIn').addEventListener('click', function () { switchAuthTab('signin'); });
        document.getElementById('tabSignUp').addEventListener('click', function () { switchAuthTab('signup'); });
        document.getElementById('tabForgot').addEventListener('click', function () { switchAuthTab('forgot'); });

        // Wire Link Switches
        document.getElementById('authLinkToForgot').addEventListener('click', function () { switchAuthTab('forgot'); });
        document.getElementById('authLinkToSignUp').addEventListener('click', function () { switchAuthTab('signup'); });
        document.getElementById('authLinkToSignIn').addEventListener('click', function () { switchAuthTab('signin'); });
        document.getElementById('authForgotLinkToSignIn').addEventListener('click', function () { switchAuthTab('signin'); });

        // Wire Password Visibility Toggles
        wrap.querySelectorAll('.auth-pw-toggle').forEach(function (toggleBtn) {
          toggleBtn.addEventListener('click', function (e) {
            e.preventDefault();
            var targetId = this.getAttribute('data-target');
            var input = document.getElementById(targetId);
            if (input) {
              if (input.type === 'password') {
                input.type = 'text';
                this.textContent = '🙈';
              } else {
                input.type = 'password';
                this.textContent = '👁';
              }
            }
          });
        });

        // Wire Form Submits
        var gBtn1 = document.getElementById('googleAuthBtn');
        if (gBtn1) gBtn1.addEventListener('click', handleGoogleSignIn);
        var gBtn2 = document.getElementById('googleAuthBtnSignUp');
        if (gBtn2) gBtn2.addEventListener('click', handleGoogleSignIn);
        document.getElementById('authSignInForm').addEventListener('submit', handleSignInSubmit);
        document.getElementById('authSignUpForm').addEventListener('submit', handleSignUpSubmit);
        document.getElementById('authForgotForm').addEventListener('submit', handleForgotSubmit);
        document.getElementById('authResetForm').addEventListener('submit', handleResetSubmit);

        // Wire global escape key
        document.addEventListener('keydown', function (e) {
          if (e.key === 'Escape') {
            var authOverlay = document.getElementById('authModalOverlay');
            if (authOverlay && authOverlay.classList.contains('open')) {
              closeAuthModal();
            }
            var proOverlay = document.getElementById('proModalOverlay');
            if (proOverlay && proOverlay.classList.contains('open')) {
              closeProModal();
            }
            var adminOverlay = document.getElementById('adminModalOverlay');
            if (adminOverlay && adminOverlay.classList.contains('open')) {
              closeAdminModal();
            }
          }
        });

        // Wire document click outside for user dropdown
        document.addEventListener('click', function (e) {
          var menuWrap = document.getElementById('userMenuWrap');
          var dropdown = document.getElementById('authDropdown');
          var userBtn = document.getElementById('authUserBtn');
          if (dropdown && !dropdown.classList.contains('hidden')) {
            if (!menuWrap || !menuWrap.contains(e.target)) {
              dropdown.classList.add('hidden');
              if (userBtn) {
                userBtn.classList.remove('open');
                userBtn.setAttribute('aria-expanded', 'false');
              }
            }
          }
        });
      }

      function switchAuthTab(tab) {
        clearAuthAlerts();
        resetAuthModalButtons();
        var titleEl = document.getElementById('authModalTitle');
        var subEl = document.getElementById('authModalSub');
        var tabIn = document.getElementById('tabSignIn');
        var tabUp = document.getElementById('tabSignUp');
        var tabFg = document.getElementById('tabForgot');
        var formIn = document.getElementById('authSignInForm');
        var formUp = document.getElementById('authSignUpForm');
        var formFg = document.getElementById('authForgotForm');
        var formRs = document.getElementById('authResetForm');
        var tabsBar = document.getElementById('authTabs');

        if (tabsBar) tabsBar.classList.toggle('hidden', tab === 'reset');
        if (formRs) formRs.classList.toggle('hidden', tab !== 'reset');

        tabIn.classList.toggle('active', tab === 'signin');
        tabUp.classList.toggle('active', tab === 'signup');
        tabFg.classList.toggle('active', tab === 'forgot');

        formIn.classList.toggle('hidden', tab !== 'signin');
        formUp.classList.toggle('hidden', tab !== 'signup');
        formFg.classList.toggle('hidden', tab !== 'forgot');

        if (tab === 'signin') {
          titleEl.textContent = 'Sign In';
          subEl.textContent = 'Fastest way in — one tap with Google, no password to remember.';
          var emailIn = document.getElementById('authSignInEmail');
          if (emailIn) setTimeout(function () { emailIn.focus(); }, 80);
        } else if (tab === 'signup') {
          titleEl.textContent = 'Create Account';
          subEl.textContent = 'One tap with Google creates your account — no password to remember.';
          var nameIn = document.getElementById('authSignUpName');
          if (nameIn) setTimeout(function () { nameIn.focus(); }, 80);
        } else if (tab === 'reset') {
          titleEl.textContent = 'Create New Password';
          subEl.textContent = 'Choose a new password for your MedLadder account.';
          var rsPw = document.getElementById('authResetPassword');
          if (rsPw) setTimeout(function () { rsPw.focus(); }, 80);
        } else if (tab === 'forgot') {
          titleEl.textContent = 'Reset Password';
          subEl.textContent = 'Enter your registered email to receive a password recovery link.';
          var fgEmail = document.getElementById('authForgotEmail');
          if (fgEmail) setTimeout(function () { fgEmail.focus(); }, 80);
        }
      }

      function openAuthModal(tab, options) {
        ensureAuthModalDOMElements();
        clearAuthAlerts();
        resetAuthModalButtons();
        switchAuthTab(tab || 'signin');
        if (options && options.onSuccess) {
          pendingAuthAction = options.onSuccess;
        } else {
          pendingAuthAction = null;
        }
        if (options && options.reason) {
          var subEl = document.getElementById('authModalSub');
          if (subEl) subEl.textContent = options.reason;
        }
        var overlay = document.getElementById('authModalOverlay');
        if (overlay) {
          overlay.classList.remove('hidden');
          overlay.classList.add('open');
        }
      }

      function closeAuthModal() {
        var overlay = document.getElementById('authModalOverlay');
        if (overlay) {
          overlay.classList.remove('open');
          overlay.classList.add('hidden');
        }
        clearAuthAlerts();
        resetAuthModalButtons();
        pendingAuthAction = null;
        recoveryMode = false;
      }

      function setAuthAlert(type, msg) {
        var errEl = document.getElementById('authAlertError');
        var succEl = document.getElementById('authAlertSuccess');
        if (type === 'error') {
          if (errEl) {
            errEl.innerHTML = '<span>⚠️</span><span>' + esc(msg) + '</span>';
            errEl.style.display = 'flex';
          }
          if (succEl) succEl.style.display = 'none';
        } else if (type === 'success') {
          if (succEl) {
            succEl.innerHTML = '<span>✓</span><span>' + esc(msg) + '</span>';
            succEl.style.display = 'flex';
          }
          if (errEl) errEl.style.display = 'none';
        }
      }

      function clearAuthAlerts() {
        var errEl = document.getElementById('authAlertError');
        var succEl = document.getElementById('authAlertSuccess');
        if (errEl) { errEl.innerHTML = ''; errEl.style.display = 'none'; }
        if (succEl) { succEl.innerHTML = ''; succEl.style.display = 'none'; }
      }


      function handleGoogleSignIn() {
        if (!supabaseClient) {
          setAuthAlert('error', 'Authentication service is currently unavailable.');
          return;
        }
        clearAuthAlerts();
        var btns = document.querySelectorAll('.auth-google-btn');
        btns.forEach(function (b) {
          b.disabled = true;
          b.innerHTML = '<span class="auth-spinner" style="border-top-color:var(--accent);"></span> Connecting to Google...';
        });

        // Fail-safe auto-reset timer in case browser does not launch or user cancels
        var resetTimer = setTimeout(function () {
          resetAuthModalButtons();
        }, 10000);

        var nativeBridge = window.MedLadderNative;
        var isNativeApp = !!(nativeBridge && nativeBridge.isNative);
        supabaseClient.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: isNativeApp ? 'com.medladder.app://auth/callback' : window.location.origin + window.location.pathname,
            skipBrowserRedirect: isNativeApp
          }
        }).then(function (res) {
          if (res && res.error) {
            clearTimeout(resetTimer);
            resetAuthModalButtons();
            if (res.error.message && res.error.message.toLowerCase().includes('provider is not enabled')) {
              setAuthAlert('error', 'Google Sign-In is not enabled yet in your Supabase project. Enable it in Supabase Dashboard → Authentication → Providers → Google.');
            } else {
              setAuthAlert('error', res.error.message || 'Google Sign-In failed.');
            }
          } else if (isNativeApp && res && res.data && res.data.url) {
            nativeBridge.Browser.open({ url: res.data.url }).then(function () {
              // Browser has opened; reset button so returning to the app never shows a stuck spinner
              setTimeout(function () {
                clearTimeout(resetTimer);
                resetAuthModalButtons();
              }, 1500);
            }).catch(function (err) {
              clearTimeout(resetTimer);
              resetAuthModalButtons();
              setAuthAlert('error', err && err.message ? err.message : 'Could not open Google Sign-In.');
            });
          }
        }).catch(function (err) {
          clearTimeout(resetTimer);
          resetAuthModalButtons();
          setAuthAlert('error', err && err.message ? err.message : 'Google Sign-In failed.');
        });
      }

      function handleSignInSubmit(e) {
        e.preventDefault();
        if (!supabaseClient) {
          setAuthAlert('error', 'Authentication service is currently unavailable.');
          return;
        }
        var email = document.getElementById('authSignInEmail').value.trim();
        var password = document.getElementById('authSignInPassword').value;
        var btn = document.getElementById('authSignInSubmit');

        if (!email || !password) {
          setAuthAlert('error', 'Please provide both email and password.');
          return;
        }

        clearAuthAlerts();
        btn.disabled = true;
        var origText = btn.innerHTML;
        btn.innerHTML = '<span class="auth-spinner"></span> Signing in...';

        supabaseClient.auth.signInWithPassword({
          email: email,
          password: password
        }).then(function (res) {
          btn.disabled = false;
          btn.innerHTML = origText;
          if (res.error) {
            setAuthAlert('error', res.error.message || 'Failed to sign in.');
          } else {
            currentUser = res.data.user;
            trackEvent('login', { method: 'email' });
            resetProState(); setTimeout(refreshProStatus, 0);
            loadUserProgress(currentUser.id);
            var act = pendingAuthAction;
            closeAuthModal();
            showToast('Welcome back, ' + getUserDisplayName(currentUser) + '!');
            if (typeof act === 'function') {
              act();
            } else {
              if (state.screen === 'home') renderHome();
              else if (state.screen === 'setup') renderSetup(state.subjectId, state.moduleId || 'all');
              else updateMastheadAuth();
            }
          }
        }).catch(function (err) {
          btn.disabled = false;
          btn.innerHTML = origText;
          setAuthAlert('error', err && err.message ? err.message : 'An unexpected error occurred.');
        });
      }

      function handleSignUpSubmit(e) {
        e.preventDefault();
        if (!supabaseClient) {
          setAuthAlert('error', 'Authentication service is currently unavailable.');
          return;
        }
        var fullName = document.getElementById('authSignUpName').value.trim();
        var email = document.getElementById('authSignUpEmail').value.trim();
        var password = document.getElementById('authSignUpPassword').value;
        var btn = document.getElementById('authSignUpSubmit');

        if (!email || !password) {
          setAuthAlert('error', 'Please fill in all required fields.');
          return;
        }
        if (password.length < 6) {
          setAuthAlert('error', 'Password must be at least 6 characters.');
          return;
        }

        clearAuthAlerts();
        btn.disabled = true;
        var origText = btn.innerHTML;
        btn.innerHTML = '<span class="auth-spinner"></span> Creating account...';

        // Preserve a ?openPyq= deep link when email confirmation opens in a new tab.
        var redirectUrl = window.location.origin + window.location.pathname + (window.location.search || '');
        supabaseClient.auth.signUp({
          email: email,
          password: password,
          options: {
            emailRedirectTo: redirectUrl,
            data: {
              full_name: fullName || email.split('@')[0]
            }
          }
        }).then(function (res) {
          btn.disabled = false;
          btn.innerHTML = origText;
          if (res.error) {
            setAuthAlert('error', res.error.message || 'Failed to create account.');
          } else if (res.data && res.data.user && Array.isArray(res.data.user.identities) && res.data.user.identities.length === 0) {
            setAuthAlert('error', 'An account with this email already exists. Please sign in or use Forgot Password.');
          } else {
            var pwInput = document.getElementById('authSignUpPassword');
            if (pwInput) pwInput.value = '';
            if (res.data && res.data.session) {
              currentUser = res.data.user;
              trackEvent('sign_up', { method: 'email' });
              resetProState(); setTimeout(refreshProStatus, 0);
              loadUserProgress(currentUser.id);
              persistProgress();
              var act = pendingAuthAction;
              closeAuthModal();
              showToast('Welcome to MedLadder, ' + getUserDisplayName(currentUser) + '!');
              if (typeof act === 'function') {
                act();
              } else {
                if (state.screen === 'home') renderHome();
                else if (state.screen === 'setup') renderSetup(state.subjectId, state.moduleId || 'all');
                else updateMastheadAuth();
              }
            } else {
              trackEvent('sign_up', { method: 'email', status: 'pending_verification' });
              setAuthAlert('success', 'Registration successful! A confirmation email has been sent to ' + esc(email) + '. Please check your inbox and verify your email before signing in.');
            }
          }
        }).catch(function (err) {
          btn.disabled = false;
          btn.innerHTML = origText;
          setAuthAlert('error', err && err.message ? err.message : 'An unexpected error occurred.');
        });
      }

      function handleForgotSubmit(e) {
        e.preventDefault();
        if (!supabaseClient) {
          setAuthAlert('error', 'Authentication service is currently unavailable.');
          return;
        }
        var email = document.getElementById('authForgotEmail').value.trim();
        var btn = document.getElementById('authForgotSubmit');

        if (!email) {
          setAuthAlert('error', 'Please enter your email address.');
          return;
        }

        clearAuthAlerts();
        btn.disabled = true;
        var origText = btn.innerHTML;
        btn.innerHTML = '<span class="auth-spinner"></span> Sending link...';

        var redirectUrl = window.location.origin + window.location.pathname;
        supabaseClient.auth.resetPasswordForEmail(email, {
          redirectTo: redirectUrl
        }).then(function (res) {
          btn.disabled = false;
          btn.innerHTML = origText;
          if (res.error) {
            setAuthAlert('error', res.error.message || 'Failed to send recovery email.');
          } else {
            setAuthAlert('success', 'Password reset instructions have been sent to ' + esc(email) + '.');
          }
        }).catch(function (err) {
          btn.disabled = false;
          btn.innerHTML = origText;
          setAuthAlert('error', err && err.message ? err.message : 'An unexpected error occurred.');
        });
      }

      function handleResetSubmit(e) {
        e.preventDefault();
        if (!supabaseClient) {
          setAuthAlert('error', 'Authentication service is currently unavailable.');
          return;
        }
        var pw = document.getElementById('authResetPassword').value;
        var pw2 = document.getElementById('authResetConfirm').value;
        var btn = document.getElementById('authResetSubmit');

        if (pw.length < 6) {
          setAuthAlert('error', 'Password must be at least 6 characters.');
          return;
        }
        if (pw !== pw2) {
          setAuthAlert('error', 'Passwords do not match.');
          return;
        }

        clearAuthAlerts();
        btn.disabled = true;
        btn.innerHTML = '<span class="auth-spinner"></span> Updating...';

        var finishUpdate = function () { return supabaseClient.auth.updateUser({ password: pw }); };
        var updateChain;
        if (recoveryTokenHash) {
          recoveryMode = true; // keep the "Signed in" toast / modal close out of the way
          updateChain = supabaseClient.auth.verifyOtp({ token_hash: recoveryTokenHash, type: 'recovery' }).then(function (vr) {
            if (vr && vr.error) { recoveryMode = false; return { error: vr.error, verifyFailed: true }; }
            recoveryTokenHash = null;
            return finishUpdate();
          });
        } else {
          updateChain = finishUpdate();
        }
        updateChain.then(function (res) {
          btn.disabled = false;
          btn.innerHTML = 'Update Password';
          if (res && res.verifyFailed) {
            switchAuthTab('forgot');
            setAuthAlert('error', 'This reset link is invalid or has expired. Request a new one below.');
            return;
          }
          if (res && res.error) {
            var msg = res.error.message || 'Could not update password.';
            if (/session missing/i.test(msg)) {
              switchAuthTab('forgot');
              setAuthAlert('error', 'This reset link has expired. Request a new one below.');
            } else {
              setAuthAlert('error', msg);
            }
            return;
          }
          setAuthAlert('success', 'Password updated. You are signed in.');
          showToast('Password updated successfully.');
          setTimeout(closeAuthModal, 1400);
        }).catch(function (err) {
          btn.disabled = false;
          btn.innerHTML = 'Update Password';
          setAuthAlert('error', err && err.message ? err.message : 'An unexpected error occurred.');
        });
      }

      function handleSignOut() {
        resetAuthModalButtons();
        var doSignOut = function () {
          currentUser = null;
          resetProState();
          resetAuthModalButtons();
          showToast('Signed out successfully.');
          updateProModalUI();
          if (state.screen === 'quiz' || state.screen === 'results') {
            renderHome();
          } else if (state.screen === 'home') {
            renderHome();
          } else if (state.screen === 'setup') {
            renderSetup(state.subjectId, state.moduleId || 'all');
          } else {
            updateMastheadAuth();
          }
        };
        if (!supabaseClient) {
          doSignOut();
          return;
        }
        supabaseClient.auth.signOut().then(function () {
          doSignOut();
        }).catch(function (err) {
          console.warn('Sign out error:', err);
          doSignOut();
        });
      }

      function launchPendingPyqDeepLink() {
        if (!pendingPyqDeepLink || pendingPyqDeepLinkStarted) return;
        pendingPyqDeepLinkStarted = true;
        var target = pendingPyqDeepLink;
        pendingPyqDeepLink = null;
        setupChoice.pyqYear = target.year;
        renderPYQSetup(target.examId);
      }

      // Parse a ?openPyq=<exam>&year=<year> deep link (if present) into the
      // pending link that launchPendingPyqDeepLink() fires after sign-in.
      // Called both from the /pyqs/ early-return guard and the home fall-through,
      // so a deep link is captured whichever page it lands on.
      function captureOpenPyqDeepLink() {
        if (!window.location.search || typeof URLSearchParams === 'undefined') return;
        var sp = new URLSearchParams(window.location.search);
        var deepExam = sp.get('openPyq');
        var deepYear = sp.get('year');
        if (!deepExam) return;
        var examAliases = {
          'neet-pg': 'NEET PG', 'neet pg': 'NEET PG',
          'inicet': 'INICET', 'ini-cet': 'INICET',
          'fmge': 'FMGE', 'aiims': 'AIIMS', 'neet-ss': 'NEET SS', 'neet ss': 'NEET SS'
        };
        var examId = examAliases[String(deepExam).toLowerCase()] || deepExam;
        var examMeta = PYQ_EXAMS.find(function (exam) { return exam.id.toLowerCase() === String(examId).toLowerCase(); });
        if (!examMeta) return;
        var requestedYear = deepYear || (examMeta.years && examMeta.years[0]);
        if (examMeta.years && examMeta.years.indexOf(requestedYear) !== -1) {
          pendingPyqDeepLink = { examId: examMeta.id, year: requestedYear };
        }
      }

      function initAuth() {
        // One-time cleanup of things older versions wrote to the browser. None of it
        // is trusted any more (admin/pro flags, cached user object, whitelist, passkey).
        try {
          ['medladder_admin_session', 'medladder_admin_email', 'medladder_saved_user',
            'medladder_admin_whitelist', 'medladder_admin_passkey', 'medladder_admin_passkey_hash',
            'medladder_rzp_key'].forEach(function (k) { localStorage.removeItem(k); });
          sessionStorage.removeItem('medladder_admin_otp');
          sessionStorage.removeItem('medladder_admin_otp_email');
        } catch (e) { }

        // currentUser is only ever set from Supabase's real session below, so admin
        // and Pro checks cannot pass until the server has confirmed who is signed in.
        currentUser = null;
        resetProState();
        resetAuthModalButtons();

        if (!supabaseClient) return;

        if (recoveryTokenHash) { cleanAuthReturnUrl(); openAuthModal('reset'); }

        loadSiteCounts();
        supabaseClient.auth.getSession().then(function (res) {
          if (res && res.data && res.data.session && res.data.session.user) {
            currentUser = res.data.session.user;
            loadUserProgress(currentUser.id);
            updateMastheadAuth();
            updateProModalUI();
            refreshProStatus();
            if (recoveryMode) { cleanAuthReturnUrl(); openAuthModal('reset'); }
            launchPendingPyqDeepLink();
          } else {
            // No session: still render the masthead auth controls, so the
            // signed-out Sign In pill also appears on the pre-rendered SEO
            // pages (subject/topic hubs), whose static header markup has no
            // auth element of its own.
            updateMastheadAuth();
            updateProModalUI();
            launchPendingPyqDeepLink();
            if (recoveryMode) {
              // Reset link was invalid, expired, or already used.
              recoveryMode = false;
              cleanAuthReturnUrl();
              openAuthModal('forgot');
              setAuthAlert('error', 'This reset link is invalid or has expired. Request a new one.');
            }
          }
        }).catch(function (err) {
          console.warn('Session check error:', err);
          updateMastheadAuth();
        });

        supabaseClient.auth.onAuthStateChange(function (event, session) {
          var prevUser = currentUser;

          if (event === 'SIGNED_OUT') {
            currentUser = null;
            resetProState();
            resetAuthModalButtons();
            updateMastheadAuth();
            updateProModalUI();
            showToast('You have signed out.');
            if (state.screen === 'home') renderHome();
            return;
          }

          if (event === 'PASSWORD_RECOVERY') {
            recoveryMode = true;
            cleanAuthReturnUrl();
            var rsForm = document.getElementById('authResetForm');
            if (!rsForm || rsForm.classList.contains('hidden')) {
              setTimeout(function () { openAuthModal('reset'); }, 0);
            }
          }

          if (session && session.user) {
            currentUser = session.user;
            var userChanged = !prevUser || prevUser.id !== currentUser.id;
            if (userChanged) {
              resetProState();
              loadUserProgress(currentUser.id);
              // Deferred: supabase-js must not be re-entered from inside this
              // callback. Anything practised signed-out moves into the account.
              setTimeout(function () {
                try { migrateGuestAttempts(); } catch (e) { console.warn('migrateGuestAttempts failed:', e); }
              }, 0);
            }
            updateMastheadAuth();
            updateProModalUI();
            // Deferred: supabase-js must not be re-entered from inside this callback.
            if (pendingPyqDeepLink && userChanged) {
              // Refresh Pro state FIRST (deferred: supabase-js must not be
              // re-entered from inside this callback), then launch. Launching
              // immediately here used to race the refresh: proState had just
              // been reset, so a signed-in Pro user got the paywall and the
              // one-shot link was consumed. renderPYQSetup awaits the refresh
              // promise, so this order is what makes the gate correct.
              setTimeout(function () { refreshProStatus(); launchPendingPyqDeepLink(); }, 0);
            } else {
              if (userChanged) setTimeout(refreshProStatus, 0);
              if (pendingPyqDeepLink) launchPendingPyqDeepLink();
            }
            if (event === 'SIGNED_IN' && !prevUser && !recoveryMode) {
              if ((window.location.hash && window.location.hash.includes('access_token')) ||
                  (window.location.search && window.location.search.includes('code='))) {
                window.history.replaceState({}, document.title, window.location.pathname);
              }
              closeAuthModal();
              // If the admin modal is open, show the console (admins) or close it (everyone else).
              if (isAdmin(currentUser)) renderAdminModalContent();
              else closeAdminModal();
              showToast('Signed in as ' + getUserDisplayName(currentUser));
              if (state.screen === 'home') renderHome();
              else if (state.screen === 'seo') handleSeoRoute();
            }
          } else {
            currentUser = null;
            resetProState();
            updateMastheadAuth();
            updateProModalUI();
          }
        });

        // Web OAuth/email-link returns land back on this page with the
        // result in the URL; make sure a return is never dropped silently.
        captureWebAuthReturn();

        // Periodic Pro status re-check (every 5 minutes).
        // Catches subscriptions that expire while the app is open without a page refresh.
        // The interval only fires an RPC call when a user is actually signed in.
        var PRO_CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
        var _proCheckTimer = null;
        function startProCheckTimer() {
          if (_proCheckTimer) return; // already running
          _proCheckTimer = setInterval(function () {
            if (currentUser) {
              refreshProStatus();
            }
          }, PRO_CHECK_INTERVAL_MS);
        }
        function stopProCheckTimer() {
          if (_proCheckTimer) { clearInterval(_proCheckTimer); _proCheckTimer = null; }
        }
        // Start once we know a session exists; stop on sign-out.
        supabaseClient.auth.getSession().then(function (res) {
          if (res && res.data && res.data.session) startProCheckTimer();
        }).catch(function () {});
        // Piggyback on the existing auth state listener to start/stop the timer.
        supabaseClient.auth.onAuthStateChange(function (event) {
          if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') startProCheckTimer();
          if (event === 'SIGNED_OUT') stopProCheckTimer();
        });
      }

      function applyTheme() {
        document.documentElement.classList.toggle('dark', darkMode);
        var btns = document.querySelectorAll('.theme-toggle, #themeToggle');
        btns.forEach(function (btn) {
          btn.textContent = darkMode ? '🌙' : '☀️';
          btn.title = darkMode ? 'Switch to light mode' : 'Switch to dark mode';
          btn.setAttribute('aria-label', darkMode ? 'Switch to light mode' : 'Switch to dark mode');
        });
      }
      function toggleTheme(e) {
        if (e && e.preventDefault) e.preventDefault();
        if (typeof window.medladderToggleTheme === 'function') {
          darkMode = window.medladderToggleTheme();
        } else {
          document.documentElement.classList.add('theme-switching');
          darkMode = !darkMode;
          applyTheme();
          try {
            localStorage.setItem('medladder_theme', darkMode ? 'dark' : 'light');
          } catch (err) { }
          requestAnimationFrame(function () {
            requestAnimationFrame(function () {
              document.documentElement.classList.remove('theme-switching');
            });
          });
        }
      }
      function shuffle(arr) {
        var a = arr.slice();
        for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
        return a;
      }
      function esc(s) {
        if (s === null || s === undefined || s === '') return '';
        return String(s)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      }
      // Bound Supabase question images to direct CDN object cache (avoiding slow on-the-fly transcoding freezes).
      // Serve question images directly from fast, edge-cached Cloudflare R2 storage.
      function optimizeQuestionImageUrl(src) {
        if (!src) return '';
        try {
          var url = new URL(String(src), window.location.href);
          if (/\.supabase\.co$/i.test(url.hostname)) {
            var prefix = '/storage/v1/object/public/question-images/';
            var renderPrefix = '/storage/v1/render/image/public/question-images/';
            if (url.pathname.startsWith(prefix)) {
              return R2_IMAGES_BASE + '/' + url.pathname.slice(prefix.length);
            } else if (url.pathname.startsWith(renderPrefix)) {
              return R2_IMAGES_BASE + '/' + url.pathname.slice(renderPrefix.length);
            }
          }
          return url.toString();
        } catch (_) {
          return String(src);
        }
      }
      // Local diagnostic switch: append ?debugNoQuestionImages=1 to suppress
      // question and explanation images while isolating mobile quiz freezes.
      var debugNoQuestionImages = new URLSearchParams(window.location.search).get('debugNoQuestionImages') === '1';
      // Render question stems that may contain trusted editorial HTML (e.g. <br> and <img>)
      // without exposing arbitrary markup or event-handler attributes to the page.
      function sanitizeQuestionHtml(input) {
        if (input === null || input === undefined || input === '') return '';
        var tpl = document.createElement('template');
        tpl.innerHTML = String(input);
        var allowed = {
          BR: true,
          B: true, STRONG: true,
          I: true, EM: true,
          U: true, S: true,
          SUB: true, SUP: true,
          SMALL: true,
          SPAN: true,
          P: true, DIV: true
        };
        function clean(parent) {
          Array.from(parent.childNodes).forEach(function (node) {
            if (node.nodeType === Node.COMMENT_NODE) {
              node.remove();
              return;
            }
            if (node.nodeType !== Node.ELEMENT_NODE) return;
            var tag = node.tagName.toUpperCase();
            if (tag === 'IMG') {
              if (debugNoQuestionImages) {
                node.remove();
                return;
              }
              var src = node.getAttribute('src') || '';
              var alt = node.getAttribute('alt') || 'Clinical exhibit';
              if (!/^https?:\/\//i.test(src)) {
                node.remove();
                return;
              }
              Array.from(node.attributes).forEach(function (attr) { node.removeAttribute(attr.name); });
              node.setAttribute('src', optimizeQuestionImageUrl(src));
              node.setAttribute('alt', alt);
              node.className = 'qtext-img';
              node.setAttribute('loading', 'lazy');
              node.setAttribute('decoding', 'async');
              return;
            }
            if (!allowed[tag]) {
              node.remove();
              return;
            }
            // Remove all attributes from formatting elements. This blocks on* handlers,
            // javascript URLs, inline CSS, and other injected markup.
            Array.from(node.attributes).forEach(function (attr) { node.removeAttribute(attr.name); });
            clean(node);
          });
        }
        clean(tpl.content);
        return tpl.innerHTML;
      }

      function storageImageUrl(image) {
        if (!image || !image.storage_path) return '';
        var path = String(image.storage_path).split('/').map(encodeURIComponent).join('/');
        return R2_IMAGES_BASE + '/' + path;
      }

      function renderQuestionContent(text, images) {
        var imageById = {};
        (images || []).forEach(function (image) { imageById[String(image.id)] = image; });
        var expanded = String(text || '').replace(/\[\[mlimg:([0-9a-f-]{36})\]\]/gi, function (marker, id) {
          var image = imageById[id];
          var src = storageImageUrl(image);
          if (!src) return '';
          return '<img src="' + esc(src) + '" alt="' + esc(image.alt_text || 'Clinical exhibit') + '">';
        });
        return sanitizeQuestionHtml(expanded);
      }

      function formatExplanation(text, images) {
        if (!text) return '';
        var cleaned = String(text)
          .replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, '<span class="explain-text-link">$1</span>')
          .replace(/<a\b[^>]*>/gi, '')
          .replace(/<\/a>/gi, '');
        return renderQuestionContent(cleaned, images);
      }

      function loadQuestionImages(questionRows) {
        if (!supabaseClient || !questionRows || !questionRows.length) return Promise.resolve([]);
        var ids = questionRows.map(function (row) { return row.id; }).filter(function (id) { return id !== null && id !== undefined; });
        if (!ids.length) return Promise.resolve([]);
        var batches = [];
        for (var i = 0; i < ids.length; i += 250) batches.push(ids.slice(i, i + 250));
        return Promise.all(batches.map(function (batch) {
          return supabaseClient.from('question_images')
            .select('id,question_id,content_field,ordinal,storage_bucket,storage_path,alt_text')
            .in('question_id', batch)
            .order('ordinal', { ascending: true })
            .then(function (res) { return (res && res.data) ? res.data : []; })
            .catch(function () { return []; });
        })).then(function (responses) {
          var images = [];
          responses.forEach(function (list) {
            if (Array.isArray(list)) images.push.apply(images, list);
          });
          return images;
        }).catch(function () {
          return [];
        });
      }
      function themeBtnHtml() {
        var isDark = document.documentElement.classList.contains('dark');
        return '<button class="theme-toggle" id="themeToggle" title="' + (isDark ? 'Switch to light mode' : 'Switch to dark mode') + '" aria-label="Toggle theme">' + (isDark ? '🌙' : '☀️') + '</button>';
      }
      function wireThemeBtn() {
        var b = document.getElementById('themeToggle');
        if (b) {
          var isDark = document.documentElement.classList.contains('dark');
          b.textContent = isDark ? '🌙' : '☀️';
          b.title = isDark ? 'Switch to light mode' : 'Switch to dark mode';
          b.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
          b.onclick = function (e) {
            if (e) { e.preventDefault(); e.stopPropagation(); }
            toggleTheme(e);
          };
          b.__themeWired = true;
        }
        wireAuthControls();
      }

      function addRipple(el, evt) {
        if (state && state.screen === 'quiz') return; // ripples + blur layers can freeze phones mid-quiz
        var rect = el.getBoundingClientRect();
        var x = (evt.clientX != null ? evt.clientX : rect.width / 2) - rect.left;
        var y = (evt.clientY != null ? evt.clientY : rect.height / 2) - rect.top;
        var size = Math.max(rect.width, rect.height) * 1.4;
        requestAnimationFrame(function () {
          var span = document.createElement('span');
          span.className = 'ripple';
          span.style.width = span.style.height = size + 'px';
          span.style.left = (x - size / 2) + 'px';
          span.style.top = (y - size / 2) + 'px';
          if (!el.classList.contains('ripple-host')) el.classList.add('ripple-host');
          el.appendChild(span);
          setTimeout(function () { span.remove(); }, 650);
        });
      }
      function wireRipples(selector) {
        document.querySelectorAll(selector).forEach(function (el) {
          if (el._rippleWired) return;
          el._rippleWired = true;
          el.addEventListener('pointerdown', function (evt) {
            addRipple(el, evt);
            el.classList.add('touch-glow');
          }, { passive: true });
          el.addEventListener('pointerup', function () {
            setTimeout(function () { el.classList.remove('touch-glow'); }, 500);
          }, { passive: true });
          el.addEventListener('pointerleave', function () {
            el.classList.remove('touch-glow');
          }, { passive: true });
          el.addEventListener('pointercancel', function () {
            el.classList.remove('touch-glow');
          }, { passive: true });
        });
      }

      function clearTimer() {
        if (state.timerId) { clearInterval(state.timerId); state.timerId = null; }
        if (state._quizKeyHandler) { window.removeEventListener('keydown', state._quizKeyHandler); state._quizKeyHandler = null; }
      }

      function releaseQuizPayload() {
        releaseQuestionImages();
        state.questions = [];
        state.order = [];
        state.answers = {};
        state.idx = 0;
      }

      function totalQuestions() {
        // Live count once site_counts has loaded; the build-time figure until then.
        return LIVE_COUNTS && LIVE_COUNTS.total ? LIVE_COUNTS.total : 36219;
      }
      function totalTopics() {
        return LIVE_COUNTS && LIVE_COUNTS.topics ? LIVE_COUNTS.topics : 740;
      }

      var activeHomeCategory = 'all';

      // ---------- HOME: subject list ----------
      // Every in-place view change resets the window scroll: without this,
      // opening a subject/topic from the bottom of a list showed the new
      // view scrolled to that same position instead of its top.
      function scrollToPageTop() { window.scrollTo(0, 0); }

      function renderHome(force) {
        // Home is document-dependent (home-only scripts, URL, title, tags):
        // on any other document, load the real homepage instead of
        // rendering home content in place and dropping pieces of it.
        if (window.location.pathname !== '/' && window.location.pathname !== '/index.html' && window.location.pathname !== '') { goHomeFromSeo(); return; }
        if (v2On()) { state.screen = 'home'; renderHomeV2(); return; }
        clearTimer();
        releaseQuizPayload();
        state.screen = 'home';
        trackPageView('/', 'home');
        scrollToPageTop();
        if (app) {
          app.classList.remove('screen-quiz', 'screen-setup', 'screen-results');
        }

        var grid = document.getElementById('subjectGrid');
        // The static shell includes a subject-grid placeholder. Rebuild it when
        // the current home markup does not yet include the custom module entry.
        var alreadyRendered = !force && !!grid && grid.children.length > 0 && !!document.getElementById('customModuleCard');

        if (!alreadyRendered) {
          var rows = SUBJECT_INDEX.map(function (s, i) {
            var p = progress[s.subjectId + ':all'];
            var scoreHtml = '';
            if (p && p.done > 0) {
              var scorePct = Math.round((p.correct / p.done) * 100);
              scoreHtml = '<span class="score-pill">✓ ' + scorePct + '% last run</span>';
            }
            var slug = s.name.toLowerCase().replace(/&/g, '-').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
            var iconHtml = '<img src="/assets/subjects-webp/' + slug + '.webp" alt="' + esc(s.name) + '" class="subject-icon-img" width="36" height="36" loading="lazy">';
            return (
              '<button class="item" data-sid="' + s.subjectId + '" data-cat="' + s.cat + '" data-name="' + esc(s.name.toLowerCase()) + '" style="animation-delay:' + (Math.min(i, 12) * 0.02) + 's">' +
              '<div class="item-icon-box">' + iconHtml + '</div>' +
              '<div class="info">' +
              '<span class="item-category-tag">' + s.catLabel + '</span>' +
              '<span class="cname">' + esc(s.name) + scoreHtml + '</span>' +
              '<span class="cmeta">' + s.questionCount.toLocaleString() + ' questions · ' + s.moduleCount + ' topics</span>' +
              '</div>' +
              '<span class="arrow">›</span>' +
              '</button>'
            );
          }).join('');

          // Build PYQ Bank collapsible section
          var isProUser = isUserPro(currentUser);
          var pyqCardsHtml = PYQ_EXAMS.map(function (exam) {
            var coverageHtml = exam.coverage ? '<span class="pyq-year-badge">📅 ' + esc(exam.coverage) + '</span>' : '';
            var lockHtml = isProUser
              ? '<span class="pyq-exam-lock unlocked" style="margin-left:auto;flex-shrink:0;font-size:10px;font-weight:800;padding:3px 8px;border-radius:999px;background:rgba(34,197,94,.12);color:#16a34a;border:1px solid rgba(34,197,94,.3);">✓ UNLOCKED</span>'
              : '<span class="pyq-exam-lock">🔒 PRO</span>';
            return '<button class="pyq-exam-card" data-pyq-exam="' + esc(exam.id) + '" title="' + esc(exam.label) + '">' +
              '<span class="pyq-exam-icon">' + exam.icon + '</span>' +
              '<span class="pyq-exam-info">' +
              '<strong>' + esc(exam.name) + '</strong>' +
              '<span>' + esc(exam.label) + '</span>' +
              coverageHtml +
              '</span>' +
              lockHtml +
              '</button>';
          }).join('');

          var pyqSectionHtml =
            '<div class="pyq-section-wrap">' +
            '<button class="pyq-section-header" id="pyqBankToggle" aria-expanded="' + pyqExpanded + '">' +
            '<div class="pyq-header-left">' +
            '<span class="pyq-header-icon">📚</span>' +
            '<div class="pyq-header-text">' +
            '<strong>Previous Year Questions (PYQ Bank)</strong>' +
            '<span>NEET PG · INICET · AIIMS · NEET SS · FMGE — Pro Feature</span>' +
            '</div>' +
            '</div>' +
            '<div class="pyq-header-right">' +
            (isProUser
              ? '<span class="pyq-pro-badge unlocked" style="font-size:9.5px;font-weight:800;padding:3px 9px;border-radius:999px;background:linear-gradient(135deg,#10b981,#059669);color:#fff;box-shadow:0 2px 8px rgba(16,185,129,.3);">✓ UNLOCKED</span>'
              : '<span class="pyq-pro-badge">⭐ PRO</span>') +
            '<span class="pyq-chevron' + (pyqExpanded ? ' open' : '') + '">▾</span>' +
            '</div>' +
            '</button>' +
            '<div class="pyq-cards-wrap' + (pyqExpanded ? ' open' : '') + '" id="pyqCardsWrap">' +
            '<div class="pyq-cards-grid">' + pyqCardsHtml + '</div>' +
            '</div>' +
            '</div>';

          app.innerHTML =
            '<header class="masthead glass" role="banner">' +
            '<a href="/" class="brand" style="text-decoration:none;"><span class="brand-icon" style="overflow:hidden;display:inline-flex;align-items:center;justify-content:center;"><img src="/icons/icon-72.png" alt="MedLadder" width="72" height="72" style="width:100%;height:100%;border-radius:inherit;display:block;object-fit:cover;"></span><span>MedLadder</span></a>' +
            '<span class="right"><span class="stat"><span class="stat-dot"></span>' + totalQuestions().toLocaleString() + ' MCQs</span>' + proHeaderBtnHtml() + authBtnHtml() + themeBtnHtml() + '</span>' +
            '</header>' +
            '<main id="mainContent" role="main">' +
            '<div class="hero-wrap">' +
            '<div class="hero-eyebrow">⚡ FMGE · NEET PG · INI-CET · NEET SS</div>' +
            '<h1 class="title">Med<span class="brand-gradient">Ladder</span></h1>' +
            '<p class="subtitle">Your climb through FMGE, NEET PG, INICET &amp; NEET SS — ' + SUBJECT_INDEX.length + ' subjects, ' + totalQuestions().toLocaleString() + ' MCQs including Previous Year Questions. Pick a subject or launch a PYQ test.</p>' +
            '<div class="bento-bar">' +
            '<div class="bento-stat"><div class="bento-stat-num">' + SUBJECT_INDEX.length + '</div><div class="bento-stat-lbl">Subjects</div></div>' +
            '<div class="bento-stat"><div class="bento-stat-num">' + totalTopics() + '</div><div class="bento-stat-lbl">Topics</div></div>' +
            '<div class="bento-stat"><div class="bento-stat-num">' + totalQuestions().toLocaleString() + '</div><div class="bento-stat-lbl">Total MCQs</div></div>' +
            '<div class="bento-stat"><div class="bento-stat-num">5 Exams</div><div class="bento-stat-lbl">PYQ Papers</div></div>' +
            '</div>' +
            '<div class="home-controls">' +
            '<div class="home-search-wrap">' +
            '<span class="home-search-icon">🔍</span>' +
            '<input type="text" id="homeSearchInput" class="home-search-input" placeholder="Search 19 subjects or keywords (e.g. Anatomy, Cardiology, Surgery)..." autocomplete="off" />' +
            '<button class="home-search-clear hidden" id="homeSearchClear">✕</button>' +
            '</div>' +
            '<div class="category-tabs">' +
            '<button class="cat-tab' + (activeHomeCategory === 'all' ? ' active' : '') + '" data-filter="all">All (19)</button>' +
            '<button class="cat-tab' + (activeHomeCategory === 'pre' ? ' active' : '') + '" data-filter="pre">Pre-Clinical (3)</button>' +
            '<button class="cat-tab' + (activeHomeCategory === 'para' ? ' active' : '') + '" data-filter="para">Para-Clinical (4)</button>' +
            '<button class="cat-tab' + (activeHomeCategory === 'clinical' ? ' active' : '') + '" data-filter="clinical">Clinical (12)</button>' +
            '<button class="cat-tab' + (activeHomeCategory === 'pyq' ? ' active' : '') + '" data-filter="pyq">⭐ PYQ Banks (5)</button>' +
            '</div>' +
            '</div>' +
            '</div>' +
            '<div class="quick-actions-label">Quick actions</div>' +
            '<div class="quick-actions-grid" id="quickActionsGrid">' +
            '<div class="custom-module-card" id="customModuleCard" role="button" tabindex="0">' +
            '<span class="custom-module-icon">🧩</span>' +
            '<span class="custom-module-copy"><strong>Custom Module</strong></span>' +
            '<span class="custom-module-arrow">›</span>' +
            '</div>' +
            bookmarksHomeCardHtml() +
            '</div>' +
            '<div class="section-divider divider-subjects"></div>' +
            '<div class="subject-grid" id="subjectGrid">' + rows + '</div>' +
            '<div id="homeNoMatch" class="no-match-card hidden">No subjects match your search.</div>' +
            '<div class="section-divider divider-pyq"></div>' +
            pyqSectionHtml +
            modeNoteHtml() +
            '</main>' +
            footerHtml(); hideStaticFooter();
        }

        function setPyqExpanded(expanded) {
          pyqExpanded = expanded;
          var wrap = document.getElementById('pyqCardsWrap');
          var toggle = document.getElementById('pyqBankToggle');
          var chevron = toggle ? toggle.querySelector('.pyq-chevron') : document.querySelector('.pyq-chevron');
          if (wrap) wrap.classList.toggle('open', pyqExpanded);
          if (chevron) chevron.classList.toggle('open', pyqExpanded);
          if (toggle) toggle.setAttribute('aria-expanded', pyqExpanded ? 'true' : 'false');
        }

        function wireHomeEvents() {
          wireThemeBtn();
          wireAuthControls();
          wireRipples('.item, .reset-link, .auth-btn, .btn-go-pro, .cat-tab');
          app.querySelectorAll('.item[data-sid]').forEach(function (btn) {
            btn.onclick = function () { renderModuleList(parseInt(btn.getAttribute('data-sid'), 10)); };
          });
          var customModuleCard = document.getElementById('customModuleCard');
          if (customModuleCard) {
            customModuleCard.onclick = function () { setupChoice.count = 'all'; renderCustomSetup(); };
            customModuleCard.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setupChoice.count = 'all'; renderCustomSetup(); } };
          }
          // Bookmarks card: injected here too so cached home renders (which
          // skip the full rebuild) still get it.
          var bmHomeCard = document.getElementById('bookmarksHomeCard');
          if (!bmHomeCard && customModuleCard && customModuleCard.parentNode) {
            customModuleCard.insertAdjacentHTML('afterend', bookmarksHomeCardHtml());
            bmHomeCard = document.getElementById('bookmarksHomeCard');
          }
          if (bmHomeCard) {
            bmHomeCard.onclick = function () { renderBookmarks(); };
            bmHomeCard.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); renderBookmarks(); } };
          }
          var resetBtn = document.getElementById('resetAll');
          if (resetBtn) {
            resetBtn.onclick = function () { resetAllProgress(); };
          }

          // Search filter logic
          var searchInput = document.getElementById('homeSearchInput');
          var searchClear = document.getElementById('homeSearchClear');
          var grid = document.getElementById('subjectGrid');
          var noMatch = document.getElementById('homeNoMatch');

          var searchTrackTimer = null;
          function filterHomeSubjects() {
            var q = (searchInput ? searchInput.value : '').trim().toLowerCase();
            if (searchClear) searchClear.classList.toggle('hidden', q.length === 0);
            var items = grid ? grid.querySelectorAll('.item[data-sid]') : [];
            var visible = 0;
            items.forEach(function (el) {
              var cat = el.getAttribute('data-cat') || '';
              var name = el.getAttribute('data-name') || '';
              var matchesCat = (activeHomeCategory === 'all' || cat === activeHomeCategory);
              var matchesSearch = (!q || name.indexOf(q) !== -1);
              var show = matchesCat && matchesSearch;
              el.classList.toggle('hidden', !show);
              if (show) visible++;
            });
            if (noMatch) noMatch.classList.toggle('hidden', visible > 0);

            if (q.length >= 3) {
              clearTimeout(searchTrackTimer);
              searchTrackTimer = setTimeout(function () {
                trackEvent('search', { search_term: q, results_count: visible });
              }, 600);
            }
          }

          if (searchInput) searchInput.oninput = filterHomeSubjects;
          if (searchClear) {
            searchClear.onclick = function () {
              searchInput.value = '';
              filterHomeSubjects();
              searchInput.focus();
            };
          }

          // Category tab filter logic
          app.querySelectorAll('.cat-tab[data-filter]').forEach(function (tab) {
            tab.onclick = function () {
              var f = tab.getAttribute('data-filter');
              if (f === 'pyq') {
                setPyqExpanded(true);
                var toggle = document.getElementById('pyqBankToggle');
                if (toggle) {
                  toggle.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
                return;
              }
              activeHomeCategory = f;
              app.querySelectorAll('.cat-tab').forEach(function (t) { t.classList.remove('active'); });
              tab.classList.add('active');
              filterHomeSubjects();
            };
          });

          // PYQ Bank toggle (single idempotent onclick)
          var pyqToggle = document.getElementById('pyqBankToggle');
          if (pyqToggle) {
            pyqToggle.onclick = function (e) {
              e.preventDefault();
              setPyqExpanded(!pyqExpanded);
            };
          }

          // PYQ exam card clicks
          app.querySelectorAll('.pyq-exam-card[data-pyq-exam]').forEach(function (btn) {
            btn.onclick = function () {
              var examId = btn.getAttribute('data-pyq-exam');
              renderPYQSetup(examId);
            };
          });

          updateMastheadAuth();
          updateModeNote();
          updatePyqSectionLocks();
        }

        wireHomeEvents();
      }

      // ---------- PYQ SETUP: configure and launch a PYQ quiz ----------
      async function renderPYQSetup(examId) {
        if (!quizStylesReady) {
          await ensureQuizStyles();
          return renderPYQSetup(examId);
        }
        clearTimer();
        releaseQuizPayload();
        scrollToPageTop();

        // If server Pro check is in-flight, wait for it before showing paywall
        if (_proStatusPromise) {
          try { await _proStatusPromise; } catch (e) { }
        }

        // Auth gate first
        if (!currentUser) {
          openAuthModal('signin', {
            reason: 'Please sign in or create an account to access the Previous Year Questions bank.',
            onSuccess: function () { renderPYQSetup(examId); }
          });
          return;
        }

        // If no server Pro check has run yet for this user (e.g. the deep link
        // launched from a path that never refreshed), run one now and wait —
        // otherwise a signed-in Pro user is paywalled on a stale reset state.
        if (!_proStatusPromise && !isUserPro(currentUser)) {
          refreshProStatus();
          if (_proStatusPromise) {
            try { await _proStatusPromise; } catch (e) { }
          }
        }

        // Pro gate
        if (!isUserPro(currentUser)) {
          openProModal('pyq_bank', { examId: examId });
          return;
        }

        var exam = PYQ_EXAMS.find(function (e) { return e.id === examId; }) || { id: examId, icon: '📝', name: examId, label: examId, years: ['All Years'] };

        state.screen = 'setup';
        state.isPyqMode = true;
        state.pyqExam = examId;
        trackPageView('/pyqs/' + pyqSlug(examId), 'pyq');
        state.subjectId = null;
        state.moduleId = 'pyq_' + examId;

        var yearsList = exam.years || ['All Years'];
        if (!setupChoice.pyqYear || yearsList.indexOf(setupChoice.pyqYear) === -1) {
          setupChoice.pyqYear = yearsList[0];
        }

        var yearsHtml = yearsList.map(function (y) {
          var activeCls = (setupChoice.pyqYear === y) ? 'active' : '';
          return '<button class="pill-choice pyq-year-pill ' + activeCls + '" data-year="' + esc(y) + '">' + esc(y) + '</button>';
        }).join('');

        // PYQ Bank: Every year PYQ acts as a dedicated single test covering the full paper
        setupChoice.count = 'all';

        // Exam Timers: 120 min (2 Hours) for INICET, 180 min (3 Hours) for NEET PG & FMGE
        var PYQ_TIME_OPTIONS = [
          { label: '2 hours', value: 7200, hint: 'INICET Standard' },
          { label: '3 hours', value: 10800, hint: 'NEET PG / FMGE Standard' },
          { label: 'No limit', value: 0, hint: 'Self-paced study' },
          { label: 'Custom', value: 'custom', hint: 'Set your own countdown' }
        ];

        if (setupChoice.timeLimit !== 7200 && setupChoice.timeLimit !== 10800 && setupChoice.timeLimit !== 0 && setupChoice.timeLimit !== 'custom') {
          setupChoice.timeLimit = (examId === 'inicet' ? 7200 : 10800);
        }

        var pool = {
          title: exam.name + ' — ' + setupChoice.pyqYear,
          isPyq: true,
          pyqExam: examId,
          pyqYear: setupChoice.pyqYear,
          questionCount: 0,
          key: 'pyq:' + examId + ':' + setupChoice.pyqYear
        };
        setupChoice.pool = pool;

        var typeHtml =
          '<button class="type-card ' + (setupChoice.quizType === 'practice' ? 'active' : '') + '" data-type="practice">' +
          '<span class="tname">Practice</span><span class="tdesc">See the answer and explanation after each question.</span>' +
          '</button>' +
          '<button class="type-card ' + (setupChoice.quizType === 'timed' ? 'active' : '') + '" data-type="timed">' +
          '<span class="tname">Exam simulation</span><span class="tdesc">The full paper against the clock.</span>' +
          '</button>';

        var timeHtml = PYQ_TIME_OPTIONS.map(function (t) {
          return '<button class="pill-choice ' + (setupChoice.timeLimit === t.value ? 'active' : '') + '" data-time="' + t.value + '">' +
            esc(t.label) +
            '</button>';
        }).join('');
        var pyqCustomTimeHtml = setupChoice.timeLimit === 'custom' ? '<div class="custom-setup-control"><label for="customTimeInput">Minutes</label><input id="customTimeInput" type="number" min="1" max="600" value="' + esc(String(setupChoice.customTime || 30)) + '" inputmode="numeric"><span>1–600 min</span></div>' : '';

        var pyqTimeLine = setupChoice.timeLimit === 'custom'
          ? (parseInt(setupChoice.customTime, 10) || 30) + ' minutes'
          : (setupChoice.timeLimit === 7200 ? '2 hours' : (setupChoice.timeLimit === 10800 ? '3 hours' : 'no time limit'));
        var pyqDefaults = (setupChoice.quizType === 'timed' ? 'Exam simulation' : 'Practice mode') + ', ' + pyqTimeLine + ', ' +
          (setupChoice.orderMode === 'shuffled' ? 'shuffled' : 'paper order') + '.';

        if (app) { app.classList.remove('screen-quiz', 'screen-results'); app.classList.add('screen-setup'); }
        app.innerHTML =
          rrTopBar('Back to home', 'Past papers') +
          '<main id="mainContent" role="main" class="rr-setup">' +
          '<h1 class="setup-chapname">' + esc(exam.name) + ' past papers</h1>' +
          '<p class="setup-sub">' + esc(exam.label) + '. Each session is one complete paper, with answers and explanations.</p>' +
          '<div class="setup-section rr-year-section">' +
          '<div class="setup-label">Year or session</div>' +
          '<div class="pill-row" id="yearRow">' + yearsHtml + '</div>' +
          '</div>' +
          '<div class="start-btn-wrap"><button class="btn start" id="startBtn">Start ' + esc(exam.name) + (/^all/i.test(setupChoice.pyqYear) ? ', all years' : ' ' + esc(setupChoice.pyqYear)) + '</button></div>' +
          '<p class="rr-defaults">' + esc(pyqDefaults) + '</p>' +
          '<details class="rr-settings" id="setupSettings"' + (setupSettingsOpen ? ' open' : '') + '>' +
          '<summary><span>Change settings</span>' + RR_CHEVRON_SVG + '</summary>' +
          '<div class="rr-settings-body">' +
          '<div class="setup-section"><div class="setup-label">Mode</div><div class="type-grid" id="typeGrid">' + typeHtml + '</div></div>' +
          '<div class="setup-section"><div class="setup-label">Time limit</div><div class="pill-row" id="timeRow">' + timeHtml + '</div>' + pyqCustomTimeHtml +
          '<p class="rr-hint">The real exams allow 3 hours for NEET PG and FMGE, and 2 hours for INI-CET.</p>' +
          '</div>' +
          '<div class="setup-section"><div class="setup-label">Question order</div><div class="pill-row" id="orderRow">' +
          '<button class="pill-choice ' + (setupChoice.orderMode === 'structured' ? 'active' : '') + '" data-order="structured">Paper order</button>' +
          '<button class="pill-choice ' + (setupChoice.orderMode === 'shuffled' ? 'active' : '') + '" data-order="shuffled">Shuffled</button>' +
          '</div></div>' +
          '</div>' +
          '</details>' +
          '</main>';

        var pyqSettingsEl = document.getElementById('setupSettings');
        if (pyqSettingsEl) pyqSettingsEl.addEventListener('toggle', function () { setupSettingsOpen = pyqSettingsEl.open; });

        wireTopBar(goHomeFromSeo);
        wireRipples('.type-card, .pill-choice, .pyq-year-pill, .btn, .auth-btn');

        app.querySelectorAll('#yearRow .pyq-year-pill').forEach(function (btn) {
          btn.addEventListener('click', function () {
            setupChoice.pyqYear = btn.getAttribute('data-year');
            renderPYQSetup(examId);
          });
        });
        app.querySelectorAll('#typeGrid .type-card').forEach(function (btn) {
          btn.addEventListener('click', function () {
            setupChoice.quizType = btn.getAttribute('data-type');
            renderPYQSetup(examId);
          });
        });
        app.querySelectorAll('#timeRow .pill-choice').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var v = btn.getAttribute('data-time');
            setupChoice.timeLimit = v === 'custom' ? 'custom' : parseInt(v, 10);
            renderPYQSetup(examId);
          });
        });
        var pyqCustomTimeInput = document.getElementById('customTimeInput');
        if (pyqCustomTimeInput) pyqCustomTimeInput.onchange = function () { setupChoice.customTime = pyqCustomTimeInput.value; };
        app.querySelectorAll('#orderRow .pill-choice').forEach(function (btn) {
          btn.addEventListener('click', function () {
            setupChoice.orderMode = btn.getAttribute('data-order');
            renderPYQSetup(examId);
          });
        });
        document.getElementById('startBtn').addEventListener('click', function () {
          setupChoice.timeLimit = resolveSetupTime();
          startPYQQuiz(examId);
        });
      }

      // ---------- PYQ QUIZ LAUNCH ----------
      async function startPYQQuiz(examId) {
        if (quizLoadInFlight) return;
        // If server Pro check is in-flight, wait for it before showing paywall
        if (_proStatusPromise) {
          try { await _proStatusPromise; } catch (e) { }
        }

        // Double-check Pro and auth guards
        if (!currentUser) {
          openAuthModal('signin', {
            reason: 'Please sign in or create an account to start practicing PYQ exams.',
            onSuccess: function () {
              startPYQQuiz(examId);
            }
          });
          return;
        }
        if (!isUserPro(currentUser)) { openProModal('pyq_bank', { examId: examId }); return; }
        quizLoadInFlight = true;

        var exam = PYQ_EXAMS.find(function (e) { return e.id === examId; }) || { id: examId, icon: '📝', name: examId, label: examId };
        var selectedYear = setupChoice.pyqYear || 'All Years';
        var isAll = (selectedYear === 'All Years' || selectedYear === 'All Sessions');
        var yearDisplay = isAll ? 'All Sessions' : selectedYear;

        app.innerHTML =
          rrLoadingHtml('Back to past papers', esc(exam.name + ' \u00b7 ' + yearDisplay), 'Loading the paper');
        wireTopBar(function () { renderPYQSetup(examId); });

        // Query Supabase: filter by is_pyq = true AND pyq_exam = examId
        var query = supabaseClient.from('questions').select('id,question_num,question_text,option_a,option_b,option_c,option_d,option_e,answer,explanation,subject,pyq_year')
          .eq('is_pyq', true)
          .eq('pyq_exam', examId);

        if (!isAll) {
          query = query.eq('pyq_year', selectedYear);
        }

        query.order('id', { ascending: true }).then(function (res) {
          quizLoadInFlight = false;
          if (res.error) console.warn('Supabase query error:', res.error);
          var rows = (res && res.data) ? res.data : [];

          if (rows.length === 0) {
            app.innerHTML =
              topBar('Back to PYQ Setup', function () { renderPYQSetup(examId); }) +
              '<main id="mainContent" role="main">' +
              '<div style="max-width:500px;margin:60px auto;text-align:center;padding:28px;" class="glass">' +
              '<div style="font-size:28px;margin-bottom:10px;">' + exam.icon + '</div>' +
              '<div style="font-size:17px;font-weight:700;margin-bottom:10px;">No PYQ questions available for ' + esc(exam.name) + (isAll ? '' : (' (' + esc(selectedYear) + ')')) + '</div>' +
              '<p style="font-size:13px;color:var(--ink-soft);line-height:1.5;">We couldn\'t load these questions right now. Please try again in a moment' + (isUserPro(currentUser) ? ', or contact support if it keeps happening.' : ' — PYQ banks are part of MedLadder Pro.') + '</p>' +
              '<button class="btn" id="pyqRetryBtn" style="margin-top:16px;">Retry</button>' +
              '</div>' +
              '</main>';
            wireTopBar(function () { renderPYQSetup(examId); });
            var retryBtn = document.getElementById('pyqRetryBtn');
            if (retryBtn) retryBtn.onclick = function () { startPYQQuiz(examId); };
            return;
          }

          var idxs = rows.map(function (q, i) { return i; });
          var picked = (setupChoice.orderMode === 'shuffled') ? shuffle(idxs) : idxs.slice();
          if (setupChoice.count !== 'all') picked = picked.slice(0, setupChoice.count);
          var selectedRows = picked.map(function (questionIndex) { return rows[questionIndex]; });
          rows = null;

          return loadQuestionImages(selectedRows).then(function (imageRows) {
            var imagesByQuestion = {};
            imageRows.forEach(function (image) {
              var key = String(image.question_id);
              if (!imagesByQuestion[key]) imagesByQuestion[key] = { question_text: [], explanation: [] };
              if (image.content_field && imagesByQuestion[key][image.content_field]) {
                imagesByQuestion[key][image.content_field].push(image);
              }
            });

            // Map rows into quiz schema (support both Supabase columns and JSON properties)
            var fetchedQuestions = selectedRows.map(function (r) {
              var opts = {};
              if (r.option_a) opts.A = r.option_a;
              if (r.option_b) opts.B = r.option_b;
              if (r.option_c) opts.C = r.option_c;
              if (r.option_d) opts.D = r.option_d;
              if (r.option_e) opts.E = r.option_e;
              return {
                id: r.id,
                moduleId: r.module_id,
                num: String(r.id || r.question_num),
                question: r.question_text || '',
                options: opts,
                answer: r.correct_answer || r.answer || 'A',
                explanation: r.explanation || '',
                questionImages: (imagesByQuestion[String(r.id)] || {}).question_text || [],
                explanationImages: (imagesByQuestion[String(r.id)] || {}).explanation || [],
                subject: r.subject || 'General',
                year: r.pyq_year || r.year || selectedYear
              };
            });
            var orderIndices = fetchedQuestions.map(function (q, i) { return i; });
            selectedRows = null;

            var yearLabelInTitle = isAll ? '' : (' · ' + selectedYear);
            state = {
              screen: 'quiz',
              subjectId: null,
              moduleId: 'pyq_' + examId + '_' + selectedYear.replace(/\s+/g, '_'),
              poolTitle: exam.name + (isAll ? '' : ' \u2014 ' + selectedYear),
              questions: fetchedQuestions,
              order: orderIndices,
            idx: 0,
            answers: {},
            quizType: setupChoice.quizType,
            timeLimit: setupChoice.timeLimit,
            remaining: setupChoice.timeLimit,
            timerId: null,
            progressKey: 'pyq:' + examId + ':' + selectedYear,
            isPyqMode: true,
            pyqExam: examId,
            pyqYear: selectedYear
          };

          // Each paper is its own attempt; without this its answers were
          // written into whatever quiz ran before it.
          beginAttemptLog(null);
          scrollToPageTop();
          renderQuiz();
          prefetchBookmarks();
          if (state.timeLimit > 0) startOverallTimer();

          });

        }).catch(function (err) {
          quizLoadInFlight = false;
          console.error('PYQ fetch error:', err);
          showToast('Failed to load PYQ questions: ' + (err.message || err), 'error');
          renderPYQSetup(examId);
        });
      }

      // ---------- MODULE LIST (sub-topics within a subject) ----------
      var quizStylesReady = false;
      var quizStylesPromise = null;
      function ensureQuizStyles() {
        if (quizStylesReady) return Promise.resolve();
        if (quizStylesPromise) return quizStylesPromise;

        var link = document.getElementById('quiz-pro-css');
        if (!link) {
          // Static SEO pages (e.g. /subjects/ob-g/abnormal-labour) only ship app.css,
          // so create the quiz stylesheet link on demand.
          link = document.createElement('link');
          link.rel = 'stylesheet';
          link.href = '/quiz-pro.css';
          link.id = 'quiz-pro-css';
          document.head.appendChild(link);
        }

        quizStylesPromise = new Promise(function (resolve) {
          var finished = false;
          var finish = function () {
            if (finished) return;
            finished = true;
            quizStylesReady = true;
            try { link.media = 'all'; } catch (_) {}
            resolve();
          };
          link.addEventListener('load', finish, { once: true });
          link.addEventListener('error', finish, { once: true });
          try { link.media = 'all'; } catch (_) {}
          try {
            if (link.sheet && link.sheet.cssRules && link.sheet.cssRules.length > 0) {
              finish();
              return;
            }
          } catch (e) { /* The load event or timeout completes activation if rules are not yet readable. */ }
          // Fallback guarantee: mobile WebKit/Blink does not emit load when modifying media of preloaded stylesheets
          setTimeout(finish, 120);
        });
        return quizStylesPromise;
      }

      function renderModuleList(subjectId) {
        if (!quizStylesReady) {
          ensureQuizStyles().then(function () { renderModuleList(subjectId); });
          return;
        }
        if (v2On()) { state.idSet = null; renderTopicsV2(subjectId); return; }
        clearTimer();
        releaseQuizPayload();
        state.screen = 'modules';
        scrollToPageTop();
        if (app) {
          app.classList.remove('screen-quiz', 'screen-setup', 'screen-results');
        }
        var subjMeta = SUBJECT_INDEX.find(function (s) { return s.subjectId === subjectId; });
        var modules = getSubjectModules(subjectId);
        trackPageView(subjectPath(subjMeta), 'modules');
        state.subjectId = subjectId;

        var allCount = modules.reduce(function (s, m) { return s + m.questionCount; }, 0);
        var pAll = progress[subjectId + ':all'];
        var allScore = pAll && pAll.done > 0 ? Math.round((pAll.correct / pAll.done) * 100) + '% last run' : '';

        if (!currentUser) loadGuestModules();
        var isPro = isUserPro(currentUser);
        var isAllLocked = isModuleLocked(subjectId, 'all');

        var subjSlug = String(subjMeta.name || '').toLowerCase().replace(/&/g, '-').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

        var allCard = isAllLocked
          ? ('<button class="item pro-locked" data-mod="all" data-locked="true" style="animation-delay:0s;border:1.5px solid rgba(255,178,61,0.38);">' +
            '<div class="item-icon-box" aria-hidden="true"><img src="/assets/subjects-webp/' + subjSlug + '.webp" alt="" class="subject-icon-img" width="36" height="36"></div>' +
            '<span class="num">✦</span>' +
            '<span class="info"><span class="cname">All topics <span class="pro-lock-pill">🔒 PRO</span>' + (allScore ? ' <span class="score-pill">' + allScore + '</span>' : '') + '</span>' +
            '<span class="cmeta">' + allCount + ' questions across every topic · Pro Full Mock Exam</span></span>' +
            '<span class="pro-lock-icon">🔒</span>' +
            '</button>')
          : ('<button class="item" data-mod="all" data-locked="false" style="animation-delay:0s;border:1.5px solid var(--accent);">' +
            '<div class="item-icon-box" aria-hidden="true"><img src="/assets/subjects-webp/' + subjSlug + '.webp" alt="" class="subject-icon-img" width="36" height="36"></div>' +
            '<span class="num">✦</span>' +
            '<span class="info"><span class="cname">All topics' + (allScore ? ' <span class="score-pill">' + allScore + '</span>' : '') + '</span>' +
            '<span class="cmeta">' + allCount + ' questions across every topic</span></span>' +
            '<span class="arrow">›</span>' +
            '</button>');

        state._lastSection = null;
        var rows = modules.map(function (m, i) {
          var p = progress[subjectId + ':' + m.moduleId];
          var progHtml = '';
          if (p && p.done > 0 && m.questionCount > 0) {
            var total = p.total || m.questionCount;
            var pct = Math.min(100, Math.round((p.done / total) * 100));
            var accPct = Math.round((p.correct / p.done) * 100);
            var isComplete = p.done >= total;
            var fillCls = isComplete ? ' complete' : '';
            progHtml = '<div class="mod-prog-wrap">' +
              '<div class="mod-prog-track"><div class="mod-prog-fill' + fillCls + '" style="width:' + pct + '%"></div></div>' +
              '<span class="mod-prog-label' + fillCls + '">' + (isComplete ? '✓ Done' : p.done + '/' + total + ' · ' + pct + '%') + ' · ' + accPct + '% acc</span>' +
              '</div>';
          }
          var sectionHeader = '';
          if (m.section && m.section !== state._lastSection) {
            sectionHeader = '<div class="section-header" data-section="' + esc(m.section) + '">' + esc(m.section) + '</div>';
            state._lastSection = m.section;
          }
          var dimClass = (m.questionCount === 0) ? ' dim' : '';
          var isLocked = isModuleLocked(subjectId, m.moduleId, i);
          var guestFree = !currentUser && !isLocked && isGuestModule(m.id);

          if (isLocked) {
            return sectionHeader + (
              '<button class="item pro-locked' + dimClass + '" data-mod="' + m.moduleId + '" data-locked="true" data-name="' + esc(m.name.toLowerCase()) + '" data-sec="' + esc((m.section || '').toLowerCase()) + '" style="animation-delay:' + (Math.min(i, 20) * 0.015) + 's">' +
              '<span class="num">' + String(i + 1).padStart(2, '0') + '</span>' +
              '<span class="info"><span class="cname">' + esc(m.name) + ' <span class="pro-lock-pill">🔒 PRO</span></span>' +
              progHtml +
              '<span class="cmeta">' + m.questionCount + ' questions · Pro Unlock</span></span>' +
              '<span class="pro-lock-icon">🔒</span>' +
              '</button>'
            );
          } else {
            return sectionHeader + (
              '<button class="item' + dimClass + '" data-mod="' + m.moduleId + '" data-locked="false" data-name="' + esc(m.name.toLowerCase()) + '" data-sec="' + esc((m.section || '').toLowerCase()) + '" style="animation-delay:' + (Math.min(i, 20) * 0.015) + 's">' +
              '<span class="num">' + String(i + 1).padStart(2, '0') + '</span>' +
              '<span class="info"><span class="cname">' + esc(m.name) +
              (guestFree ? ' <span class="score-pill">Free to try</span>' : '') + '</span>' +
              progHtml +
              '<span class="cmeta">' + m.questionCount + ' questions' +
              (guestFree ? ' \u00b7 no account needed' : '') + '</span></span>' +
              '<span class="arrow">›</span>' +
              '</button>'
            );
          }
        }).join('');

        var searchHtml =
          '<div class="search-wrap">' +
          '<span class="search-icon">🔍</span>' +
          '<input type="text" id="topicSearch" class="topic-search-input" placeholder="Search topics, diseases, or keywords (e.g. Asthma, Thyroid, Fracture)..." autocomplete="off">' +
          '<button class="search-clear hidden" id="searchClear">✕</button>' +
          '</div>';

        var tierBannerHtml = isPro
          ? ('<div class="pro-tier-banner active glass">' +
            '<div class="pro-banner-left">' +
            '<span class="pro-badge-glow active">⭐ PRO UNLOCKED</span>' +
            '<span class="pro-banner-text"><strong>All ' + modules.length + ' topics unlocked</strong> in ' + esc(subjMeta.name) + '. Unlimited QBank practice active.</span>' +
            '</div>' +
            '</div>')
          : ('<div class="pro-tier-banner glass">' +
            '<div class="pro-banner-left">' +
            '<span class="pro-badge-glow">FREE TIER</span>' +
            '<span class="pro-banner-text"><strong>First 8 topics unlocked</strong> in this subject. Upgrade to Pro to unlock all ' + modules.length + ' topics.</span>' +
            '</div>' +
            '<button class="pro-banner-btn" id="proBannerUpgradeBtn">⚡ Upgrade (₹' + PRO_CONFIG.PRICE_INR + ')</button>' +
            '</div>');

        app.innerHTML =
          topBar('All subjects', function () { renderHome(); }) +
          '<main id="mainContent" role="main">' +
          '<h1 class="setup-chapname">' + esc(subjMeta.name) + '</h1>' +
          '<p class="setup-sub">' + modules.length + ' topics · ' + allCount + ' questions total.</p>' +
          tierBannerHtml +
          searchHtml +
          '<div class="item-list" id="moduleItemList" style="list-style:none;padding:0;margin:12px 0 0;">' + allCard + rows + '</div>' +
          '<div id="noMatchCard" class="no-match-card hidden">No subtopics match your search.</div>' +
          '</main>' +
          footerHtml(); hideStaticFooter();

        wireTopBar(function () { renderHome(); });
        wireRipples('.item, .auth-btn');

        var searchInput = document.getElementById('topicSearch');
        var searchClear = document.getElementById('searchClear');
        var itemList = document.getElementById('moduleItemList');
        var noMatchCard = document.getElementById('noMatchCard');

        function applyFilter(query) {
          var q = query.trim().toLowerCase();
          searchClear.classList.toggle('hidden', q.length === 0);
          var items = itemList.querySelectorAll('.item[data-mod]');
          var visibleCount = 0;
          items.forEach(function (btn) {
            var modId = btn.getAttribute('data-mod');
            if (modId === 'all') {
              btn.classList.toggle('hidden', q.length > 0);
              return;
            }
            var name = btn.getAttribute('data-name') || '';
            var sec = btn.getAttribute('data-sec') || '';
            var matches = (name.indexOf(q) !== -1 || sec.indexOf(q) !== -1);
            btn.classList.toggle('hidden', !matches);
            if (matches) visibleCount++;
          });

          itemList.querySelectorAll('.section-header').forEach(function (sh) {
            if (q.length === 0) { sh.classList.remove('hidden'); return; }
            var sibling = sh.nextElementSibling;
            var hasVisible = false;
            while (sibling && !sibling.classList.contains('section-header')) {
              if (sibling.classList.contains('item') && !sibling.classList.contains('hidden')) {
                hasVisible = true;
                break;
              }
              sibling = sibling.nextElementSibling;
            }
            sh.classList.toggle('hidden', !hasVisible);
          });

          noMatchCard.classList.toggle('hidden', visibleCount > 0 || q.length === 0);
        }

        searchInput.addEventListener('input', function () { applyFilter(this.value); });
        searchClear.addEventListener('click', function () {
          searchInput.value = '';
          applyFilter('');
          searchInput.focus();
        });

        itemList.querySelectorAll('.item[data-mod]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var mid = btn.getAttribute('data-mod');
            var isLocked = btn.getAttribute('data-locked') === 'true';
            if (isLocked) {
              var modObj = modules.find(function (m) { return String(m.moduleId) === String(mid); });
              openProModal(mid === 'all' ? 'all_topics' : 'locked_module', {
                subjectId: subjectId,
                moduleId: mid,
                moduleName: modObj ? modObj.name : 'This Topic'
              });
              return;
            }
            renderSetup(subjectId, mid);
          });
        });

        var bannerUpgradeBtn = document.getElementById('proBannerUpgradeBtn');
        if (bannerUpgradeBtn) {
          bannerUpgradeBtn.onclick = function () {
            openProModal('banner', { subjectId: subjectId });
          };
        }
      }

      function topBar(backLabel, handler) {
        return '<header class="masthead glass" role="banner" style="border:none;padding:10px 14px;margin-bottom:12px;">' +
          '<button class="back-btn" id="backBtn">‹ ' + esc(backLabel) + '</button>' +
          '<div class="right">' + proHeaderBtnHtml() + authBtnHtml() + themeBtnHtml() + '</div>' +
          '</header>';
      }
      // ---------- READING-ROOM SCREENS (quiz + quiz setup) ----------
      // These two screens use their own visual system. It is switched by a
      // class on <html>, kept in step with #app's screen-* classes by an
      // observer, so the dozen places that add or remove those classes do not
      // each need to know about it.
      function syncReadingMode() {
        if (!app) return;
        var c = app.classList;
        var on = c.contains('screen-setup') || c.contains('screen-quiz');
        var dash = false, v2 = false;
        for (var ci = 0; ci < app.children.length; ci++) {
          var cl = app.children[ci].classList;
          if (!cl) continue;
          if (cl.contains('rr-dash')) dash = true;
          if (cl.contains('v2')) v2 = true;
          if (cl.contains('rr-loading')) on = true;
        }
        on = on || dash || v2;
        document.documentElement.classList.toggle('ml-dash', dash);
        document.documentElement.classList.toggle('ml-v2', v2);
        document.documentElement.classList.toggle('ml-reading', on);
        if (on && !document.getElementById('rr-fonts')) {
          var f = document.createElement('link');
          f.id = 'rr-fonts';
          f.rel = 'stylesheet';
          f.href = 'https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600&family=Literata:ital,opsz,wght@0,7..72,400;0,7..72,500;0,7..72,600;1,7..72,400&display=swap';
          document.head.appendChild(f);
        }
      }
      if (app && window.MutationObserver) {
        new MutationObserver(syncReadingMode).observe(app, { attributes: true, attributeFilter: ['class'], childList: true });
      }

      var RR_BACK_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>';
      var RR_BOOKMARK_SVG = '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>';
      var RR_CHEVRON_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';

      // Loading a set: the shape of the question screen, drawn before the
      // questions arrive. The title is already escaped by the caller.
      function rrLoadingHtml(backLabel, titleHtml, line) {
        if (!quizStylesReady) ensureQuizStyles();
        var bar = function (w) { return '<span class="rr-skel" style="width:' + w + '%"></span>'; };
        return rrTopBar(backLabel, '') +
          '<main id="mainContent" role="main" class="rr-loading" aria-busy="true">' +
          '<p class="rr-load-title">' + titleHtml + '</p>' +
          '<p class="rr-load-line" role="status">' + esc(line) + '\u2026</p>' +
          '<div class="rr-load-track" aria-hidden="true"><span></span></div>' +
          '<div class="rr-load-skel" aria-hidden="true">' + bar(92) + bar(84) + bar(56) +
          '<div class="rr-load-opts">' + bar(46) + bar(38) + bar(52) + bar(41) + '</div></div>' +
          '</main>';
      }

      // Same ids as topBar(), so wireTopBar() works unchanged.
      function rrTopBar(backLabel, crumb) {
        return '<header class="rr-top" role="banner">' +
          '<button class="rr-back" id="backBtn" aria-label="' + esc(backLabel) + '">' + RR_BACK_SVG + '</button>' +
          '<div class="rr-crumb">' + esc(crumb || '') + '</div>' +
          '<div class="right rr-top-right">' + proHeaderBtnHtml() + authBtnHtml() + themeBtnHtml() + '</div>' +
          '</header>';
      }
      // Open by default: the settings are visible on arrival and can be folded away.
      var setupSettingsOpen = true;

      function wireTopBar(handler) {
        wireThemeBtn();
        wireAuthControls();
        var b = document.getElementById('backBtn');
        if (b) b.addEventListener('click', handler);
      }

      // ---------- SETUP ----------
      var COUNT_OPTIONS = [10, 25, 50, 100, 150, 200, 300];
      var TIME_OPTIONS = [
        { label: 'No limit', value: 0 }, { label: '10 min', value: 600 },
        { label: '20 min', value: 1200 }, { label: '30 min', value: 1800 },
        { label: '1 hour', value: 3600 }, { label: '2 hours', value: 7200 }
      ];

      function resolveSetupCount(total) {
        if (setupChoice.count === 'all') return 'all';
        if (setupChoice.count === 'custom') {
          var custom = parseInt(setupChoice.customCount, 10);
          return Math.max(1, Math.min(total, Number.isFinite(custom) ? custom : Math.min(50, total)));
        }
        return Math.max(1, Math.min(total, parseInt(setupChoice.count, 10) || total));
      }

      function resolveSetupTime() {
        if (setupChoice.timeLimit === 'custom') {
          var minutes = parseInt(setupChoice.customTime, 10);
          return Math.max(1, Math.min(600, Number.isFinite(minutes) ? minutes : 30)) * 60;
        }
        return Number(setupChoice.timeLimit) || 0;
      }

      function customPool() {
        var moduleDbIds = [];
        var questionCount = 0;
        SUBJECT_INDEX.forEach(function (s) {
          getSubjectModules(s.subjectId).forEach(function (m) {
            if (m.id) moduleDbIds.push(m.id);
            questionCount += Number(m.questionCount) || 0;
          });
        });
        return {
          title: 'Custom Module · All Questions', questionCount: questionCount,
          moduleId: 'custom', moduleDbIds: moduleDbIds, key: 'custom:all'
        };
      }

      function renderCustomSetup() {
        state.idSet = null;
        if (!quizStylesReady) {
          ensureQuizStyles().then(renderCustomSetup);
          return;
        }
        clearTimer();
        releaseQuizPayload();
        scrollToPageTop();
        state.screen = 'setup';
        state.isPyqMode = false;
        state.subjectId = null;
        state.moduleId = 'custom';
        trackPageView('/custom-module', 'custom');
        app.classList.remove('screen-quiz');
        app.classList.add('screen-setup');
        var pool = customPool();
        setupChoice.pool = pool;
        if (!setupChoice.customCount) setupChoice.customCount = 50;
        if (!setupChoice.customTime) setupChoice.customTime = 30;
        var total = pool.questionCount;
        var countChoices = COUNT_OPTIONS.filter(function (n) { return n < total; }).concat(['all', 'custom']);
        if (countChoices.indexOf(setupChoice.count) === -1) setupChoice.count = 50 < total ? 50 : 'all';
        var countHtml = countChoices.map(function (n) {
          var label = n === 'all' ? 'All ' + total : (n === 'custom' ? 'Custom' : n);
          return '<button class="pill-choice ' + (setupChoice.count === n ? 'active' : '') + '" data-count="' + n + '">' + label + '</button>';
        }).join('');
        var timeHtml = TIME_OPTIONS.map(function (t) {
          return '<button class="pill-choice ' + (setupChoice.timeLimit === t.value ? 'active' : '') + '" data-time="' + t.value + '">' + t.label + '</button>';
        }).join('') + '<button class="pill-choice ' + (setupChoice.timeLimit === 'custom' ? 'active' : '') + '" data-time="custom">Custom</button>';
        var customCountHtml = setupChoice.count === 'custom' ? '<div class="custom-setup-control"><label for="customCountInput">Questions</label><input id="customCountInput" type="number" min="1" max="' + total + '" value="' + esc(String(setupChoice.customCount || 50)) + '" inputmode="numeric"><span>of ' + total + '</span></div>' : '';
        var customTimeHtml = setupChoice.timeLimit === 'custom' ? '<div class="custom-setup-control"><label for="customTimeInput">Minutes</label><input id="customTimeInput" type="number" min="1" max="600" value="' + esc(String(setupChoice.customTime || 30)) + '" inputmode="numeric"><span>1–600 min</span></div>' : '';
        var typeHtml = '<button class="type-card ' + (setupChoice.quizType === 'practice' ? 'active' : '') + '" data-type="practice"><span class="tname">Practice</span><span class="tdesc">Instant answer and explanation after every question.</span></button><button class="type-card ' + (setupChoice.quizType === 'timed' ? 'active' : '') + '" data-type="timed"><span class="tname">Timed Test</span><span class="tdesc">Set a clock and work through your custom question set.</span></button>';
        app.innerHTML = rrTopBar('Back to home', '') + '<main id="mainContent" role="main" class="rr-setup"><h1 class="setup-chapname">Custom module</h1><p class="setup-sub">Choose questions from all ' + SUBJECT_INDEX.length + ' subjects and every topic.</p><div class="setup-section"><div class="setup-label">Quiz type</div><div class="type-grid" id="typeGrid">' + typeHtml + '</div></div><div class="setup-section"><div class="setup-label">Number of questions</div><div class="pill-row" id="countRow">' + countHtml + '</div>' + customCountHtml + '</div><div class="setup-section"><div class="setup-label">Time limit</div><div class="pill-row" id="timeRow">' + timeHtml + '</div>' + customTimeHtml + '</div><div class="setup-section"><div class="setup-label">Question order</div><div class="pill-row" id="orderRow"><button class="pill-choice ' + (setupChoice.orderMode === 'structured' ? 'active' : '') + '" data-order="structured">Structured</button><button class="pill-choice ' + (setupChoice.orderMode === 'shuffled' ? 'active' : '') + '" data-order="shuffled">Shuffled</button></div></div><div class="start-btn-wrap"><button class="btn start" id="startBtn">Start custom quiz</button></div></main>';
        wireTopBar(renderHome);
        wireRipples('.type-card, .pill-choice, .btn, .auth-btn');
        app.querySelectorAll('#typeGrid .type-card').forEach(function (btn) { btn.onclick = function () { setupChoice.quizType = btn.getAttribute('data-type'); renderCustomSetup(); }; });
        app.querySelectorAll('#countRow .pill-choice').forEach(function (btn) { btn.onclick = function () { var v = btn.getAttribute('data-count'); setupChoice.count = v === 'all' ? 'all' : (v === 'custom' ? 'custom' : parseInt(v, 10)); renderCustomSetup(); }; });
        app.querySelectorAll('#timeRow .pill-choice').forEach(function (btn) { btn.onclick = function () { var v = btn.getAttribute('data-time'); setupChoice.timeLimit = v === 'custom' ? 'custom' : parseInt(v, 10); renderCustomSetup(); }; });
        app.querySelectorAll('#orderRow .pill-choice').forEach(function (btn) { btn.onclick = function () { setupChoice.orderMode = btn.getAttribute('data-order'); renderCustomSetup(); }; });
        var countInput = document.getElementById('customCountInput'); if (countInput) countInput.onchange = function () { setupChoice.customCount = countInput.value; };
        var timeInput = document.getElementById('customTimeInput'); if (timeInput) timeInput.onchange = function () { setupChoice.customTime = timeInput.value; };
        document.getElementById('startBtn').onclick = function () { setupChoice.timeLimit = resolveSetupTime(); startQuiz(); };
      }

      function resolvePool(subjectId, moduleId) {
        var modules = getSubjectModules(subjectId);
        var subjMeta = SUBJECT_INDEX.find(function (s) { return s.subjectId === subjectId; });
        var subjName = subjMeta ? subjMeta.name : 'Subject';
        if (moduleId === 'all') {
          var totalQ = modules.reduce(function (acc, m) { return acc + (m.questionCount || 0); }, 0);
          var modDbIds = modules.map(function (m) { return m.id; });
          return {
            title: subjName + ' — All topics',
            questionCount: totalQ,
            moduleId: 'all',
            moduleDbIds: modDbIds,
            key: subjectId + ':all'
          };
        }
        var mod = modules.find(function (m) { return String(m.moduleId) === String(moduleId); });
        return {
          title: subjName + ' — ' + (mod ? mod.name : 'Topic'),
          questionCount: mod ? (mod.questionCount || 0) : 0,
          moduleId: mod ? mod.moduleId : moduleId,
          moduleDbId: mod ? mod.id : null,
          key: subjectId + ':' + moduleId
        };
      }

      // This topic's record from the answer history: answered, right on the
      // latest answer, missed on it, and not yet answered.
      function setupHistory(pool, total) {
        if (!pool || typeof pool.moduleDbId !== 'number' || !v2HaveHistory()) return null;
        var seen = 0, ok = 0;
        Object.keys(reviewData.q).forEach(function (k) {
          var e = reviewData.q[k];
          if (e.mod === pool.moduleDbId) { seen++; if (e.ok) ok++; }
        });
        seen = Math.min(seen, total);
        return { seen: seen, ok: ok, missed: seen - ok, unseen: Math.max(0, total - seen) };
      }

      function renderSetup(subjectId, moduleId) {
        state.idSet = null;
        if (!currentUser) loadGuestModules();
        if (!quizStylesReady) {
          ensureQuizStyles().then(function () { renderSetup(subjectId, moduleId); });
          return;
        }
        clearTimer();
        releaseQuizPayload();
        scrollToPageTop();
        state.screen = 'setup';
        app.classList.remove('screen-quiz');
        app.classList.add('screen-setup');
        state.subjectId = subjectId;
        state.moduleId = moduleId;
        trackPageView(practiceBasePath(), 'setup');
        var pool = resolvePool(subjectId, moduleId);
        setupChoice.pool = pool;
        var total = pool.questionCount;

        var countChoices = COUNT_OPTIONS.filter(function (n) { return n < total; }).concat(['all', 'custom']);
        if (setupChoice.count !== 'all' && setupChoice.count !== 'custom' && countChoices.indexOf(setupChoice.count) === -1) setupChoice.count = 'all';

        var typeHtml =
          '<button class="type-card ' + (setupChoice.quizType === 'practice' ? 'active' : '') + '" data-type="practice">' +
          '<span class="tname">Practice</span><span class="tdesc">See the correct answer and explanation right after each question.</span>' +
          '</button>' +
          '<button class="type-card ' + (setupChoice.quizType === 'timed' ? 'active' : '') + '" data-type="timed">' +
          '<span class="tname">Timed Test</span><span class="tdesc">Same instant feedback, but the clock is running — pick a time limit below.</span>' +
          '</button>';

        var countHtml = countChoices.map(function (n) {
          var label = n === 'all' ? 'All ' + total : (n === 'custom' ? 'Custom' : n);
          return '<button class="pill-choice ' + (setupChoice.count === n ? 'active' : '') + '" data-count="' + n + '">' + label + '</button>';
        }).join('');

        var timeHtml = TIME_OPTIONS.map(function (t) {
          return '<button class="pill-choice ' + (setupChoice.timeLimit === t.value ? 'active' : '') + '" data-time="' + t.value + '">' + t.label + '</button>';
        }).join('') + '<button class="pill-choice ' + (setupChoice.timeLimit === 'custom' ? 'active' : '') + '" data-time="custom">Custom</button>';
        var customCountHtml = setupChoice.count === 'custom' ? '<div class="custom-setup-control"><label for="customCountInput">Questions</label><input id="customCountInput" type="number" min="1" max="' + total + '" value="' + esc(String(setupChoice.customCount || 50)) + '" inputmode="numeric"><span>of ' + total + '</span></div>' : '';
        var customTimeHtml = setupChoice.timeLimit === 'custom' ? '<div class="custom-setup-control"><label for="customTimeInput">Minutes</label><input id="customTimeInput" type="number" min="1" max="600" value="' + esc(String(setupChoice.customTime || 30)) + '" inputmode="numeric"><span>1–600 min</span></div>' : '';

        var modules = getSubjectModules(subjectId);
        var modIndex = -1;
        if (moduleId !== 'all') {
          modIndex = modules.findIndex(function (m) { return String(m.moduleId) === String(moduleId); });
        }
        var isLocked = isModuleLocked(subjectId, moduleId, modIndex);

        // A signed-out visitor may start a guest module. guestCanStart also
        // rules out PYQ, whole-subject and custom pools.
        var guestOk = !currentUser && !isLocked && guestCanStart(pool);

        var startBtnLabel = isLocked
          ? 'Unlock with MedLadder Pro (₹' + PRO_CONFIG.PRICE_INR + ')'
          : ((currentUser || guestOk) ? 'Start quiz' : 'Sign in to start quiz');
        var startBtnClass = isLocked ? 'btn start btn-locked-pro' : 'btn start';

        var setupNoteHtml = isLocked
          ? '<p class="rr-note">This topic is part of MedLadder Pro. The first 8 topics in this subject are free.</p>'
          : (guestOk
            ? '<p class="rr-note">Free to try \u2014 no account needed. Sign in afterwards to keep your score and open the rest of this subject.</p>'
            : (!currentUser ? '<p class="rr-note">Sign in or create a free account to take quizzes and save test history. <button class="auth-link" id="setupAuthLink">Sign in / Register</button></p>' : ''));

        // pool.title is "Subject \u2014 Topic": the topic is the heading, the
        // subject goes in the breadcrumb.
        var titleParts = String(pool.title || '').split(' \u2014 ');
        var setupCrumb = titleParts.length > 1 ? titleParts[0] : '';
        var setupTitle = titleParts.length > 1 ? titleParts.slice(1).join(' \u2014 ') : pool.title;

        // One sentence stating what Start will do, so the settings can stay folded.
        var chosenCount = resolveSetupCount(total);
        var chosenTime = setupChoice.timeLimit === 'custom'
          ? (parseInt(setupChoice.customTime, 10) || 30) + ' minutes'
          : (setupChoice.timeLimit > 0
            ? (setupChoice.timeLimit >= 3600 ? (setupChoice.timeLimit / 3600) + (setupChoice.timeLimit === 3600 ? ' hour' : ' hours') : (setupChoice.timeLimit / 60) + ' minutes')
            : 'no time limit');
        var defaultsLine =
          (setupChoice.quizType === 'timed' ? 'Timed test' : 'Practice mode') + ', ' +
          (chosenCount === 'all' ? 'all ' + total + ' questions' : chosenCount + ' of ' + total + ' questions') + ', ' +
          chosenTime + ', ' +
          (setupChoice.orderMode === 'shuffled' ? 'shuffled' : 'topic order') + '.';

        // Which questions: all, only those not answered yet, or only those
        // missed on the latest try. Needs the answer history for this topic.
        if (setupChoice.whichKey !== pool.key) { setupChoice.which = 'all'; setupChoice.whichKey = pool.key; }
        var whichHtml = '';
        var hist = setupHistory(pool, total);
        if (hist && hist.seen > 0 && !isLocked) {
          if (setupChoice.which === 'unseen' && !hist.unseen) setupChoice.which = 'all';
          if (setupChoice.which === 'missed' && !hist.missed) setupChoice.which = 'all';
          var whichOpt = function (v, label, n) {
            return '<button class="pill-choice ' + (setupChoice.which === v ? 'active' : '') + '" data-which="' + v + '"' + (n === 0 ? ' disabled' : '') + '>' + label + ' ' + n + '</button>';
          };
          whichHtml = '<div class="setup-section"><div class="setup-label">Which questions</div><div class="pill-row" id="whichRow">' +
            whichOpt('all', 'All', total) + whichOpt('unseen', 'Not answered yet', hist.unseen) + whichOpt('missed', 'Missed last time', hist.missed) +
            '</div></div>';
          if (setupChoice.which !== 'all') {
            defaultsLine = defaultsLine.replace(/^([^,]+), [^,]+,/, '$1, ' + (setupChoice.which === 'unseen' ? hist.unseen + ' not answered yet' : hist.missed + ' missed last time') + ',');
          }
        } else if (currentUser && !v2HaveHistory()) {
          loadReviewData().then(function (rd) { if (rd && state.screen === 'setup' && state.moduleId === moduleId && state.subjectId === subjectId) renderSetup(subjectId, moduleId); });
        }

        var last = progress[pool.key];
        var lastRunHtml = (hist && hist.seen > 0)
          ? '<section class="rr-last"><div class="rr-eyebrow">Your record here</div>' +
            '<div class="rr-last-row"><span class="rr-last-num">' + hist.seen + '</span>' +
            '<span class="rr-last-of">of ' + total + ' answered \u00b7 ' + Math.round(100 * hist.ok / hist.seen) + '% correct on your latest answers</span></div></section>'
          : (last && last.done > 0)
          ? '<section class="rr-last"><div class="rr-eyebrow">Your last run</div>' +
            '<div class="rr-last-row"><span class="rr-last-num">' + (last.correct || 0) + '</span>' +
            '<span class="rr-last-of">correct of ' + last.done + ' answered</span></div></section>'
          : '';

        app.innerHTML =
          rrTopBar('Back to topics', setupCrumb) +
          '<main id="mainContent" role="main" class="rr-setup">' +
          '<h1 class="setup-chapname">' + esc(setupTitle) + '</h1>' +
          '<p class="setup-sub">' + total + ' questions, each with an explained answer.</p>' +
          '<div class="start-btn-wrap">' +
          '<button class="' + startBtnClass + '" id="startBtn">' + startBtnLabel + '</button>' +
          '</div>' +
          '<p class="rr-defaults">' + esc(defaultsLine) + '</p>' +
          setupNoteHtml +
          '<details class="rr-settings" id="setupSettings"' + (setupSettingsOpen ? ' open' : '') + '>' +
          '<summary><span>Change settings</span>' + RR_CHEVRON_SVG + '</summary>' +
          '<div class="rr-settings-body">' +
          whichHtml +
          '<div class="setup-section"><div class="setup-label">Quiz type</div><div class="type-grid" id="typeGrid">' + typeHtml + '</div></div>' +
          '<div class="setup-section"><div class="setup-label">Number of questions</div><div class="pill-row" id="countRow">' + countHtml + '</div>' + customCountHtml + '</div>' +
          '<div class="setup-section"><div class="setup-label">Time limit</div><div class="pill-row" id="timeRow">' + timeHtml + '</div>' + customTimeHtml + '</div>' +
          '<div class="setup-section"><div class="setup-label">Question order</div><div class="pill-row" id="orderRow">' +
          '<button class="pill-choice ' + (setupChoice.orderMode === 'structured' ? 'active' : '') + '" data-order="structured">Topic order</button>' +
          '<button class="pill-choice ' + (setupChoice.orderMode === 'shuffled' ? 'active' : '') + '" data-order="shuffled">Shuffled</button>' +
          '</div></div>' +
          '</div>' +
          '</details>' +
          lastRunHtml +
          '</main>';

        // Every choice re-renders this screen; remember whether the panel was
        // open so it does not snap shut under the user's finger.
        var settingsEl = document.getElementById('setupSettings');
        if (settingsEl) settingsEl.addEventListener('toggle', function () { setupSettingsOpen = settingsEl.open; });

        wireTopBar(function () { renderModuleList(subjectId); });
        wireRipples('.type-card, .pill-choice, .btn, .auth-btn');

        app.querySelectorAll('#typeGrid .type-card').forEach(function (btn) {
          btn.addEventListener('click', function () { setupChoice.quizType = btn.getAttribute('data-type'); renderSetup(subjectId, moduleId); });
        });
        app.querySelectorAll('#countRow .pill-choice').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var v = btn.getAttribute('data-count');
            setupChoice.count = (v === 'all') ? 'all' : (v === 'custom' ? 'custom' : parseInt(v, 10));
            renderSetup(subjectId, moduleId);
          });
        });
        app.querySelectorAll('#timeRow .pill-choice').forEach(function (btn) {
          btn.addEventListener('click', function () { var v = btn.getAttribute('data-time'); setupChoice.timeLimit = v === 'custom' ? 'custom' : parseInt(v, 10); renderSetup(subjectId, moduleId); });
        });
        app.querySelectorAll('#orderRow .pill-choice').forEach(function (btn) {
          btn.addEventListener('click', function () {
            setupChoice.orderMode = btn.getAttribute('data-order');
            renderSetup(subjectId, moduleId);
          });
        });
        app.querySelectorAll('#whichRow .pill-choice').forEach(function (btn) {
          btn.addEventListener('click', function () { setupChoice.which = btn.getAttribute('data-which'); renderSetup(subjectId, moduleId); });
        });
        document.getElementById('startBtn').addEventListener('click', function () {
          if (isLocked) {
            var modObj = modules.find(function (m) { return String(m.moduleId) === String(moduleId); });
            openProModal(moduleId === 'all' ? 'all_topics' : 'locked_module', {
              subjectId: subjectId,
              moduleId: moduleId,
              moduleName: modObj ? modObj.name : 'This Topic'
            });
            return;
          }
          setupChoice.timeLimit = resolveSetupTime();
          startQuiz();
        });

        var customCountInput = document.getElementById('customCountInput');
        if (customCountInput) customCountInput.onchange = function () { setupChoice.customCount = customCountInput.value; };
        var customTimeInput = document.getElementById('customTimeInput');
        if (customTimeInput) customTimeInput.onchange = function () { setupChoice.customTime = customTimeInput.value; };

        var setupAuthLink = document.getElementById('setupAuthLink');
        if (setupAuthLink) {
          setupAuthLink.addEventListener('click', function () {
            openAuthModal('signin', {
              reason: 'Sign in or register to start practicing questions and track your performance.',
              onSuccess: function () { renderSetup(subjectId, moduleId); }
            });
          });
        }
      }

      // ---------- SECURE SUPABASE QUESTION FETCH & QUIZ INITIALIZATION ----------
      function startQuiz() {
        if (quizLoadInFlight) return;
        var isCustom = state.moduleId === 'custom';
        var modules = isCustom ? [] : getSubjectModules(state.subjectId);
        var modIndex = -1;
        if (!isCustom && state.moduleId !== 'all') {
          modIndex = modules.findIndex(function (m) { return String(m.moduleId) === String(state.moduleId); });
        }
        if (!isCustom && isModuleLocked(state.subjectId, state.moduleId, modIndex)) {
          var modObj = modules.find(function (m) { return String(m.moduleId) === String(state.moduleId); });
          openProModal(state.moduleId === 'all' ? 'all_topics' : 'locked_module', {
            subjectId: state.subjectId,
            moduleId: state.moduleId,
            moduleName: modObj ? modObj.name : 'This Topic'
          });
          return;
        }

        if (!currentUser && !guestCanStart(setupChoice.pool)) {
          openAuthModal('signin', {
            reason: 'Please sign in or create an account to start practicing questions.',
            onSuccess: function () {
              startQuiz();
            }
          });
          return;
        }

        var pool = setupChoice.pool;
        // Remember that this run was started without an account, so renderQuiz
        // and anything after it do not have to re-derive eligibility from
        // setupChoice, which the user can change behind them.
        guestRunActive = !currentUser && guestCanStart(pool);
        quizLoadInFlight = true;
        beginAttemptLog(pool);

        // Show loading screen while fetching from Supabase
        app.innerHTML =
          rrLoadingHtml('Back to setup', esc(pool.title), 'Loading ' + (resolveSetupCount(pool.questionCount) === 'all' ? '' : resolveSetupCount(pool.questionCount) + ' ') + 'questions');
        wireTopBar(function () { isCustom ? renderCustomSetup() : renderSetup(state.subjectId, state.moduleId || 'all'); });

        // Build Supabase Query
        var query = supabaseClient.from('questions').select('id,question_num,question_text,option_a,option_b,option_c,option_d,option_e,answer,explanation,module_id');
        if (pool.moduleId === 'all' || pool.moduleId === 'custom') {
          query = query.in('module_id', pool.moduleDbIds);
        } else {
          query = query.eq('module_id', pool.moduleDbId);
        }
        // Avoid pulling the entire multi-subject bank into a mobile browser
        // when a finite custom set was requested. A small oversample preserves
        // variety before the client applies shuffle/order and the final count.
        if (pool.moduleId === 'custom' || pool.moduleId === 'all') {
          var requestedCustomCount = resolveSetupCount(pool.questionCount);
          if (requestedCustomCount !== 'all') {
            query = query.limit(Math.min(1000, Math.max(requestedCustomCount, requestedCustomCount * 3)));
          }
        }

        query.order('id', { ascending: true }).then(function (res) {
          quizLoadInFlight = false;
          if (res.error) throw res.error;
          var rows = res.data || [];
          if (rows.length === 0) {
            app.innerHTML =
              topBar('Back to setup', function () { isCustom ? renderCustomSetup() : renderSetup(state.subjectId, state.moduleId || 'all'); }) +
              '<main id="mainContent" role="main">' +
              '<div style="max-width:500px;margin:60px auto;text-align:center;padding:28px;" class="glass">' +
              '<div style="font-size:24px;margin-bottom:8px;">⚠️</div>' +
              '<div style="font-size:17px;font-weight:700;margin-bottom:10px;">Questions unavailable</div>' +
              '<p style="font-size:13px;color:var(--ink-soft);line-height:1.5;">We couldn\'t load the questions for this topic right now. Please try again in a moment' + (isUserPro(currentUser) ? ', or contact support if it keeps happening.' : ', or check whether this topic is part of MedLadder Pro.') + '</p>' +
              '<button class="btn" id="retryFetchBtn" style="margin-top:10px;">Retry loading</button>' +
              '</div>' +
              '</main>';
            wireTopBar(function () { isCustom ? renderCustomSetup() : renderSetup(state.subjectId, state.moduleId || 'all'); });
            var retryBtn = document.getElementById('retryFetchBtn');
            if (retryBtn) retryBtn.onclick = function () { startQuiz(); };
            return;
          }

          if (setupChoice.which && setupChoice.which !== 'all' && setupChoice.whichKey === pool.key && v2HaveHistory()) {
            var wantMissed = setupChoice.which === 'missed';
            var kept = rows.filter(function (r) {
              var e = reviewData.q[r.id];
              return wantMissed ? (e && !e.ok) : !e;
            });
            if (kept.length) rows = kept;
            else showToast(wantMissed ? 'Nothing missed here \u2014 starting all questions.' : 'You have answered every question \u2014 starting all of them.');
          }
          var idxs = rows.map(function (q, i) { return i; });
          var picked = (setupChoice.orderMode === 'shuffled') ? shuffle(idxs) : idxs.slice();
          var selectedCount = resolveSetupCount(rows.length);
          if (selectedCount !== 'all') picked = picked.slice(0, selectedCount);
          var selectedRows = picked.map(function (questionIndex) { return rows[questionIndex]; });
          rows = null;

          return loadQuestionImages(selectedRows).then(function (imageRows) {
            var imagesByQuestion = {};
            imageRows.forEach(function (image) {
              var key = String(image.question_id);
              if (!imagesByQuestion[key]) imagesByQuestion[key] = { question_text: [], explanation: [] };
              if (image.content_field && imagesByQuestion[key][image.content_field]) {
                imagesByQuestion[key][image.content_field].push(image);
              }
            });

            // Map rows from Supabase into MedLadder question schema
            var fetchedQuestions = selectedRows.map(function (r) {
              var opts = {};
              if (r.option_a) opts.A = r.option_a;
              if (r.option_b) opts.B = r.option_b;
              if (r.option_c) opts.C = r.option_c;
              if (r.option_d) opts.D = r.option_d;
              if (r.option_e) opts.E = r.option_e;

              return {
                id: r.id,
                moduleId: r.module_id,
                num: String(r.id || r.question_num),
                question: r.question_text || '',
                options: opts,
                answer: r.answer || 'A',
                explanation: r.explanation || '',
                questionImages: (imagesByQuestion[String(r.id)] || {}).question_text || [],
                explanationImages: (imagesByQuestion[String(r.id)] || {}).explanation || []
              };
            });
            var orderIndices = fetchedQuestions.map(function (q, i) { return i; });
            selectedRows = null;

            state = {
              screen: 'quiz', subjectId: state.subjectId, moduleId: state.moduleId, poolTitle: pool.title, questions: fetchedQuestions,
              order: orderIndices, idx: 0, answers: {}, quizType: setupChoice.quizType, timeLimit: setupChoice.timeLimit,
              remaining: setupChoice.timeLimit, timerId: null, progressKey: pool.key
            };

          scrollToPageTop();
          renderQuiz();
          prefetchBookmarks();
          trackEvent('quiz_start', {
            subject_id: state.subjectId,
            module_id: state.moduleId,
            quiz_type: setupChoice.quizType,
            question_count: picked.length,
            pool_title: pool.title,
            is_pyq: !!state.isPyqMode
          });
          if (state.timeLimit > 0) startOverallTimer();

          });

        }).catch(function (err) {
          quizLoadInFlight = false;
          console.error('Fetch questions error:', err, err && err.status, err && err.code);

          // A signed-out visitor can still be carrying a dead session: if a
          // refresh token in localStorage has expired, supabase-js restores it
          // and sends it as Authorization, and PostgREST answers 401 even
          // though the anon key alone is accepted (verified: the same query
          // returns rows against /rest/v1 with only the publishable key).
          // currentUser is null in that state, so the UI says "signed out"
          // while every query fails. Clear the local session once, retry clean.
          var authish = err && (err.status === 401 || err.code === 'PGRST301' ||
            /jwt|token|unauthor/i.test(String(err.message || '')));
          if (!currentUser && authish && !guestAuthRetry && supabaseClient && supabaseClient.auth) {
            guestAuthRetry = true;
            // Never sign out here. currentUser is set asynchronously, so a
            // genuinely signed-in user can reach this branch before it is
            // populated, and signing out would end their session on every
            // device over a failed question fetch. Confirm with the client
            // that there is no live session, then drop only the cached token.
            try {
              Promise.resolve(supabaseClient.auth.getSession())
                .then(function (res) {
                  var sess = res && res.data && res.data.session;
                  var exp = sess && sess.expires_at;
                  var live = !!(sess && sess.user) &&
                    (!exp || (exp * 1000) > Date.now());
                  if (live) {
                    // Real session; the 401 is not a stale-token problem.
                    showToast('Failed to load questions: ' + (err.message || err), 'error');
                    renderSetup(state.subjectId, state.moduleId || 'all');
                    return;
                  }
                  console.warn('dropping a stale cached session, retrying as anon');
                  try {
                    Object.keys(window.localStorage || {}).forEach(function (k) {
                      if (/^sb-.*-auth-token$/.test(k)) window.localStorage.removeItem(k);
                    });
                  } catch (e) { /* storage blocked; the retry may still work */ }
                  startQuiz();
                })
                .catch(function () { startQuiz(); });
            } catch (e) { startQuiz(); }
            return;
          }

          showToast('Failed to load questions: ' + (err.message || err), 'error');
          if (state.isPyqMode && state.pyqExam) {
            renderPYQSetup(state.pyqExam);
          } else if (state.moduleId === 'custom') {
            renderCustomSetup();
          } else {
            renderSetup(state.subjectId, state.moduleId || 'all');
          }
        });
      }

      function startOverallTimer() {
        clearTimer();
        updateTimerBadge();
        state.endTime = Date.now() + (state.remaining * 1000);
        state.timerId = setInterval(function () {
          var now = Date.now();
          state.remaining = Math.max(0, Math.ceil((state.endTime - now) / 1000));
          updateTimerBadge();
          if (state.remaining <= 0) { clearTimer(); finishDueToTimeout(); }
        }, 1000);
      }
      function updateTimerBadge() {
        var el = document.getElementById('timerBadge');
        if (!el) return;
        var totalSec = Math.max(0, state.remaining);
        var h = Math.floor(totalSec / 3600);
        var m = Math.floor((totalSec % 3600) / 60);
        var s = totalSec % 60;
        var pad = function (n) { return (n < 10 ? '0' : '') + n; };
        if (h > 0) {
          el.textContent = '⏱ ' + h + ':' + pad(m) + ':' + pad(s);
        } else {
          el.textContent = '⏱ ' + pad(m) + ':' + pad(s);
        }
        el.classList.toggle('low', totalSec <= 60);
      }
      function finishDueToTimeout() {
        var q = currentQuestion();
        if (q) {
          var qKey = String(q.id || q.num);
          if (!state.answers[qKey]) state.answers[qKey] = { picked: null, isCorrect: false, skipped: true };
        }
        renderResults(true);
      }
      function currentQuestion() { return state.questions[state.order[state.idx]]; }

      // Cleanly release active zoom modal before rendering new question.
      function releaseQuestionImages() {
        closeExhibitZoom();
      }

      function commitAndAdvance() {
        if (state.idx + 1 < state.order.length) { state.idx++; renderQuiz(); }
        else { clearTimer(); renderResults(); }
      }

      function renderQuiz() {
        // The quiz stylesheet is switched on by the setup screens. A quiz
        // reached without passing through one (bookmarks, opened from home)
        // would otherwise render the new markup with no styles at all.
        if (!quizStylesReady) { ensureQuizStyles().then(renderQuiz); return; }
        if (!currentUser && !guestRunActive) {
          openAuthModal('signin', {
            reason: 'Please sign in or create an account to view and solve questions.'
          });
          renderSetup(state.subjectId, state.moduleId || 'all');
          return;
        }

        state.screen = 'quiz';
        if (!state.startedAt) state.startedAt = Date.now();
        setTimeout(function () { try { applyPeerStats(); } catch (e) { } }, 0);
        trackPageView(practiceBasePath() + '/quiz', 'quiz');
        if (app) {
          app.classList.remove('screen-setup', 'screen-results');
          app.classList.add('screen-quiz');
        }

        var q = currentQuestion();
        if (!q) {
          clearTimer();
          renderResults();
          return;
        }
        var qKey = String(q.id || q.num);
        var total = state.order.length;
        var answeredCount = Object.keys(state.answers).length;
        var correctSoFar = Object.values(state.answers).filter(function (a) { return a.isCorrect; }).length;
        var existing = state.answers[qKey];
        var reveal = !!existing;
        var lockedOptions = !!existing;

        var letters = ['A', 'B', 'C', 'D', 'E'];
        var optsHtml = letters.filter(function (L) { return q.options[L]; }).map(function (L, i) {
          var cls = 'opt';
          if (reveal) {
            cls += ' locked';
            if (L === q.answer) cls += ' correct';
            else if (existing && L === existing.picked) cls += ' incorrect';
            else cls += ' dim';
          }
          var delay = reveal ? '0s' : (i * 0.04) + 's';
          return '<button class="' + cls + '" data-letter="' + L + '" style="animation-delay:' + delay + '" ' + (lockedOptions ? 'disabled' : '') + '>' +
            '<span class="letter">' + L + '</span><span>' + esc(q.options[L] || '') + '</span>' +
            '</button>';
        }).join('');

        var explainHtml = '';
        if (reveal) {
          explainHtml = '<div class="explain show"><span class="exlabel">Rationale</span>' +
            (q.explanation ? formatExplanation(q.explanation, q.explanationImages) : '<span class="no-explain">No explanation was captured for this item in the source text.</span>') +
            (existing && existing.skipped ? '<div class="skip-tag">Time ran out before you answered.</div>' : '') +
            '</div>';
        }

        var timerHtml = state.timeLimit > 0 ? '<span class="timer-badge" id="timerBadge">--:--</span>' : '';
        var isLast = state.idx + 1 >= total;
        var backFn = state.idSet ? state.idSet.back : state.isPyqMode ? function () { renderPYQSetup(state.pyqExam); } : (state.moduleId === 'bookmarks' ? function () { renderBookmarks(); } : (state.moduleId === 'custom' ? function () { renderCustomSetup(); } : function () { renderModuleList(state.subjectId); }));

        // One tick per question. On a phone they are the thin ladder under the
        // counter; on a wide screen the same elements become the numbered grid
        // in the left rail.
        var wrongSoFar = answeredCount - correctSoFar;
        var ticksHtml = state.order.map(function (qi, i) {
          var tq = state.questions[qi];
          var ta = tq ? state.answers[String(tq.id || tq.num)] : null;
          return '<i class="tick' + (ta ? (ta.isCorrect ? ' ok' : ' bad') : '') + (i === state.idx ? ' cur' : '') + '" data-jump="' + i + '" role="button" tabindex="-1" aria-label="Question ' + (i + 1) + (ta ? (ta.isCorrect ? ', correct' : ', wrong') : '') + '">' + (i + 1) + '</i>';
        }).join('');
        var ladderDensity = total <= 40 ? 'sparse' : (total <= 110 ? 'mid' : 'dense');
        var quizCrumb = String(state.poolTitle || '').replace(' \u2014 ', ' / ');
        var railParts = String(state.poolTitle || '').split(' \u2014 ');

        releaseQuestionImages();
        app.innerHTML =
          rrTopBar('Back', quizCrumb) +
          '<main id="mainContent" role="main" class="rr-quiz">' +
          '<aside class="rr-rail">' +
          (railParts.length > 1 ? '<div class="rr-rail-sub">' + esc(railParts[0]) + '</div>' : '') +
          '<div class="rr-rail-title">' + esc(railParts.length > 1 ? railParts.slice(1).join(' \u2014 ') : state.poolTitle) + '</div>' +
          '<div class="rr-meta">' +
          '<h1 class="rr-count">Question ' + (state.idx + 1) + ' of ' + total + '</h1>' +
          '<span class="rr-score">' + timerHtml + '<span id="scoreText">' + correctSoFar + ' correct</span></span>' +
          '</div>' +
          '<div class="rr-ladder rr-ladder-' + ladderDensity + '" id="rrLadder" role="img" aria-label="' + correctSoFar + ' correct, ' + wrongSoFar + ' incorrect, ' + (total - answeredCount) + ' remaining">' + ticksHtml + '</div>' +
          '<div class="rr-legend"><span class="ok">Correct</span><span class="bad">Missed</span></div>' +
          '</aside>' +
          '<section class="rr-q">' +
          '<div class="qtext">' + renderQuestionContent(q.question || '', q.questionImages) + '</div>' +
          '<div class="options">' + optsHtml + '</div>' +
          '</section>' +
          '<aside class="rr-rationale" id="rrRationale" aria-live="polite">' +
          (explainHtml || '<p class="rr-await">Answer to see the rationale.</p>') +
          '</aside>' +
          '<div class="quiz-actions rr-actions">' +
          (q.id ? '<button class="rr-text-btn" id="flagBtn" data-qid="' + q.id + '">Flag</button>' : '<span></span>') +
          '<div class="quiz-shortcuts-hint rr-keys">Keys <strong>1\u20134</strong> or <strong>A\u2013D</strong> \u00b7 <strong>Enter</strong> to advance</div>' +
          '<div class="rr-actions-right">' +
          (q.id ? '<button class="rr-icon-btn bm-btn' + (isBookmarked(q.id) ? ' active' : '') + '" id="bookmarkBtn" data-qid="' + q.id + '" aria-pressed="' + (isBookmarked(q.id) ? 'true' : 'false') + '" aria-label="' + (isBookmarked(q.id) ? 'Remove bookmark' : 'Bookmark this question') + '">' + RR_BOOKMARK_SVG + '</button>' : '') +
          '<button class="btn" id="nextBtn" ' + (existing ? '' : 'disabled') + '>' + (isLast ? 'See results' : 'Next question') + '</button>' +
          '</div>' +
          '</div>' +
          '</main>';

        wireTopBar(backFn);
        app.querySelectorAll('#rrLadder .tick[data-jump]').forEach(function (t) {
          t.addEventListener('click', function () {
            var to = parseInt(t.getAttribute('data-jump'), 10);
            if (!isFinite(to) || to === state.idx) return;
            state.idx = to;
            scrollToPageTop();
            renderQuiz();
          });
        });
        if (state.timeLimit > 0) updateTimerBadge();

        var explainBox = app.querySelector('.explain');
        if (explainBox) {
          explainBox.addEventListener('click', function (e) {
            var target = e.target;
            if (target && (target.tagName === 'A' || target.closest('a'))) {
              e.preventDefault();
              e.stopPropagation();
            }
          });
        }

        app.querySelectorAll('.opt').forEach(function (btn) {
          btn.addEventListener('click', function () {
            if (state.answers[qKey]) return;
            var L = btn.getAttribute('data-letter');
            var answer = { picked: L, isCorrect: L === q.answer };
            state.answers[qKey] = answer;

            // 1) Instant visual feedback + unlock Next first, so a failure in any
            //    later (non-essential) step can never leave the quiz looking frozen.
            app.querySelectorAll('.opt').forEach(function (option) {
              var optionLetter = option.getAttribute('data-letter');
              option.disabled = true;
              option.classList.add('locked');
              if (optionLetter === q.answer) option.classList.add('correct');
              else if (optionLetter === answer.picked) option.classList.add('incorrect');
              else option.classList.add('dim');
            });
            var nextButton = document.getElementById('nextBtn');
            if (nextButton) nextButton.disabled = false;

            var correctNow = Object.values(state.answers).filter(function (item) { return item.isCorrect; }).length;
            var scoreText = document.getElementById('scoreText');
            if (scoreText) scoreText.textContent = correctNow + ' correct';
            var curTick = app.querySelector('#rrLadder .tick.cur');
            if (curTick) curTick.classList.add(answer.isCorrect ? 'ok' : 'bad');

            // 2) Explanation, guarded so bad editorial HTML cannot break the tap.
            try {
              var explanationHtml = '<div class="explain show"><span class="exlabel">Rationale</span>' +
                (q.explanation ? formatExplanation(q.explanation, q.explanationImages) : '<span class="no-explain">No explanation was captured for this item in the source text.</span>') +
                '</div>';
              var rationaleHolder = document.getElementById('rrRationale');
              if (rationaleHolder && !app.querySelector('.explain')) rationaleHolder.innerHTML = explanationHtml;
              var explanationBox = app.querySelector('.explain');
              if (explanationBox) {
                explanationBox.addEventListener('click', function (event) {
                  var target = event.target;
                  if (target && (target.tagName === 'A' || target.closest('a'))) {
                    event.preventDefault();
                    event.stopPropagation();
                  }
                });
              }
            } catch (err) {
              console.warn('Explanation render failed:', err);
            }
            try { applyPeerStats(); } catch (err) { }

            // 3) Persistence (localStorage + Supabase) deferred off the tap's critical path.
            setTimeout(function () {
              try { saveProgress(); } catch (err) { console.warn('saveProgress failed:', err); }
              try { logAnswer(q, answer); } catch (err) { console.warn('logAnswer failed:', err); }
              try { v2NoteLive(q, answer); } catch (err) { }
            }, 0);
          });
        });
        document.getElementById('nextBtn').addEventListener('click', function () { commitAndAdvance(); });
        var bookmarkBtn = document.getElementById('bookmarkBtn');
        if (bookmarkBtn) bookmarkBtn.addEventListener('click', function () { toggleBookmark(q); });
        var flagBtn = document.getElementById('flagBtn');
        if (flagBtn) flagBtn.addEventListener('click', function () { openFlagDialog(q.id); });

        // Warm the explanation images while the user reads, so revealing the
        // answer doesn't trigger a big network fetch + decode at tap time.
        if (!debugNoQuestionImages && !existing && q.explanation) {
          var warm = function () {
            try {
              var urls = [];
              (q.explanationImages || []).forEach(function (im) { var u = storageImageUrl(im); if (u) urls.push(u); });
              var m, re = /<img[^>]+src=["']([^"']+)["']/gi;
              while ((m = re.exec(String(q.explanation))) && urls.length < 4) { if (/^https?:\/\//i.test(m[1])) urls.push(optimizeQuestionImageUrl(m[1])); }
              urls.slice(0, 3).forEach(function (u) {
                var img = new Image();
                img.decoding = 'async';
                img.src = u;
                if (img.decode) img.decode().catch(function () {});
              });
            } catch (_) {}
          };
          if (window.requestIdleCallback) requestIdleCallback(warm, { timeout: 2500 }); else setTimeout(warm, 800);
        }

        // Desktop keyboard shortcut handler
        if (state._quizKeyHandler) {
          window.removeEventListener('keydown', state._quizKeyHandler);
        }
        state._quizKeyHandler = function (e) {
          if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) return;
          var key = e.key ? e.key.toUpperCase() : '';
          var map = { '1': 'A', '2': 'B', '3': 'C', '4': 'D', '5': 'E' };
          var letter = map[key] || (['A', 'B', 'C', 'D', 'E'].indexOf(key) !== -1 ? key : null);
          if (letter && !state.answers[qKey]) {
            var optBtn = app.querySelector('.opt[data-letter="' + letter + '"]');
            if (optBtn && !optBtn.disabled) {
              e.preventDefault();
              optBtn.click();
            }
          } else if (e.key === 'Enter') {
            var nextBtn = document.getElementById('nextBtn');
            if (nextBtn && !nextBtn.disabled) {
              e.preventDefault();
              nextBtn.click();
            }
          }
        };
        window.addEventListener('keydown', state._quizKeyHandler);
      }

      function saveProgress() {
        // Sets built from question ids span topics; per-topic progress comes
        // from the answers themselves (attempt_answers), not from this map.
        if (state.idSet) return;
        var answered = Object.keys(state.answers).length;
        var correct = Object.values(state.answers).filter(function (a) { return a.isCorrect; }).length;
        var total = state.order.length;
        // Update local map
        progress[state.progressKey] = { done: answered, correct: correct, total: total };
        persistProgress();
        // Persist to Supabase after a short quiet period so rapid mobile taps do
        // not create a burst of overlapping writes.
        if (progressSaveTimer) clearTimeout(progressSaveTimer);
        // Bookmarked practice is not tied to a module: keep it out of the
        // module-progress table entirely (local progress map only).
        if (state.progressKey === 'bookmarks') return;
        var saveKey = state.progressKey;
        progressSaveTimer = setTimeout(function () {
          progressSaveTimer = null;
          saveModuleProgressToDB(saveKey, answered, correct, total);
        }, 350);
      }

      // ---------- BOOKMARKS + FLAGS (practice quiz) ----------
      function bookmarksHomeCardHtml() {
        return '<div class="custom-module-card" id="bookmarksHomeCard" role="button" tabindex="0">' +
          '<span class="custom-module-icon">🔖</span>' +
          '<span class="custom-module-copy"><strong>Bookmarks</strong></span>' +
          '<span class="custom-module-arrow">›</span>' +
          '</div>';
      }

      function isBookmarked(id) {
        return !!(state.bookmarkedIds && state.bookmarkedIds[id]);
      }

      // Module id → { subject, topic } from the baked syllabus data.
      // Used instead of querying the modules/subjects tables: the app's
      // key cannot read those tables (RLS returns []), which is why
      // every bookmark previously showed 'Question bank'.
      var _bookmarkModuleMap = null;
      function bookmarkModuleMap() {
        if (_bookmarkModuleMap) return _bookmarkModuleMap;
        var map = {};
        if (typeof SYLLABUS !== 'undefined' && Array.isArray(SYLLABUS)) {
          SYLLABUS.forEach(function (s) {
            (s.modules || []).forEach(function (mod) {
              map[mod.id] = { subject: s.name, topic: mod.name };
            });
          });
        }
        _bookmarkModuleMap = map;
        return map;
      }

      // Where a bookmark belongs, best source first: the question's own
      // module (live truth, survives admin reassigns), then single-topic
      // quiz context, then subject only. Nulls mean 'unknown', not an error.
      function resolveBookmarkLocation(q) {
        if (q && q.moduleId !== null && q.moduleId !== undefined) {
          var hit = bookmarkModuleMap()[q.moduleId];
          if (hit) return hit;
        }
        if (state.moduleId !== 'bookmarks' && setupChoice && setupChoice.pool &&
            setupChoice.pool.moduleDbId) {
          var hit2 = bookmarkModuleMap()[setupChoice.pool.moduleDbId];
          if (hit2) return hit2;
        }
        if (state.subjectId && typeof SUBJECT_INDEX !== 'undefined') {
          for (var i = 0; i < SUBJECT_INDEX.length; i++) {
            if (SUBJECT_INDEX[i].subjectId === state.subjectId) {
              return { subject: SUBJECT_INDEX[i].name, topic: null };
            }
          }
        }
        return { subject: null, topic: null };
      }

      // Non-essential fetch: never blocks the quiz render. When it lands it
      // only flips the current question's button if the quiz is unchanged.
      // How other students answered: shown under each option once a question
      // is answered, when at least 5 students have answered it.
      var peerStats = {};
      function prefetchPeerStats() {
        if (!currentUser || !supabaseClient || !state.questions) return;
        var ids = state.questions.map(function (q) { return Number(q.id); })
          .filter(function (n) { return n > 0 && !peerStats[n]; }).slice(0, 200);
        if (!ids.length) { applyPeerStats(); return; }
        try {
          supabaseClient.rpc('question_answer_stats', { p_ids: ids }).then(function (res) {
            if (res && res.error) return;
            ((res && res.data) || []).forEach(function (r) {
              var e = peerStats[r.question_id] || (peerStats[r.question_id] = { total: Number(r.total) || 0, by: {} });
              e.by[String(r.picked_option || '').toUpperCase()] = Number(r.n) || 0;
            });
            ids.forEach(function (id) { if (!peerStats[id]) peerStats[id] = { total: 0, by: {} }; });
            applyPeerStats();
          }, function () {});
        } catch (e) { }
      }
      function applyPeerStats() {
        if (state.screen !== 'quiz' || !app) return;
        var q = currentQuestion();
        if (!q) return;
        var st = peerStats[Number(q.id)];
        if (!st || st.total < 5) return;
        var opts = app.querySelectorAll('.options .opt.locked[data-letter]');
        if (!opts.length) return;
        opts.forEach(function (b) {
          if (b.querySelector('.rr-peer')) return;
          var share = Math.round((100 * (st.by[b.getAttribute('data-letter')] || 0)) / st.total);
          var bar = document.createElement('span');
          bar.className = 'rr-peer-bar';
          bar.setAttribute('aria-hidden', 'true');
          bar.style.width = share + '%';
          b.insertBefore(bar, b.firstChild);
          var sp = document.createElement('span');
          sp.className = 'rr-peer';
          sp.textContent = share + '%';
          // Before the text span: the CORRECT / YOUR ANSWER label hangs off
          // the option's last span.
          b.insertBefore(sp, b.lastElementChild);
        });
        var rh = document.getElementById('rrRationale');
        if (rh && !rh.querySelector('.rr-peer-line')) {
          var p = document.createElement('p');
          p.className = 'rr-peer-line';
          p.textContent = Math.round((100 * (st.by[q.answer] || 0)) / st.total) + '% of ' + st.total + ' MedLadder students got this right on their first try. The figure beside each option is how many chose it.';
          rh.insertBefore(p, rh.firstChild);
        }
      }

      function prefetchBookmarks() {
        try { prefetchPeerStats(); } catch (e) { }
        if (!currentUser || !supabaseClient || !state.questions) return;
        var key = state.progressKey;
        var ids = state.questions.map(function (q) { return q.id; })
          .filter(function (id) { return id !== null && id !== undefined; });
        if (!ids.length) return;
        supabaseClient.from('user_bookmarks').select('question_id')
          .eq('user_id', currentUser.id).in('question_id', ids)
          .then(function (res) {
            if (res.error || !res.data || state.progressKey !== key) return;
            var map = {};
            res.data.forEach(function (row) { map[row.question_id] = true; });
            state.bookmarkedIds = map;
            refreshBookmarkBtn();
          }).catch(function () {});
      }

      function refreshBookmarkBtn() {
        var btn = document.getElementById('bookmarkBtn');
        if (!btn || !state.questions) return;
        var q = currentQuestion();
        if (!q || String(btn.getAttribute('data-qid')) !== String(q.id)) return;
        var saved = isBookmarked(q.id);
        btn.classList.toggle('active', saved);
        btn.setAttribute('aria-pressed', saved ? 'true' : 'false');
        btn.setAttribute('aria-label', saved ? 'Remove bookmark' : 'Bookmark this question');
      }

      function toggleBookmark(q) {
        if (!currentUser || !supabaseClient || !q || !q.id) return;
        var questionId = q.id;
        if (!state.bookmarkedIds) state.bookmarkedIds = {};
        var saved = isBookmarked(questionId);
        if (saved) delete state.bookmarkedIds[questionId];
        else state.bookmarkedIds[questionId] = true;
        refreshBookmarkBtn();
        var done = function (res) {
          if (res.error) {
            if (saved) state.bookmarkedIds[questionId] = true;
            else delete state.bookmarkedIds[questionId];
            refreshBookmarkBtn();
            showToast('Could not update bookmark — please retry.');
          } else if (!saved) {
            showToast('Bookmarked — find it under My bookmarks on the home screen.');
          }
        };
        if (saved) {
          supabaseClient.from('user_bookmarks').delete()
            .eq('user_id', currentUser.id).eq('question_id', questionId).then(done);
          return;
        }
        var loc = resolveBookmarkLocation(q);
        var payload = {
          user_id: currentUser.id, question_id: questionId,
          subject_name: loc.subject, topic_name: loc.topic
        };
        supabaseClient.from('user_bookmarks').insert(payload).then(function (res) {
          // The subject/topic columns arrive via a second migration: if a
          // deploy lands before it runs, retry without them instead of
          // failing the save.
          if (res.error && /subject_name|topic_name/.test(res.error.message || '')) {
            supabaseClient.from('user_bookmarks')
              .insert({ user_id: currentUser.id, question_id: questionId }).then(done);
          } else {
            done(res);
          }
        });
      }

      function closeFlagDialog() {
        var d = document.getElementById('flagDialog');
        if (d && d.parentNode) d.parentNode.removeChild(d);
      }

      function openFlagDialog(questionId) {
        if (!currentUser || !questionId) return;
        closeFlagDialog();
        var overlay = document.createElement('div');
        overlay.className = 'bm-modal-overlay';
        overlay.id = 'flagDialog';
        overlay.innerHTML = '<div class="bm-modal glass">' +
          '<h3>🚩 Flag this question</h3>' +
          '<p class="bm-hint">Tell the admin what is wrong. Your report goes to the review queue.</p>' +
          '<label>Reason<select id="flagReason">' +
          '<option value="wrong_key">Wrong answer key</option>' +
          '<option value="wrong_explanation">Wrong explanation</option>' +
          '<option value="wrong_location">Wrong subject or topic</option>' +
          '<option value="unclear">Unclear or incorrect question</option>' +
          '<option value="other">Something else</option>' +
          '</select></label>' +
          '<label>Details (optional)<textarea id="flagDetail" rows="3" placeholder="e.g. The correct answer should be B because…"></textarea></label>' +
          '<div class="bm-modal-actions">' +
          '<button class="btn secondary" id="flagCancel">Cancel</button>' +
          '<button class="btn" id="flagSubmit">Send report</button>' +
          '</div></div>';
        document.body.appendChild(overlay);
        overlay.addEventListener('click', function (e) {
          if (e.target === overlay) closeFlagDialog();
        });
        document.getElementById('flagCancel').addEventListener('click', closeFlagDialog);
        document.getElementById('flagSubmit').addEventListener('click', function () {
          var reason = document.getElementById('flagReason').value;
          var detail = document.getElementById('flagDetail').value.trim();
          supabaseClient.from('question_flags').insert({
            question_id: questionId, user_id: currentUser.id,
            reason: reason, detail: detail
          }).then(function (res) {
            closeFlagDialog();
            if (res.error) {
              if (res.error.code === '23505' ||
                  /duplicate/i.test(res.error.message || '')) {
                showToast('You already flagged this question — it is under review.');
              } else {
                showToast('Could not send report — please retry.');
              }
              return;
            }
            showToast('Report sent — thank you. The admin will review it.');
          });
        });
      }

      function stripHtmlPreview(text, maxLen) {
        var plain = String(text || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        return plain.length > maxLen ? plain.slice(0, maxLen) + '…' : plain;
      }

      // ---------- MY PROGRESS (dashboard) ----------
      // Built from the progress map already loaded for the signed-in user
      // (module_progress: the latest run of every topic), so it costs no extra
      // query. Recent sessions come from the attempts table.
      var DASH_MIN_SUBJECT = 10;  // answers before a subject is ranked
      var DASH_MIN_TOPIC = 5;     // answers before a topic can be flagged

      // The progress map holds each topic's most recent run only, so an
      // unfinished retry hides everything answered before it. Where the
      // answer history is loaded, count from it instead: each question once,
      // scored on the latest answer to it.
      function v2EffectiveProgress() {
        var ep = Object.assign({}, progress);
        if (!v2HaveHistory()) return ep;
        var ix = v2Index(reviewData);
        var idx = v2ModIndex();
        Object.keys(ix.byMod).forEach(function (mid) {
          var info = idx[mid];
          var b = ix.byMod[mid];
          if (!info || !b.seen) return;
          var key = info.sx.subjectId + ':' + info.m.moduleId;
          var p = ep[key];
          if (!p || b.seen >= (p.done || 0)) ep[key] = { done: b.seen, correct: b.ok, total: info.m.questionCount };
        });
        return ep;
      }

      function dashboardData(src) {
        src = src || progress;
        var subjects = {};
        SUBJECT_INDEX.forEach(function (sx) {
          subjects[String(sx.subjectId)] = { subjectId: sx.subjectId, name: sx.name, done: 0, correct: 0, topics: 0 };
        });
        var out = { done: 0, correct: 0, topicsStarted: 0, pyqDone: 0, pyqCorrect: 0, topics: [] };
        Object.keys(src).forEach(function (k) {
          var p = src[k];
          if (!p || !p.done) return;
          var done = p.done || 0;
          var correct = Math.min(p.correct || 0, done);
          out.done += done;
          out.correct += correct;
          var parts = String(k).split(':');
          if (parts[0] === 'pyq') { out.pyqDone += done; out.pyqCorrect += correct; return; }
          var sub = subjects[parts[0]];
          if (!sub || parts.length < 2) return;
          sub.done += done;
          sub.correct += correct;
          if (parts[1] === 'all') return;
          sub.topics++;
          out.topicsStarted++;
          var mod = getSubjectModules(sub.subjectId).find(function (m) { return String(m.moduleId) === parts.slice(1).join(':'); });
          if (mod) out.topics.push({ subjectId: sub.subjectId, subjectName: sub.name, moduleId: mod.moduleId, name: mod.name, done: done, correct: correct, pct: Math.round((correct / done) * 100) });
        });
        out.subjects = Object.keys(subjects).map(function (id) {
          var sb = subjects[id];
          sb.pct = sb.done > 0 ? Math.round((sb.correct / sb.done) * 100) : null;
          return sb;
        });
        return out;
      }

      function renderDashboard() {
        if (!currentUser) {
          openAuthModal('signin', { reason: 'Sign in to see your progress.', onSuccess: function () { renderDashboard(); } });
          return;
        }
        if (!quizStylesReady) { ensureQuizStyles().then(renderDashboard); return; }
        clearTimer();
        releaseQuizPayload();
        state.screen = 'dashboard';
        state.idSet = null;
        scrollToPageTop();
        if (app) app.classList.remove('screen-quiz', 'screen-setup', 'screen-results');
        trackPageView('/dashboard', 'dashboard');

        var rd = v2HaveHistory() ? reviewData : null;
        var ix = v2Index(rd);
        var ep = v2EffectiveProgress();
        var fromHistory = !!(rd && Object.keys(rd.q).length);
        var totalAnswers = 0;
        if (fromHistory) Object.keys(rd.q).forEach(function (k) { totalAnswers += rd.q[k].n; });
        var d = dashboardData(ep);
        var overallPct = d.done > 0 ? Math.round((d.correct / d.done) * 100) : null;
        var subjStats = SUBJECT_INDEX.map(function (sx) { return { sx: sx, ss: v2SubjectStats(sx, ix), dd: d.subjects.find(function (b) { return String(b.subjectId) === String(sx.subjectId); }) }; });
        var startedSubj = subjStats.filter(function (r) { return r.dd && r.dd.done > 0; });
        var topicsStarted = subjStats.reduce(function (n, r) { return n + r.ss.started; }, 0);
        var topicsDone = subjStats.reduce(function (n, r) { return n + r.ss.done; }, 0);
        var days = rd ? rd.days : {};
        var today = v2Day(Date.now());
        var streak = 0;
        for (var s0 = (days[today] ? today : today - 1); days[s0]; s0--) streak++;
        var keys = Object.keys(days).map(Number).sort(function (a, b) { return a - b; });
        var best = 0, run = 0, prev = null;
        keys.forEach(function (k) { run = (prev !== null && k === prev + 1) ? run + 1 : 1; prev = k; if (run > best) best = run; });

        var body = '<div class="v2-bold v2-dash"><h1 class="v2-hello-h">Your progress</h1>' +
          '<p class="v2-sub">' + (fromHistory ? 'Each question counts once, scored on your latest answer to it.' : 'Counted from your most recent run of each topic.') + '</p>';

        if (!d.done) {
          body += '<section class="v2-hero v2-hero-compact"><div class="v2-hero-main"><p class="v2-hero-k">Nothing yet</p><h2 class="v2-hero-h">Answer a few questions to see your progress</h2>' +
            '<p class="v2-hero-p">Accuracy, strong and weak subjects and topics to revisit all appear here.</p></div>' +
            '<div class="v2-hero-actions"><button class="v2-hero-btn" id="dashBrowseBtn">Browse subjects</button></div></section></div>';
        } else {
          // hero: overall accuracy
          body += '<section class="v2-hero v2-hero-compact"><div class="v2-hero-main"><p class="v2-hero-k">Overall' + (streak ? '<span class="v2-streak">' + v2Icon('flame') + streak + '-day streak</span>' : '') + '</p>' +
            '<h2 class="v2-hero-h">' + d.done.toLocaleString() + ' questions answered</h2>' +
            '<p class="v2-hero-p">' + d.correct.toLocaleString() + ' right on your latest answer' + (totalAnswers > d.done ? ' · ' + totalAnswers.toLocaleString() + ' answers with repeats' : '') + '</p></div>' +
            v2Ring((overallPct || 0) / 100, 92, 9, 'v2-ring-hero', '<strong>' + overallPct + '%</strong><small>accuracy</small>') + '</section>';

          body += '<div class="v2-stat3 v2-stat4">' +
            '<div class="v2-card2 v2-stat"><span class="v2-stat-ic top">' + v2Icon('layers') + '</span><strong>' + topicsStarted + '</strong><span>topics started</span></div>' +
            '<div class="v2-card2 v2-stat"><span class="v2-stat-ic ok">' + v2Icon('check') + '</span><strong>' + topicsDone + '</strong><span>topics cleared</span></div>' +
            '<div class="v2-card2 v2-stat"><span class="v2-stat-ic acc">' + v2Icon('target') + '</span><strong>' + startedSubj.length + '<small> / 19</small></strong><span>subjects started</span></div>' +
            '<div class="v2-card2 v2-stat"><span class="v2-stat-ic fl">' + v2Icon('flame') + '</span><strong>' + best + '</strong><span>best streak (days)</span></div>' +
            '</div>';

          // last 4 weeks
          if (fromHistory) {
            var cells = '', maxN = 1;
            for (var k2 = 27; k2 >= 0; k2--) maxN = Math.max(maxN, days[today - k2] || 0);
            for (var k = 27; k >= 0; k--) {
              var n = days[today - k] || 0;
              var lvl = n ? Math.min(4, 1 + Math.floor((3 * n) / maxN)) : 0;
              var dt = new Date(Date.now() - k * 86400000);
              cells += '<span class="v2-heat l' + lvl + (k === 0 ? ' now' : '') + '" title="' + esc(dt.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })) + ': ' + v2Plural(n, 'answer') + '"></span>';
            }
            body += '<section class="v2-sec"><h2 class="v2-h2b v2-h2b-row"><span>Last four weeks</span><span class="v2-qotd-tag">' + Object.keys(days).filter(function (x) { return Number(x) > today - 28; }).length + ' days practised</span></h2>' +
              '<div class="v2-card2 v2-heatmap"><div class="v2-heat-grid">' + cells + '</div><div class="v2-heat-key"><span>Less</span><i class="v2-heat l0"></i><i class="v2-heat l1"></i><i class="v2-heat l2"></i><i class="v2-heat l3"></i><i class="v2-heat l4"></i><span>More</span></div></div></section>';
          }

          // up next
          var upNext = [];
          subjStats.forEach(function (r) {
            if (!r.ss.started) return;
            var nx = v2NextIn(r.ss, v2LastModuleIn(r.ss));
            if (nx) upNext.push({ sx: r.sx, x: nx });
          });
          if (upNext.length) {
            body += '<section class="v2-sec"><h2 class="v2-h2b">Up next</h2>' + upNext.slice(0, 5).map(function (u) {
              var fr = u.x.st.seen / (u.x.st.total || 1);
              return '<button class="v2-card2 v2-weak" data-subject="' + u.sx.subjectId + '" data-module="' + esc(u.x.m.moduleId) + '">' + v2SubjIcon(u.sx, 40) +
                '<span class="v2-cont-main"><span class="v2-cont-t">' + esc(u.x.m.name) + '</span><span class="v2-cont-s">' + esc(u.sx.name) + ' · ' +
                (u.x.st.seen ? (u.x.st.total - u.x.st.seen) + ' left' : v2Plural(u.x.m.questionCount, 'question')) + '</span></span>' +
                v2Ring(fr, 40, 4, 'v2-ring-cont', Math.round(fr * 100) + '%') + '</button>';
            }).join('') + '</section>';
          }

          // strong and weak subjects
          var ranked = startedSubj.filter(function (r) { return r.dd.done >= DASH_MIN_SUBJECT; }).sort(function (a, b) { return b.dd.pct - a.dd.pct; });
          var pick = Math.min(3, Math.floor(ranked.length / 2));
          var rankCard = function (r, tone) {
            return '<button class="v2-card2 v2-weak" data-subject="' + r.sx.subjectId + '">' + v2SubjIcon(r.sx, 36) +
              '<span class="v2-cont-main"><span class="v2-cont-t">' + esc(r.sx.name) + '</span><span class="v2-cont-s">' + r.dd.done.toLocaleString() + ' answered</span></span>' +
              '<span class="v2-badge ' + tone + '">' + r.dd.pct + '%</span></button>';
          };
          body += pick > 0
            ? '<div class="v2-cols2"><section class="v2-sec"><h2 class="v2-h2b">Strongest</h2>' + ranked.slice(0, pick).map(function (r) { return rankCard(r, 'ok'); }).join('') + '</section>' +
              '<section class="v2-sec"><h2 class="v2-h2b">Needs work</h2>' + ranked.slice(ranked.length - pick).reverse().map(function (r) { return rankCard(r, 'bad'); }).join('') + '</section></div>'
            : '<section class="v2-sec"><h2 class="v2-h2b">Strongest and weakest</h2><div class="v2-card2 v2-qotd"><p class="v2-qotd-wait">Answer at least ' + DASH_MIN_SUBJECT + ' questions in two subjects and they will be ranked here.</p></div></section>';

          // topics to revisit
          var revisit = d.topics.filter(function (t) { return t.done >= DASH_MIN_TOPIC && t.pct < 60; })
            .sort(function (a, b) { return a.pct - b.pct || b.done - a.done; }).slice(0, 6);
          if (revisit.length) {
            body += '<section class="v2-sec"><h2 class="v2-h2b">Topics to revisit</h2>' + revisit.map(function (t) {
              var sx = SUBJECT_INDEX.find(function (x) { return String(x.subjectId) === String(t.subjectId); });
              return '<button class="v2-card2 v2-weak" data-subject="' + t.subjectId + '" data-module="' + esc(String(t.moduleId)) + '">' + (sx ? v2SubjIcon(sx, 36) : '') +
                '<span class="v2-cont-main"><span class="v2-cont-t">' + esc(t.name) + '</span><span class="v2-cont-s">' + esc(t.subjectName) + ' · ' + t.correct + ' of ' + t.done + ' right</span></span>' +
                '<span class="v2-pct-bad">' + t.pct + '%</span></button>';
            }).join('') + '</section>';
          }

          // every subject
          body += '<section class="v2-sec"><h2 class="v2-h2b">All subjects</h2><div class="v2-card2 v2-subjlist">' + subjStats.map(function (r) {
            var done = r.dd ? r.dd.done : 0;
            var pct = r.dd && r.dd.pct != null ? r.dd.pct : null;
            var cov = r.ss.started / (r.ss.total || 1);
            return '<button class="v2-sl-row" data-subject="' + r.sx.subjectId + '">' + v2SubjIcon(r.sx, 34) +
              '<span class="v2-cont-main"><span class="v2-cont-t">' + esc(r.sx.name) + '</span>' +
              '<span class="v2-cont-s">' + r.ss.started + ' of ' + r.ss.total + ' topics' + (done ? ' · ' + done.toLocaleString() + ' answered' : '') + '</span>' +
              '<span class="v2-tile-bar"><span style="width:' + Math.round(cov * 100) + '%"></span></span></span>' +
              '<span class="v2-sl-pct' + (pct == null ? ' none' : pct >= 70 ? ' ok' : pct < 50 ? ' bad' : '') + '">' + (pct == null ? '–' : pct + '%') + '</span></button>';
          }).join('') + '</div></section>';

          if (d.pyqDone > 0) {
            body += '<section class="v2-sec"><h2 class="v2-h2b">Past papers</h2><div class="v2-card2 v2-weak" style="cursor:default"><span class="v2-qa-ic v2-qa-papers" style="width:40px;height:40px;border-radius:12px">' + v2Icon('papers') + '</span>' +
              '<span class="v2-cont-main"><span class="v2-cont-t">' + d.pyqCorrect.toLocaleString() + ' of ' + d.pyqDone.toLocaleString() + ' right</span><span class="v2-cont-s">Across every paper you have tried</span></span>' +
              '<span class="v2-badge">' + Math.round((d.pyqCorrect / d.pyqDone) * 100) + '%</span></div></section>';
          }
          body += '<section class="v2-sec" id="dashRecent"></section></div>';
        }

        var useV2 = v2On();
        app.innerHTML = useV2
          ? v2Shell('progress', v2Header('Back to today', 'Progress'), body, ix.due.length)
          : rrTopBar('Back to home', 'Home') + '<main id="mainContent" role="main" class="rr-dash v2-main">' + body + '</main>';
        if (useV2) { wireV2Shell(); } else { wireTopBar(renderHome); }
        if (!v2HaveHistory()) {
          loadReviewData().then(function (r2) {
            if (r2 && state.screen === 'dashboard') { var y = window.scrollY; renderDashboard(); window.scrollTo(0, y); }
          });
        }
        app.querySelectorAll('.v2-dash [data-subject]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var sid = parseInt(btn.getAttribute('data-subject'), 10);
            var mid = btn.getAttribute('data-module');
            if (mid) renderSetup(sid, mid); else renderModuleList(sid);
          });
        });
        var browseBtn = document.getElementById('dashBrowseBtn');
        if (browseBtn) browseBtn.onclick = function () { if (useV2) renderSubjectsV2(); else renderHome(); };

        var recentEl = document.getElementById('dashRecent');
        if (!recentEl || !supabaseClient) return;
        try {
          supabaseClient.from('attempts')
            .select('id,subject_id,module_id,question_count,score_pct,started_at,finished_at,attempt_answers(count)')
            .eq('user_id', currentUser.id).order('started_at', { ascending: false }).limit(8)
            .then(function (res) {
              if (state.screen !== 'dashboard' || !document.getElementById('dashRecent')) return;
              var rows = (res && !res.error && res.data) || [];
              if (!rows.length) return;
              var idx = v2ModIndex();
              recentEl.innerHTML = '<h2 class="v2-h2b">Recent sessions</h2>' + rows.map(function (r) {
                var info = r.module_id != null ? idx[r.module_id] : null;
                var sx = info ? info.sx : SUBJECT_INDEX.find(function (x) { return String(x.subjectId) === String(r.subject_id); });
                var label = info ? info.m.name : (sx ? sx.name + ' mixed' : 'Mixed set');
                var when = '';
                try { when = new Date(r.started_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }); } catch (e) { }
                var n = r.attempt_answers && r.attempt_answers[0] ? r.attempt_answers[0].count : null;
                var score = (r.finished_at && r.score_pct != null) ? '<span class="v2-badge ' + (r.score_pct >= 60 ? 'ok' : 'bad') + '">' + r.score_pct + '%</span>' : '<span class="v2-cont-s">' + (n != null ? n + ' of ' + (r.question_count || '?') + ' done' : 'Not finished') + '</span>';
                return '<div class="v2-card2 v2-weak v2-recent">' + (sx ? v2SubjIcon(sx, 36) : '<span class="v2-subj-ic" style="width:36px;height:36px"></span>') +
                  '<span class="v2-cont-main"><span class="v2-cont-t">' + esc(label) + '</span><span class="v2-cont-s">' + esc(when) + (r.question_count ? ' · ' + r.question_count + ' questions' : '') + '</span></span>' + score + '</div>';
              }).join('');
            });
        } catch (e) { console.warn('dashboard recent sessions failed:', e); }
      }

      // ======================================================================
      // HOME, SUBJECTS, REVIEW AND TOPICS, VERSION 2
      // Opt-in while it is tried live: ?ui=new turns it on for this browser,
      // ?ui=old turns it off again. Everything below reads data the app
      // already has (the baked syllabus, the progress map, the user's own
      // attempt_answers rows); nothing here writes anything new.
      // ======================================================================
      var V2_KEY = 'ml_ui';
      function setUiMode(mode) {
        try { localStorage.setItem(V2_KEY, mode); } catch (e) {}
        try {
          if (/[?&]ui=/.test(window.location.search || '')) history.replaceState(null, '', window.location.pathname + window.location.hash);
        } catch (e) {}
        renderHome(true);
        if (typeof updateMastheadAuth === 'function') updateMastheadAuth();
      }
      function v2On() {
        try {
          var m = /[?&]ui=(new|old)\b/.exec(window.location.search || '');
          if (m) localStorage.setItem(V2_KEY, m[1]);
          // The new home is the default; ?ui=old keeps the classic one.
          return localStorage.getItem(V2_KEY) !== 'old';
        } catch (e) { return true; }
      }

      // ---- review history ---------------------------------------------------
      // Spaced review on a Leitner ladder: a miss comes back the next day; each
      // correct answer in a row pushes the next showing further out.
      var V2_INTERVALS = [1, 3, 7, 16, 35];
      var V2_SET_SIZE = 20;
      var V2_REVIEW_SHARE = 12;
      var reviewData = null;
      var reviewLoading = null;

      function v2Day(ms) {
        var d = new Date(ms);
        return Math.floor((ms - d.getTimezoneOffset() * 60000) / 86400000);
      }
      function emptyReviewData(uid) { return { uid: uid, q: {}, days: {}, lastModule: null, loaded: false }; }

      function noteReviewAnswer(rd, qid, moduleDbId, ok, ms) {
        if (!qid) return;
        var e = rd.q[qid];
        if (!e) e = rd.q[qid] = { n: 0, streak: 0, last: 0, ok: false, mod: null };
        if (moduleDbId != null) e.mod = moduleDbId;
        e.n++;
        e.last = ms;
        e.ok = ok;
        e.streak = ok ? e.streak + 1 : 0;
        var k = v2Day(ms);
        rd.days[k] = (rd.days[k] || 0) + 1;
        if (e.mod != null) rd.lastModule = e.mod;
      }

      function loadReviewData() {
        if (!currentUser || !supabaseClient) return Promise.resolve(null);
        var uid = currentUser.id;
        if (reviewData && reviewData.uid === uid && reviewData.loaded) return Promise.resolve(reviewData);
        if (reviewLoading) return reviewLoading;
        try {
          reviewLoading = supabaseClient.from('attempt_answers')
            .select('question_id,is_correct,answered_at,questions(module_id)')
            .eq('user_id', uid).order('answered_at', { ascending: false }).limit(5000)
            .then(function (res) {
              reviewLoading = null;
              if (!currentUser || currentUser.id !== uid) return null;
              if (res && res.error) console.warn('review history:', res.error);
              var rows = (res && !res.error && res.data) || [];
              var rd = emptyReviewData(uid);
              for (var i = rows.length - 1; i >= 0; i--) {
                var r = rows[i];
                var mod = r.questions && r.questions.module_id != null ? Number(r.questions.module_id) : null;
                noteReviewAnswer(rd, Number(r.question_id), mod, !!r.is_correct, Date.parse(r.answered_at) || 0);
              }
              // Answers given while the history was loading.
              if (reviewData && reviewData.uid === uid && reviewData.live) {
                reviewData.live.forEach(function (a) { noteReviewAnswer(rd, a[0], a[1], a[2], a[3]); });
              }
              rd.loaded = true;
              rd.failed = !!(res && res.error);
              reviewData = rd;
              return rd;
            }, function (err) {
              reviewLoading = null;
              console.warn('review history failed:', err);
              return null;
            });
        } catch (e) {
          reviewLoading = null;
          return Promise.resolve(null);
        }
        return reviewLoading;
      }

      // Called for every answer that is also being written to attempt_answers,
      // so the home screen is current the moment a quiz ends.
      function v2NoteLive(q, answer) {
        if (!currentUser || !q || !q.id || !attemptLog.meta) return;
        var uid = currentUser.id;
        if (!reviewData || reviewData.uid !== uid) reviewData = emptyReviewData(uid);
        var a = [Number(q.id), q.moduleId != null ? Number(q.moduleId) : null, !!(answer && answer.isCorrect), Date.now()];
        noteReviewAnswer(reviewData, a[0], a[1], a[2], a[3]);
        if (!reviewData.loaded) (reviewData.live = reviewData.live || []).push(a);
      }

      // ---- syllabus lookups -------------------------------------------------
      var _v2ModIndex = null;
      function v2ModIndex() {
        if (_v2ModIndex) return _v2ModIndex;
        var map = {};
        SUBJECT_INDEX.forEach(function (sx) {
          getSubjectModules(sx.subjectId).forEach(function (m, i) {
            map[m.id] = { sx: sx, m: m, index: i };
          });
        });
        _v2ModIndex = map;
        return map;
      }
      function v2Accessible(sx, m, i) {
        if (isModuleLocked(sx.subjectId, m.moduleId, i)) return false;
        if (!currentUser) return isGuestModule(m.id);
        return true;
      }

      // One pass over the history: per-module coverage, accuracy on each
      // question's latest answer, and what is due today.
      function v2Index(rd) {
        var now = v2Day(Date.now());
        var byMod = {};
        var due = [];
        var seen = 0, okNow = 0;
        var idx = v2ModIndex();
        var pro = isUserPro(currentUser);
        if (rd) {
          Object.keys(rd.q).forEach(function (qid) {
            var e = rd.q[qid];
            seen++;
            if (e.ok) okNow++;
            var info = e.mod != null ? idx[e.mod] : null;
            var b = null;
            if (info) {
              b = byMod[e.mod] || (byMod[e.mod] = { seen: 0, ok: 0, due: 0, last: 0 });
              b.seen++;
              if (e.ok) b.ok++;
              if (e.last > b.last) b.last = e.last;
            }
            var iv = V2_INTERVALS[Math.min(e.streak, V2_INTERVALS.length - 1)];
            if (now - v2Day(e.last) < iv) return;
            // Only what the student can still open: a lapsed Pro topic or a
            // past paper is not served to a free account.
            var open = info ? v2Accessible(info.sx, info.m, info.index) : pro;
            if (!open) return;
            if (b) b.due++;
            due.push({ qid: Number(qid), mod: e.mod, wrong: e.streak === 0, last: e.last });
          });
        }
        due.sort(function (a, b) { return (a.wrong === b.wrong) ? a.last - b.last : (a.wrong ? -1 : 1); });
        return { byMod: byMod, due: due, seen: seen, okNow: okNow };
      }

      function v2ModuleStats(sx, m, ix) {
        var total = m.questionCount || 0;
        var b = ix && ix.byMod[m.id];
        var seen = b ? b.seen : 0;
        var pct = seen ? Math.round((b.ok / seen) * 100) : null;
        var p = progress[sx.subjectId + ':' + m.moduleId];
        if (p && p.done > seen) {
          seen = p.done;
          pct = Math.round((Math.min(p.correct || 0, p.done) / p.done) * 100);
        }
        if (total) seen = Math.min(seen, total);
        return {
          total: total, seen: seen, pct: pct, due: b ? b.due : 0, last: b ? b.last : 0,
          status: total && seen >= total ? 'done' : (seen > 0 ? 'active' : 'new')
        };
      }

      function v2SubjectStats(sx, ix) {
        var mods = getSubjectModules(sx.subjectId);
        var out = { mods: [], done: 0, active: 0, fresh: 0, due: 0, seen: 0, ok: 0, last: 0, total: mods.length, questions: 0, qseen: 0 };
        mods.forEach(function (m, i) {
          var st = v2ModuleStats(sx, m, ix);
          var open = v2Accessible(sx, m, i);
          var locked = isModuleLocked(sx.subjectId, m.moduleId, i);
          out.mods.push({ m: m, i: i, st: st, open: open, locked: locked });
          out.questions += m.questionCount || 0;
          out.qseen += Math.min(st.seen, m.questionCount || 0);
          if (st.status === 'done') out.done++; else if (st.status === 'active') out.active++; else out.fresh++;
          out.due += st.due;
          if (st.seen && st.pct != null) { out.seen += st.seen; out.ok += Math.round(st.seen * st.pct / 100); }
          if (st.last > out.last) out.last = st.last;
        });
        out.started = out.done + out.active;
        out.pct = out.seen ? Math.round((out.ok / out.seen) * 100) : null;
        return out;
      }

      // The next topic in a subject: the one in hand if it is unfinished,
      // otherwise the first unfinished open topic after it, in syllabus order.
      function v2NextIn(ss, afterModDbId) {
        var list = ss.mods.filter(function (x) { return x.open && x.m.questionCount > 0; });
        if (!list.length) return null;
        var at = -1;
        if (afterModDbId != null) {
          for (var i = 0; i < list.length; i++) if (list[i].m.id === afterModDbId) { at = i; break; }
          if (at >= 0 && list[at].st.status === 'active') return list[at];
        }
        for (var j = at + 1; j < list.length; j++) if (list[j].st.status !== 'done') return list[j];
        for (var k = 0; k <= at && k < list.length; k++) if (list[k].st.status !== 'done') return list[k];
        return null;
      }

      // Subjects in the order the student last worked on them.
      function v2ActiveSubjects(ix) {
        var rows = SUBJECT_INDEX.map(function (sx) {
          var ss = v2SubjectStats(sx, ix);
          var last = ss.last;
          if (!last && ss.started) last = 1;
          return { sx: sx, ss: ss, last: last };
        });
        return rows.filter(function (r) { return r.last > 0; }).sort(function (a, b) { return b.last - a.last; });
      }
      function v2LastModuleIn(ss) {
        var best = null;
        ss.mods.forEach(function (x) { if (x.st.last && (!best || x.st.last > best.st.last)) best = x; });
        return best ? best.m.id : null;
      }

      function v2TodayPlan(ix) {
        var active = v2ActiveSubjects(ix);
        var next = [];
        active.slice(0, 3).forEach(function (r) {
          if (next.length >= 2) return;
          var n = v2NextIn(r.ss, v2LastModuleIn(r.ss));
          if (n) next.push({ sx: r.sx, x: n });
        });
        if (!next.length) {
          for (var i = 0; i < SUBJECT_INDEX.length && !next.length; i++) {
            var ss = v2SubjectStats(SUBJECT_INDEX[i], ix);
            var n0 = v2NextIn(ss, null);
            if (n0) next.push({ sx: SUBJECT_INDEX[i], x: n0 });
          }
        }
        var newAvail = next.reduce(function (s, r) { return s + Math.max(0, r.x.st.total - r.x.st.seen); }, 0);
        var reviewN = Math.min(ix.due.length, newAvail > 0 ? V2_REVIEW_SHARE : V2_SET_SIZE);
        var newN = Math.min(V2_SET_SIZE - reviewN, newAvail);
        if (reviewN + newN < V2_SET_SIZE) reviewN = Math.min(ix.due.length, V2_SET_SIZE - newN);
        var reviewItems = ix.due.slice(0, reviewN);
        var subjNames = [];
        var idx = v2ModIndex();
        reviewItems.forEach(function (d) {
          var info = d.mod != null ? idx[d.mod] : null;
          var nm = info ? info.sx.name : 'Past papers';
          if (subjNames.indexOf(nm) === -1) subjNames.push(nm);
        });
        return { reviewIds: reviewItems.map(function (d) { return d.qid; }), newN: newN, next: next, size: reviewN + newN, reviewSubjects: subjNames };
      }

      // ---- launching question sets -------------------------------------------
      function v2Loading(title, line, back) {
        clearTimer();
        app.innerHTML =
          rrLoadingHtml('Back', esc(title), line);
        wireTopBar(back);
      }

      // A practice set built from question ids: today's set, a review set or a
      // mixed subject set. Answers are logged like any other quiz, so the next
      // home screen already knows about them.
      function launchIdQuiz(ids, opts) {
        if (quizLoadInFlight) return;
        if (!ids || !ids.length) { showToast('Nothing to practise here yet.'); opts.back(); return; }
        if (!quizStylesReady) { ensureQuizStyles().then(function () { launchIdQuiz(ids, opts); }); return; }
        quizLoadInFlight = true;
        v2Loading(opts.title, 'Loading your questions', opts.back);
        supabaseClient.from('questions')
          .select('id,question_num,question_text,option_a,option_b,option_c,option_d,option_e,answer,explanation,module_id')
          .in('id', ids).then(function (res) {
            quizLoadInFlight = false;
            var byId = {};
            ((res && !res.error && res.data) || []).forEach(function (r) { byId[r.id] = r; });
            var rows = ids.map(function (id) { return byId[id]; }).filter(function (r) { return !!r; });
            if (!rows.length) { showToast('Could not load these questions. Please try again.', 'error'); opts.back(); return; }
            return loadQuestionImages(rows).then(function (imageRows) {
              var imgs = {};
              imageRows.forEach(function (image) {
                var key = String(image.question_id);
                if (!imgs[key]) imgs[key] = { question_text: [], explanation: [] };
                if (image.content_field && imgs[key][image.content_field]) imgs[key][image.content_field].push(image);
              });
              var questions = rows.map(function (r) {
                var o = {};
                ['A', 'B', 'C', 'D', 'E'].forEach(function (L) { var v = r['option_' + L.toLowerCase()]; if (v) o[L] = v; });
                return {
                  id: r.id, moduleId: r.module_id, num: String(r.id || r.question_num),
                  question: r.question_text || '', options: o, answer: r.answer || 'A',
                  explanation: r.explanation || '',
                  questionImages: (imgs[String(r.id)] || {}).question_text || [],
                  explanationImages: (imgs[String(r.id)] || {}).explanation || []
                };
              });
              state = {
                screen: 'quiz', subjectId: opts.subjectId || null, moduleId: opts.kind,
                poolTitle: opts.title, questions: questions,
                order: questions.map(function (q, i) { return i; }),
                idx: 0, answers: {}, quizType: 'practice', timeLimit: 0, remaining: 0,
                timerId: null, progressKey: opts.kind, idSet: opts
              };
              beginAttemptLog(null);
              trackEvent('quiz_start', { module_id: opts.kind, quiz_type: 'practice', question_count: questions.length, pool_title: opts.title });
              scrollToPageTop();
              renderQuiz();
              prefetchBookmarks();
            });
          }).catch(function (err) {
            quizLoadInFlight = false;
            console.warn('id set failed:', err);
            showToast('Could not load these questions. Please try again.', 'error');
            opts.back();
          });
      }

      function v2NeedAccount(reason, then) {
        openAuthModal('signin', { reason: reason, onSuccess: then });
      }

      // Pick unseen questions from a few topics, alternating between them.
      function v2FreshIds(modDbIds, count, rd) {
        if (!count || !modDbIds.length) return Promise.resolve([]);
        return supabaseClient.from('questions').select('id,module_id')
          .in('module_id', modDbIds).order('id', { ascending: true }).limit(1000)
          .then(function (res) {
            var seen = (rd && rd.q) || {};
            var buckets = modDbIds.map(function () { return []; });
            ((res && !res.error && res.data) || []).forEach(function (r) {
              var b = modDbIds.indexOf(Number(r.module_id));
              if (b >= 0 && !seen[r.id]) buckets[b].push(r.id);
            });
            var out = [];
            var more = true;
            while (out.length < count && more) {
              more = false;
              for (var i = 0; i < buckets.length && out.length < count; i++) {
                if (buckets[i].length) { out.push(buckets[i].shift()); more = true; }
              }
            }
            return out;
          });
      }

      function startTodaySet() {
        if (!currentUser) { v2NeedAccount("Sign in free to get a daily set built from your own answers.", startTodaySet); return; }
        loadReviewData().then(function (rd) {
          var ix = v2Index(rd);
          var plan = v2TodayPlan(ix);
          if (!plan.size) { showToast('You are all caught up for today.'); return; }
          var opts = { kind: 'today', title: "Today's set", back: function () { renderHome(true); }, again: startTodaySet };
          v2Loading(opts.title, 'Building your set', opts.back);
          v2FreshIds(plan.next.map(function (r) { return r.x.m.id; }), plan.newN, rd).then(function (fresh) {
            launchIdQuiz(shuffle(plan.reviewIds.concat(fresh)), opts);
          }).catch(function () { launchIdQuiz(shuffle(plan.reviewIds.slice()), opts); });
        });
      }

      function startReviewSet(modDbId) {
        if (!currentUser) { v2NeedAccount('Sign in to review the questions you have answered.', function () { startReviewSet(modDbId); }); return; }
        loadReviewData().then(function (rd) {
          var ix = v2Index(rd);
          var list = ix.due.filter(function (d) { return modDbId == null || d.mod === modDbId; }).slice(0, 30);
          if (!list.length) { showToast('Nothing is due for review right now.'); return; }
          var info = modDbId != null ? v2ModIndex()[modDbId] : null;
          launchIdQuiz(shuffle(list.map(function (d) { return d.qid; })), {
            kind: 'review', title: info ? 'Review: ' + info.m.name : 'Review',
            subjectId: info ? info.sx.subjectId : null,
            back: function () { renderReviewV2(); },
            again: function () { startReviewSet(modDbId); }
          });
        });
      }

      // Twenty questions from the topics already started in one subject: what
      // is due first, then the rest at random.
      function startSubjectMix(subjectId) {
        var sx = SUBJECT_INDEX.find(function (s) { return s.subjectId === subjectId; });
        if (!sx) return;
        if (!currentUser) { v2NeedAccount('Sign in free to practise mixed sets.', function () { startSubjectMix(subjectId); }); return; }
        loadReviewData().then(function (rd) {
          var ix = v2Index(rd);
          var ss = v2SubjectStats(sx, ix);
          var mods = ss.mods.filter(function (x) { return x.open && x.st.seen > 0; }).map(function (x) { return x.m.id; });
          var dueIds = ix.due.filter(function (d) { return mods.indexOf(d.mod) !== -1; }).slice(0, 8).map(function (d) { return d.qid; });
          var opts = {
            kind: 'mix', title: 'Mixed ' + sx.name + ' set', subjectId: subjectId,
            back: function () { renderModuleList(subjectId); },
            again: function () { startSubjectMix(subjectId); }
          };
          v2Loading(opts.title, 'Building your set', opts.back);
          supabaseClient.from('questions').select('id').in('module_id', mods).limit(1000).then(function (res) {
            var pool = ((res && !res.error && res.data) || []).map(function (r) { return r.id; })
              .filter(function (id) { return dueIds.indexOf(id) === -1; });
            launchIdQuiz(shuffle(dueIds.concat(shuffle(pool).slice(0, V2_SET_SIZE - dueIds.length))), opts);
          }).catch(function () { opts.back(); });
        });
      }

      // ---- exam date --------------------------------------------------------
      var V2_EXAMS = ['NEET PG', 'INI-CET', 'FMGE', 'NEET SS'];
      function v2ExamGet() {
        try { var v = JSON.parse(localStorage.getItem('ml_exam_goal') || 'null'); return v && v.exam ? v : null; } catch (e) { return null; }
      }
      function v2ExamLine(ix) {
        var g = v2ExamGet();
        var editor = '<form class="v2-exam-form" id="v2ExamForm" hidden>' +
          '<label><span>Exam</span><select id="v2ExamName">' + V2_EXAMS.map(function (x) {
            return '<option' + (g && g.exam === x ? ' selected' : '') + '>' + esc(x) + '</option>';
          }).join('') + '</select></label>' +
          '<label><span>Date</span><input type="date" id="v2ExamDate" value="' + esc(g && g.date ? g.date : '') + '"></label>' +
          '<button type="submit" class="v2-btn v2-btn-quiet">Save</button>' +
          (g ? '<button type="button" class="v2-link" id="v2ExamClear">Remove</button>' : '') +
          '</form>';
        if (!g) return '<p class="v2-exam">Preparing for an exam? <button class="v2-link" id="v2ExamEdit">Set your exam date</button></p>' + editor;
        var line = esc(g.exam);
        if (g.date) {
          var days = v2Day(Date.parse(g.date + 'T00:00:00')) - v2Day(Date.now());
          if (isFinite(days)) line += ' · ' + (days > 1 ? days + ' days to go' : days === 1 ? 'tomorrow' : days === 0 ? 'today' : 'date passed');
          // The pace that covers every open topic once before the exam.
          if (ix && currentUser && days > 1) {
            var left = 0;
            SUBJECT_INDEX.forEach(function (sx) {
              v2SubjectStats(sx, ix).mods.forEach(function (x) { if (x.open) left += Math.max(0, x.st.total - x.st.seen); });
            });
            if (left > 0) line += '<br><span class="v2-pace">About ' + Math.ceil(left / days).toLocaleString() + ' new questions a day covers all ' + left.toLocaleString() + ' you have not answered in your open topics.</span>';
          }
        }
        return '<p class="v2-exam">' + line + ' · <button class="v2-link" id="v2ExamEdit">change</button></p>' + editor;
      }
      function wireV2Exam(rerender) {
        var edit = document.getElementById('v2ExamEdit');
        var form = document.getElementById('v2ExamForm');
        if (!edit || !form) return;
        edit.onclick = function () { form.hidden = !form.hidden; };
        form.onsubmit = function (e) {
          e.preventDefault();
          var exam = document.getElementById('v2ExamName').value;
          var date = document.getElementById('v2ExamDate').value;
          try { localStorage.setItem('ml_exam_goal', JSON.stringify({ exam: exam, date: date })); } catch (err) { }
          rerender();
        };
        var clear = document.getElementById('v2ExamClear');
        if (clear) clear.onclick = function () { try { localStorage.removeItem('ml_exam_goal'); } catch (err) { } rerender(); };
      }

      // ---- shell --------------------------------------------------------------
      var V2_ICONS = {
        home: '<path d="M3 11l9-7 9 7v9a1 1 0 01-1 1h-5v-6h-6v6H4a1 1 0 01-1-1z"/>',
        qbank: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/><path d="M3 17.5l9 5 9-5"/>',
        pyq: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>',
        mock: '<path d="M9 2.5h6M12 2.5v3"/><circle cx="12" cy="14" r="7.5"/><path d="M12 10v4.2l2.8 1.8M18.5 6.5l1.5-1.5"/>',
        bookmarks: '<path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/>',
        profile: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0"/>',
        today: '<path d="M3 11l9-7 9 7v9a1 1 0 01-1 1h-5v-6h-6v6H4a1 1 0 01-1-1z"/>',
        subjects: '<path d="M4 5h16M4 12h16M4 19h10"/>',
        review: '<path d="M20 12a8 8 0 11-2.3-5.6M20 4v5h-5"/>',
        progress: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'
      };
      function v2Svg(name, size) {
        return '<svg width="' + (size || 22) + '" height="' + (size || 22) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + V2_ICONS[name] + '</svg>';
      }
      // Older screen names map onto the five tabs.
      var V2_TAB_OF = { today: 'home', home: 'home', review: 'home', subjects: 'qbank', qbank: 'qbank', pyq: 'pyq', bookmarks: 'bookmarks', progress: 'profile', profile: 'profile' };
      function v2Nav(active, dueCount) {
        var tab = V2_TAB_OF[active] || active;
        var items = [['home', 'Home'], ['qbank', 'QBank'], ['mock', 'Mock'], ['pyq', 'PYQ'], ['bookmarks', 'Bookmarks'], ['profile', 'Profile']];
        return '<nav class="v2-nav v3-nav" aria-label="Main">' + items.map(function (it) {
          // The revision count lives on a Review card (v3DueCard), not on the bar.
          var badge = it[0] === 'mock' && v2MockState && v2MockState.live ? '<span class="v3-nav-live" title="A mock test is live"></span>' : '';
          var inner = '<span class="v2-nav-icon">' + v2Svg(it[0]) + badge + '</span><span>' + it[1] + '</span>';
          // Mock is a separate page: a real link lets the browser start loading
          // it the moment a finger touches it (speculation rules, _headers).
          if (it[0] === 'mock') return '<a class="v2-nav-item" href="/mock-test" data-nav="mock">' + inner + '</a>';
          return '<button class="v2-nav-item" data-nav="' + it[0] + '"' + (it[0] === tab ? ' aria-current="page"' : '') + '>' + inner + '</button>';
        }).join('') + '</nav>';
      }
      function v2Header(back, crumb) {
        var left = back
          ? '<button class="rr-back" id="backBtn" aria-label="' + esc(back) + '">' + RR_BACK_SVG + '</button><a href="/" class="v2-brand v3-brand-sm"><img src="/icons/icon-72.png" alt="" width="28" height="28"><span>MedLadder</span></a>'
          : '<a href="/" class="v2-brand"><img src="/icons/icon-72.png" alt="" width="28" height="28"><span>MedLadder</span></a>';
        return '<header class="rr-top v2-top" role="banner">' + left +
          '<div class="right rr-top-right">' + proHeaderBtnHtml() + authBtnHtml() + themeBtnHtml() + '</div></header>';
      }
      function v2Shell(active, header, body, dueCount) {
        return '<div class="v2 v3">' + header +
          '<div class="v2-body">' + v2Nav(active, dueCount) +
          '<main id="mainContent" role="main" class="v2-main">' + body + '</main></div></div>' +
          footerHtml();
      }
      function v2Go(name) {
        if (name === 'today' || name === 'home') renderHome(true);
        else if (name === 'subjects' || name === 'qbank') renderSubjectsV2();
        else if (name === 'review') renderReviewV2();
        else if (name === 'pyq') renderPyqV2();
        else if (name === 'mock') window.location.href = '/mock-test';
        else if (name === 'profile') renderProfileV2();
        else if (name === 'bookmarks') { if (!currentUser) v2NeedAccount('Sign in to see your bookmarks.', renderBookmarks); else renderBookmarks(); }
        else if (name === 'progress') renderDashboard();
      }
      function wireV2Shell(back) {
        wireTopBar(back || function () { renderHome(true); });
        app.querySelectorAll('button.v2-nav-item[data-nav]').forEach(function (b) {
          b.onclick = function () {
            // Mark the tab at once so the tap feels instant, then render.
            app.querySelectorAll('.v2-nav-item[aria-current]').forEach(function (o) { o.removeAttribute('aria-current'); });
            b.setAttribute('aria-current', 'page');
            v2Go(b.getAttribute('data-nav'));
          };
        });
        hideStaticFooter();
      }
      function v2Paint(screen, html) {
        clearTimer();
        releaseQuizPayload();
        state.screen = screen;
        state.idSet = null;
        if (app) app.classList.remove('screen-quiz', 'screen-setup', 'screen-results');
        app.innerHTML = html;
      }
      // Render now from what is in hand, then once more when the history lands.
      function v2WithHistory(screen, again) {
        if (!currentUser || (reviewData && reviewData.uid === currentUser.id && reviewData.loaded)) return;
        loadReviewData().then(function (rd) {
          if (!rd || state.screen !== screen) return;
          var y = window.scrollY;
          again();
          window.scrollTo(0, y);
        });
      }
      function v2HaveHistory() { return !!(currentUser && reviewData && reviewData.uid === currentUser.id && reviewData.loaded); }
      function v2Bar(frac) {
        return '<span class="v2-bar" aria-hidden="true"><span style="width:' + Math.max(0, Math.min(100, Math.round(frac * 100))) + '%"></span></span>';
      }
      function v2Plural(n, one, many) { return n.toLocaleString() + ' ' + (n === 1 ? one : (many || one + 's')); }

      // ---- home extras: goal, search, question of the day, standing, badges ----
      var V2_GOALS = [10, 20, 30, 50, 100];
      function v2Goal() {
        try { var g = parseInt(localStorage.getItem('ml_daily_goal'), 10); if (V2_GOALS.indexOf(g) !== -1) return g; } catch (e) { }
        return 20;
      }
      function v2SetGoal(g) { try { localStorage.setItem('ml_daily_goal', String(g)); } catch (e) { } }

      // Every topic in the bank, searchable from the home screen.
      function v2SearchHtml() {
        return '<div class="v2-gsearch"><label class="v2-sr" for="v2GSearch">Search all topics</label>' +
          '<span class="v2-gsearch-ic" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg></span>' +
          '<input id="v2GSearch" type="search" placeholder="Search ' + totalTopics() + ' topics" autocomplete="off">' +
          '<div class="v2-gsearch-res" id="v2GSearchRes" hidden></div></div>';
      }
      function wireV2Search() {
        var input = document.getElementById('v2GSearch');
        var box = document.getElementById('v2GSearchRes');
        if (!input || !box) return;
        var idx = v2ModIndex();
        var all = Object.keys(idx).map(function (k) { return idx[k]; });
        input.oninput = function () {
          var q = input.value.trim().toLowerCase();
          if (q.length < 2) { box.hidden = true; box.innerHTML = ''; return; }
          var hits = all.filter(function (x) {
            return x.m.name.toLowerCase().indexOf(q) !== -1 || String(x.m.section || '').toLowerCase().indexOf(q) !== -1 || x.sx.name.toLowerCase().indexOf(q) !== -1;
          }).sort(function (a, b) {
            var an = a.m.name.toLowerCase().indexOf(q) === 0 ? 0 : 1, bn = b.m.name.toLowerCase().indexOf(q) === 0 ? 0 : 1;
            return an - bn;
          }).slice(0, 8);
          box.hidden = false;
          box.innerHTML = hits.length ? hits.map(function (x) {
            var locked = isModuleLocked(x.sx.subjectId, x.m.moduleId, x.index);
            return '<button class="v2-gs-row" data-gs-sid="' + x.sx.subjectId + '" data-gs-mod="' + esc(x.m.moduleId) + '" data-gs-locked="' + locked + '">' +
              v2SubjIcon(x.sx, 32) + '<span class="v2-cont-main"><span class="v2-cont-t">' + esc(x.m.name) + '</span>' +
              '<span class="v2-cont-s">' + esc(x.sx.name) + (x.m.section ? ' · ' + esc(x.m.section) : '') + ' · ' + x.m.questionCount + ' Qs</span></span>' +
              (locked ? '<span class="v2-lock">' + v2LockSvg() + '</span>' : '') + '</button>';
          }).join('') : '<p class="v2-gs-none">No topic matches “' + esc(input.value.trim()) + '”.</p>';
          box.querySelectorAll('[data-gs-sid]').forEach(function (b) {
            b.onclick = function () {
              var sid = parseInt(b.getAttribute('data-gs-sid'), 10), mid = b.getAttribute('data-gs-mod');
              if (b.getAttribute('data-gs-locked') === 'true') {
                var mo = getSubjectModules(sid).find(function (m) { return String(m.moduleId) === mid; });
                openProModal('locked_module', { subjectId: sid, moduleId: mid, moduleName: mo ? mo.name : 'This Topic' });
                return;
              }
              renderSetup(sid, mid);
            };
          });
        };
        input.onkeydown = function (e) { if (e.key === 'Escape') { input.value = ''; input.oninput(); } };
      }

      // Question of the day: the same question for everyone on a given day,
      // drawn from a topic this visitor can open, answered right on the card.
      var v2Qotd = null;
      function v2QotdPick() {
        var open = [];
        SUBJECT_INDEX.forEach(function (sx) {
          getSubjectModules(sx.subjectId).forEach(function (m, i) {
            if (m.questionCount > 0 && v2Accessible(sx, m, i)) open.push({ sx: sx, m: m });
          });
        });
        if (!open.length) return null;
        var day = v2Day(Date.now());
        var pick = open[(day * 7919) % open.length];
        return { sx: pick.sx, m: pick.m, n: (day * 104729) % Math.max(1, pick.m.questionCount), day: day };
      }
      function v2LoadQotd() {
        var card = document.getElementById('v2QotdCard');
        if (!card || !supabaseClient) return;
        // Only questions an admin chose: today's, or the last one chosen
        // before today. With none chosen yet the card stays hidden.
        var today = v2Day(Date.now());
        var pick = { day: today };
        var paint = function (q) {
          if (!q) { var sec2 = document.getElementById('v2Qotd'); if (sec2) sec2.hidden = true; return; }
          // Keyed by question, so a question kept over several days stays
          // answered and a new one starts fresh.
          var key = 'ml_qotd_q' + (q && q.id);
          var picked = null;
          try { picked = localStorage.getItem(key); } catch (e) { }
          var tag = document.querySelector('#v2Qotd .v2-qotd-tag');
          if (tag) tag.textContent = pick.sx ? pick.sx.name : (pick.subj || '');
          var letters = ['A', 'B', 'C', 'D', 'E'].filter(function (L) { return q['option_' + L.toLowerCase()]; });
          card.innerHTML = '<p class="v2-qotd-q">' + esc(stripHtmlPreview(q.question_text, 400)) + '</p>' +
            '<div class="v2-qotd-opts">' + letters.map(function (L) {
              var cls = 'v2-qotd-opt';
              if (picked) { if (L === q.answer) cls += ' ok'; else if (L === picked) cls += ' bad'; else cls += ' dim'; }
              return '<button class="' + cls + '" data-qotd="' + L + '"' + (picked ? ' disabled' : '') + '><span class="v2-qotd-l">' + L + '</span><span>' + esc(stripHtmlPreview(q['option_' + L.toLowerCase()], 200)) + '</span></button>';
            }).join('') + '</div>' +
            (picked ? '<p class="v2-qotd-res ' + (picked === q.answer ? 'ok' : 'bad') + '">' + (picked === q.answer ? 'Right. ' : 'The answer is ' + esc(q.answer) + '. ') +
              '<span>' + esc(stripHtmlPreview(q.explanation, 260)) + '</span></p>' +
              (pick.sx && pick.m ? '<button class="v2-link" data-sid="' + pick.sx.subjectId + '" data-mod="' + esc(pick.m.moduleId) + '">Practise ' + esc(pick.m.name) + '</button>' : '') : '');
          card.querySelectorAll('[data-qotd]').forEach(function (b) {
            b.onclick = function () { try { localStorage.setItem(key, b.getAttribute('data-qotd')); } catch (e) { } paint(q); };
          });
          card.querySelectorAll('[data-sid][data-mod]').forEach(function (b) {
            b.onclick = function () { renderSetup(parseInt(b.getAttribute('data-sid'), 10), b.getAttribute('data-mod')); };
          });
        };
        if (v2Qotd && v2Qotd.day === today) { if (v2Qotd.pick) pick = v2Qotd.pick; paint(v2Qotd.q); return; }
        // An admin's choice for today wins; otherwise the automatic pick.
        var dt = new Date(), pad = function (n) { return (n < 10 ? '0' : '') + n; };
        var iso = dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate());
        var autoLoad = function () { v2Qotd = { day: today, q: null }; paint(null); };
        try {
          supabaseClient.rpc('question_of_the_day', { p_day: iso }).then(function (res) {
            var row = res && !res.error && res.data && res.data[0];
            if (!row) { autoLoad(); return; }
            row.answer = String(row.answer || '').toUpperCase();
            var info = row.module_id != null ? v2ModIndex()[row.module_id] : null;
            pick = { day: today, sx: info ? info.sx : null, m: info ? info.m : null, subj: row.subject || '' };
            v2Qotd = { day: today, q: row, pick: pick };
            paint(row);
          }, autoLoad);
        } catch (e) { autoLoad(); }
      }

      // This week against other students (aggregate RPC).
      function v2LoadStanding() {
        var el = document.getElementById('v2Standing');
        if (!el || !currentUser || !supabaseClient) return;
        try {
          supabaseClient.rpc('weekly_standing').then(function (res) {
            var d = res && !res.error && res.data;
            if (!d || !document.getElementById('v2Standing')) return;
            var mine = Number(d.mine) || 0, last = Number(d.last_week) || 0, active = Number(d.active) || 0, beat = Number(d.beat) || 0;
            var others = Math.max(0, active - (mine ? 1 : 0));
            var pct = others ? Math.round((100 * beat) / others) : null;
            var trend = last ? Math.round((100 * (mine - last)) / last) : null;
            el.innerHTML = '<div class="v2-stand-main"><strong>' + mine.toLocaleString() + '</strong><span>answers this week</span>' +
              (trend != null ? '<span class="v2-trend ' + (trend >= 0 ? 'up' : 'down') + '">' + (trend >= 0 ? '↑ ' : '↓ ') + Math.abs(trend) + '% vs last week</span>' : (mine ? '<span class="v2-trend up">New this week</span>' : '')) + '</div>' +
              (pct != null && mine ? '<div class="v2-stand-side"><strong>' + (pct >= 50 ? 'Top ' + Math.max(1, 100 - pct) + '%' : pct + '%') + '</strong><span>' + (pct >= 50 ? 'of students practising this week' : 'of this week’s students answered less') + '</span></div>' : '');
            el.hidden = false;
          }, function () { });
        } catch (e) { }
      }

      // Badges, all from the answer history.
      function v2Badges(rd, ix) {
        var days = rd ? rd.days : {};
        var keys = Object.keys(days).map(Number).sort(function (a, b) { return a - b; });
        var best = 0, run = 0, prev = null;
        keys.forEach(function (k) { run = (prev !== null && k === prev + 1) ? run + 1 : 1; prev = k; if (run > best) best = run; });
        var answered = ix.seen;
        var topicsDone = 0, sharp = 0;
        SUBJECT_INDEX.forEach(function (sx) {
          v2SubjectStats(sx, ix).mods.forEach(function (x) {
            if (x.st.status === 'done') topicsDone++;
            if (x.st.seen >= 20 && x.st.pct != null && x.st.pct >= 80) sharp++;
          });
        });
        var list = [
          { id: 'first', t: 'First answer', d: 'Answer your first question', v: answered, goal: 1, ic: '✨' },
          { id: 'c100', t: 'Century', d: '100 questions answered', v: answered, goal: 100, ic: '💯' },
          { id: 'c1000', t: 'Thousand', d: '1,000 questions answered', v: answered, goal: 1000, ic: '🏆' },
          { id: 's3', t: 'On a roll', d: '3 days in a row', v: best, goal: 3, ic: '🔥' },
          { id: 's7', t: 'Full week', d: '7 days in a row', v: best, goal: 7, ic: '📅' },
          { id: 'td1', t: 'Topic cleared', d: 'Answer every question in a topic', v: topicsDone, goal: 1, ic: '✅' },
          { id: 'td10', t: 'Ten topics', d: 'Clear 10 topics', v: topicsDone, goal: 10, ic: '🧠' },
          { id: 'sharp', t: 'Sharp', d: '80%+ in a topic with 20+ answers', v: sharp, goal: 1, ic: '🎯' }
        ];
        var earned = list.filter(function (b) { return b.v >= b.goal; });
        var next = list.filter(function (b) { return b.v < b.goal; }).sort(function (a, b) { return (b.v / b.goal) - (a.v / a.goal); })[0];
        return { earned: earned, next: next, total: list.length, list: list };
      }
      function v2BadgesHtml(rd, ix) {
        var b = v2Badges(rd, ix);
        return '<section class="v2-sec"><h2 class="v2-h2b v2-h2b-row"><span>Badges</span><span class="v2-qotd-tag">' + b.earned.length + ' of ' + b.total + '</span></h2>' +
          '<div class="v2-card2 v2-badges">' +
          (b.earned.length ? '<div class="v2-badge-row">' + b.earned.map(function (x) {
            return '<span class="v2-bdg" title="' + esc(x.d) + '"><span class="v2-bdg-ic">' + x.ic + '</span><span>' + esc(x.t) + '</span></span>';
          }).join('') + '</div>' : '<p class="v2-qotd-wait">Answer your first question to earn your first badge.</p>') +
          (b.next ? '<div class="v2-bdg-next"><span class="v2-bdg-ic dim">' + b.next.ic + '</span><span class="v2-cont-main"><span class="v2-cont-t">Next: ' + esc(b.next.t) + '</span><span class="v2-cont-s">' + esc(b.next.d) + ' · ' + Math.min(b.next.v, b.next.goal).toLocaleString() + ' of ' + b.next.goal.toLocaleString() + '</span>' +
            '<span class="v2-tile-bar"><span style="width:' + Math.round(100 * Math.min(1, b.next.v / b.next.goal)) + '%"></span></span></span></div>' : '') +
          '</div></section>';
      }

      // Last three sessions, filled in after the page paints.
      function v2LoadRecent() {
        var el = document.getElementById('v2Recent');
        if (!el || !currentUser || !supabaseClient) return;
        try {
          supabaseClient.from('attempts').select('id,subject_id,module_id,question_count,score_pct,started_at,finished_at,attempt_answers(count)')
            .eq('user_id', currentUser.id).order('started_at', { ascending: false }).limit(3)
            .then(function (res) {
              var rows = (res && !res.error && res.data) || [];
              if (!rows.length || !document.getElementById('v2Recent')) return;
              var idx = v2ModIndex();
              el.innerHTML = '<h2 class="v2-h2b">Recent sessions</h2>' + rows.map(function (r) {
                var info = r.module_id != null ? idx[r.module_id] : null;
                var sx = info ? info.sx : SUBJECT_INDEX.find(function (x) { return String(x.subjectId) === String(r.subject_id); });
                var label = info ? info.m.name : (sx ? sx.name + ' mixed' : 'Mixed set');
                var when = '';
                try { when = new Date(r.started_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }); } catch (e) { }
                var n = r.attempt_answers && r.attempt_answers[0] ? r.attempt_answers[0].count : null;
                var score = (r.finished_at && r.score_pct != null) ? '<span class="v2-badge ' + (r.score_pct >= 60 ? 'ok' : 'bad') + '">' + r.score_pct + '%</span>' : '<span class="v2-cont-s">' + (n != null ? n + ' of ' + (r.question_count || '?') : 'Not finished') + '</span>';
                return '<div class="v2-card2 v2-weak v2-recent">' + (sx ? v2SubjIcon(sx, 36) : '<span class="v2-subj-ic" style="width:36px;height:36px"></span>') +
                  '<span class="v2-cont-main"><span class="v2-cont-t">' + esc(label) + '</span><span class="v2-cont-s">' + esc(when) + (r.question_count ? ' · ' + r.question_count + ' questions' : '') + '</span></span>' + score + '</div>';
              }).join('');
              el.hidden = false;
            }, function () { });
        } catch (e) { }
      }

      function v2ProCardHtml() {
        if (!currentUser || isUserPro(currentUser)) return '';
        return '<section class="v2-sec"><div class="v2-card2 v2-pro">' +
          '<div class="v2-cont-main"><span class="v2-pro-k">MedLadder Pro</span><span class="v2-pro-h">All ' + totalTopics() + ' topics, past papers and full-subject mocks</span>' +
          '<span class="v2-cont-s">From ₹' + PRO_CONFIG.PRICE_INR + ' a month. You are using ' + (SUBJECT_INDEX.length * PRO_CONFIG.FREE_MODULES_PER_SUBJECT) + ' free topics.</span></div>' +
          '<button class="v2-btn v2-pro-btn" id="v2ProBtn">See plans</button></div></section>';
      }

      // ---- home (bold) ----------------------------------------------------------
      // One strong card for today's set, quick actions, then progress and
      // subjects as tiles with their illustrations.
      function v2Ring(frac, size, stroke, cls, inner) {
        var r = (size - stroke) / 2, c = 2 * Math.PI * r;
        var len = Math.max(0, Math.min(1, frac || 0)) * c;
        if (frac > 0 && len < 3) len = 3;
        return '<span class="v2-ring ' + (cls || '') + '" style="width:' + size + 'px;height:' + size + 'px">' +
          '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '" aria-hidden="true">' +
          '<circle class="v2-ring-track" cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" stroke-width="' + stroke + '"/>' +
          (len < 1 ? '' : '<circle class="v2-ring-fill" cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" stroke-width="' + stroke + '" stroke-dasharray="' + len.toFixed(1) + ' ' + c.toFixed(1) + '" style="--v2-len:' + len.toFixed(1) + ';--v2-c:' + c.toFixed(1) + '"/>') +
          '</svg>' + (inner ? '<span class="v2-ring-in">' + inner + '</span>' : '') + '</span>';
      }
      function v2Icon(name) {
        var p = {
          review: '<path d="M20 12a8 8 0 11-2.3-5.6M20 4v5h-5"/>',
          mock: '<path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 01-10 0z"/><path d="M17 5h3v2a3 3 0 01-3 3M7 5H4v2a3 3 0 003 3"/>',
          papers: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>',
          custom: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
          bookmarks: '<path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/>',
          flame: '<path d="M12 3c1 3 4 5 4 9a4 4 0 01-8 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 0-8z"/>',
          check: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5L16 9.5"/>',
          target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
          layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
          calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'
        }[name] || '';
        return '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>';
      }
      function v2Slug(name) { return String(name || '').toLowerCase().replace(/&/g, '-').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
      function v2SubjIcon(sx, size) {
        return '<span class="v2-subj-ic v2-cat-' + esc(sx.cat) + '" style="width:' + size + 'px;height:' + size + 'px">' +
          '<img src="/assets/subjects-webp/' + v2Slug(sx.name) + '.webp" alt="" width="' + Math.round(size * 0.7) + '" height="' + Math.round(size * 0.7) + '" loading="lazy"></span>';
      }
      function v2SubjectTile(sx, ix) {
        var ss = v2SubjectStats(sx, ix);
        var comp = ss.qseen / (ss.questions || 1);
        var compPct = Math.round(comp * 100);
        if (comp > 0 && compPct === 0) compPct = 1;
        return '<button class="v2-tile" data-subject="' + sx.subjectId + '" data-name="' + esc(sx.name.toLowerCase()) + '" data-cat="' + esc(sx.cat) + '">' +
          '<span class="v2-tile-top">' + v2SubjIcon(sx, 44) +
          v2Ring(comp, 44, 4.5, 'v2-ring-tile', compPct + '%') + '</span>' +
          '<span class="v2-tile-name">' + esc(sx.name) + '</span>' +
          '<span class="v2-tile-sub">' + ss.started + ' of ' + ss.total + ' topics started</span>' +
          '<span class="v2-tile-meta">' + (ss.pct != null ? '<span class="v2-tile-acc">' + ss.pct + '% correct</span>' : '<span class="v2-tile-acc none">Not started</span>') +
          (ss.due ? '<span class="v2-badge">' + ss.due + ' due</span>' : '') + '</span>' +
          '</button>';
      }
      // ---- topic illustrations ------------------------------------------------
      // Each picture: [tile tone, SVG body on a 64x64 grid]. Topics are matched to
      // a picture by keywords in their name, then section, then subject.
      var V3_ART = {
        heart: ['red', '<path d="M27 15v-7M34 14V6M41 16l3-7" stroke="#B42335" stroke-width="4" stroke-linecap="round"/><path d="M32 56C17 45 9 37 9 26a11.5 11.5 0 0123-3.5A11.5 11.5 0 0155 26c0 11-8 19-23 30z" fill="#E5484D"/><path d="M33 26c4 5 4 12 0 18" stroke="#B42335" stroke-width="2.5" fill="none" stroke-linecap="round"/><ellipse cx="20" cy="25" rx="5" ry="3.5" fill="#fff" opacity=".35"/>'],
        lungs: ['pink', '<path d="M32 5v18M32 23c-2 4-6 7-6 7M32 23c2 4 6 7 6 7" stroke="#CBD5E1" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M27 21c-9-2-17 9-18 23-1 8 4 13 10 12 6-1 9-5 9-12V24z" fill="#F17C8E"/><path d="M37 21c9-2 17 9 18 23 1 8-4 13-10 12-6-1-9-5-9-12V24z" fill="#EC6A7F"/><path d="M15 40c3-1 6 0 8 3M49 40c-3-1-6 0-8 3" stroke="#C94A60" stroke-width="2" fill="none" stroke-linecap="round"/><ellipse cx="17" cy="33" rx="3" ry="5" fill="#fff" opacity=".3"/>'],
        brain: ['pink', '<path d="M31 12c-4-4-12-3-14 2-6 0-9 6-7 11-4 4-3 11 2 13 0 6 6 9 11 7 3 4 8 3 8-1z" fill="#F4A3C0"/><path d="M33 12c4-4 12-3 14 2 6 0 9 6 7 11 4 4 3 11-2 13 0 6-6 9-11 7-3 4-8 3-8-1z" fill="#EE8DB0"/><path d="M20 20c3 1 4 4 3 7M14 30c4-1 7 1 8 4M24 40c0-3 3-5 6-4M44 20c-3 1-4 4-3 7M50 30c-4-1-7 1-8 4M40 40c0-3-3-5-6-4" fill="none" stroke="#C2557F" stroke-width="2.2" stroke-linecap="round"/><path d="M32 13v34" stroke="#C2557F" stroke-width="1.6"/>'],
        neuron: ['violet', '<path d="M24 30L8 18M24 30L6 38M24 30L14 52M29 25L27 7M34 34l22 18" stroke="#A78BFA" stroke-width="3" stroke-linecap="round"/><path d="M38 38l4 3.2M45 43.5l4 3.2" stroke="#FCD34D" stroke-width="5" stroke-linecap="round"/><circle cx="28" cy="30" r="9" fill="#8B5CF6"/><circle cx="28" cy="30" r="3.5" fill="#EDE9FE"/><circle cx="56" cy="52" r="3" fill="#F59E0B"/>'],
        kidney: ['red', '<path d="M30 8c-12 0-20 11-20 24s8 24 20 24c9 0 12-7 9-13-2-4-7-6-7-11s5-7 7-11c3-7-1-13-9-13z" fill="#C8564F"/><path d="M34 32h9c4 0 6 3 6 7v18" fill="none" stroke="#F2C14E" stroke-width="4" stroke-linecap="round"/><path d="M32 26c-3 2-3 10 0 12" stroke="#9E3A34" stroke-width="2.5" fill="none"/><ellipse cx="19" cy="22" rx="4" ry="6" fill="#fff" opacity=".3"/>'],
        adrenal: ['blue', '<path d="M30 16c-11 0-18 10-18 21s7 21 18 21c8 0 11-6 8-12-2-4-6-5-6-10s4-6 6-10c3-6-1-10-8-10z" fill="#C8564F"/><path d="M14 18l10-12 14 8c-2 4-8 6-14 6-4 0-8-1-10-2z" fill="#F59E0B"/><ellipse cx="21" cy="30" rx="3.5" ry="5" fill="#fff" opacity=".3"/><path d="M40 36h6c3 0 5 3 5 6v14" fill="none" stroke="#F2C14E" stroke-width="4" stroke-linecap="round"/>'],
        liver: ['red', '<path d="M8 22c6-8 20-10 34-9 8 0 14 3 14 8 0 6-6 9-14 14-8 6-14 13-20 13-8 0-16-12-14-26z" fill="#B5473F"/><ellipse cx="36" cy="44" rx="4" ry="6" fill="#3FB37F"/><path d="M36 26c-4 4-6 8-8 14" stroke="#8E342E" stroke-width="2.4" fill="none" stroke-linecap="round"/><ellipse cx="22" cy="21" rx="8" ry="3.5" fill="#fff" opacity=".28"/>'],
        gallbladder: ['green', '<path d="M32 6v14" stroke="#2F9E6B" stroke-width="4" stroke-linecap="round"/><path d="M32 18c-8 0-14 10-14 20 0 9 6 16 14 16s14-7 14-16c0-10-6-20-14-20z" fill="#3FB37F"/><circle cx="27" cy="40" r="3.4" fill="#FDE68A"/><circle cx="36" cy="44" r="4" fill="#FCD34D"/><circle cx="33" cy="33" r="2.6" fill="#FDE68A"/><ellipse cx="24" cy="30" rx="2.5" ry="5" fill="#fff" opacity=".3"/>'],
        pancreas: ['violet', '<path d="M8 38c4-10 14-8 22-12 10-5 18-12 26-6 5 4 2 12-6 14-10 3-16 10-26 12C14 48 6 44 8 38z" fill="#F6C177"/><path d="M14 40c10-2 20-8 34-16" stroke="#D99A3F" stroke-width="2.5" fill="none" stroke-linecap="round"/><circle cx="22" cy="38" r="1.8" fill="#D99A3F"/><circle cx="34" cy="32" r="1.8" fill="#D99A3F"/><circle cx="44" cy="25" r="1.8" fill="#D99A3F"/>'],
        spleen: ['violet', '<path d="M18 14c10-8 30-6 36 6 6 12-2 28-16 30-12 2-26-6-26-18 0-8 2-14 6-18z" fill="#9D4A7A"/><path d="M26 24c4 6 4 14 0 18" stroke="#7A2E5C" stroke-width="2.5" fill="none" stroke-linecap="round"/><ellipse cx="22" cy="22" rx="5" ry="3" fill="#fff" opacity=".3"/>'],
        stomach: ['orange', '<path d="M24 6v9c0 6-12 8-12 22 0 10 8 19 20 19 14 0 22-10 22-22 0-8-6-12-12-10-6 2-6 8-10 8s-4-6-4-12V6z" fill="#F08A7E"/><path d="M44 54c2 3 6 4 9 2" stroke="#E06A5E" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M20 30c-2 6 0 14 6 18" stroke="#D95F53" stroke-width="2.2" fill="none" stroke-linecap="round"/><ellipse cx="21" cy="36" rx="3.5" ry="7" fill="#fff" opacity=".3"/>'],
        intestine: ['orange', '<rect x="8" y="10" width="48" height="44" rx="16" fill="none" stroke="#E3836A" stroke-width="7"/><path d="M20 23h24c4.5 0 4.5 7 0 7H22c-4.5 0-4.5 7 0 7h20c4.5 0 4.5 7 0 7H26" fill="none" stroke="#F4A68A" stroke-width="5.5" stroke-linecap="round"/>'],
        eye: ['blue', '<path d="M4 32c8-12 18-18 28-18s20 6 28 18c-8 12-18 18-28 18S12 44 4 32z" fill="#fff" stroke="#CBD5E1" stroke-width="2"/><circle cx="32" cy="32" r="12" fill="#3B82F6"/><circle cx="32" cy="32" r="12" fill="none" stroke="#1D4ED8" stroke-width="2"/><circle cx="32" cy="32" r="5.5" fill="#0F172A"/><circle cx="36" cy="28" r="2.6" fill="#fff"/>'],
        glasses: ['blue', '<circle cx="18" cy="36" r="11" fill="#E0F2FE" stroke="#1E293B" stroke-width="4"/><circle cx="46" cy="36" r="11" fill="#E0F2FE" stroke="#1E293B" stroke-width="4"/><path d="M29 34c2-2 4-2 6 0M7.5 33L4 21M56.5 33L60 21" stroke="#1E293B" stroke-width="3.5" stroke-linecap="round" fill="none"/><path d="M13 32l5-4M41 32l5-4" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>'],
        ear: ['orange', '<path d="M36 6c-12 0-20 9-20 20 0 6 2 9 4 12 2 4 1 8 2 12 1 6 6 8 10 8 6 0 8-5 8-9 0-6 10-10 12-18 3-13-5-25-16-25z" fill="#F2B49A"/><path d="M28 26c0-6 4-10 9-10s9 4 9 9c0 6-6 7-8 12-1 3-4 3-5 0" fill="none" stroke="#C9786A" stroke-width="3" stroke-linecap="round"/><ellipse cx="26" cy="18" rx="3" ry="5" fill="#fff" opacity=".3"/>'],
        nose: ['orange', '<path d="M28 6c0 14 4 22 14 30 6 5 3 14-6 13-3 0-4-3-8-3s-6 4-10 3c-8-2-8-10-3-14 6-5 7-14 7-29z" fill="#F2B49A"/><ellipse cx="25" cy="46" rx="3.2" ry="2" fill="#A35D52"/><ellipse cx="37" cy="46" rx="3.2" ry="2" fill="#A35D52"/><path d="M31 10c0 10 2 16 6 22" stroke="#fff" stroke-width="2.5" opacity=".4" fill="none" stroke-linecap="round"/>'],
        mouth: ['pink', '<path d="M8 26c8-8 40-8 48 0-4 17-14 26-24 26S12 43 8 26z" fill="#9F1239"/><path d="M8 26c8-5 40-5 48 0" stroke="#FFE4E6" stroke-width="5" fill="none"/><path d="M19 44c4-9 22-9 26 0-4 4-8 6-13 6s-9-2-13-6z" fill="#FB7185"/><path d="M32 39v8" stroke="#E11D48" stroke-width="2" stroke-linecap="round"/>'],
        larynx: ['pink', '<rect x="12" y="6" width="18" height="52" rx="9" fill="#F4A3A8"/><path d="M12 18h18M12 27h18M12 36h18M12 45h18" stroke="#D66A75" stroke-width="3"/><path d="M40 22c4 3 4 9 0 12M46 17c7 5 7 16 0 21M52 12c10 7 10 24 0 31" fill="none" stroke="#8B5CF6" stroke-width="3" stroke-linecap="round"/>'],
        tooth: ['blue', '<path d="M20 10c-8 0-12 8-10 16 2 6 4 8 5 16 1 10 4 14 7 14 4 0 4-12 10-12s6 12 10 12c3 0 6-4 7-14 1-8 3-10 5-16 2-8-2-16-10-16-6 0-8 3-12 3s-6-3-12-3z" fill="#fff" stroke="#CBD5E1" stroke-width="2"/><path d="M18 18c2-3 6-3 8-1" stroke="#BFDBFE" stroke-width="3" fill="none" stroke-linecap="round"/>'],
        bone: ['blue', '<g transform="rotate(-45 32 32)"><rect x="14" y="27" width="36" height="10" rx="5" fill="#EFE2C4"/><circle cx="14" cy="26" r="7" fill="#EFE2C4"/><circle cx="14" cy="38" r="7" fill="#EFE2C4"/><circle cx="50" cy="26" r="7" fill="#EFE2C4"/><circle cx="50" cy="38" r="7" fill="#EFE2C4"/><path d="M18 30h28" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/></g>'],
        fracture: ['blue', '<g transform="rotate(-45 32 32)"><path d="M14 27h14l2 3-3 2 2 3-1 2H14z" fill="#EFE2C4"/><circle cx="12" cy="26" r="7" fill="#EFE2C4"/><circle cx="12" cy="38" r="7" fill="#EFE2C4"/><path d="M52 27H38l-1 2 2 3-2 3 1 2h14z" fill="#EFE2C4"/><circle cx="54" cy="26" r="7" fill="#EFE2C4"/><circle cx="54" cy="38" r="7" fill="#EFE2C4"/></g><path d="M30 20l-4 6M38 40l4 6M24 34l-6 2" stroke="#EF4444" stroke-width="3" stroke-linecap="round"/>'],
        joint: ['blue', '<rect x="25" y="4" width="14" height="20" rx="5" fill="#EFE2C4"/><path d="M18 24c0-4 4-6 8-6h12c4 0 8 2 8 6s-4 6-8 6H26c-4 0-8-2-8-6z" fill="#EFE2C4"/><path d="M19 38c0-3 3-4 6-4h14c3 0 6 1 6 4s-3 4-6 4H25c-3 0-6-1-6-4z" fill="#EFE2C4"/><rect x="26" y="40" width="12" height="20" rx="5" fill="#EFE2C4"/><path d="M21 32h22" stroke="#7DD3FC" stroke-width="3.5" stroke-linecap="round"/><circle cx="49" cy="31" r="5.5" fill="#E7D9BB"/>'],
        spine: ['blue', '<g fill="#EFE2C4"><rect x="20" y="5" width="20" height="8" rx="3"/><rect x="20" y="17" width="20" height="8" rx="3"/><rect x="20" y="29" width="20" height="8" rx="3"/><rect x="20" y="41" width="20" height="8" rx="3"/><rect x="20" y="53" width="20" height="7" rx="3"/><path d="M40 7l8 3-8 1zM40 19l8 3-8 1zM40 31l8 3-8 1zM40 43l8 3-8 1z"/></g><g fill="#60A5FA"><rect x="23" y="13.5" width="14" height="3" rx="1.5"/><rect x="23" y="25.5" width="14" height="3" rx="1.5"/><rect x="23" y="37.5" width="14" height="3" rx="1.5"/><rect x="23" y="49.5" width="14" height="3" rx="1.5"/></g>'],
        pelvis: ['blue', '<path d="M8 16c8-4 15 0 19 7h10c4-7 11-11 19-7 4 11 0 23-10 27l-4 11H22l-4-11C8 39 4 27 8 16z" fill="#EFE2C4"/><circle cx="21" cy="34" r="5" fill="#E2D3B0"/><circle cx="43" cy="34" r="5" fill="#E2D3B0"/><ellipse cx="32" cy="42" rx="5" ry="4" fill="#E2D3B0"/>'],
        skull: ['slate', '<path d="M32 7c-13 0-22 9-22 21 0 7 3 12 8 15v8c0 2 2 4 4 4h20c2 0 4-2 4-4v-8c5-3 8-8 8-15 0-12-9-21-22-21z" fill="#EFE2C4"/><circle cx="23" cy="30" r="6" fill="#3F3A52"/><circle cx="41" cy="30" r="6" fill="#3F3A52"/><path d="M32 36l-3 6h6z" fill="#3F3A52"/><path d="M26 49v6M32 49v6M38 49v6" stroke="#C9BB9A" stroke-width="2"/>'],
        hand: ['orange', '<path d="M19 36V18a3.5 3.5 0 017 0v12V11a3.5 3.5 0 017 0v19V13a3.5 3.5 0 017 0v19-9a3.5 3.5 0 017 0v19c0 12-7 18-16 18-6 0-10-3-13-8l-7-11a3.5 3.5 0 016-3.5z" fill="#F2B49A"/><path d="M26 30v6M33 30v6M40 31v6" stroke="#D48E78" stroke-width="2" stroke-linecap="round"/>'],
        muscle: ['red', '<path d="M2 32h9M53 32h9" stroke="#EFE2C4" stroke-width="5" stroke-linecap="round"/><path d="M8 32c8-15 40-15 48 0-8 15-40 15-48 0z" fill="#E5484D"/><path d="M14 32c10-6 26-6 36 0M16 26.5c10-4 22-4 32 0M16 37.5c10 4 22 4 32 0" stroke="#FCA5A5" stroke-width="2" fill="none"/>'],
        skin: ['orange', '<rect x="8" y="14" width="48" height="10" rx="3" fill="#E9A07E"/><rect x="8" y="24" width="48" height="14" fill="#F7C9B5"/><rect x="8" y="38" width="48" height="14" rx="3" fill="#FDE68A"/><circle cx="18" cy="45" r="3" fill="#FCD34D"/><circle cx="30" cy="46" r="3.5" fill="#FCD34D"/><circle cx="44" cy="45" r="3" fill="#FCD34D"/><path d="M24 36l3-30M40 36l-2-30" stroke="#5B3A29" stroke-width="2" stroke-linecap="round"/><circle cx="24" cy="36" r="2.6" fill="#B45309"/><circle cx="40" cy="36" r="2.6" fill="#B45309"/>'],
        uterus: ['pink', '<path d="M24 20c-4-3-9-3-11 1-1 3 1 6 4 6M40 20c4-3 9-3 11 1 1 3-1 6-4 6" fill="none" stroke="#F472B6" stroke-width="3.5" stroke-linecap="round"/><circle cx="13" cy="28" r="4.5" fill="#FBCFE8"/><circle cx="51" cy="28" r="4.5" fill="#FBCFE8"/><path d="M23 20c0-6 4-8 9-8s9 2 9 8c0 9-5 13-5 19v8h-8v-8c0-6-5-10-5-19z" fill="#F472B6"/><path d="M28 46h8v8h-8z" fill="#EC4899"/><ellipse cx="28" cy="22" rx="2.5" ry="4" fill="#fff" opacity=".35"/>'],
        fetus: ['pink', '<circle cx="32" cy="32" r="25" fill="#FDE2EF"/><circle cx="32" cy="32" r="25" fill="none" stroke="#F472B6" stroke-width="3"/><path d="M29 29c-7 4-9 13-4 18 5 5 13 4 15-2 2-5-2-8-6-7" fill="none" stroke="#F9A8C9" stroke-width="8" stroke-linecap="round"/><circle cx="36" cy="22" r="8" fill="#F9A8C9"/><path d="M14 44c2 5 6 8 10 9" stroke="#EC4899" stroke-width="2.5" fill="none" stroke-linecap="round"/>'],
        egg: ['amber', '<circle cx="39" cy="35" r="17" fill="#FDE68A"/><circle cx="39" cy="35" r="17" fill="none" stroke="#F59E0B" stroke-width="3"/><circle cx="41" cy="33" r="5.5" fill="#F59E0B"/><path d="M5 12c3 3 6 0 8 3s5 2 7 5" fill="none" stroke="#3B82F6" stroke-width="2" stroke-linecap="round"/><ellipse cx="22" cy="22" rx="4.5" ry="3.5" fill="#3B82F6" transform="rotate(35 22 22)"/><path d="M6 30c3 2 5-1 8 1" fill="none" stroke="#60A5FA" stroke-width="2" stroke-linecap="round"/><ellipse cx="18" cy="33" rx="3.5" ry="2.8" fill="#60A5FA"/>'],
        baby: ['blue', '<circle cx="12" cy="35" r="4" fill="#F5C39B"/><circle cx="52" cy="35" r="4" fill="#F5C39B"/><circle cx="32" cy="35" r="20" fill="#FCD9B8"/><circle cx="25" cy="33" r="2.6" fill="#3F3A52"/><circle cx="39" cy="33" r="2.6" fill="#3F3A52"/><path d="M27 42c3 3 7 3 10 0" stroke="#C2410C" stroke-width="2.5" fill="none" stroke-linecap="round"/><circle cx="20" cy="40" r="3" fill="#F9A8A8" opacity=".7"/><circle cx="44" cy="40" r="3" fill="#F9A8A8" opacity=".7"/><path d="M29 15c0-5 7-5 7 0" stroke="#B45309" stroke-width="3" fill="none" stroke-linecap="round"/>'],
        bottle: ['blue', '<path d="M28 4h8v7h-8z" fill="#FCA5A5"/><path d="M25 11h14l3 7H22z" fill="#F9A8D4"/><rect x="19" y="18" width="26" height="40" rx="9" fill="#E0F2FE" stroke="#93C5FD" stroke-width="2"/><rect x="21" y="32" width="22" height="24" rx="7" fill="#fff"/><path d="M25 26h7M25 34h7M25 42h7" stroke="#93C5FD" stroke-width="2" stroke-linecap="round"/>'],
        breast: ['pink', '<path d="M32 10c-6 0-10 4-10 10 0 8 6 14 10 20 4-6 10-12 10-20 0-6-4-10-10-10z" fill="none" stroke="#EC4899" stroke-width="6.5"/><path d="M27 34L16 54l7-1 3 6 10-21M37 34l11 20-7-1-3 6-10-21" fill="#EC4899"/>'],
        thyroid: ['pink', '<rect x="28" y="4" width="8" height="56" rx="4" fill="#CBD5E1"/><path d="M30 30c-2-10-10-18-16-16-6 2-6 14-2 22 4 8 14 8 18 2z" fill="#E879A6"/><path d="M34 30c2-10 10-18 16-16 6 2 6 14 2 22-4 8-14 8-18 2z" fill="#E879A6"/><rect x="27" y="29" width="10" height="9" rx="3" fill="#D9558A"/><ellipse cx="17" cy="22" rx="2.5" ry="4" fill="#fff" opacity=".35"/>'],
        glucose: ['violet', '<rect x="12" y="8" width="28" height="44" rx="8" fill="#6366F1"/><rect x="16" y="14" width="20" height="14" rx="3" fill="#E0E7FF"/><path d="M20 21h4l2-3 3 6 2-3h2" stroke="#6366F1" stroke-width="1.8" fill="none" stroke-linecap="round"/><circle cx="26" cy="39" r="4.5" fill="#A5B4FC"/><path d="M34 52v8" stroke="#CBD5E1" stroke-width="5"/><path d="M50 28c3.5 5.5 6.5 9 6.5 13a6.5 6.5 0 01-13 0c0-4 3-7.5 6.5-13z" fill="#EF4444"/>'],
        bladder: ['blue', '<path d="M14 6c4 8 6 14 10 18M50 6c-4 8-6 14-10 18" stroke="#E0A82E" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M32 22c-12 0-18 8-18 16 0 10 8 16 18 16s18-6 18-16c0-8-6-16-18-16z" fill="#F2C14E"/><path d="M30 53h4v7h-4z" fill="#E0A82E"/><ellipse cx="23" cy="34" rx="3" ry="5" fill="#fff" opacity=".35"/>'],
        male: ['blue', '<circle cx="26" cy="38" r="14" fill="#DBEAFE" stroke="#3B82F6" stroke-width="6"/><path d="M36 28l14-14M38 14h12v12" fill="none" stroke="#3B82F6" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>'],
        dna: ['violet', '<path d="M24 12h16M28 20h8M28 44h8M24 52h16M30 32h4" stroke="#F59E0B" stroke-width="3" stroke-linecap="round"/><path d="M20 4c0 14 24 14 24 28S20 46 20 60" fill="none" stroke="#8B5CF6" stroke-width="5" stroke-linecap="round"/><path d="M44 4c0 14-24 14-24 28s24 14 24 28" fill="none" stroke="#22C3A6" stroke-width="5" stroke-linecap="round"/>'],
        chromosome: ['violet', '<path d="M18 7c4 0 10 16 14 24 4-8 10-24 14-24s4 6 0 12c-4 6-8 10-10 13 2 2 6 6 10 12 4 6 4 12 0 12s-10-16-14-24c-4 8-10 24-14 24s-4-6 0-12c4-6 8-10 10-12-2-3-6-7-10-13-4-6-4-12 0-12z" fill="#A78BFA"/><circle cx="32" cy="32" r="4.5" fill="#7C3AED"/><path d="M16 12l6 6M48 12l-6 6" stroke="#EDE9FE" stroke-width="2" stroke-linecap="round"/>'],
        cell: ['violet', '<circle cx="32" cy="32" r="24" fill="#C4B5FD"/><circle cx="32" cy="32" r="24" fill="none" stroke="#8B5CF6" stroke-width="2.5"/><circle cx="34" cy="30" r="9" fill="#7C3AED"/><circle cx="36" cy="28" r="3" fill="#C4B5FD"/><ellipse cx="18" cy="39" rx="5" ry="2.5" fill="#F59E0B" transform="rotate(-30 18 39)"/><ellipse cx="44" cy="45" rx="5" ry="2.5" fill="#F59E0B" transform="rotate(20 44 45)"/><circle cx="21" cy="21" r="2" fill="#22C3A6"/><circle cx="47" cy="22" r="2" fill="#22C3A6"/><circle cx="26" cy="49" r="2" fill="#22C3A6"/>'],
        celldead: ['slate', '<path d="M9 34a23 23 0 0144-8l-11 4 7 9-13-3-4 11-6-9-9 6z" fill="#C4B5FD"/><path d="M10 40c2 6 7 11 13 13l3-8z" fill="#DDD6FE"/><circle cx="30" cy="27" r="4" fill="#6D28D9"/><circle cx="38" cy="33" r="2.5" fill="#6D28D9"/><circle cx="26" cy="35" r="2" fill="#6D28D9"/><circle cx="50" cy="48" r="3" fill="#A78BFA"/><circle cx="44" cy="54" r="2" fill="#A78BFA"/>'],
        inflam: ['red', '<path d="M32 4v8M13 12l5 6M51 12l-5 6M5 30h8M51 30h8" stroke="#F97316" stroke-width="4" stroke-linecap="round"/><circle cx="32" cy="38" r="19" fill="#FCA5A5"/><circle cx="32" cy="38" r="19" fill="none" stroke="#EF4444" stroke-width="2.5"/><circle cx="32" cy="38" r="7.5" fill="#DC2626"/><circle cx="21" cy="30" r="2.5" fill="#fff" opacity=".7"/>'],
        rbc: ['red', '<ellipse cx="24" cy="25" rx="17" ry="14" fill="#E5484D"/><ellipse cx="24" cy="25" rx="7" ry="5.5" fill="#B91C1C"/><ellipse cx="43" cy="43" rx="15" ry="12" fill="#F05252"/><ellipse cx="43" cy="43" rx="6" ry="4.5" fill="#C81E1E"/><ellipse cx="15" cy="20" rx="3" ry="2" fill="#fff" opacity=".4"/>'],
        wbc: ['violet', '<circle cx="32" cy="32" r="23" fill="#EDE9FE"/><circle cx="32" cy="32" r="23" fill="none" stroke="#A78BFA" stroke-width="2.5"/><path d="M21 30c0-6 6-8 9-5 3-4 10-3 10 3 4 2 4 9-1 10-2 5-9 5-11 1-5 1-8-4-7-9z" fill="#7C3AED"/><circle cx="20" cy="46" r="1.8" fill="#C4B5FD"/><circle cx="44" cy="20" r="1.8" fill="#C4B5FD"/><circle cx="46" cy="42" r="1.8" fill="#C4B5FD"/>'],
        drop: ['red', '<path d="M32 5c8 12 18 22 18 33a18 18 0 01-36 0c0-11 10-21 18-33z" fill="#DC2626"/><ellipse cx="25" cy="38" rx="4" ry="7" fill="#fff" opacity=".35"/><path d="M38 46c3-2 5-5 5-9" stroke="#fff" stroke-width="2.5" opacity=".5" fill="none" stroke-linecap="round"/>'],
        antibody: ['blue', '<path d="M32 58V34M32 34L17 13M32 34l15-21" stroke="#3B82F6" stroke-width="7" stroke-linecap="round"/><path d="M23 31L11 15M41 31l12-16" stroke="#93C5FD" stroke-width="5" stroke-linecap="round"/><circle cx="32" cy="34" r="4" fill="#1D4ED8"/>'],
        bacteria: ['green', '<path d="M6 18c-3 3-2 6 1 8M58 46c3-3 2-6-1-8M24 6c-3 0-5 3-4 6" stroke="#16A34A" stroke-width="2" fill="none" stroke-linecap="round"/><rect x="8" y="14" width="32" height="14" rx="7" fill="#22C55E" transform="rotate(-20 24 21)"/><rect x="24" y="34" width="32" height="14" rx="7" fill="#16A34A" transform="rotate(15 40 41)"/><circle cx="18" cy="21" r="2" fill="#BBF7D0"/><circle cx="29" cy="18" r="2" fill="#BBF7D0"/><circle cx="36" cy="39" r="2" fill="#BBF7D0"/><circle cx="46" cy="42" r="2" fill="#BBF7D0"/>'],
        rodred: ['red', '<rect x="6" y="18" width="30" height="10" rx="5" fill="#E11D48" transform="rotate(-25 21 23)"/><rect x="26" y="20" width="30" height="10" rx="5" fill="#F43F5E" transform="rotate(30 41 25)"/><rect x="14" y="40" width="34" height="10" rx="5" fill="#BE123C" transform="rotate(-8 31 45)"/><circle cx="20" cy="22" r="1.6" fill="#FFE4E6"/><circle cx="40" cy="25" r="1.6" fill="#FFE4E6"/><circle cx="30" cy="45" r="1.6" fill="#FFE4E6"/>'],
        cocci: ['violet', '<circle cx="12" cy="42" r="7" fill="#A855F7"/><circle cx="24" cy="34" r="7" fill="#9333EA"/><circle cx="36" cy="27" r="7" fill="#A855F7"/><circle cx="49" cy="22" r="7" fill="#9333EA"/><circle cx="22" cy="53" r="6" fill="#C084FC"/><circle cx="34" cy="49" r="6" fill="#C084FC"/><circle cx="46" cy="44" r="6" fill="#C084FC"/><circle cx="10" cy="40" r="2" fill="#F3E8FF"/><circle cx="34" cy="25" r="2" fill="#F3E8FF"/>'],
        spiral: ['orange', '<path d="M5 32c4-9 8-9 10 0s6 9 10 0 6-9 10 0 6 9 10 0 6-9 10 0" fill="none" stroke="#F97316" stroke-width="5.5" stroke-linecap="round"/><path d="M10 50c3-5 6-5 8 0s5 5 8 0 5-5 8 0" fill="none" stroke="#FDBA74" stroke-width="4" stroke-linecap="round"/>'],
        virus: ['red', '<g stroke="#B91C1C" stroke-width="3" stroke-linecap="round"><path d="M47 32h8M42.6 42.6l5.7 5.7M32 47v8M21.4 42.6l-5.7 5.7M17 32H9M21.4 21.4l-5.7-5.7M32 17V9M42.6 21.4l5.7-5.7"/></g><g fill="#F59E0B"><circle cx="56" cy="32" r="3.5"/><circle cx="49" cy="49" r="3.5"/><circle cx="32" cy="56" r="3.5"/><circle cx="15" cy="49" r="3.5"/><circle cx="8" cy="32" r="3.5"/><circle cx="15" cy="15" r="3.5"/><circle cx="32" cy="8" r="3.5"/><circle cx="49" cy="15" r="3.5"/></g><circle cx="32" cy="32" r="16" fill="#EF4444"/><circle cx="27" cy="28" r="3" fill="#FCA5A5"/><circle cx="37" cy="36" r="2.5" fill="#FCA5A5"/><circle cx="36" cy="25" r="1.8" fill="#FCA5A5"/>'],
        fungus: ['red', '<rect x="25" y="30" width="14" height="26" rx="5" fill="#FDE68A"/><path d="M6 32c0-13 12-22 26-22s26 9 26 22z" fill="#EF4444"/><circle cx="19" cy="23" r="3.5" fill="#fff"/><circle cx="33" cy="17" r="3.5" fill="#fff"/><circle cx="45" cy="25" r="3" fill="#fff"/><circle cx="28" cy="27" r="2" fill="#fff"/>'],
        worm: ['pink', '<path d="M8 44c6-11 12-11 16-2s10 9 14-2 12-15 18-6" fill="none" stroke="#F0A6A0" stroke-width="10" stroke-linecap="round"/><path d="M14 38v4M22 40v4M30 44v4M38 38v4M46 30v4" stroke="#D97B73" stroke-width="2" stroke-linecap="round"/><circle cx="56" cy="34" r="2" fill="#7C2D12"/>'],
        amoeba: ['green', '<path d="M14 30c-4-10 6-18 14-14 6-8 20-6 22 4 8 2 10 14 2 18 0 10-12 14-18 8-8 6-20 0-18-8-6-2-6-6-2-8z" fill="#86EFAC"/><path d="M14 30c-4-10 6-18 14-14 6-8 20-6 22 4 8 2 10 14 2 18 0 10-12 14-18 8-8 6-20 0-18-8-6-2-6-6-2-8z" fill="none" stroke="#22C55E" stroke-width="2"/><circle cx="34" cy="32" r="7" fill="#15803D"/><circle cx="22" cy="40" r="3" fill="#4ADE80"/><circle cx="44" cy="22" r="2.5" fill="#4ADE80"/>'],
        mosquito: ['cyan', '<ellipse cx="22" cy="22" rx="13" ry="5" fill="#BAE6FD" opacity=".95" transform="rotate(-40 22 22)"/><ellipse cx="45" cy="39" rx="13" ry="5" fill="#BAE6FD" opacity=".95" transform="rotate(30 45 39)"/><ellipse cx="31" cy="37" rx="4.5" ry="15" fill="#475569" transform="rotate(-30 31 37)"/><circle cx="40" cy="22" r="5" fill="#334155"/><path d="M43 19l11-11M27 43l-10 14M31 45l-4 14M35 43l6 14" stroke="#334155" stroke-width="2" stroke-linecap="round"/>'],
        bug: ['green', '<path d="M18 28l-10-6M18 36l-12 0M20 44l-10 8M46 28l10-6M46 36h12M44 44l10 8" stroke="#78350F" stroke-width="2.5" stroke-linecap="round"/><ellipse cx="32" cy="38" rx="15" ry="17" fill="#92400E"/><circle cx="32" cy="19" r="6.5" fill="#78350F"/><path d="M32 23v30" stroke="#B45309" stroke-width="2"/><ellipse cx="25" cy="32" rx="3" ry="5" fill="#fff" opacity=".25"/>'],
        pill: ['blue', '<g transform="rotate(-40 30 28)"><rect x="8" y="18" width="44" height="20" rx="10" fill="#fff" stroke="#CBD5E1" stroke-width="2"/><path d="M30 18h12a10 10 0 010 20H30z" fill="#EF4444"/><path d="M14 24h8" stroke="#E2E8F0" stroke-width="3" stroke-linecap="round"/></g><circle cx="46" cy="48" r="9" fill="#60A5FA"/><path d="M39 48h14" stroke="#fff" stroke-width="2.5"/>'],
        syringe: ['cyan', '<g transform="rotate(45 32 32)"><rect x="24" y="12" width="16" height="32" rx="3" fill="#E0F2FE" stroke="#38BDF8" stroke-width="2"/><rect x="26" y="26" width="12" height="16" fill="#38BDF8"/><path d="M32 44v14M23 7h18M32 7v5" stroke="#64748B" stroke-width="3" stroke-linecap="round"/><path d="M28 18h5M28 23h5" stroke="#38BDF8" stroke-width="2"/></g>'],
        drip: ['cyan', '<path d="M26 4h12" stroke="#94A3B8" stroke-width="3" stroke-linecap="round"/><path d="M20 8h24v30c0 6-4 10-12 10s-12-4-12-10z" fill="#E0F2FE" stroke="#38BDF8" stroke-width="2"/><path d="M21 24h22v14c0 5-4 9-11 9s-11-4-11-9z" fill="#38BDF8" opacity=".7"/><path d="M32 48v12" stroke="#38BDF8" stroke-width="3"/><circle cx="32" cy="54" r="2.6" fill="#0EA5E9"/>'],
        flask: ['violet', '<path d="M26 6h12M28 6v16L14 50c-2 4 1 8 5 8h26c4 0 7-4 5-8L36 22V6" fill="#fff" stroke="#94A3B8" stroke-width="2.5" stroke-linejoin="round"/><path d="M19 41h26l4.5 9c1 3-1 5-4 5H18.5c-3 0-5-2-4-5z" fill="#A78BFA"/><circle cx="28" cy="33" r="2.6" fill="#C4B5FD"/><circle cx="35" cy="27" r="1.8" fill="#C4B5FD"/>'],
        molecule: ['blue', '<path d="M20 20l12 12 14-8M32 32l-4 16M32 32l14 14" stroke="#94A3B8" stroke-width="3"/><circle cx="20" cy="20" r="7" fill="#EF4444"/><circle cx="32" cy="32" r="8" fill="#3B82F6"/><circle cx="46" cy="24" r="6" fill="#F59E0B"/><circle cx="28" cy="50" r="6" fill="#22C55E"/><circle cx="47" cy="47" r="5" fill="#E2E8F0"/><circle cx="29" cy="29" r="2.5" fill="#fff" opacity=".5"/>'],
        sugar: ['amber', '<path d="M50 20l8-4M14 40l-8 4M50 40l8 4M14 20l-8-4" stroke="#FBBF24" stroke-width="3" stroke-linecap="round"/><path d="M32 10l18 10v20L32 50 14 40V20z" fill="#FEF3C7" stroke="#F59E0B" stroke-width="5" stroke-linejoin="round"/><circle cx="32" cy="10" r="5" fill="#EF4444"/><path d="M26 30h12M32 24v12" stroke="#F59E0B" stroke-width="3" stroke-linecap="round"/>'],
        cycle: ['green', '<path d="M50 24a19 19 0 00-31-7" fill="none" stroke="#22C3A6" stroke-width="5" stroke-linecap="round"/><path d="M14 40a19 19 0 0031 7" fill="none" stroke="#8B5CF6" stroke-width="5" stroke-linecap="round"/><path d="M13 9l5 9 9-3" fill="none" stroke="#22C3A6" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path d="M51 55l-5-9-9 3" fill="none" stroke="#8B5CF6" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="32" cy="32" r="6" fill="#F59E0B"/>'],
        lipid: ['blue', '<circle cx="26" cy="30" r="16" fill="#FCD34D"/><circle cx="44" cy="45" r="10" fill="#FBBF24"/><circle cx="46" cy="18" r="6" fill="#FDE68A"/><ellipse cx="20" cy="24" rx="5" ry="3" fill="#fff" opacity=".55"/><ellipse cx="41" cy="41" rx="3" ry="2" fill="#fff" opacity=".55"/>'],
        vitamin: ['orange', '<circle cx="32" cy="32" r="25" fill="#FB923C"/><circle cx="32" cy="32" r="20" fill="#FED7AA"/><g stroke="#FB923C" stroke-width="2.5"><path d="M32 12v40M12 32h40M18 18l28 28M46 18L18 46"/></g><circle cx="32" cy="32" r="4" fill="#FB923C"/>'],
        apple: ['red', '<path d="M32 18c0-6 2-10 6-12" stroke="#78350F" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M32 18c-10-6-22 0-22 14 0 14 10 26 22 22 12 4 22-8 22-22 0-14-12-20-22-14z" fill="#EF4444"/><path d="M34 14c6-6 12-4 14 0-6 4-10 4-14 0z" fill="#22C55E"/><ellipse cx="21" cy="30" rx="4" ry="7" fill="#fff" opacity=".3"/>'],
        microscope: ['violet', '<path d="M18 57h30M24 49h18" stroke="#475569" stroke-width="5" stroke-linecap="round"/><path d="M46 31c8 6 6 20-4 22" fill="none" stroke="#475569" stroke-width="5" stroke-linecap="round"/><path d="M23 9l10-4 13 26-10 4z" fill="#6366F1"/><rect x="29" y="34" width="12" height="6" rx="2" fill="#475569"/><circle cx="35" cy="45" r="3" fill="#A5B4FC"/>'],
        scale: ['blue', '<path d="M32 9v43M18 56h28M13 16h38" stroke="#B45309" stroke-width="4" stroke-linecap="round"/><path d="M14 16L6 34M14 16l8 18M50 16l-8 18M50 16l8 18" stroke="#B45309" stroke-width="2" stroke-linecap="round"/><path d="M5 34a9 5 0 0018 0zM41 34a9 5 0 0018 0z" fill="#F59E0B"/><circle cx="32" cy="8" r="4.5" fill="#F59E0B"/>'],
        fingerprint: ['violet', '<g fill="none" stroke="#6366F1" stroke-width="3" stroke-linecap="round"><path d="M18 18a17 17 0 0128 0"/><path d="M12 32c0-12 9-21 20-21s20 9 20 21"/><path d="M20 50c-2-4-4-10-4-16 0-9 7-15 16-15s16 6 16 15c0 4 0 8-2 12"/><path d="M27 55c-2-6-4-13-4-21 0-5 4-8 9-8s9 3 9 8c0 6 0 12-2 17"/><path d="M32 34c0 8 0 14 2 21"/></g>'],
        poison: ['green', '<rect x="27" y="4" width="10" height="8" rx="2" fill="#78350F"/><path d="M24 12h16v6l6 8v26c0 4-3 6-6 6H24c-3 0-6-2-6-6V26l6-8z" fill="#4ADE80"/><circle cx="32" cy="35" r="8" fill="#fff"/><circle cx="29" cy="34" r="2" fill="#14532D"/><circle cx="35" cy="34" r="2" fill="#14532D"/><path d="M24 51l16-6M24 45l16 6" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>'],
        bandage: ['orange', '<g transform="rotate(-40 32 32)"><rect x="5" y="22" width="54" height="20" rx="10" fill="#F5C9A3"/><rect x="22" y="22" width="20" height="20" fill="#FDE6CF"/><g fill="#D6A27A"><circle cx="27" cy="27.5" r="1.6"/><circle cx="37" cy="27.5" r="1.6"/><circle cx="27" cy="36.5" r="1.6"/><circle cx="37" cy="36.5" r="1.6"/><circle cx="32" cy="32" r="1.6"/></g></g>'],
        fire: ['orange', '<path d="M32 4c4 10 16 16 16 32a16 16 0 01-32 0c0-8 4-12 8-16 0 6 3 9 6 9-3-9 0-17 2-25z" fill="#F97316"/><path d="M32 30c2 6 8 8 8 16a8 8 0 01-16 0c0-4 2-6 4-8 0 3 2 4 3 4-1-5 0-9 1-12z" fill="#FCD34D"/>'],
        blast: ['orange', '<path d="M32 4l5 14 13-8-5 14 15 3-14 6 9 12-15-4-1 15-8-12-8 12-1-15-15 4 9-12-14-6 15-3-5-14 13 8z" fill="#F97316"/><circle cx="32" cy="32" r="9" fill="#FCD34D"/>'],
        water: ['cyan', '<path d="M32 5c7 10 14 18 14 26a14 14 0 01-28 0c0-8 7-16 14-26z" fill="#38BDF8"/><path d="M5 50c5-4 9-4 13 0s9 4 13 0 9-4 13 0 9 4 13 0" fill="none" stroke="#0EA5E9" stroke-width="4" stroke-linecap="round"/><ellipse cx="27" cy="31" rx="3" ry="5" fill="#fff" opacity=".5"/>'],
        ecg: ['green', '<rect x="6" y="11" width="52" height="38" rx="8" fill="#0F172A"/><path d="M10 31h10l4-10 6 20 5-14 3 4h16" fill="none" stroke="#22C55E" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M24 56h16" stroke="#64748B" stroke-width="4" stroke-linecap="round"/>'],
        bp: ['red', '<circle cx="32" cy="34" r="23" fill="#fff" stroke="#94A3B8" stroke-width="3"/><path d="M14 40a18.5 18.5 0 0137 0" fill="none" stroke="#FECACA" stroke-width="5"/><path d="M38 23a18.5 18.5 0 0113 17" fill="none" stroke="#EF4444" stroke-width="5"/><path d="M32 34l10-12" stroke="#0F172A" stroke-width="3" stroke-linecap="round"/><circle cx="32" cy="34" r="3.5" fill="#0F172A"/>'],
        vessel: ['red', '<path d="M4 22h56v20H4z" fill="#FCA5A5"/><path d="M4 22h56M4 42h56" stroke="#DC2626" stroke-width="4"/><ellipse cx="36" cy="25.5" rx="11" ry="4" fill="#FDE68A"/><ellipse cx="14" cy="34" rx="4.5" ry="3" fill="#DC2626"/><ellipse cx="27" cy="36" rx="4.5" ry="3" fill="#DC2626"/><ellipse cx="48" cy="34" rx="4.5" ry="3" fill="#DC2626"/>'],
        steth: ['blue', '<path d="M16 6v14a12 12 0 0024 0V6" fill="none" stroke="#475569" stroke-width="4" stroke-linecap="round"/><path d="M28 32v8a12 12 0 0024 0v-6" fill="none" stroke="#475569" stroke-width="4" stroke-linecap="round"/><circle cx="52" cy="30" r="6.5" fill="#3B82F6" stroke="#475569" stroke-width="3"/><circle cx="16" cy="6" r="3" fill="#94A3B8"/><circle cx="40" cy="6" r="3" fill="#94A3B8"/>'],
        mask: ['teal', '<path d="M8 30l12 2M56 30l-12 2" stroke="#64748B" stroke-width="2.5"/><path d="M20 22c0-8 6-12 12-12s12 4 12 12l4 14c2 8-6 16-16 16s-18-8-16-16z" fill="#A7F3D0" stroke="#10B981" stroke-width="2.5"/><ellipse cx="32" cy="34" rx="6" ry="8" fill="#6EE7B7"/><path d="M32 52v8" stroke="#10B981" stroke-width="4"/>'],
        tube: ['cyan', '<path d="M14 8h8c10 0 18 8 18 18v28" fill="none" stroke="#7DD3FC" stroke-width="7" stroke-linecap="round"/><ellipse cx="40" cy="45" rx="8" ry="5" fill="#BAE6FD" stroke="#38BDF8" stroke-width="2"/><circle cx="12" cy="8" r="5" fill="#0EA5E9"/><path d="M40 54v6" stroke="#38BDF8" stroke-width="4" stroke-linecap="round"/>'],
        scalpel: ['slate', '<path d="M8 56L35 29" stroke="#475569" stroke-width="7" stroke-linecap="round"/><path d="M33 31L52 8c4 2 6 6 4 10L40 35z" fill="#E2E8F0" stroke="#94A3B8" stroke-width="2" stroke-linejoin="round"/>'],
        needle: ['violet', '<path d="M14 44a20 20 0 0136-20" fill="none" stroke="#94A3B8" stroke-width="4" stroke-linecap="round"/><circle cx="50" cy="24" r="2.5" fill="#64748B"/><path d="M14 44c4 10 14 14 22 10s14-2 18 4" fill="none" stroke="#8B5CF6" stroke-width="2.6" stroke-dasharray="4 3" stroke-linecap="round"/>'],
        xray: ['slate', '<rect x="8" y="6" width="48" height="52" rx="6" fill="#0F172A"/><path d="M32 12v40" stroke="#E2E8F0" stroke-width="3"/><path d="M30 18c-8 0-14 3-16 6M30 25c-8 0-14 3-16 6M30 32c-8 0-14 3-15 6M34 18c8 0 14 3 16 6M34 25c8 0 14 3 16 6M34 32c8 0 14 3 15 6" fill="none" stroke="#93C5FD" stroke-width="2.5" stroke-linecap="round"/>'],
        mri: ['slate', '<circle cx="32" cy="28" r="22" fill="#E2E8F0"/><circle cx="32" cy="28" r="22" fill="none" stroke="#94A3B8" stroke-width="2"/><circle cx="32" cy="28" r="11" fill="#1E293B"/><rect x="8" y="46" width="48" height="9" rx="3" fill="#94A3B8"/><rect x="18" y="26" width="32" height="5" rx="2.5" fill="#60A5FA"/>'],
        radiation: ['slate', '<circle cx="32" cy="32" r="26" fill="#FACC15"/><g fill="#1F2937"><path d="M28 25.07L22 14.68A20 20 0 0142 14.68L36 25.07A8 8 0 0028 25.07z"/><path d="M28 25.07L22 14.68A20 20 0 0142 14.68L36 25.07A8 8 0 0028 25.07z" transform="rotate(120 32 32)"/><path d="M28 25.07L22 14.68A20 20 0 0142 14.68L36 25.07A8 8 0 0028 25.07z" transform="rotate(240 32 32)"/></g><circle cx="32" cy="32" r="4.5" fill="#1F2937"/>'],
        chart: ['violet', '<rect x="7" y="7" width="50" height="50" rx="9" fill="#fff" stroke="#E2E8F0" stroke-width="2"/><rect x="15" y="34" width="8" height="16" rx="2" fill="#8B5CF6"/><rect x="28" y="24" width="8" height="26" rx="2" fill="#22C3A6"/><rect x="41" y="15" width="8" height="35" rx="2" fill="#F59E0B"/><path d="M13 29l13-10 10 4 15-12" fill="none" stroke="#EF4444" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>'],
        bell: ['violet', '<path d="M6 50c10 0 14-36 26-36s16 36 26 36z" fill="#C4B5FD"/><path d="M6 50c10 0 14-36 26-36s16 36 26 36" fill="none" stroke="#7C3AED" stroke-width="3"/><path d="M6 51h52M32 14v37" stroke="#94A3B8" stroke-width="2" stroke-dasharray="3 3"/>'],
        people: ['teal', '<circle cx="16" cy="26" r="5.5" fill="#22C3A6"/><path d="M6 48c0-7 4-12 10-12s10 5 10 12z" fill="#22C3A6"/><circle cx="48" cy="26" r="5.5" fill="#F59E0B"/><path d="M38 48c0-7 4-12 10-12s10 5 10 12z" fill="#F59E0B"/><circle cx="32" cy="20" r="7" fill="#8B5CF6"/><path d="M20 48c0-9 5-15 12-15s12 6 12 15z" fill="#8B5CF6"/>'],
        globe: ['blue', '<circle cx="32" cy="32" r="24" fill="#38BDF8"/><path d="M20 14c6 2 4 8 10 10 4 2 2 8-2 8-6 0-8 6-4 10-6-2-12-10-10-18 0-4 2-8 6-10zM40 12c6 2 12 8 14 16-4 0-6-4-10-2-4 2-2 8-6 8-4 0-4-6-2-10s-2-6 4-12zM40 44c4-2 10 0 12-2-2 6-8 12-14 12 0-4 0-8 2-10z" fill="#22C55E"/><ellipse cx="22" cy="20" rx="4" ry="2.5" fill="#fff" opacity=".35"/>'],
        shield: ['teal', '<path d="M32 6l20 7v16c0 14-9 22-20 28-11-6-20-14-20-28V13z" fill="#22C3A6"/><path d="M32 12l14 5v12c0 10-6 16-14 21z" fill="#fff" opacity=".18"/><path d="M32 19v20M22 29h20" stroke="#fff" stroke-width="6" stroke-linecap="round"/>'],
        house: ['orange', '<path d="M14 28v26h36V28L32 13z" fill="#FED7AA"/><path d="M7 30L32 9l25 21" fill="none" stroke="#F97316" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><rect x="27" y="38" width="10" height="16" rx="2" fill="#F97316"/><rect x="18" y="33" width="6" height="6" rx="1" fill="#38BDF8"/><rect x="40" y="33" width="6" height="6" rx="1" fill="#38BDF8"/>'],
        bin: ['red', '<path d="M26 8h12" stroke="#B91C1C" stroke-width="4" stroke-linecap="round"/><rect x="12" y="12" width="40" height="7" rx="3" fill="#B91C1C"/><path d="M16 19h32l-3 37H19z" fill="#EF4444"/><path d="M32 26l8 13H24z" fill="none" stroke="#fff" stroke-width="2.6" stroke-linejoin="round"/>'],
        alert: ['slate', '<path d="M32 6L60 54H4z" fill="#FACC15" stroke="#CA8A04" stroke-width="2.5" stroke-linejoin="round"/><path d="M32 22v16" stroke="#1F2937" stroke-width="5" stroke-linecap="round"/><circle cx="32" cy="46" r="3" fill="#1F2937"/>'],
        factory: ['slate', '<path d="M50 10c0-4 4-4 4-8" stroke="#CBD5E1" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M6 56V30l14 8v-8l14 8v-8l14 8V14h10v42z" fill="#94A3B8"/><g fill="#FACC15"><rect x="12" y="44" width="6" height="6"/><rect x="26" y="44" width="6" height="6"/><rect x="40" y="44" width="6" height="6"/></g>'],
        megaphone: ['violet', '<path d="M10 26h10l22-12v36L20 38H10z" fill="#8B5CF6"/><rect x="14" y="38" width="8" height="14" rx="2" fill="#6D28D9"/><path d="M48 24c4 4 4 12 0 16M53 18c7 7 7 21 0 28" fill="none" stroke="#F59E0B" stroke-width="3" stroke-linecap="round"/>'],
        scroll: ['violet', '<rect x="14" y="10" width="36" height="44" rx="3" fill="#FDE68A"/><path d="M10 14a4 4 0 018 0v40a4 4 0 01-8 0zM46 10a4 4 0 018 0v40a4 4 0 01-8 0z" fill="#F59E0B"/><path d="M23 22h18M23 30h18M23 38h12" stroke="#B45309" stroke-width="2.5" stroke-linecap="round"/>'],
        clipboard: ['violet', '<rect x="12" y="10" width="40" height="48" rx="6" fill="#fff" stroke="#94A3B8" stroke-width="2.5"/><rect x="22" y="6" width="20" height="9" rx="3" fill="#8B5CF6"/><path d="M19 28l3.5 3.5L29 25M19 43l3.5 3.5L29 40" stroke="#22C55E" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M34 28h12M34 43h12" stroke="#CBD5E1" stroke-width="3" stroke-linecap="round"/>'],
        mind: ['violet', '<path d="M36 8c-12 0-22 8-22 20 0 6 2 10 2 14l-6 8 6 2v6c0 3 3 4 6 4h8v4h18V44c6-4 10-10 10-18 0-10-9-18-22-18z" fill="#C4B5FD"/><path d="M40 30a4 4 0 10-4-4 8 8 0 108-8" fill="none" stroke="#7C3AED" stroke-width="3" stroke-linecap="round"/>'],
        cloud: ['blue', '<path d="M18 38a10 10 0 012-20 14 14 0 0126 4 8 8 0 014 16z" fill="#94A3B8"/><path d="M22 46l-3 8M32 46l-3 8M42 46l-3 8" stroke="#38BDF8" stroke-width="3.5" stroke-linecap="round"/><ellipse cx="28" cy="24" rx="5" ry="3" fill="#fff" opacity=".4"/>'],
        moon: ['violet', '<path d="M40 8a24 24 0 1016 40A20 20 0 0140 8z" fill="#FACC15"/><path d="M48 14l2 4 4 1-4 2-1 4-2-4-4-1 4-2z" fill="#FDE68A"/><circle cx="22" cy="36" r="3" fill="#EAB308" opacity=".6"/><circle cx="30" cy="46" r="2" fill="#EAB308" opacity=".6"/>'],
        bolt: ['violet', '<path d="M36 4L14 36h14l-4 24 26-34H34z" fill="#FACC15" stroke="#CA8A04" stroke-width="2" stroke-linejoin="round"/>'],
        tumor: ['pink', '<circle cx="25" cy="28" r="12" fill="#F472B6"/><circle cx="40" cy="24" r="10" fill="#EC4899"/><circle cx="37" cy="41" r="13" fill="#DB2777"/><circle cx="21" cy="43" r="8" fill="#F9A8D4"/><g fill="#831843"><circle cx="25" cy="28" r="3.5"/><circle cx="41" cy="24" r="3"/><circle cx="37" cy="41" r="4"/><circle cx="21" cy="43" r="2.5"/></g>'],
        spore: ['green', '<rect x="6" y="14" width="40" height="16" rx="8" fill="#22C55E"/><ellipse cx="40" cy="22" rx="5.5" ry="6.5" fill="#FEF9C3" stroke="#15803D" stroke-width="2"/><rect x="18" y="36" width="40" height="16" rx="8" fill="#16A34A"/><ellipse cx="52" cy="44" rx="5.5" ry="6.5" fill="#FEF9C3" stroke="#14532D" stroke-width="2"/><circle cx="14" cy="22" r="2" fill="#BBF7D0"/><circle cx="26" cy="44" r="2" fill="#BBF7D0"/>'],
        flagella: ['pink', '<path d="M16 26c-4-4-8-2-10-6M14 36c-5 2-6 6-10 6M48 24c4-4 8-2 10-7M50 38c4 3 5 7 9 8M24 22c-1-5-4-7-3-12M40 42c1 5 4 8 3 13" fill="none" stroke="#DB2777" stroke-width="2" stroke-linecap="round"/><rect x="14" y="22" width="36" height="20" rx="10" fill="#EC4899"/><circle cx="24" cy="30" r="2.2" fill="#FCE7F3"/><circle cx="36" cy="34" r="2.2" fill="#FCE7F3"/><circle cx="41" cy="28" r="1.6" fill="#FCE7F3"/>'],
        polar: ['blue', '<path d="M44 32c4-6 8 0 12-6" fill="none" stroke="#1D4ED8" stroke-width="2.5" stroke-linecap="round"/><rect x="6" y="24" width="38" height="16" rx="8" fill="#3B82F6"/><path d="M34 50c4-6 8 0 12-6" fill="none" stroke="#2563EB" stroke-width="2.5" stroke-linecap="round"/><rect x="6" y="44" width="28" height="12" rx="6" fill="#60A5FA"/><circle cx="16" cy="32" r="2" fill="#DBEAFE"/><circle cx="28" cy="32" r="2" fill="#DBEAFE"/>'],
        coccobac: ['amber', '<g fill="#F59E0B"><ellipse cx="16" cy="18" rx="6" ry="4.5"/><ellipse cx="32" cy="14" rx="6" ry="4.5"/><ellipse cx="46" cy="22" rx="6" ry="4.5"/><ellipse cx="22" cy="32" rx="6" ry="4.5"/><ellipse cx="38" cy="34" rx="6" ry="4.5"/></g><g fill="#D97706"><ellipse cx="14" cy="46" rx="6" ry="4.5"/><ellipse cx="30" cy="48" rx="6" ry="4.5"/><ellipse cx="48" cy="44" rx="6" ry="4.5"/><ellipse cx="52" cy="32" rx="5" ry="4"/></g>'],
        club: ['teal', '<path d="M10 40l16-22a5 5 0 017 4L19 46a4 4 0 01-9-6z" fill="#14B8A6"/><path d="M54 40L38 18a5 5 0 00-7 4l14 24a4 4 0 009-6z" fill="#0D9488"/><path d="M22 54l20-4a4 4 0 011 8l-22 2a3 3 0 011-6z" fill="#2DD4BF"/><circle cx="29" cy="21" r="2.4" fill="#CCFBF1"/><circle cx="35" cy="21" r="2.4" fill="#CCFBF1"/>'],
        tuningfork: ['cyan', '<path d="M24 6v22a8 8 0 0016 0V6" stroke="#64748B" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M32 36v22" stroke="#475569" stroke-width="5" stroke-linecap="round"/><path d="M12 14c-4 4-4 10 0 14M6 10c-7 7-7 18 0 24M52 14c4 4 4 10 0 14M58 10c7 7 7 18 0 24" fill="none" stroke="#0EA5E9" stroke-width="2.6" stroke-linecap="round"/>'],
        cataract: ['blue', '<path d="M4 32c8-12 18-18 28-18s20 6 28 18c-8 12-18 18-28 18S12 44 4 32z" fill="#fff" stroke="#CBD5E1" stroke-width="2"/><circle cx="32" cy="32" r="12" fill="#60A5FA"/><circle cx="32" cy="32" r="7" fill="#E2E8F0"/><circle cx="32" cy="32" r="7" fill="none" stroke="#94A3B8" stroke-width="1.5"/><ellipse cx="30" cy="30" rx="3" ry="2" fill="#fff"/>'],
        retina: ['red', '<circle cx="32" cy="32" r="25" fill="#F97316"/><circle cx="32" cy="32" r="25" fill="none" stroke="#C2410C" stroke-width="2"/><path d="M22 30c-6-6-8-12-6-18M22 30c-8 2-12 8-12 12M22 30c10-8 22-8 32-2M22 30c10 6 20 12 26 18M22 30c0 10 4 18 8 22" fill="none" stroke="#B91C1C" stroke-width="2" stroke-linecap="round"/><circle cx="22" cy="30" r="5.5" fill="#FDE68A"/><circle cx="40" cy="34" r="3.5" fill="#9A3412"/>'],
        eyelid: ['blue', '<path d="M6 28c8 10 18 14 26 14s18-4 26-14" fill="#F2B49A"/><path d="M6 28c8 10 18 14 26 14s18-4 26-14" fill="none" stroke="#1E293B" stroke-width="4" stroke-linecap="round"/><path d="M14 37l-4 6M23 41l-2 7M32 42v7M41 41l2 7M50 37l4 6" stroke="#1E293B" stroke-width="3" stroke-linecap="round"/><path d="M42 20c2 2 4 2 6 0" stroke="#0EA5E9" stroke-width="0"/><path d="M48 46c0 4 3 7 3 9a3 3 0 01-6 0c0-2 3-5 3-9z" fill="#38BDF8"/>'],
        rash: ['orange', '<circle cx="32" cy="32" r="25" fill="#F7C9B5"/><g fill="#EF4444"><circle cx="22" cy="22" r="4.5"/><circle cx="38" cy="18" r="3"/><circle cx="44" cy="32" r="5"/><circle cx="28" cy="36" r="3.5"/><circle cx="18" cy="42" r="3"/><circle cx="36" cy="48" r="4"/></g><g fill="#FCA5A5"><circle cx="30" cy="26" r="2"/><circle cx="48" cy="44" r="2.5"/><circle cx="14" cy="30" r="2"/></g>'],
        hairnail: ['pink', '<rect x="20" y="12" width="24" height="48" rx="12" fill="#F2B49A"/><rect x="24" y="16" width="16" height="19" rx="7.5" fill="#FDE2E4" stroke="#E8A3A8" stroke-width="2"/><path d="M27 20c2-1 6-1 8 0" stroke="#fff" stroke-width="2" stroke-linecap="round"/><path d="M8 50c4-14 2-28 8-40M54 52c-2-12 2-26-4-42" fill="none" stroke="#7C2D12" stroke-width="2.6" stroke-linecap="round"/>'],
        ovary: ['pink', '<path d="M6 20c6-6 14-4 18 2" fill="none" stroke="#F472B6" stroke-width="3.5" stroke-linecap="round"/><ellipse cx="34" cy="36" rx="23" ry="17" fill="#F9A8D4"/><circle cx="24" cy="32" r="6" fill="#FDF2F8" stroke="#EC4899" stroke-width="2"/><circle cx="40" cy="28" r="4" fill="#FDF2F8" stroke="#EC4899" stroke-width="2"/><circle cx="42" cy="42" r="7" fill="#FDF2F8" stroke="#EC4899" stroke-width="2"/><circle cx="42" cy="42" r="2.5" fill="#F59E0B"/><circle cx="28" cy="45" r="3" fill="#FDF2F8" stroke="#EC4899" stroke-width="1.5"/>'],
        gas: ['green', '<rect x="26" y="5" width="12" height="10" rx="2" fill="#64748B"/><rect x="21" y="14" width="22" height="45" rx="11" fill="#22C55E"/><rect x="21" y="26" width="22" height="9" fill="#fff" opacity=".85"/><ellipse cx="27" cy="44" rx="2.5" ry="7" fill="#fff" opacity=".3"/>']
      };
      var V3_ART_RULES = [
        ['ear', /embryology of ear/],
        ['cell', /cell structure|epitheli/],
        ['skull', /osteology, scalp/],
        ['thyroid', /glands of the head/],
        ['pelvis', /genitalia|pelvic organs/],
        ['poison', /corrosive|poisoning|organophosph/],
        ['scale', /sexual offences/],
        ['liver', /portal hypertension/],
        ['bandage', /^trauma -|wound/],
        ['bone', /paget/],
        ['spine', /regional conditions of neck/],
        ['mind', /eating disorders/],
        ['eye', /special senses/],
        ['gas', /workstation|gases/],
        ['rbc', /hemoly/],
        ['kidney', /tubulointerstitial|glomerul/],
        ['brain', /cns pathology/],
        ['mri', /neuroimaging|\bmri\b|ct brain|imaging modalities|fundamentals of imaging|obstetrical imaging/],
        ['xray', /imaging|x-?ray|radiograph|contrast media/],
        ['radiation', /radiation|radiotherap|radionuclide|light, sound/],
        ['tooth', /dental|teeth|tooth/],
        ['fingerprint', /fingerprint|identification|stature|race, sex/],
        ['egg', /gameto|conception|infertil|fertiliz|reproductive|sexual development|puberty/],
        ['fetus', /pregnan|fetal|fetus|placenta|labou?r\b|caesarean|vaginal delivery|antenatal|obstetric|abortion|trophoblast|twinning|multifetal|ectopic|partum|rhesus|puerper|preterm|postterm|embryo/],
        ['bottle', /breastfeed|malnutrition/],
        ['baby', /neonat|newborn|apgar|infant|milestone|growth and development|autism|intellectual disab|attention-deficit|childhood violence/],
        ['breast', /breast/],
        ['male', /prostate|testes|scrot|penis|urethra|\bmale genital|androgen|erectile/],
        ['ovary', /ovar/],
        ['uterus', /uter|menstru|fibroid|endometri|adenomyosis|ovar|vulv|vagin|cervix|prolapse|female genital|female pelvic|pelvic inflammatory|menopaus|female reproductive|gynaec|contracep|family planning/],
        ['glasses', /myopia|hypermetropia|astigmat|optics|accom+odation|physiology of vision/],
        ['cataract', /cataract|\blens\b/],
        ['retina', /retina|macula|vitre/],
        ['eyelid', /eyelid|lacrimal/],
        ['eye', /\beye|retina|cornea|conjunctiv|sclera|\blens\b|cataract|glaucoma|uveitis|lacrimal|orbit|strabism|optic|pupil|gaze|ophthal|blindness|visual/],
        ['tuningfork', /tuning fork|audiometr|hearing/],
        ['ear', /\bear\b|mastoid|cholesteatoma|csom|otoscler|meniere|hearing|tuning fork|audiometr|eustachian|facial nerve/],
        ['nose', /\bnose\b|nasal|paranasal|sinusitis|\bpns\b|epistaxis|rhinitis|septum|polyposis|nasopharyn/],
        ['tube', /airway|intubation|breathing system|ventilation and o2/],
        ['mouth', /tongue|palate|oral cavity|salivary|tonsil|adenoid|\bpharynx/],
        ['larynx', /laryn|voice|speech|stridor/],
        ['bolt', /seizure|epilep/],
        ['moon', /sleep/],
        ['virus', /viru|viral|\bhiv\b|\baids\b|antiretroviral|polio|measles|covid|\barbo|picorna|hepatitis/],
        ['rodred', /tubercul|mycobact|lepro/],
        ['spiral', /spirochet|syphilis|vibrio|campylobact/],
        ['cocci', /cocc/],
        ['spore', /clostrid|bacill/],
        ['flagella', /escherichia|proteus|klebsiella|shigella|salmonella/],
        ['polar', /pseudomonas|burkholder/],
        ['coccobac', /haemophilus|yersinia|brucella|rickettsia|chlamydia|mycoplasma/],
        ['club', /corynebact|listeria|actinomyc/],
        ['bacteria', /bacter|bacill|clostrid|salmonella|shigella|escherichia|klebsiella|pseudomonas|haemophilus|yersinia|rickettsia|chlamydia|listeria|corynebact|antimicrob|penicillin|cephalospor|sulfonamide|30s subunit|\bstds?\b|sexually transmitted/],
        ['fungus', /fung|mycos/],
        ['bug', /tick|flea|mite/],
        ['mosquito', /mosquito|arthropod|entomolog|nvbdcp|vector|pest control/],
        ['worm', /helminth|nematode|cestode|trematode|anthelmint|parasit/],
        ['amoeba', /protozo|amoeb|sporozoa|malaria/],
        ['ecg', /arrhythm|electrophysiology|monitoring|acls|heart block/],
        ['bp', /blood pressure|hypertens|shock|renin|portal hypertension/],
        ['heart', /heart|cardi|coronary|angina|myocard|pericard|valv|endocarditis|rheumatic fever|fetal circulation|cyanotic/],
        ['vessel', /vascul|vessel|aneurysm|dissection|atheroscler|arterial|\bvenous|dvt|embolism|hypolipidemic|lymphatic/],
        ['vitamin', /vitamin|micronutrient/],
        ['water', /water|drowning/],
        ['lungs', /lung|pulmonary|pleura|respirat|alveol|asthma|copd|pneumon|bronch|ards|thorax|thoracic|mediastin|hypoxia|asphyx/],
        ['adrenal', /adrenal|cushing|corticosteroid|aldosterone/],
        ['kidney', /kidney|renal|nephr|glomerul|tubul|kub\b|diuretic|urinary calculi|micturition|acid-base|body fluids|diabetes insipidus|\badh\b/],
        ['gallbladder', /gall ?bladder|bile duct|biliary|bile pigments|jaundice|hyperbilirubin/],
        ['bladder', /bladder|ureter|urinary/],
        ['thyroid', /thyroid|calcium homeostasis|calcium metabolism|parathyroid|endocrin/],
        ['glucose', /diabet|insulin|endocrine pancreas|the pancreas$/],
        ['pancreas', /pancrea/],
        ['liver', /liver|hepat|cirrhosis|wilson|hemochromatosis/],
        ['spleen', /spleen/],
        ['stomach', /stomach|gastr|peptic|esophag|duoden|emetic|bariatric|upper gi/],
        ['intestine', /intestin|bowel|colon|colorectal|rectum|\banus|anal canal|appendix|malabsorption|digest|gi tract|alimentary|hernia|peritone|abdomen|abdominal|lower gi|motility/],
        ['neuron', /nerve|sympathomim|cholinergic|synap|neurotransmit|sensory|somatosensory|motor physiology|spinal cord|myasthen|guillain|demyelin|multiple sclerosis|plexus|cranial|neuropath|movement disorders|extrapyramidal|nervous system/],
        ['brain', /brain|cerebr|cerebell|diencephal|basal ganglia|limbic|hypothalam|pituitary|ventricular system|meninges|white matter|dementia|coma|\bcns\b|neuro|headache|migraine|higher mental|encephal|delirium|amnestic|sheehan/],
        ['fire', /burn|thermal/],
        ['blast', /firearm|blast/],
        ['fracture', /fractur|injuries of|dislocation|amputation|sports injury/],
        ['spine', /spine|vertebra|spondyl|ivdp/],
        ['pelvis', /pelvis|perineum|\bhip\b/],
        ['joint', /joint|arthrit|knee|cartilage|ctev|genu|perthes|scfe|rheumat|gout|sjogren|scleroderma|connective tissue/],
        ['muscle', /muscle|muscular|tendon|relaxant|dermatomyositis|exercise/],
        ['hand', /\bhand\b|upper limb|forearm|elbow|shoulder|clavicle/],
        ['bone', /bone|osteo|skeletal|limb|femur|\bleg\b|foot|paget|avn|osteoporosis/],
        ['hairnail', /\bhair|\bnails?\b/],
        ['rash', /dermatitis|urticaria|eruption|papulosquamous|psoria|vesiculobullous|acne|rosacea|lesions/],
        ['skin', /skin|derma|epiderm|acne|rosacea|pigment|urticaria|psoria|papulosquamous|vesiculobullous|genoderm|hair|nail|tattoo/],
        ['syringe', /vaccin|immunization|local anaesthetic|regional anaesthesia|intravenous anaesth|nerve block/],
        ['rbc', /anemi|anaemi|hemoly|g6pd/],
        ['wbc', /\bleuk|lymphom|myelom|plasma cell|myelodysplast|myeloprolif|histiocyt|lymphadenitis/],
        ['drop', /blood|hemo|haemo|platelet|coagul|transfusion|bleeding|hemorrhage|anticoag|fibrinoly/],
        ['tumor', /tumou?r|neoplas|cancer|carcinom|malignan|oncolog|carcinogen|angiofibroma|cytotoxic|targeted therap/],
        ['antibody', /immun|antibod|hypersensitiv|graft|amyloid|monoclonal|antiphospholipid|interleukin/],
        ['inflam', /inflamm|tissue repair/],
        ['celldead', /cell death|cellular adaptations|intracellular accumulations|ageing/],
        ['chromosome', /chromosom|inheritance|genetic disorders|genetic diseases/],
        ['sugar', /carbohydr|glycoly|gluconeo|glycogen|fructose|galactose|hmp/],
        ['dna', /\bdna\b|\brna\b|\bgenes?\b|genetic|nucleotide|genomic|molecular/],
        ['cycle', /krebs|urea cycle/],
        ['lipid', /lipid|fatty|cholesterol|ketogen|eicosanoid|sphingo|acylglycerol|obesity/],
        ['molecule', /amino acid|protein|enzyme|porphyrin|metabolic disorder|metabolism|kinetics/],
        ['drip', /fluid|electrolyte/],
        ['vitamin', /vitamin|antioxidant|mineral|micronutrient|trace element/],
        ['apple', /food|nutrition|eating/],
        ['cell', /\bcell|membrane|homeostasis|histolog|epitheli|receptor|messenger|lysosom|storage disease/],
        ['poison', /poison|toxic|organophosph|corrosive|irritant|alcohol|substance/],
        ['scale', /jurisprud|\bbns\b|forensic|criminal|sexual offences|malinger|factitious/],
        ['skull', /skelet|death|post-mortem|autopsy|osteology|infanticide/],
        ['bandage', /injur|scar|reconstructive/],
        ['cloud', /depress|mood|bipolar|manic/],
        ['mind', /psych|schizo|anxiety|obsessive|stress|personality|somatoform|dissociat|impulse|sexual|\bmental|defense mechanism/],
        ['bell', /dispersion|measures of location|significance|probability/],
        ['chart', /statistic|epidemiolog|indicators|screening|correlat|demograph|clinical research|clinical trial|pharmacokinetic/],
        ['shield', /prevent|concepts of disease|health determinants|sterilization and disinfection/],
        ['globe', /international|environment|zoonotic|communicable/],
        ['house', /housing|ventilation/],
        ['bin', /waste|sewage/],
        ['alert', /disaster|emergenc|complications of anaesthesia/],
        ['factory', /occupational/],
        ['megaphone', /communication|education/],
        ['people', /population|community|social|sociolog|health planning|healthcare|geriatric|health programme/],
        ['scroll', /history|theories/],
        ['clipboard', /assessment|evaluation|diagnosis|investigation|hypothes|clinical features|practical|preoperative|symptoms/],
        ['mask', /anaesthe|anesthe|inhaled|halothane|workstation|gases/],
        ['needle', /suture/],
        ['scalpel', /surg|instrument/],
        ['pill', /drug|pharmac|agonist|sympathomim|opioid|\banti|nsaid|ocp|estrogen|progestin|mimetic/],
        ['microscope', /microbiolog|dermatopath/],
        ['flask', /chemistr|biochem/]
      ];
      var V3_ART_SUBJECT = {
        anatomy: 'bone', physiology: 'ecg', biochemistry: 'flask', pathology: 'cell', microbiology: 'microscope', pharmacology: 'pill',
        'forensic medicine': 'scale', ent: 'ear', ophthalmology: 'eye', psm: 'people', medicine: 'steth', surgery: 'scalpel',
        'ob & g': 'uterus', pediatrics: 'baby', anaesthesia: 'mask', dermatology: 'skin', orthopaedics: 'bone', psychiatry: 'mind', radiology: 'xray'
      };
      var v3ArtCache = {};
      function v3ArtKey(subjectName, section, name) {
        var ck = subjectName + '|' + section + '|' + name;
        if (v3ArtCache[ck]) return v3ArtCache[ck];
        var tries = [String(name || '').toLowerCase(), String(section || '').toLowerCase()];
        var hit = null;
        for (var t = 0; t < tries.length && !hit; t++) {
          if (!tries[t] || /^mixed/.test(tries[t])) continue;
          for (var i = 0; i < V3_ART_RULES.length; i++) {
            if (V3_ART_RULES[i][1].test(tries[t])) { hit = V3_ART_RULES[i][0]; break; }
          }
        }
        hit = hit || V3_ART_SUBJECT[String(subjectName || '').toLowerCase()] || 'cell';
        v3ArtCache[ck] = hit;
        return hit;
      }
      function v3ArtSvg(key, size) {
        var a = V3_ART[key] || V3_ART.cell;
        return '<svg class="v3-art-svg" viewBox="0 0 64 64" width="' + (size || 44) + '" height="' + (size || 44) + '" aria-hidden="true" fill="none">' + a[1] + '</svg>';
      }
      function v3ArtTone(key) { return (V3_ART[key] || V3_ART.cell)[0]; }

      // ---- v3 pieces: icons, art, subject tiles ------------------------------
      var V3_IC = {
        target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
        clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
        doc: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>',
        sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/>',
        bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
        trophy: '<path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 01-10 0z"/><path d="M17 5h3v2a3 3 0 01-3 3M7 5H4v2a3 3 0 003 3"/>',
        layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
        chart: '<path d="M5 20V12M10 20V6M15 20v-9M20 20V4"/>',
        play: '<path d="M8 5l11 7-11 7z"/>',
        playc: '<circle cx="12" cy="12" r="9"/><path d="M10 8.5l5 3.5-5 3.5z"/>',
        check: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5L16 9.5"/>',
        calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
        chev: '<path d="M9 18l6-6-6-6"/>',
        refresh: '<path d="M20 12a8 8 0 11-2.3-5.6M20 4v5h-5"/>',
        bookmark: '<path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/>',
        custom: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><path d="M12 12l7-7M16 5h3v3"/>',
        steth: '<path d="M6 3v6a4 4 0 008 0V3"/><path d="M10 13v3a5 5 0 0010 0v-2"/><circle cx="20" cy="12" r="2"/>',
        flask: '<path d="M9 3h6M10 3v6l-5 9a2 2 0 002 3h10a2 2 0 002-3l-5-9V3"/><path d="M7.5 15h9"/>',
        bed: '<path d="M3 7v12M3 15h18v4M21 15v-3a3 3 0 00-3-3h-8v6"/><circle cx="6.5" cy="11.5" r="1.5"/>',
        grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
        search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
        lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>',
        sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
        user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0"/>',
        out: '<path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>',
        crown: '<path d="M3 8l4 4 5-7 5 7 4-4-2 11H5z"/>'
      };
      function v3Ic(name, size) {
        return '<svg class="v3-i" width="' + (size || 20) + '" height="' + (size || 20) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (V3_IC[name] || '') + '</svg>';
      }
      // Decorative cluster of the subject illustrations, for page headers.
      function v3Art(slugs) {
        return '<div class="v3-art" aria-hidden="true"><span class="v3-art-glow"></span>' + slugs.map(function (s, i) {
          return '<img class="v3-art-' + (i + 1) + '" src="/assets/subjects-webp/' + s + '.webp" alt="" width="96" height="96" loading="lazy">';
        }).join('') + '</div>';
      }
      function v3Pct(frac) {
        var p = Math.round(frac * 100);
        if (frac > 0 && p === 0) p = 1;
        return p;
      }
      function v3TopicThumb(sx, m, n) {
        var k = v3ArtKey(sx.name, m.section, m.name);
        return '<span class="v3-thumb v3-tone-' + v3ArtTone(k) + '">' + v3ArtSvg(k, 50) + (n ? '<span class="v3-thumb-n">' + n + '</span>' : '') + '</span>';
      }
      function v3SubjTile(sx, ix) {
        var ss = v2SubjectStats(sx, ix);
        var comp = ss.qseen / (ss.questions || 1);
        var p = v3Pct(comp);
        return '<button class="v3-subj" data-subject="' + sx.subjectId + '" data-name="' + esc(sx.name.toLowerCase()) + '" data-cat="' + esc(sx.cat) + '">' +
          '<span class="v3-subj-ic">' + v2SubjIcon(sx, 42) + '</span>' +
          '<span class="v3-subj-t"><b>' + esc(sx.name) + '</b><small>' + ss.started + '/' + ss.total + ' topics<span class="v3-subj-pct"> · ' + p + '%</span></small>' +
            '<span class="v3-subj-bar"><span style="width:' + (p ? Math.max(4, p) : 0) + '%"></span></span></span>' +
          v2Ring(comp, 40, 4, 'v3-ring-s' + (p >= 50 ? ' hi' : ''), p + '%') +
          '<span class="v3-subj-chev">' + v3Ic('chev', 16) + '</span></button>';
      }
      function v3Head(icon, title, more) {
        return '<div class="v3-h"><h2>' + icon + '<span>' + title + '</span></h2>' + (more || '') + '</div>';
      }
      function v3More(label, attrs) {
        return '<button class="v3-more" ' + attrs + '>' + label + v3Ic('chev', 15) + '</button>';
      }

      function v2QotdHtml() {
        return '<section class="v3-card v3-qotd-card" id="v2Qotd">' + v3Head('<span class="v3-hi v3-hi-bolt">' + v3Ic('bolt') + '</span>', 'Question of the day', '<span class="v2-qotd-tag v3-tag"></span>') +
          '<div class="v2-qotd" id="v2QotdCard"><p class="v2-qotd-wait">Loading today’s question…</p></div></section>';
      }

      // Medal artwork for each badge: shape, two gradient stops, glyph.
      var V3_MEDALS = {
        first: ['hex', '#B794FF', '#6D3DF0', '<path d="M32 19l3.6 9 9.4.9-7.1 6.3 2.1 9.3L32 39.6l-8 4.9 2.1-9.3-7.1-6.3 9.4-.9z" fill="#fff"/>'],
        c100: ['hex', '#7CC4FF', '#2563EB', '<text x="32" y="38.5" text-anchor="middle" font-family="Inter,system-ui,sans-serif" font-size="15" font-weight="800" fill="#fff">100</text>'],
        c1000: ['hex', '#FFD66B', '#E08A00', '<text x="32" y="39" text-anchor="middle" font-family="Inter,system-ui,sans-serif" font-size="17" font-weight="800" fill="#fff">1K</text>'],
        s3: ['circle', '#FFB067', '#F0442C', '<path d="M32 18c1 6 8 8.5 8 16.5A8 8 0 0124 35c0-3.5 2-5.5 3.5-7 .3 3 2 4.5 3.5 4.5-1.5-4.5-.5-10 1-14.5z" fill="#fff"/>'],
        s7: ['circle', '#FF8FC8', '#D6246E', '<rect x="21" y="22" width="22" height="20" rx="3.5" fill="none" stroke="#fff" stroke-width="2.6"/><path d="M21 28h22M26 19.5v5M38 19.5v5" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/><text x="32" y="40" text-anchor="middle" font-family="Inter,system-ui,sans-serif" font-size="10" font-weight="800" fill="#fff">7</text>'],
        td1: ['shield', '#6EE7A8', '#109A55', '<path d="M24.5 32.5l5.2 5.2L40 27.2" fill="none" stroke="#fff" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>'],
        td10: ['shield', '#67E8F9', '#0E7490', '<text x="32" y="38.5" text-anchor="middle" font-family="Inter,system-ui,sans-serif" font-size="16" font-weight="800" fill="#fff">10</text>'],
        sharp: ['circle', '#FCA5A5', '#B91C3C', '<circle cx="32" cy="32" r="10" fill="none" stroke="#fff" stroke-width="2.6"/><circle cx="32" cy="32" r="4.5" fill="#fff"/>']
      };
      function v3MedalSvg(id) {
        var m = V3_MEDALS[id] || V3_MEDALS.first;
        var g = 'v3m-' + id;
        var shape = m[0] === 'hex' ? '<path d="M32 4l24.2 14v28L32 60 7.8 46V18z" fill="url(#' + g + ')" stroke="rgba(255,255,255,.55)" stroke-width="2" stroke-linejoin="round"/>' +
            '<path d="M32 10l19 11v22L32 54 13 43V21z" fill="rgba(255,255,255,.12)"/>'
          : m[0] === 'shield' ? '<path d="M32 4l22 7v17c0 15-9.5 25-22 31C19.5 53 10 43 10 28V11z" fill="url(#' + g + ')" stroke="rgba(255,255,255,.55)" stroke-width="2" stroke-linejoin="round"/>' +
            '<path d="M32 10l16 5v13c0 11-6.8 18.5-16 23-9.2-4.5-16-12-16-23V15z" fill="rgba(255,255,255,.12)"/>'
          : '<path d="M20 44l-5 15 8-3 4 7 5-13M44 44l5 15-8-3-4 7-5-13" fill="' + m[2] + '" opacity=".85"/><circle cx="32" cy="30" r="24" fill="url(#' + g + ')" stroke="rgba(255,255,255,.55)" stroke-width="2"/>' +
            '<circle cx="32" cy="30" r="18" fill="rgba(255,255,255,.12)"/>';
        var glyph = m[0] === 'circle' ? '<g transform="translate(0,-2)">' + m[3] + '</g>' : m[3];
        return '<svg class="v3-medal" viewBox="0 0 64 64" width="52" height="52" aria-hidden="true"><defs><linearGradient id="' + g + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + m[1] + '"/><stop offset="1" stop-color="' + m[2] + '"/></linearGradient></defs>' +
          shape + glyph + '<path d="M18 18c5-6 12-8 18-7" fill="none" stroke="rgba(255,255,255,.5)" stroke-width="2.4" stroke-linecap="round"/></svg>';
      }
      function v3BadgesHtml(rd, ix) {
        var b = v2Badges(rd, ix);
        var earnedIds = b.earned.map(function (x) { return x.id; });
        var list = b.earned.concat(b.list.filter(function (x) { return earnedIds.indexOf(x.id) === -1; }));
        return '<section class="v3-sec">' + v3Head('<span class="v3-emoji">🏆</span>', 'Badges &amp; achievements', v3More(b.earned.length + ' of ' + b.total, 'id="v3BadgeMore" aria-expanded="false"')) +
          '<div class="v3-badges" id="v3Badges">' + list.map(function (x, i) {
            var got = earnedIds.indexOf(x.id) !== -1;
            return '<span class="v3-card v3-bdg' + (got ? '' : ' dim') + (i >= 4 ? ' extra' : '') + '" title="' + esc(x.d) + '"' + (i >= 4 ? ' hidden' : '') + '>' +
              '<span class="v3-bdg-ic">' + v3MedalSvg(x.id) + '</span><span class="v3-bdg-t">' + esc(x.t) + '</span>' +
              (got ? '' : '<span class="v3-bdg-p">' + Math.min(x.v, x.goal).toLocaleString() + '/' + x.goal.toLocaleString() + '</span>') + '</span>';
          }).join('') + '</div></section>';
      }

      // Ten fresh questions from across the open topics.
      function v3QuickPractice() {
        if (!currentUser) { v2NeedAccount('Sign in free for quick mixed practice.', v3QuickPractice); return; }
        loadReviewData().then(function (rd) {
          var mods = [];
          SUBJECT_INDEX.forEach(function (sx) {
            getSubjectModules(sx.subjectId).forEach(function (m, i) { if (m.questionCount > 0 && v2Accessible(sx, m, i)) mods.push(m.id); });
          });
          var opts = { kind: 'quick', title: 'Quick practice', back: function () { renderHome(true); }, again: v3QuickPractice };
          v2Loading(opts.title, 'Picking 10 questions', opts.back);
          v2FreshIds(shuffle(mods).slice(0, 10), 10, rd).then(function (ids) { launchIdQuiz(shuffle(ids), opts); })
            .catch(function () { opts.back(); });
        });
      }

      function v2Greeting() {
        var h = new Date().getHours();
        var part = h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
        var name = '';
        try { name = currentUser ? String(getUserDisplayName(currentUser) || '').split(/[\s@]/)[0] : ''; } catch (e) { }
        return part + (name ? ', ' + esc(name.charAt(0).toUpperCase() + name.slice(1)) : '');
      }

      // Links from other pages (e.g. the mock-test bottom bar) open a tab with ?go=.
      var v3PendingGo = (function () {
        try {
          var m = /[?&]go=(qbank|pyq|bookmarks|profile)\b/.exec(window.location.search || '');
          if (!m) return null;
          history.replaceState(null, '', window.location.pathname + window.location.hash);
          return m[1];
        } catch (e) { return null; }
      })();
      function renderHomeV2() {
        if (v3PendingGo && (v3PendingGo !== 'bookmarks' || currentUser)) {
          var go = v3PendingGo; v3PendingGo = null;
          if (!quizStylesReady) { ensureQuizStyles().then(function () { v2Go(go); }); } else v2Go(go);
          return;
        }
        if (!quizStylesReady) { ensureQuizStyles().then(function () { if (state.screen === 'home') renderHomeV2(); }); return; }
        trackPageView('/', 'home');
        if (!currentUser) loadGuestModules();
        var rd = v2HaveHistory() ? reviewData : null;
        var ix = v2Index(rd);
        var pro = isUserPro(currentUser);
        var today = v2Day(Date.now());
        var days = rd ? rd.days : {};
        var streak = 0;
        for (var s0 = (days[today] ? today : today - 1); days[s0]; s0--) streak++;
        var doneToday = days[today] || 0;
        var flame = '<span aria-hidden="true">🔥</span> ';

        // ---- greeting, exam chip and art
        var g = v2ExamGet();
        var examChip = '';
        if (g) {
          var dleft = g.date ? v2Day(Date.parse(g.date + 'T00:00:00')) - today : null;
          examChip = '<button class="v3-exam" id="v2ExamEdit">' + v3Ic('calendar', 18) + '<span><b>' + esc(g.exam) + '</b>' +
            (dleft != null && isFinite(dleft) ? (dleft > 0 ? ' · <em>' + dleft + ' days left</em>' : dleft === 0 ? ' · <em>today</em>' : '') : '') + '</span>' + v3Ic('chev', 16) + '</button>';
        } else if (currentUser) {
          examChip = '<button class="v3-exam ghost" id="v2ExamEdit">' + v3Ic('calendar', 18) + '<span>Set your exam date</span>' + v3Ic('chev', 16) + '</button>';
        }
        var colA = '<section class="v3-hello"><div class="v3-hello-t"><h1>' + (currentUser ? v2Greeting() + ' <span class="v3-wave" aria-hidden="true">👋</span>' : 'Welcome to MedLadder') + '</h1>' +
          '<p>' + (currentUser ? 'Ready for today’s learning?' : totalQuestions().toLocaleString() + ' questions with explanations, free to start.') + '</p>' + examChip + '</div>' +
          v3Art(['physiology', 'pathology', 'pharmacology']) + '</section>';
        colA += v2ExamLine(ix).replace(/^<p class="v2-exam">[\s\S]*?<\/p>/, '');

        // ---- today's mission
        var goal = v2Goal();
        if (!currentUser) {
          var guest = null;
          SUBJECT_INDEX.some(function (sx) {
            return getSubjectModules(sx.subjectId).some(function (m) {
              if (isGuestModule(m.id)) { guest = { sx: sx, m: m }; return true; }
              return false;
            });
          });
          colA += '<section class="v2-hero v3-mission"><div class="v3-mission-main"><p class="v3-mission-k">' + v3Ic('target', 22) + 'Start here</p>' +
            '<h2>Try a topic free</h2><ul class="v3-mission-list">' +
            '<li>' + v3Ic('sparkle', 18) + (guest ? esc(guest.m.name) + ' in ' + esc(guest.sx.name) : 'One free topic in every subject') + '</li>' +
            '<li>' + v3Ic('doc', 18) + 'Explanations with every answer</li><li>' + v3Ic('user', 18) + 'No account needed</li></ul></div>' +
            '<div class="v3-mission-actions">' + (guest ? '<button class="v3-mission-btn" id="v2GuestStart" data-sid="' + guest.sx.subjectId + '" data-mod="' + esc(guest.m.moduleId) + '">Start ' + esc(guest.m.name) + ' <span aria-hidden="true">→</span></button>' : '') +
            '<button class="v3-mission-link" id="v2SignUp">Sign up free for 8 topics in every subject</button></div></section>';
        } else if (!rd) {
          colA += '<section class="v2-hero v3-mission" aria-busy="true"><div class="v3-mission-main"><p class="v3-mission-k">' + v3Ic('target', 22) + 'Today’s mission</p><h2>Building your set…</h2>' +
            '<ul class="v3-mission-list"><li>' + v3Ic('clock', 18) + 'Looking at what you have answered</li></ul></div></section>';
        } else {
          var plan = v2TodayPlan(ix);
          var nReview = plan.reviewIds.length;
          var newFrom = plan.next.filter(function (r) { return r.x.st.total > r.x.st.seen; }).map(function (r) { return r.x.m.name; });
          var mins = Math.max(1, Math.round(plan.size * 0.75));
          var items = '';
          if (plan.size) items += '<li>' + v3Ic('clock', 18) + 'About ' + mins + ' min</li>';
          if (nReview) items += '<li>' + v3Ic('refresh', 18) + '<span>' + nReview + ' revision question' + (nReview === 1 ? '' : 's') + '</span></li>';
          if (plan.newN) items += '<li>' + v3Ic('sparkle', 18) + '<span>' + plan.newN + ' new question' + (plan.newN === 1 ? '' : 's') + '</span></li>';
          if (!plan.size) items += '<li>' + v3Ic('check', 18) + 'Nothing due, every open topic finished</li>';
          var gp = Math.min(1, doneToday / goal);
          colA += '<section class="v2-hero v3-mission">' +
            '<p class="v3-mission-k">' + v3Ic('target', 22) + 'Today’s mission' + (streak > 0 ? '<span class="v3-streak-pill">' + flame + streak + '-day streak</span>' : '') + '</p>' +
            '<div class="v3-mission-main"><h2>' + (plan.size ? plan.size + ' Questions' : 'All caught up') + '</h2><ul class="v3-mission-list">' + items + '</ul></div>' +
            v2Ring(gp, 116, 11, 'v2-ring-hero v3-ring-mission', '<strong>' + Math.round(gp * 100) + '%</strong><small>' + Math.min(doneToday, 999) + '/' + goal + '</small>') +
            '<div class="v3-mission-actions">' + (plan.size ? '<button class="v3-mission-btn" id="v2TodayBtn">Start today’s set <span aria-hidden="true">→</span></button>' : '<button class="v3-mission-btn" data-nav-go="subjects">Browse subjects <span aria-hidden="true">→</span></button>') +
            '<button class="v3-mission-link" id="v2GoalBtn" aria-expanded="false">Daily goal: ' + goal + ' questions</button>' +
            '<div class="v2-goal-pick" id="v2GoalPick" hidden>' + V2_GOALS.map(function (gv) { return '<button class="v2-goal-opt' + (gv === goal ? ' on' : '') + '" data-goal="' + gv + '">' + gv + '</button>'; }).join('') + '</div>' +
            '</div></section>';
        }

        // ---- quick tiles
        var mockLive = v2MockState && v2MockState.live;
        var qa = [
          ['bolt', 'Quick practice', '', 'id="v3Quick"'],
          ['trophy', 'Mock tests', mockLive ? 'Live' : '', 'id="v2QaMock"'],
          ['layers', 'Custom set', '', 'id="v2Custom"'],
          ['chart', 'Analytics', '', 'data-nav-go="progress"']
        ];
        colA += '<nav class="v3-quick" aria-label="Quick actions">' + qa.map(function (q) {
          return '<button class="v3-card v3-qt v3-qt-' + q[0] + '" ' + q[3] + '><span class="v3-qt-ic">' + v3Ic(q[0], 30) +
            (q[2] ? '<span class="v3-qt-badge">' + q[2] + '</span>' : '') + '</span><span>' + q[1] + '</span></button>';
        }).join('') + '</nav>';

        // ---- continue learning
        var active = v2ActiveSubjects(ix);
        var cont = null;
        active.some(function (r) {
          var lastId = v2LastModuleIn(r.ss);
          var x = r.ss.mods.find(function (y) { return y.m.id === lastId; }) || r.ss.mods.find(function (y) { return y.st.status === 'active'; });
          if (x && x.st.status === 'active' && x.open) { cont = { sx: r.sx, x: x }; return true; }
          return false;
        });
        if (cont) {
          var fr = cont.x.st.seen / (cont.x.st.total || 1);
          colA += '<section class="v3-sec">' + v3Head('<span class="v3-hi v3-hi-play">' + v3Ic('play', 14) + '</span>', 'Continue learning', v3More('View all', 'data-nav-go="subjects"')) +
            '<button class="v3-card v3-cont" data-sid="' + cont.sx.subjectId + '" data-mod="' + esc(cont.x.m.moduleId) + '">' +
            '<span class="v3-cont-ic">' + v3TopicThumb(cont.sx, cont.x.m) + '</span>' +
            '<span class="v3-cont-main"><b>' + esc(cont.x.m.name) + '</b><small>' + esc(cont.sx.name) + ' · ' + v2Plural(cont.x.st.total - cont.x.st.seen, 'question') + ' left</small>' +
            '<span class="v3-bar"><span style="width:' + Math.max(3, v3Pct(fr)) + '%"></span></span></span>' +
            '<span class="v3-cont-end"><span class="v3-play">' + v3Ic('play', 16) + '</span><span>' + v3Pct(fr) + '%</span></span></button></section>';
        }

        colA += v2QotdHtml();

        // ---- right column: progress, streak, subjects, needs work, badges
        var colB = '';
        if (currentUser) {
          var dd = dashboardData(v2EffectiveProgress());
          var answered = Math.max(ix.seen, dd.done);
          var acc = ix.seen ? Math.round((ix.okNow / ix.seen) * 100) : (dd.done ? Math.round((dd.correct / dd.done) * 100) : null);
          var topicsStarted = 0;
          SUBJECT_INDEX.forEach(function (sx) { topicsStarted += v2SubjectStats(sx, ix).started; });
          colB += '<section class="v3-card v3-prog">' + v3Head('<span class="v3-hi v3-hi-chart">' + v3Ic('chart') + '</span>', 'Your progress', v3More('View details', 'data-nav-go="progress"')) +
            '<div class="v3-stat3">' +
            '<div class="v3-stat s-ok">' + v3Ic('check', 30) + '<strong>' + answered.toLocaleString() + '</strong><span>Answered</span></div>' +
            '<div class="v3-stat s-acc">' + v3Ic('target', 30) + '<strong>' + (acc == null ? '–' : acc + '%') + '</strong><span>Accuracy</span></div>' +
            '<div class="v3-stat s-top">' + v3Ic('layers', 30) + '<strong>' + topicsStarted + '</strong><span>of ' + totalTopics() + ' topics</span></div>' +
            '</div></section>';
          var letters = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
          var strip = '';
          for (var d = 6; d >= 0; d--) {
            var n = days[today - d] || 0;
            var dt = new Date(Date.now() - d * 86400000);
            strip += '<span class="v3-day' + (n ? ' on' : '') + (d === 0 ? ' now' : '') + '" title="' + esc(dt.toLocaleDateString(undefined, { weekday: 'long' })) + ': ' + v2Plural(n, 'answer') + '"><span class="v3-day-c">' + (n ? '🔥' : '') + '</span>' + letters[dt.getDay()] + '</span>';
          }
          colB += '<section class="v3-card v3-streak">' + v3Head('<span class="v3-hi v3-hi-cal">' + v3Ic('calendar') + '</span>', 'Study streak',
            streak ? '<span class="v3-streak-pill">' + flame + streak + '-day streak</span>' : '<span class="v3-muted">Start one today</span>') +
            '<div class="v3-week">' + strip + '</div></section>';
        }

        var used = active.map(function (r) { return r.sx.subjectId; });
        var shown = active.map(function (r) { return r.sx; });
        SUBJECT_INDEX.forEach(function (sx) { if (shown.length < 4 && used.indexOf(sx.subjectId) === -1) shown.push(sx); });
        colB += '<section class="v3-sec">' + v3Head('<span class="v3-hi v3-hi-layers">' + v3Ic('layers') + '</span>', 'Subjects', v3More('All ' + SUBJECT_INDEX.length, 'data-nav-go="subjects"')) +
          '<div class="v3-subj4">' + shown.slice(0, 4).map(function (sx) { return v3SubjTile(sx, ix); }).join('') + '</div></section>';

        var weak = [];
        active.forEach(function (r) {
          r.ss.mods.forEach(function (x) { if (x.open && x.st.seen >= 5 && x.st.pct != null && x.st.pct < 60) weak.push({ sx: r.sx, x: x }); });
        });
        weak.sort(function (a, b) { return a.x.st.pct - b.x.st.pct; });
        if (weak.length) {
          colB += '<section class="v3-sec">' + v3Head('<span class="v3-hi v3-hi-target">' + v3Ic('target') + '</span>', 'Needs work', '<span class="v3-muted">Focus on these topics</span>') +
            '<div class="v3-card v3-list">' + weak.slice(0, 3).map(function (w) {
              return '<button class="v3-li" data-sid="' + w.sx.subjectId + '" data-mod="' + esc(w.x.m.moduleId) + '">' + v3TopicThumb(w.sx, w.x.m) +
                '<span class="v3-li-t"><b>' + esc(w.x.m.name) + '</b><small>' + esc(w.sx.name) + ' · ' + w.x.st.seen + ' answered</small></span>' +
                '<span class="v3-pill bad">' + w.x.st.pct + '%</span></button>';
            }).join('') + '</div></section>';
        }
        if (currentUser) colB += v3BadgesHtml(rd, ix);
        if (currentUser && !pro) {
          colB += '<button class="v3-pro" id="v2ProBtn"><span class="v3-pro-ic" aria-hidden="true">👑</span><span class="v3-pro-t"><b>Go Pro with MedLadder</b>' +
            '<small>All ' + totalTopics() + ' topics, past papers and full-subject mocks from ₹' + PRO_CONFIG.PRICE_INR + '.</small></span>' + v3Ic('chev', 20) + '</button>';
        }

        var out = '<div class="v3-home"><div class="v3-col">' + colA + '</div><div class="v3-col">' + colB + '</div></div>';
        v2Paint('home', v2Shell('home', v2Header(), '<div class="v2-bold v3-page">' + out + '</div>', ix.due.length));
        wireV2Shell();
        wireV2Common();
        wireV2Exam(function () { renderHomeV2(); });
        var tb = document.getElementById('v2TodayBtn');
        if (tb) tb.onclick = startTodaySet;
        var gs = document.getElementById('v2GuestStart');
        if (gs) gs.onclick = function () { renderSetup(parseInt(gs.getAttribute('data-sid'), 10), gs.getAttribute('data-mod')); };
        var su = document.getElementById('v2SignUp');
        if (su) su.onclick = function () { openAuthModal('signup', { reason: 'Create a free account to open 8 topics in every subject.' }); };
        var cu = document.getElementById('v2Custom');
        if (cu) cu.onclick = function () { setupChoice.count = 'all'; renderCustomSetup(); };
        var qk = document.getElementById('v3Quick');
        if (qk) qk.onclick = v3QuickPractice;
        var qm = document.getElementById('v2QaMock');
        if (qm) qm.onclick = function () { window.location.href = '/mock-test'; };
        var bm = document.getElementById('v3BadgeMore');
        if (bm) bm.onclick = function () {
          var open = bm.getAttribute('aria-expanded') !== 'true';
          bm.setAttribute('aria-expanded', String(open));
          app.querySelectorAll('#v3Badges .extra').forEach(function (e) { e.hidden = !open; });
        };
        if (v2MockState === null) v2LoadMockState();
        v2LoadQotd();
        var pb = document.getElementById('v2ProBtn');
        if (pb) pb.onclick = function () { openProModal('banner', {}); };
        var gb = document.getElementById('v2GoalBtn'), gpk = document.getElementById('v2GoalPick');
        if (gb && gpk) {
          gb.onclick = function () { gpk.hidden = !gpk.hidden; gb.setAttribute('aria-expanded', String(!gpk.hidden)); };
          gpk.querySelectorAll('[data-goal]').forEach(function (o) {
            o.onclick = function () { v2SetGoal(parseInt(o.getAttribute('data-goal'), 10)); renderHomeV2(); };
          });
        }
        v2WithHistory('home', renderHomeV2);
      }

      // Live mock tests: a row that says when one is running or next opens.
      var v2MockState = null;
      function v2MockRow() {
        var st = v2MockState, end = '\u203a';
        if (st && st.live) end = '<span class="v2-live">Live now</span>';
        else if (st && st.next && st.next.starts_at) {
          try { end = 'Next ' + new Date(st.next.starts_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }); } catch (e) { }
        }
        return '<a class="v2-row v2-row-plain" id="v2Mock" href="/mock-test"><span>Mock tests</span><span class="v2-row-end">' + end + '</span></a>';
      }
      function v2LoadMockState() {
        if (v2MockState !== null || !supabaseClient) return;
        v2MockState = false;
        try {
          supabaseClient.rpc('mock_banner_state').then(function (res) {
            if (!res || res.error || !res.data) return;
            v2MockState = res.data;
            var row = document.getElementById('v2Mock');
            if (row) row.outerHTML = v2MockRow();
            var qa = document.getElementById('v2QaMock');
            if (qa && v2MockState.live && !qa.querySelector('.v3-qt-badge')) qa.querySelector('.v3-qt-ic').insertAdjacentHTML('beforeend', '<span class="v3-qt-badge">Live</span>');
          }, function () {});
        } catch (e) { }
      }

      function v2LockSvg() {
        return '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/></svg>';
      }
      function v2SubjectRow(sx, ix) {
        var ss = v2SubjectStats(sx, ix);
        return '<button class="v2-row v2-subj" data-subject="' + sx.subjectId + '" data-name="' + esc(sx.name.toLowerCase()) + '" data-cat="' + esc(sx.cat) + '">' +
          '<span class="v2-subj-name">' + esc(sx.name) + '</span>' + v2Bar(ss.started / (ss.total || 1)) +
          '<span class="v2-subj-count">' + ss.started + ' / ' + ss.total + '</span></button>';
      }

      // Shared click wiring for rows that open a topic, a subject or a screen.
      function wireV2Common() {
        app.querySelectorAll('[data-sid][data-mod]').forEach(function (b) {
          if (b.id === 'v2GuestStart') return;
          b.onclick = function () { renderSetup(parseInt(b.getAttribute('data-sid'), 10), b.getAttribute('data-mod')); };
        });
        app.querySelectorAll('[data-subject]').forEach(function (b) {
          b.onclick = function () { renderModuleList(parseInt(b.getAttribute('data-subject'), 10)); };
        });
        app.querySelectorAll('[data-nav-go]').forEach(function (b) {
          b.onclick = function () { v2Go(b.getAttribute('data-nav-go')); };
        });
        app.querySelectorAll('[data-pyq]').forEach(function (b) {
          b.onclick = function () { renderPYQSetup(b.getAttribute('data-pyq')); };
        });
      }

      // ---- QBank: all subjects ---------------------------------------------
      var v2SubjectFilter = 'all';
      // "Revision due" card: questions answered before that are due to come
      // back (spaced review). Shown on QBank (not Home) when there are any.
      function v3DueCard(ix) {
        var n = ix && ix.due ? ix.due.length : 0;
        if (!currentUser || !n) return '';
        var wrong = ix.due.filter(function (d) { return d.wrong; }).length;
        return '<button class="v3-card v3-duecard" data-nav-go="review">' +
          '<span class="v3-duecard-ic">' + v3Ic('refresh', 22) + '</span>' +
          '<span class="v3-duecard-t"><b>' + n.toLocaleString() + ' question' + (n === 1 ? '' : 's') + ' due for revision</b>' +
          '<small>' + (wrong ? wrong + ' missed last time' + (n - wrong ? ', ' + (n - wrong) + ' fading' : '') : 'Right last time, now fading') + '</small></span>' +
          '<span class="v3-duecard-go">Review ' + v3Ic('chev', 16) + '</span></button>';
      }
      function renderSubjectsV2() {
        if (!quizStylesReady) { ensureQuizStyles().then(renderSubjectsV2); return; }
        trackPageView('/subjects', 'subjects');
        var rd = v2HaveHistory() ? reviewData : null;
        var ix = v2Index(rd);
        var cats = [['all', 'All', ''], ['pre', 'Pre-clinical', 'layers'], ['para', 'Para-clinical', 'flask'], ['clinical', 'Clinical', 'steth']];
        var body = '<section class="v3-pagehead"><div class="v3-pagehead-t"><span class="v3-chip">' + v3Ic('layers', 16) + 'QBank</span>' +
          '<h1>Subjects</h1><p>' + SUBJECT_INDEX.length + ' subjects · ' + totalTopics() + ' topics · ' + totalQuestions().toLocaleString() + ' questions</p></div>' +
          v3Art(['anatomy', 'medicine', 'pharmacology']) + '</section>' + v3DueCard(ix) +
          '<div class="v2-gsearch v3-search"><label class="v2-sr" for="v2GSearch">Search subjects or topics</label>' +
          '<span class="v2-gsearch-ic" aria-hidden="true">' + v3Ic('search', 20) + '</span>' +
          '<input id="v2GSearch" type="search" placeholder="Search subjects or topics…" autocomplete="off">' +
          '<div class="v2-gsearch-res" id="v2GSearchRes" hidden></div></div>' +
          '<div class="v3-filters" role="group" aria-label="Filter subjects">' + cats.map(function (c) {
            return '<button class="v3-filter" data-cat-f="' + c[0] + '" aria-pressed="' + (v2SubjectFilter === c[0]) + '">' + (c[2] ? v3Ic(c[2], 18) : '') + c[1] + '</button>';
          }).join('') + '</div>' +
          '<div class="v3-subjgrid" id="v2SubjList">' + SUBJECT_INDEX.map(function (sx) { return v3SubjTile(sx, ix); }).join('') +
          '<button class="v3-custom" id="v2Custom"><span class="v3-custom-ic">' + v3Ic('custom', 30) + '</span><span class="v3-custom-t"><b>Custom practice</b><small>Build a set from any subjects and topics</small></span>' + v3Ic('chev', 20) + '</button></div>' +
          '<p class="v2-empty" id="v2SubjNone" hidden>No subject matches.</p>' +
          '<section class="v3-sec"><div class="v3-h"><h2><span>More ways to practise</span></h2></div><div class="v3-ways">' +
          '<a class="v3-card v3-way" id="v2Mock" href="/mock-test"><span class="v3-way-ic w-trophy">' + v3Ic('trophy', 26) + '</span><span>Mock tests</span>' + v3Ic('chev', 18) + '</a>' +
          '<button class="v3-card v3-way" data-nav-go="pyq"><span class="v3-way-ic w-doc">' + v3Ic('doc', 26) + '</span><span>Past papers</span>' + v3Ic('chev', 18) + '</button>' +
          '<button class="v3-card v3-way" data-nav-go="review"><span class="v3-way-ic w-ref">' + v3Ic('refresh', 26) + '</span><span>Review' + (ix.due.length ? ' <small>' + ix.due.length + ' due</small>' : '') + '</span>' + v3Ic('chev', 18) + '</button>' +
          '</div></section>';
        body = '<div class="v2-bold v3-page">' + body + '</div>';
        v2Paint('subjects', v2Shell('qbank', v2Header(), body, ix.due.length));
        wireV2Shell();
        wireV2Common();
        wireV2Search();
        var cu = document.getElementById('v2Custom');
        if (cu) cu.onclick = function () { setupChoice.count = 'all'; renderCustomSetup(); };
        var input = document.getElementById('v2GSearch');
        function apply() {
          var q = (input.value || '').trim().toLowerCase();
          var shown = 0;
          app.querySelectorAll('#v2SubjList [data-subject]').forEach(function (r) {
            var ok = (v2SubjectFilter === 'all' || r.getAttribute('data-cat') === v2SubjectFilter) && (!q || r.getAttribute('data-name').indexOf(q) !== -1);
            r.hidden = !ok;
            if (ok) shown++;
          });
          // Typing also lists matching topics, so an empty subject grid is fine then.
          document.getElementById('v2SubjNone').hidden = shown > 0 || q.length >= 2;
        }
        input.addEventListener('input', apply);
        app.querySelectorAll('[data-cat-f]').forEach(function (b) {
          b.onclick = function () {
            v2SubjectFilter = b.getAttribute('data-cat-f');
            app.querySelectorAll('[data-cat-f]').forEach(function (o) { o.setAttribute('aria-pressed', String(o === b)); });
            apply();
          };
        });
        apply();
        v2WithHistory('subjects', renderSubjectsV2);
      }

      // ---- PYQ: past papers -----------------------------------------------
      function renderPyqV2() {
        if (!quizStylesReady) { ensureQuizStyles().then(renderPyqV2); return; }
        trackPageView('/pyqs', 'pyq');
        var pro = isUserPro(currentUser);
        var ix = v2Index(v2HaveHistory() ? reviewData : null);
        var body = '<section class="v3-pagehead"><div class="v3-pagehead-t"><span class="v3-chip">' + v3Ic('doc', 16) + 'PYQ</span>' +
          '<h1>Past papers</h1><p>Previous-year questions, by exam and year' + (pro ? '' : ' · Pro') + '</p></div>' +
          v3Art(['forensic-medicine', 'psm', 'surgery']) + '</section>' +
          '<div class="v3-pyqs">' + PYQ_EXAMS.map(function (ex) {
            var years = (ex.years || []).filter(function (y) { return !/^All /.test(y); });
            var span = String(ex.coverage || '').split('·')[0].replace(/ – /g, '–').replace(/\s*(Recalls|Exam Question Papers)\s*$/i, '').trim();
            return '<button class="v3-card v3-pyq" data-pyq="' + esc(ex.id) + '"><span class="v3-pyq-ic" aria-hidden="true">' + esc(ex.icon || '📄') + '</span>' +
              '<span class="v3-pyq-t"><b>' + esc(ex.name) + '</b><small>' + esc(ex.label || '') + '</small>' +
              '<span class="v3-tchips"><span class="v3-tc">' + v3Ic('calendar', 14) + esc(span) + '</span>' + (years.length ? '<span class="v3-tc">' + v2Plural(years.length, /Sessions/.test(ex.coverage || '') ? 'session' : 'paper') + '</span>' : '') +
              (pro ? '' : '<span class="v3-tc pro">' + v3Ic('lock', 13) + 'Pro</span>') + '</span></span>' + v3Ic('chev', 20) + '</button>';
          }).join('') + '</div>' +
          (pro ? '' : '<button class="v3-pro" id="v2ProBtn"><span class="v3-pro-ic" aria-hidden="true">👑</span><span class="v3-pro-t"><b>Unlock past papers</b><small>Every year of NEET PG, INI-CET, FMGE and more with Pro.</small></span>' + v3Ic('chev', 20) + '</button>');
        v2Paint('pyq', v2Shell('pyq', v2Header(), '<div class="v2-bold v3-page">' + body + '</div>', ix.due.length));
        wireV2Shell();
        wireV2Common();
        var pb = document.getElementById('v2ProBtn');
        if (pb) pb.onclick = function () { if (currentUser) openProModal('banner', {}); else openAuthModal('signup', { reason: 'Create a free account, then go Pro for past papers.' }); };
      }

      // ---- Profile ---------------------------------------------------------
      var v3ProfileUid = undefined;
      function renderProfileV2() {
        if (!quizStylesReady) { ensureQuizStyles().then(renderProfileV2); return; }
        v3ProfileUid = currentUser ? currentUser.id : null;
        trackPageView('/profile', 'profile');
        var rd = v2HaveHistory() ? reviewData : null;
        var ix = v2Index(rd);
        var pro = isUserPro(currentUser);
        var row = function (icon, label, sub, attrs, end) {
          return '<button class="v3-li v3-set" ' + attrs + '><span class="v3-set-ic">' + v3Ic(icon, 20) + '</span><span class="v3-li-t"><b>' + label + '</b>' + (sub ? '<small>' + sub + '</small>' : '') + '</span>' + (end || v3Ic('chev', 18)) + '</button>';
        };
        var body = '';
        if (currentUser) {
          var name = esc(getUserDisplayName(currentUser) || 'Student');
          body += '<section class="v3-card v3-me"><span class="v3-me-av">' + esc(getUserInitials(currentUser)) + '</span><span class="v3-me-t"><b>' + name + '</b><small>' + esc(currentUser.email || '') + '</small>' +
            '<span class="v3-pill ' + (pro ? 'pro' : '') + '">' + (pro ? '⭐ Pro active' : 'Free plan') + '</span></span></section>';
        } else {
          body += '<section class="v2-hero v3-mission v3-mission-sm"><div class="v3-mission-main"><p class="v3-mission-k">' + v3Ic('user', 22) + 'Your account</p><h2>Sign in to save your progress</h2>' +
            '<ul class="v3-mission-list"><li>' + v3Ic('check', 18) + '8 free topics in every subject</li><li>' + v3Ic('refresh', 18) + 'Spaced review of what you miss</li></ul></div>' +
            '<div class="v3-mission-actions"><button class="v3-mission-btn" id="v3SignIn">Sign in free <span aria-hidden="true">→</span></button></div></section>';
        }
        var g = v2ExamGet();
        var goal = v2Goal();
        body += '<section class="v3-sec">' + v3Head('', 'Study', '') + '<div class="v3-card v3-list">' +
          (currentUser ? row('calendar', 'Exam and date', g ? esc(g.exam) + (g.date ? ' · ' + esc(g.date) : '') : 'Not set', 'id="v2ExamEdit"') : '') +
          (currentUser ? row('target', 'Daily goal', goal + ' questions a day', 'id="v2GoalBtn" aria-expanded="false"') +
            '<div class="v2-goal-pick v3-goal-pick" id="v2GoalPick" hidden>' + V2_GOALS.map(function (gv) { return '<button class="v2-goal-opt' + (gv === goal ? ' on' : '') + '" data-goal="' + gv + '">' + gv + '</button>'; }).join('') + '</div>' : '') +
          row('chart', 'Progress and analytics', 'Accuracy, activity and every subject', 'data-nav-go="progress"') +
          row('refresh', 'Review', ix.due.length ? ix.due.length + ' questions due' : 'Spaced review of past answers', 'data-nav-go="review"') +
          row('bookmark', 'Bookmarks', 'Questions you saved', 'data-nav-go="bookmarks"') +
          '</div>' + (currentUser ? v2ExamLine(ix).replace(/^<p class="v2-exam">[\s\S]*?<\/p>/, '') : '') + '</section>';
        body += '<section class="v3-sec">' + v3Head('', 'App', '') + '<div class="v3-card v3-list">' +
          row('sun', 'Theme', darkMode ? 'Dark' : 'Light', 'id="v3Theme"', '<span class="v3-switch' + (darkMode ? ' on' : '') + '" aria-hidden="true"><span></span></span>') +
          row('grid', 'Classic home', 'Use the earlier home screen', 'id="v2ClassicBtn"') +
          (isAdmin(currentUser) ? row('crown', 'Admin console', 'Students, questions, mock tests', 'id="v3Admin"') : '') +
          (currentUser && !pro ? row('crown', 'Go Pro', 'All ' + totalTopics() + ' topics and past papers', 'id="v2ProBtn"') : '') +
          (currentUser ? row('out', 'Sign out', '', 'id="v3SignOut"', '') : '') +
          '</div></section>';
        v2Paint('profile', v2Shell('profile', v2Header(), '<div class="v2-bold v3-page"><h1 class="v3-title">Profile</h1>' + body + '</div>', ix.due.length));
        wireV2Shell();
        wireV2Common();
        if (currentUser) wireV2Exam(function () { renderProfileV2(); });
        var si = document.getElementById('v3SignIn');
        if (si) si.onclick = function () { openAuthModal('signin', { reason: 'Sign in to save your progress.' }); };
        var th = document.getElementById('v3Theme');
        if (th) th.onclick = function (e) { toggleTheme(e); setTimeout(renderProfileV2, 60); };
        var cl = document.getElementById('v2ClassicBtn');
        if (cl) cl.onclick = function () { setUiMode('old'); };
        var ad = document.getElementById('v3Admin');
        if (ad) ad.onclick = function () { window.location.href = '/admin-mock'; };
        var pb = document.getElementById('v2ProBtn');
        if (pb) pb.onclick = function () { openProModal('banner', {}); };
        var so = document.getElementById('v3SignOut');
        if (so) so.onclick = function () { handleSignOut(); };
        var gb = document.getElementById('v2GoalBtn'), gpk = document.getElementById('v2GoalPick');
        if (gb && gpk) {
          gb.onclick = function () { gpk.hidden = !gpk.hidden; gb.setAttribute('aria-expanded', String(!gpk.hidden)); };
          gpk.querySelectorAll('[data-goal]').forEach(function (o) {
            o.onclick = function () { v2SetGoal(parseInt(o.getAttribute('data-goal'), 10)); renderProfileV2(); };
          });
        }
        v2WithHistory('profile', renderProfileV2);
      }

      // ---- review -------------------------------------------------------------
      function renderReviewV2() {
        if (!quizStylesReady) { ensureQuizStyles().then(renderReviewV2); return; }
        trackPageView('/review', 'review');
        var rd = v2HaveHistory() ? reviewData : null;
        var ix = v2Index(rd);
        var ladder = '<div class="v2-ladder" aria-label="Review intervals">' + ['Miss', '3 days', '7 days', '16 days', '35 days'].map(function (t, k) {
          return '<span class="v2-ladder-step' + (k === 0 ? ' miss' : '') + '"><b>' + (k === 0 ? 'Next day' : t) + '</b><small>' + (k === 0 ? 'after a miss' : k + ' right in a row') + '</small></span>';
        }).join('') + '</div>';
        var body = '<div class="v2-bold"><h1 class="v2-hello-h">Review</h1>';
        if (!currentUser) {
          body += '<section class="v2-hero v2-hero-compact"><div class="v2-hero-main"><p class="v2-hero-k">Spaced review</p><h2 class="v2-hero-h">Questions come back when you are about to forget them</h2>' +
            '<p class="v2-hero-p">Sign in and every answer is scheduled for you.</p></div><div class="v2-hero-actions"><button class="v2-hero-btn" id="v2RevSignIn">Sign in free</button></div></section>' +
            '<section class="v2-sec"><h2 class="v2-h2b">How it works</h2>' + ladder + '</section>';
        } else if (!rd) {
          body += '<section class="v2-hero v2-hero-compact" aria-busy="true"><div class="v2-hero-main"><p class="v2-hero-k">Spaced review</p><h2 class="v2-hero-h">Loading…</h2></div></section>';
        } else {
          var wrong = ix.due.filter(function (d) { return d.wrong; }).length;
          var nNow = Math.min(30, ix.due.length);
          body += '<section class="v2-hero v2-hero-compact"><div class="v2-hero-main"><p class="v2-hero-k">Spaced review</p>' +
            '<h2 class="v2-hero-h">' + (ix.due.length ? v2Plural(ix.due.length, 'question') + ' due' : 'Nothing due right now') + '</h2>' +
            '<p class="v2-hero-p">' + (ix.due.length ? (wrong ? wrong + ' missed last time, ' + (ix.due.length - wrong) + ' right but fading' : 'All of them right last time, now fading') : (ix.seen ? 'You are up to date. New reviews appear as days pass.' : 'Answer a few questions and they start to come back here.')) + '</p></div>' +
            (ix.due.length ? v2Ring(wrong / (ix.due.length || 1), 76, 8, 'v2-ring-hero', '<strong>' + wrong + '</strong><small>missed</small>') : '') +
            '<div class="v2-hero-actions">' + (ix.due.length ? '<button class="v2-hero-btn" id="v2RevAll">Review ' + nNow + ' now</button>' : '<button class="v2-hero-btn" data-nav-go="today">Go to today’s set</button>') + '</div></section>' +
            (ix.due.length > 30 ? '<p class="v2-note">Sessions are kept to 30 questions; the rest wait for the next one.</p>' : '');
          var byTopic = {};
          ix.due.forEach(function (d) { if (d.mod != null) byTopic[d.mod] = (byTopic[d.mod] || 0) + 1; });
          var idx = v2ModIndex();
          var topics = Object.keys(byTopic).map(function (k) { return { info: idx[k], n: byTopic[k], id: Number(k) }; })
            .filter(function (t) { return t.info; }).sort(function (a, b) { return b.n - a.n; });
          if (topics.length) body += '<section class="v2-sec"><h2 class="v2-h2b">Due by topic</h2>' + topics.slice(0, 25).map(function (t) {
            return '<button class="v2-card2 v2-weak" data-review-mod="' + t.id + '">' + v2SubjIcon(t.info.sx, 40) +
              '<span class="v2-cont-main"><span class="v2-cont-t">' + esc(t.info.m.name) + '</span><span class="v2-cont-s">' + esc(t.info.sx.name) + '</span></span>' +
              '<span class="v2-badge">' + t.n + ' due</span></button>';
          }).join('') + '</section>';
          body += '<section class="v2-sec"><h2 class="v2-h2b">How the spacing works</h2>' + ladder + '</section>';
        }
        body += '</div>';
        v2Paint('review', v2Shell('review', v2Header('Back to today', 'Review'), body, ix.due.length));
        wireV2Shell();
        wireV2Common();
        var si = document.getElementById('v2RevSignIn');
        if (si) si.onclick = function () { v2NeedAccount('Sign in to review your answers.', renderReviewV2); };
        var all = document.getElementById('v2RevAll');
        if (all) all.onclick = function () { startReviewSet(null); };
        app.querySelectorAll('[data-review-mod]').forEach(function (b) {
          b.onclick = function () { startReviewSet(Number(b.getAttribute('data-review-mod'))); };
        });
        v2WithHistory('review', renderReviewV2);
      }

      // ---- topics in a subject ------------------------------------------------
      var v2TopicFilter = 'all';
      var V2_STATUS_SVG = {
        done: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="Done" class="v2-st v2-st-done"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
        active: '<svg width="18" height="18" viewBox="0 0 24 24" role="img" aria-label="In progress" class="v2-st v2-st-active"><circle cx="12" cy="12" r="8" fill="none" stroke-width="2.4" class="v2-st-track"/><path d="M12 4a8 8 0 0 1 7.2 4.5" fill="none" stroke-width="2.4" stroke-linecap="round" class="v2-st-arc"/></svg>',
        next: '<svg width="18" height="18" viewBox="0 0 24 24" role="img" aria-label="Next" class="v2-st v2-st-next"><circle cx="12" cy="12" r="8" fill="none" stroke-width="2.4"/></svg>',
        fresh: '<svg width="18" height="18" viewBox="0 0 24 24" role="img" aria-label="Not started" class="v2-st v2-st-new"><circle cx="12" cy="12" r="8" fill="none" stroke-width="2.4"/></svg>'
      };

      // The in-progress ring fills with the share of the topic answered.
      function v2ArcSvg(frac) {
        var c = 50.27, len = Math.max(3, Math.min(c - 3, frac * c));
        return '<svg width="18" height="18" viewBox="0 0 24 24" role="img" aria-label="In progress, ' + Math.round(frac * 100) + '% answered" class="v2-st v2-st-active">' +
          '<circle cx="12" cy="12" r="8" fill="none" stroke-width="2.4" class="v2-st-track"/>' +
          '<circle cx="12" cy="12" r="8" fill="none" stroke-width="2.4" stroke-linecap="round" class="v2-st-arc" stroke-dasharray="' + len.toFixed(1) + ' ' + c + '" transform="rotate(-90 12 12)"/></svg>';
      }

      function renderTopicsV2(subjectId) {
        var sx = SUBJECT_INDEX.find(function (s) { return s.subjectId === subjectId; });
        if (!sx) { renderSubjectsV2(); return; }
        trackPageView(subjectPath(sx), 'modules');
        if (!currentUser) loadGuestModules();
        state.subjectId = subjectId;
        var rd = v2HaveHistory() ? reviewData : null;
        var ix = v2Index(rd);
        var ss = v2SubjectStats(sx, ix);
        var pro = isUserPro(currentUser);
        var next = v2NextIn(ss, v2LastModuleIn(ss));
        var started = ss.mods.filter(function (x) { return x.open && x.st.seen > 0; });
        var freeCount = ss.mods.filter(function (x) { return !x.locked; }).length;
        var slug = v2Slug(sx.name);
        var comp = ss.qseen / (ss.questions || 1);

        var body = '<div class="v2-bold v3-page v3-topics"><section class="v3-topichead v2-subj-head">' +
          '<span class="v3-th-ic">' + v2SubjIcon(sx, 84) + '</span>' +
          '<div class="v3-th-t"><h1>' + esc(sx.name) + '</h1><p>' + v2Plural(ss.total, 'topic') + ' · ' + v2Plural(ss.questions, 'question') + '</p>' +
          '<div class="v3-th-bar"><span class="v3-bar"><span style="width:' + Math.max(2, v3Pct(comp)) + '%"></span></span><span>' + v3Pct(comp) + '% complete</span></div></div>' +
          '<img class="v3-th-art" src="/assets/subjects-webp/' + slug + '.webp" alt="" width="96" height="96" aria-hidden="true"></section>';

        if (!pro) {
          body += '<p class="v2-tier v3-tier">' + (currentUser
            ? freeCount + ' of ' + ss.total + ' topics are open on the free plan.'
            : 'One topic here is free to try without an account; a free account opens ' + Math.min(PRO_CONFIG.FREE_MODULES_PER_SUBJECT, ss.total) + '.') +
            ' <button class="v2-link" id="v2Upgrade">' + (currentUser ? 'Unlock all ' + ss.total + ' with Pro' : 'Sign up free') + '</button></p>';
        }

        var rows = [];
        ss.mods.forEach(function (x) {
          var f = x.locked ? 'locked' : x.st.status === 'done' ? 'done' : x.st.status === 'active' ? 'active' : 'fresh';
          rows.push({ x: x, f: f });
        });
        var counts = { all: ss.total, fresh: 0, active: 0, due: 0, done: 0 };
        rows.forEach(function (r) { if (counts[r.f] != null) counts[r.f]++; if (r.x.st.due) counts.due++; });
        var filters = [['all', 'All', ''], ['fresh', 'Not started', 'playc'], ['active', 'In progress', 'refresh'], ['due', 'Needs revision', 'bookmark'], ['done', 'Done', 'check']]
          .filter(function (fl) { return fl[0] !== 'done' || counts.done > 0; });
        if (!filters.some(function (fl) { return fl[0] === v2TopicFilter; })) v2TopicFilter = 'all';
        body += '<div class="v2-gsearch v3-search"><label class="v2-sr" for="topicSearch">Search ' + esc(sx.name) + ' topics</label>' +
          '<span class="v2-gsearch-ic" aria-hidden="true">' + v3Ic('search', 20) + '</span>' +
          '<input id="topicSearch" type="search" placeholder="Search topics in ' + esc(sx.name) + '…" autocomplete="off"></div>' +
          '<div class="v3-filters" role="group" aria-label="Filter topics">' + filters.map(function (fl) {
            return '<button class="v3-filter" data-topic-f="' + fl[0] + '" aria-pressed="' + (v2TopicFilter === fl[0]) + '">' + (fl[2] ? v3Ic(fl[2], 18) : '') + fl[1] + ' (' + counts[fl[0]] + ')</button>';
          }).join('') + '</div>';

        var html = '', section = null, secRows = [];
        function flush() {
          if (section === null && !secRows.length) return;
          html += '<section class="v3-topic-sec v2-topic-sec">' + (section ? '<h2 class="v3-sec-h">' + esc(section) + '</h2>' : '') + secRows.join('') + '</section>';
          secRows = [];
        }
        rows.forEach(function (r) {
          var x = r.x, st = x.st;
          if ((x.m.section || null) !== section) { flush(); section = x.m.section || null; }
          var isNext = next && next.m.id === x.m.id && !x.locked;
          var frac = st.total ? st.seen / st.total : 0;
          var p = v3Pct(frac);
          var chips = ['<span class="v3-tc">' + v3Ic('layers', 15) + x.m.questionCount + ' Qs</span>'];
          if (x.locked) chips.push('<span class="v3-tc pro">' + v3Ic('lock', 14) + 'Pro</span>');
          else if (st.status === 'done') chips.push('<span class="v3-tc ok">' + v3Ic('check', 15) + 'Done</span>');
          else if (st.status === 'active') chips.push('<span class="v3-tc">' + v3Ic('check', 15) + st.seen + ' of ' + st.total + '</span>');
          else chips.push('<span class="v3-tc">' + v3Ic('playc', 15) + 'Not started</span>');
          if (!x.locked && st.pct != null && st.seen) chips.push('<span class="v3-tc ' + (st.pct >= 70 ? 'ok' : st.pct >= 50 ? 'mid' : 'bad') + '">' + v3Ic('target', 15) + st.pct + '% correct</span>');
          if (!x.locked && st.due) chips.push('<span class="v3-tc due">' + v3Ic('refresh', 14) + st.due + ' due</span>');
          if (!currentUser && !x.locked) chips.push('<span class="v3-tc">' + (x.open ? 'Free to try' : 'Free account') + '</span>');
          var ring = x.locked ? '<span class="v3-lockc">' + v3Ic('lock', 20) + '</span>'
            : v2Ring(frac, 54, 5, 'v3-ring-t v3-rt-' + (st.status === 'done' ? 'done' : st.status === 'active' ? 'active' : 'new'), st.status === 'done' ? '✓' : p + '%');
          var end = isNext ? '<span class="v3-nextbtn">' + (st.status === 'active' ? 'Next up' : 'Start') + v3Ic('chev', 16) + '</span>' : '<span class="v3-tchev">' + v3Ic('chev', 18) + '</span>';
          secRows.push('<button class="v3-topic' + (x.locked ? ' is-locked' : '') + (isNext ? ' is-next' : '') + (x.m.questionCount ? '' : ' is-empty') + '" data-topic="' + esc(x.m.moduleId) + '" data-i="' + x.i + '" data-locked="' + x.locked + '"' +
            ' data-f="' + r.f + '" data-due="' + (st.due ? 1 : 0) + '" data-name="' + esc((x.m.name + ' ' + (x.m.section || '')).toLowerCase()) + '">' +
            v3TopicThumb(sx, x.m, x.i + 1) +
            '<span class="v3-topic-t"><b>' + esc(x.m.name) + '</b><span class="v3-tchips">' + chips.join('') + '</span></span>' +
            ring + end + '</button>');
        });
        flush();
        body += '<div id="v2TopicList" class="v3-topiclist">' + html + '</div><p class="v2-empty" id="v2TopicNone" hidden>No topics match.</p>';

        var mockLocked = isModuleLocked(subjectId, 'all');
        body += '<section class="v3-sec"><div class="v3-h"><h2><span>More practice</span></h2></div><div class="v3-card v3-list">' +
          (currentUser && started.length >= 2 ? '<button class="v3-li v3-set" id="v2Mix"><span class="v3-set-ic">' + v3Ic('custom', 20) + '</span><span class="v3-li-t"><b>Mixed ' + esc(sx.name) + ' set</b><small>20 questions from the ' + started.length + ' topics you have started' + (ss.due ? ', due ones first' : '') + '</small></span>' + v3Ic('chev', 18) + '</button>' : '') +
          '<button class="v3-li v3-set" id="v2AllTopics"><span class="v3-set-ic">' + v3Ic('trophy', 20) + '</span><span class="v3-li-t"><b>' + esc(sx.name) + ' mock</b><small>All ' + v2Plural(ss.questions, 'question') + '</small></span>' + (mockLocked ? '<span class="v3-tc pro">' + v3Ic('lock', 14) + 'Pro</span>' : v3Ic('chev', 18)) + '</button>' +
          '</div></section></div>';

        v2Paint('modules', v2Shell('qbank', v2Header('All subjects', 'Subjects'), body, ix.due.length));
        wireV2Shell(function () { renderSubjectsV2(); });
        wireV2Common();

        var modules = getSubjectModules(subjectId);
        app.querySelectorAll('[data-topic]').forEach(function (b) {
          b.onclick = function () {
            var mid = b.getAttribute('data-topic');
            if (b.getAttribute('data-locked') === 'true') {
              var mo = modules.find(function (m) { return String(m.moduleId) === mid; });
              openProModal('locked_module', { subjectId: subjectId, moduleId: mid, moduleName: mo ? mo.name : 'This Topic' });
              return;
            }
            renderSetup(subjectId, mid);
          };
        });
        var mix = document.getElementById('v2Mix');
        if (mix) mix.onclick = function () { startSubjectMix(subjectId); };
        var up = document.getElementById('v2Upgrade');
        if (up) up.onclick = function () {
          if (currentUser) openProModal('banner', { subjectId: subjectId });
          else openAuthModal('signup', { reason: 'Create a free account to open 8 topics in every subject.' });
        };
        var all = document.getElementById('v2AllTopics');
        if (all) all.onclick = function () {
          if (mockLocked) openProModal('all_topics', { subjectId: subjectId, moduleId: 'all', moduleName: 'All topics' });
          else renderSetup(subjectId, 'all');
        };

        var input = document.getElementById('topicSearch');
        function apply() {
          var q = (input.value || '').trim().toLowerCase();
          var shown = 0;
          app.querySelectorAll('#v2TopicList .v3-topic-sec').forEach(function (sec) {
            var any = false;
            sec.querySelectorAll('[data-topic]').forEach(function (r) {
              var f = r.getAttribute('data-f');
              var okF = v2TopicFilter === 'all' || (v2TopicFilter === 'due' ? r.getAttribute('data-due') === '1' : f === v2TopicFilter);
              var ok = okF && (!q || r.getAttribute('data-name').indexOf(q) !== -1);
              r.hidden = !ok;
              if (ok) { any = true; shown++; }
            });
            sec.hidden = !any;
          });
          document.getElementById('v2TopicNone').hidden = shown > 0;
        }
        input.oninput = apply;
        app.querySelectorAll('[data-topic-f]').forEach(function (b) {
          b.onclick = function () {
            v2TopicFilter = b.getAttribute('data-topic-f');
            app.querySelectorAll('[data-topic-f]').forEach(function (o) { o.setAttribute('aria-pressed', String(o === b)); });
            apply();
          };
        });
        apply();
        v2WithHistory('modules', function () { renderTopicsV2(subjectId); });
      }

      var bmSubjectFilter = 'all';
      function renderBookmarks() {
        if (!quizStylesReady) { ensureQuizStyles().then(renderBookmarks); return; }
        clearTimer();
        releaseQuizPayload();
        state.screen = 'bookmarks';
        state.idSet = null;
        scrollToPageTop();
        if (app) app.classList.remove('screen-quiz', 'screen-setup', 'screen-results');
        if (!currentUser) {
          openAuthModal('signin', { reason: 'Please sign in to view your bookmarks.' });
          renderHome();
          return;
        }
        trackPageView('/bookmarks', 'bookmarks');
        var useV2 = v2On();
        var body = '<h1 class="v2-title">Bookmarks</h1>' +
          '<p class="v2-sub" id="bmCount">Questions you saved while practising.</p>' +
          '<div id="bmTop"></div>' +
          '<div id="bmList" class="bm2-list"><p class="v2-lede" aria-busy="true">Loading your saved questions…</p></div>';
        app.innerHTML = useV2
          ? v2Shell('bookmarks', v2Header('Back to today', 'Bookmarks'), body, v2HaveHistory() ? v2Index(reviewData).due.length : 0)
          : rrTopBar('Back to home', 'Home') + '<main id="mainContent" role="main" class="rr-dash v2-main bm2">' + body + '</main>' + footerHtml();
        hideStaticFooter();
        if (useV2) { wireV2Shell(); } else { wireTopBar(renderHome); }
        var listEl = document.getElementById('bmList');
        var fail = function (msg) { listEl.innerHTML = '<p class="v2-lede">' + esc(msg) + ' <button class="v2-link" id="bmRetry">Try again</button></p>'; var r = document.getElementById('bmRetry'); if (r) r.onclick = renderBookmarks; };
        supabaseClient.from('user_bookmarks').select('question_id,subject_name,topic_name,created_at')
          .eq('user_id', currentUser.id).order('created_at', { ascending: false })
          .then(function (res) {
            if (res.error) { fail('Could not load your bookmarks.'); return; }
            var marks = res.data || [];
            if (!marks.length) {
              document.getElementById('bmCount').textContent = 'Nothing saved yet.';
              listEl.innerHTML = '<p class="v2-lede">While practising, tap the bookmark icon at the bottom of a question to keep it here for later.</p>' +
                '<button class="v2-btn" id="bmBrowse">Practise a topic</button>';
              document.getElementById('bmBrowse').onclick = function () { if (useV2) renderSubjectsV2(); else renderHome(); };
              return;
            }
            var ids = marks.map(function (m) { return m.question_id; });
            supabaseClient.from('questions').select('id,question_num,question_text,module_id')
              .in('id', ids).then(function (qr) {
                if (qr.error || !qr.data) { fail('Could not load the saved questions.'); return; }
                var byId = {};
                qr.data.forEach(function (r) { byId[r.id] = r; });
                var modMap = bookmarkModuleMap();
                var subjects = [], subjByName = {};
                marks.forEach(function (m) {
                  var r = byId[m.question_id];
                  if (!r) return;
                  var hit = (r.module_id !== null && r.module_id !== undefined) ? modMap[r.module_id] : null;
                  var subjName = (hit && hit.subject) || m.subject_name || 'Question bank';
                  var topicName = (hit && hit.topic) || m.topic_name || '';
                  var sg = subjByName[subjName];
                  if (!sg) { sg = subjByName[subjName] = { name: subjName, topics: [], topicByName: {}, ids: [] }; subjects.push(sg); }
                  var tg = sg.topicByName[topicName];
                  if (!tg) { tg = sg.topicByName[topicName] = { name: topicName, rows: [] }; sg.topics.push(tg); }
                  tg.rows.push({ r: r, at: m.created_at });
                  sg.ids.push(r.id);
                });
                var total = subjects.reduce(function (n, sg) { return n + sg.ids.length; }, 0);
                if (bmSubjectFilter !== 'all' && !subjByName[bmSubjectFilter]) bmSubjectFilter = 'all';
                var shown = subjects.filter(function (sg) { return bmSubjectFilter === 'all' || sg.name === bmSubjectFilter; });
                var shownIds = [];
                shown.forEach(function (sg) { shownIds = shownIds.concat(sg.ids); });
                document.getElementById('bmCount').textContent = v2Plural(total, 'question') + ' saved' + (subjects.length > 1 ? ' across ' + subjects.length + ' subjects' : '');
                document.getElementById('bmTop').innerHTML =
                  '<button class="v2-btn" id="bmPractiseAll">Practise ' + (bmSubjectFilter === 'all' ? 'all ' : '') + v2Plural(shownIds.length, 'question') + (bmSubjectFilter === 'all' ? '' : ' in ' + esc(bmSubjectFilter)) + '</button>' +
                  (subjects.length > 1 ? '<div class="v2-filters" role="group" aria-label="Filter by subject">' +
                    '<button class="v2-filter" data-bm-f="all" aria-pressed="' + (bmSubjectFilter === 'all') + '">All ' + total + '</button>' +
                    subjects.map(function (sg) {
                      return '<button class="v2-filter" data-bm-f="' + esc(sg.name) + '" aria-pressed="' + (bmSubjectFilter === sg.name) + '">' + esc(sg.name) + ' ' + sg.ids.length + '</button>';
                    }).join('') + '</div>' : '');
                var trash = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3"/></svg>';
                listEl.innerHTML = shown.map(function (sg) {
                  return '<section class="v2-sec"><h2 class="v2-h2 v2-h2-flat"><span>' + esc(sg.name) + '</span><span>' + sg.ids.length + '</span></h2>' +
                    sg.topics.map(function (tg) {
                      return (tg.name ? '<p class="bm2-topic">' + esc(tg.name) + '</p>' : '') + tg.rows.map(function (x) {
                        var when = '';
                        try { when = new Date(x.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }); } catch (e) { }
                        return '<div class="bm2-row">' +
                          '<button class="bm2-q" data-bm-go="' + x.r.id + '"><span class="bm2-stem">' + esc(stripHtmlPreview(x.r.question_text, 200) || 'Image-based question') + '</span>' +
                          '<span class="bm2-meta">Saved ' + esc(when) + ' · tap to practise</span></button>' +
                          '<button class="bm2-del" data-bm-del="' + x.r.id + '" aria-label="Remove bookmark" title="Remove bookmark">' + trash + '</button></div>';
                      }).join('');
                    }).join('') + '</section>';
                }).join('');
                document.getElementById('bmPractiseAll').onclick = function () { practiseBookmarks(shownIds); };
                app.querySelectorAll('[data-bm-f]').forEach(function (b) {
                  b.onclick = function () { bmSubjectFilter = b.getAttribute('data-bm-f'); renderBookmarks(); };
                });
                app.querySelectorAll('[data-bm-go]').forEach(function (b) {
                  b.onclick = function () { practiseBookmarks([Number(b.getAttribute('data-bm-go'))]); };
                });
                app.querySelectorAll('[data-bm-del]').forEach(function (b) {
                  b.onclick = function () {
                    var qid = Number(b.getAttribute('data-bm-del'));
                    var row = b.closest('.bm2-row');
                    if (row) row.style.opacity = '0.4';
                    supabaseClient.from('user_bookmarks').delete().eq('user_id', currentUser.id).eq('question_id', qid)
                      .then(function (dr) {
                        if (dr.error) { if (row) row.style.opacity = ''; showToast('Could not remove the bookmark. Please try again.', 'error'); return; }
                        showToast('Bookmark removed.');
                        renderBookmarks();
                      });
                  };
                });
              });
          });
      }

      // Practise bookmarked questions as a quiz pool. Built from the fetched
      // bank rows (same mapping as startQuiz) rather than reusing the setup
      // flow, so no subject/module setup is assumed.
      function practiseBookmarks(questionIds) {
        if (!questionIds || !questionIds.length) {
          showToast('No bookmarked questions to practise.');
          renderBookmarks();
          return;
        }
        if (!currentUser) {
          openAuthModal('signin', { reason: 'Please sign in to practise your bookmarks.' });
          renderHome();
          return;
        }
        clearTimer();
        app.innerHTML =
          rrLoadingHtml('Back', 'My bookmarks', 'Loading your saved questions');
        wireTopBar(renderBookmarks);
        supabaseClient.from('questions')
          .select('id,question_num,question_text,option_a,option_b,option_c,option_d,option_e,answer,explanation,module_id')
          .in('id', questionIds).then(function (res) {
            if (res.error || !res.data || !res.data.length) {
              showToast('Could not load bookmarked questions.');
              renderBookmarks();
              return;
            }
            var byId = {};
            res.data.forEach(function (r) { byId[r.id] = r; });
            var rows = questionIds.map(function (id) { return byId[id]; })
              .filter(function (r) { return !!r; });
            if (!rows.length) {
              showToast('Those bookmarks are no longer available.');
              renderBookmarks();
              return;
            }
            return loadQuestionImages(rows).then(function (imageRows) {
              var imagesByQuestion = {};
              imageRows.forEach(function (image) {
                var key = String(image.question_id);
                if (!imagesByQuestion[key]) imagesByQuestion[key] = { question_text: [], explanation: [] };
                if (image.content_field && imagesByQuestion[key][image.content_field]) {
                  imagesByQuestion[key][image.content_field].push(image);
                }
              });
              var fetchedQuestions = rows.map(function (r) {
                var opts = {};
                if (r.option_a) opts.A = r.option_a;
                if (r.option_b) opts.B = r.option_b;
                if (r.option_c) opts.C = r.option_c;
                if (r.option_d) opts.D = r.option_d;
                if (r.option_e) opts.E = r.option_e;
                return {
                  id: r.id,
                  moduleId: r.module_id,
                  num: String(r.id || r.question_num),
                  question: r.question_text || '',
                  options: opts,
                  answer: r.answer || 'A',
                  explanation: r.explanation || '',
                  questionImages: (imagesByQuestion[String(r.id)] || {}).question_text || [],
                  explanationImages: (imagesByQuestion[String(r.id)] || {}).explanation || []
                };
              });
              var bmIds = {};
              fetchedQuestions.forEach(function (q) { bmIds[q.id] = true; });
              state = {
                screen: 'quiz', subjectId: null, moduleId: 'bookmarks',
                poolTitle: 'My bookmarks', questions: fetchedQuestions,
                order: fetchedQuestions.map(function (q, i) { return i; }),
                idx: 0, answers: {}, quizType: 'practice', timeLimit: 0,
                remaining: 0, timerId: null, progressKey: 'bookmarks',
                bookmarkOrder: questionIds, bookmarkedIds: bmIds
              };
              beginAttemptLog(null);
              scrollToPageTop();
              renderQuiz();
            });
          });
      }

      // ---------- RESULTS ----------
      function verdictFor(pct) {
        if (pct === 100) return 'Perfect score — every question nailed.';
        if (pct >= 85) return 'Strong grasp of this topic.';
        if (pct >= 70) return 'Solid, with a few gaps to revisit.';
        if (pct >= 50) return 'Halfway there — worth a second pass.';
        return 'This topic needs another round.';
      }

      // Score ring and the four counts, the way question banks report a test.
      function rrResultSummary(correct, total, pct, timedOut) {
        var answered = 0, wrong = 0;
        Object.keys(state.answers).forEach(function (k) {
          var a = state.answers[k];
          if (!a || a.skipped) return;
          answered++;
          if (!a.isCorrect) wrong++;
        });
        var skipped = Math.max(0, total - correct - wrong);
        if (!state.finishedAt) state.finishedAt = Date.now();
        var secs = state.startedAt ? Math.max(0, Math.round((state.finishedAt - state.startedAt) / 1000)) : 0;
        var fmt = function (t) { var m = Math.floor(t / 60), s2 = t % 60; return m >= 60 ? Math.floor(m / 60) + 'h ' + (m % 60) + 'm' : (m ? m + 'm ' : '') + s2 + 's'; };
        var acc = answered ? Math.round((correct / answered) * 100) : 0;
        var C = 2 * Math.PI * 52;
        var okLen = total ? (correct / total) * C : 0, badLen = total ? (wrong / total) * C : 0;
        return '<section class="rr-sum" aria-label="Result">' +
          '<div class="rr-ring">' +
          '<svg viewBox="0 0 120 120" width="132" height="132" aria-hidden="true">' +
          '<circle cx="60" cy="60" r="52" class="rr-ring-track"/>' +
          (badLen ? '<circle cx="60" cy="60" r="52" class="rr-ring-bad" stroke-dasharray="' + badLen.toFixed(2) + ' ' + C.toFixed(2) + '" stroke-dashoffset="' + (-okLen).toFixed(2) + '"/>' : '') +
          (okLen ? '<circle cx="60" cy="60" r="52" class="rr-ring-ok" stroke-dasharray="' + okLen.toFixed(2) + ' ' + C.toFixed(2) + '"/>' : '') +
          '</svg>' +
          '<h1 class="rr-ring-label"><span class="rr-ring-pct">' + pct + '%</span><span class="rr-ring-of">' + correct + ' of ' + total + '</span></h1>' +
          '</div>' +
          '<p class="rr-res-verdict">' + verdictFor(pct) + (timedOut ? ' Time ran out.' : '') + '</p>' +
          '<dl class="rr-counts">' +
          '<div class="ok"><dt>Correct</dt><dd>' + correct + '</dd></div>' +
          '<div class="bad"><dt>Wrong</dt><dd>' + wrong + '</dd></div>' +
          '<div class="skip"><dt>Skipped</dt><dd>' + skipped + '</dd></div>' +
          '<div><dt>Time</dt><dd>' + (secs ? fmt(secs) : '\u2013') + '</dd></div>' +
          '</dl>' +
          (answered ? '<p class="rr-sum-note">Accuracy on the ' + answered + ' you answered: ' + acc + '%' + (secs && answered ? ' \u00b7 about ' + Math.max(1, Math.round(secs / answered)) + 's a question' : '') + '</p>' : '') +
          '</section>';
      }

      function renderResults(timedOut) {
        if (!quizStylesReady) { ensureQuizStyles().then(function () { renderResults(timedOut); }); return; }
        clearTimer();
        releaseQuestionImages();
        state.screen = 'results';
        trackPageView(practiceBasePath() + '/results', 'results');
        scrollToPageTop();
        if (app) {
          app.classList.remove('screen-setup');
          app.classList.add('screen-quiz', 'screen-results');
        }
        var total = state.order.length;
        var correct = Object.values(state.answers).filter(function (a) { return a.isCorrect; }).length;
        var pct = Math.round((correct / total) * 100);
        var wrongCount = Object.values(state.answers).filter(function (a) { return !a.isCorrect; }).length;
        saveProgress();
        try { finishAttemptLog(pct); } catch (err) { console.warn('finishAttemptLog failed:', err); }
        trackEvent('quiz_complete', {
          subject_id: state.subjectId,
          module_id: state.moduleId,
          pool_title: state.poolTitle,
          score: correct,
          total: total,
          accuracy_pct: pct,
          timed_out: !!timedOut,
          is_pyq: !!state.isPyqMode
        });

        // Build the review only when the user asks for it. Large modules can
        // contain hundreds of explanations and images; doing this during the
        // results render can block the mobile main thread.
        var buildReviewHtml = function (start, end) { return state.order.slice(start, end).map(function (oi, offset) {
          var idx = start + offset;
          var q = state.questions[oi];
          var a = state.answers[String(q.id || q.num)];
          var letters = ['A', 'B', 'C', 'D', 'E'];
          var optsHtml = letters.filter(function (L) { return q.options[L]; }).map(function (L) {
            var cls = 'ropt';
            if (L === q.answer) cls += ' correct';
            else if (a && L === a.picked) cls += ' incorrect';
            return '<div class="' + cls + '">' + L + '. ' + esc(q.options[L] || '') + '</div>';
          }).join('');
          var skipTag = (!a || a.skipped) ? '<div class="skip-tag">Not answered</div>' : '';
          return '<div class="review-item">' +
            '<div class="rq">' + (idx + 1) + '. ' + renderQuestionContent(q.question || '', q.questionImages) + '</div>' +
            optsHtml + skipTag +
            '<div class="rexplain">' + (q.explanation ? formatExplanation(q.explanation, q.explanationImages) : 'No explanation captured.') + '</div>' +
            '</div>';
        }).join(''); };
        var reviewHtml = '';

        var resBackFn = state.idSet ? state.idSet.back : state.isPyqMode ? function () { renderPYQSetup(state.pyqExam); } : (state.moduleId === 'bookmarks' ? function () { renderBookmarks(); } : (state.moduleId === 'custom' ? function () { renderCustomSetup(); } : function () { renderModuleList(state.subjectId); }));

        // The questions that were missed or left unanswered, each a row that
        // opens its own review. Built lazily, like the full review.
        var plainText = function (html) {
          var t = String(html || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
          return t.length > 120 ? t.slice(0, 117).replace(/\s+\S*$/, '') + '\u2026' : t;
        };
        var missIdx = [];
        state.order.forEach(function (oi, i) {
          var mq = state.questions[oi];
          var ma = mq ? state.answers[String(mq.id || mq.num)] : null;
          if (!ma || !ma.isCorrect) missIdx.push(i);
        });
        var MISS_CAP = 60;
        var missesHtml = missIdx.length
          ? '<section class="rr-misses"><h2 class="rr-h2">' + (missIdx.length === 1 ? 'The one you missed' : 'The ' + missIdx.length + ' you missed') + '</h2>' +
            missIdx.slice(0, MISS_CAP).map(function (i) {
              var mq = state.questions[state.order[i]];
              return '<details class="rr-miss" data-idx="' + i + '"><summary>' +
                '<span class="rr-miss-n">' + (i + 1 < 10 ? '0' : '') + (i + 1) + '</span>' +
                '<span class="rr-miss-q">' + esc(plainText(mq.question) || 'Image-based question') + '</span>' +
                RR_CHEVRON_SVG + '</summary><div class="rr-miss-body"></div></details>';
            }).join('') +
            (missIdx.length > MISS_CAP ? '<p class="rr-dash-note">Showing the first ' + MISS_CAP + '. The full review below has all of them.</p>' : '') +
            '</section>'
          : '';
        var resCrumb = String(state.poolTitle || '').replace(' \u2014 ', ' / ');

        app.innerHTML =
          rrTopBar('Back', resCrumb) +
          '<main id="mainContent" role="main" class="rr-results">' +
          rrResultSummary(correct, total, pct, timedOut) +
          (currentUser ? '' :
            '<div class="rr-res-guest">' +
            '<p>You answered these without an account. Sign in to keep this result' +
            (wrongCount ? ' and the ' + wrongCount + ' you missed' : '') +
            ', and to open the rest of this subject.</p>' +
            '<button class="btn" id="guestSaveBtn">Keep my result</button>' +
            '</div>') +
          missesHtml +
          '<button class="review-toggle" id="reviewToggle">Show full review \u25be</button>' +
          '<div id="reviewBlock" class="hidden" data-loaded="false">' + reviewHtml + '</div>' +
          '<div class="result-actions rr-res-actions">' +
          (currentUser && wrongCount ? '<button class="btn" id="retryMissedBtn">Retry the ' + wrongCount + ' missed</button>' : '') +
          '<button class="btn secondary" id="retryBtn">Retry</button>' +
          '<button class="btn secondary" id="setupBtn">' + (state.idSet ? 'Done' : state.isPyqMode ? 'Change paper' : 'Change setup') + '</button>' +
          '</div>' +
          '</main>';

        app.querySelectorAll('.rr-miss').forEach(function (row) {
          row.addEventListener('toggle', function () {
            var body = row.querySelector('.rr-miss-body');
            if (!row.open || !body || body.getAttribute('data-loaded') === 'true') return;
            var i = parseInt(row.getAttribute('data-idx'), 10);
            body.setAttribute('data-loaded', 'true');
            try { body.innerHTML = buildReviewHtml(i, i + 1); } catch (err) { console.warn('review item failed:', err); }
          });
        });

        var guestSaveBtn = document.getElementById('guestSaveBtn');
        if (guestSaveBtn) {
          guestSaveBtn.addEventListener('click', function () {
            openAuthModal('signup', {
              reason: 'Create a free account to keep this result and open the rest of the subject.'
            });
          });
        }

        wireTopBar(resBackFn);
        wireRipples('.btn, .auth-btn');

        var retryMissedBtn = document.getElementById('retryMissedBtn');
        if (retryMissedBtn) {
          var missedIds = state.order.map(function (i) { return state.questions[i]; }).filter(function (q) {
            var a = q && state.answers[String(q.id || q.num)];
            return q && q.id && (!a || !a.isCorrect);
          }).map(function (q) { return q.id; });
          var fromTitle = state.poolTitle;
          var snap = { pyq: state.isPyqMode, exam: state.pyqExam, mod: state.moduleId, sid: state.subjectId, idSet: state.idSet };
          var backTo = function () {
            if (snap.idSet) snap.idSet.back();
            else if (snap.pyq) renderPYQSetup(snap.exam);
            else if (snap.mod === 'bookmarks') renderBookmarks();
            else if (snap.mod === 'custom') renderCustomSetup();
            else if (snap.sid) renderModuleList(snap.sid);
            else renderHome(true);
          };
          var retryOpts = {
            kind: 'retry', title: 'Missed: ' + String(fromTitle || '').replace(/^Missed: /, ''), subjectId: state.subjectId,
            back: backTo, again: function () { launchIdQuiz(shuffle(missedIds.slice()), retryOpts); }
          };
          retryMissedBtn.addEventListener('click', function () { launchIdQuiz(shuffle(missedIds.slice()), retryOpts); });
        }
        document.getElementById('retryBtn').addEventListener('click', function () {
          if (state.idSet) state.idSet.again();
          else if (state.moduleId === 'bookmarks') practiseBookmarks(state.bookmarkOrder || []);
          else if (state.isPyqMode) startPYQQuiz(state.pyqExam);
          else startQuiz();
        });
        document.getElementById('setupBtn').addEventListener('click', function () {
          if (state.idSet) {
            state.idSet.back();
          } else if (state.moduleId === 'bookmarks') {
            renderBookmarks();
          } else if (state.isPyqMode) {
            renderPYQSetup(state.pyqExam);
          } else if (state.moduleId === 'custom') {
            renderCustomSetup();
          } else {
            var mid = state.progressKey.split(':')[1];
            renderSetup(state.subjectId, mid);
          }
        });
        document.getElementById('reviewToggle').addEventListener('click', function () {
          var block = document.getElementById('reviewBlock');
          if (block && block.getAttribute('data-loaded') !== 'true') {
            block.innerHTML = '<div class="review-loading">Loading review…</div>';
            block.setAttribute('data-loaded', 'true');
            var toggle = this;
            setTimeout(function () {
              block.innerHTML = buildReviewHtml(0, state.order.length);
              block.classList.remove('hidden');
              toggle.textContent = 'Hide review ▴';
            }, 0);
            return;
          }
          block.classList.toggle('hidden');
          this.textContent = block.classList.contains('hidden') ? 'Show full review ▾' : 'Hide review ▴';
        });
      }

      // Tap an exhibit image to zoom (delegated: works for images added later, no inline handlers)
      document.addEventListener('click', function (e) {
        var img = e.target && e.target.closest ? e.target.closest('img.qimage, img.rq-img, img.qtext-img') : null;
        if (img) window.openExhibitZoom(img.src);
      });

      // Delegated click handler for note sign-in and reset-all buttons
      document.addEventListener('click', function (e) {
        var customCard = e.target && e.target.closest ? e.target.closest('#customModuleCard') : null;
        if (customCard) {
          e.preventDefault();
          setupChoice.count = 'all';
          renderCustomSetup();
          return;
        }
        var bmHomeCardEl = e.target && e.target.closest ? e.target.closest('#bookmarksHomeCard') : null;
        if (bmHomeCardEl) {
          e.preventDefault();
          renderBookmarks();
          return;
        }
        var noteBtn = e.target && e.target.closest ? e.target.closest('#noteSignInBtn') : null;
        if (noteBtn) {
          e.preventDefault();
          e.stopPropagation();
          openAuthModal('signin');
          return;
        }
        var resetBtn = e.target && e.target.closest ? e.target.closest('#resetAll') : null;
        if (resetBtn) {
          e.preventDefault();
          resetAllProgress();
          return;
        }
      });

      // Global handler for Admin Access footer links and hotkey (Ctrl + Shift + A)
      document.addEventListener('click', function (e) {
        var link = e.target.closest('.admin-footer-link');
        if (link) {
          e.preventDefault();
          openAdminModal();
        }
      });

      window.addEventListener('keydown', function (e) {
        if (e.ctrlKey && e.shiftKey && (e.key === 'A' || e.key === 'a')) {
          e.preventDefault();
          openAdminModal();
        }
      });

      // Open external footer social and community links cleanly
      document.addEventListener('click', function (e) {
        var socialLink = e.target && e.target.closest ? e.target.closest('a.footer-social-btn, .footer-content a[target="_blank"]') : null;
        if (socialLink && socialLink.href) {
          var isNative = !!(
            (window.MedLadderNative && window.MedLadderNative.isNative) ||
            window.MedLadderAndroidApp ||
            (window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform()) ||
            (document.documentElement && document.documentElement.classList.contains('is-native-app')) ||
            (document.body && document.body.classList.contains('is-native-app'))
          );
          if (isNative) {
            e.preventDefault();
            if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Browser) {
              window.Capacitor.Plugins.Browser.open({ url: socialLink.href });
            } else if (window.MedLadderNative && window.MedLadderNative.Browser) {
              window.MedLadderNative.Browser.open({ url: socialLink.href });
            } else {
              window.open(socialLink.href, '_system');
            }
          }
        }
      });

      // Prevent any link navigation from inside explanations
      document.addEventListener('click', function (e) {
        var link = e.target && e.target.closest ? e.target.closest('.explain a, .rexplain a, .explain-text-link') : null;
        if (link) {
          e.preventDefault();
          e.stopPropagation();
        }
      }, true);

      // Image Zoom Lightbox
      window.openExhibitZoom = function (src) {
        var overlay = document.getElementById('imageModalOverlay');
        if (!overlay) {
          var div = document.createElement('div');
          div.className = 'image-modal-overlay';
          div.id = 'imageModalOverlay';
          div.setAttribute('role', 'dialog');
          div.setAttribute('aria-modal', 'true');
          div.innerHTML =
            '<div class="image-modal-content">' +
            '<button class="image-modal-close" aria-label="Close exhibit" title="Close exhibit (Esc)">✕</button>' +
            '<img id="imageModalImg" class="image-modal-img" src="' + esc(src) + '" alt="Medical Exhibit" />' +
            '<div class="image-modal-caption">Medical Exhibit · Tap anywhere or ✕ to close</div>' +
            '</div>';
          div.addEventListener('click', function (e) {
            if (e.target !== div.querySelector('#imageModalImg')) closeExhibitZoom();
          });
          document.body.appendChild(div);
        } else {
          var img = document.getElementById('imageModalImg');
          if (img) img.src = src;
          overlay.classList.remove('hidden');
        }
      };
      window.closeExhibitZoom = function () {
        var overlay = document.getElementById('imageModalOverlay');
        if (overlay) {
          overlay.classList.add('hidden');
          var img = document.getElementById('imageModalImg');
          if (img) {
            img.removeAttribute('src');
            img.removeAttribute('srcset');
          }
        }
      };
      // Global delegation for modal close buttons & overlay clicks
      document.addEventListener('click', function (e) {
        var proClose = e.target.closest('#proModalClose, .pro-modal-close');
        if (proClose) {
          e.preventDefault();
          e.stopPropagation();
          closeProModal();
          return;
        }
        var adminClose = e.target.closest('#adminModalClose, .admin-modal-close');
        if (adminClose) {
          e.preventDefault();
          e.stopPropagation();
          closeAdminModal();
          return;
        }
        var authClose = e.target.closest('#authModalClose, .auth-modal-close');
        if (authClose) {
          e.preventDefault();
          e.stopPropagation();
          closeAuthModal();
          return;
        }
      });

      window.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
          closeExhibitZoom();
          closeProModal();
          closeAuthModal();
          closeAdminModal();
        }
      });

      // ---------- SEO LANDING ROUTES ----------
      // Phase 3: every real subject/module in the syllabus gets a stable,
      // crawlable URL while continuing to use the existing quiz engine.
      function slugifySeo(value) {
        return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      }

      function updateSeoMeta(title, description, path) {
        document.title = title;
        var desc = document.querySelector('meta[name="description"]');
        if (desc) desc.setAttribute('content', description);
        var canonical = document.querySelector('link[rel="canonical"]');
        if (canonical) canonical.setAttribute('href', 'https://medladder.top' + (path || '/'));
        var ogTitle = document.querySelector('meta[property="og:title"]');
        var ogDesc = document.querySelector('meta[property="og:description"]');
        var ogUrl = document.querySelector('meta[property="og:url"]');
        if (ogTitle) ogTitle.setAttribute('content', title);
        if (ogDesc) ogDesc.setAttribute('content', description);
        if (ogUrl) ogUrl.setAttribute('content', 'https://medladder.top' + (path || '/'));

        // GA4 page_view for this view is sent by trackPageView at the render
        // call site (the gtag config already covers the initial load).
      }

      function goHomeFromSeo() {
        // Full load: swapping the DOM in place left the topic page's JSON-LD/OG tags on the home URL.
        window.location.assign('/');
      }

      function goSubjectFromSeo(subject) {
        // Full page load so the pre-rendered (current) SEO page is served, not the JS fallback template.
        window.location.assign('/subjects/' + slugifySeo(subject.name));
      }

      function goTopicFromSeo(subject, module) {
        // Full page load so the pre-rendered (current) SEO page is served, not the JS fallback template.
        window.location.assign('/subjects/' + slugifySeo(subject.name) + '/' + slugifySeo(module.name));
      }

      function topicPath(subject, module) {
        return '/subjects/' + slugifySeo(subject.name) + '/' + slugifySeo(module.name);
      }

      function subjectPath(subject) {
        return '/subjects/' + slugifySeo(subject.name);
      }

      function renderSeoLanding(type, item) {
        state.screen = 'seo';
        scrollToPageTop();
        var subject = type === 'subject';
        var topic = type === 'topic';
        var subj = topic ? item.subject : (subject ? item : null);
        var mod = topic ? item.module : null;

        var title, description, heading, intro, startLabel;
        if (topic) {
          title = mod.name + ' MCQs & Questions | ' + subj.name + ' | MedLadder';
          description = 'Practice ' + mod.name + ' questions and medical MCQs in ' + subj.name + ' with ' + (mod.questionCount || 0) + ' questions, detailed explanations and topic-wise revision on MedLadder.';
          heading = mod.name + ' — ' + subj.name + ' MCQs';
          intro = 'Practice ' + mod.name + ' with focused ' + subj.name + ' medical MCQs, detailed explanations and topic-wise revision.';
          startLabel = 'Start ' + mod.name + ' Questions';
        } else if (subject) {
          title = item.name + ' MCQs & Previous-Year Questions | MedLadder';
          description = 'Practice ' + item.name + ' MCQs and previous-year questions with detailed explanations on MedLadder. Revise topic-wise and track your performance.';
          heading = item.name + ' MCQs and Previous-Year Questions';
          intro = 'Practice ' + item.name + ' with topic-wise medical MCQs, previous-year questions, detailed explanations and progress tracking.';
          startLabel = 'Open ' + item.name + ' Topics';
        } else {
          title = item.name + ' Preparation & Question Bank | MedLadder';
          description = 'Prepare for ' + item.name + ' with medical MCQs, previous-year questions, detailed explanations and performance tracking on MedLadder.';
          heading = item.name + ' Question Bank';
          intro = 'Prepare for ' + item.name + ' with focused medical MCQs, previous-year questions, detailed explanations and performance tracking.';
          startLabel = 'Start Practising ' + item.name;
        }

        var breadcrumb = topic
          ? '<a href="' + subjectPath(subj) + '" id="seoSubjectCrumb" style="color:var(--accent-deep);font-weight:800;text-decoration:none;">' + esc(subj.name) + '</a> <span aria-hidden="true">/</span> <span>' + esc(mod.name) + '</span>'
          : '<span>' + esc(item.name) + '</span>';

        var count = topic
          ? '<p style="font-size:16px;"><strong>' + Number(mod.questionCount || 0).toLocaleString() + ' questions</strong> in this topic · ' + esc(mod.section || 'Core syllabus') + '</p>'
          : subject
            ? '<p style="font-size:16px;"><strong>' + Number(item.questionCount || 0).toLocaleString() + ' questions</strong> across ' + item.moduleCount + ' topics/modules.</p>'
            : '';

        var linksHtml = '';
        if (topic) {
          var mods = Array.isArray(subj.modules) ? subj.modules : [];
          var idx = mods.findIndex(function (m) { return String(m.moduleId) === String(mod.moduleId); });
          var nearby = [];
          for (var d = -3; d <= 3; d++) {
            if (d === 0) continue;
            var n = mods[idx + d];
            if (n) nearby.push(n);
          }
          linksHtml = '<section aria-labelledby="relatedTopics" style="margin-top:32px;">' +
            '<h2 id="relatedTopics" class="seo-section-title">More ' + esc(subj.name) + ' topics</h2>' +
            '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;">' +
            nearby.map(function (n) { return '<a href="' + topicPath(subj,n) + '" class="seo-card"><strong>' + esc(n.name) + '</strong><small>' + Number(n.questionCount || 0).toLocaleString() + ' questions</small></a>'; }).join('') +
            '</div></section>';
        } else if (subject) {
          linksHtml = '<section aria-labelledby="subjectTopics" style="margin-top:32px;"><h2 id="subjectTopics" class="seo-section-title">' + esc(item.name) + ' topic-wise question banks</h2>' +
            '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:12px;">' +
            (Array.isArray(item.modules) ? item.modules : []).map(function (n) { return '<a href="' + topicPath(item,n) + '" class="seo-card"><strong>' + esc(n.name) + '</strong><small>' + Number(n.questionCount || 0).toLocaleString() + ' questions · ' + esc(n.section || '') + '</small></a>'; }).join('') +
            '</div></section>';
        }

        var bentoHtml = topic
          ? '<div class="bento-bar" style="max-width:680px;margin:18px auto 24px;">' +
            '<div class="bento-stat"><div class="bento-stat-num">' + Number(mod.questionCount || 0).toLocaleString() + '</div><div class="bento-stat-lbl">Questions</div></div>' +
            '<div class="bento-stat"><div class="bento-stat-num">4 Exams</div><div class="bento-stat-lbl">NEET PG · INICET · FMGE · SS</div></div>' +
            '<div class="bento-stat"><div class="bento-stat-num">100%</div><div class="bento-stat-lbl">With Rationales</div></div>' +
            '<div class="bento-stat"><div class="bento-stat-num">Interactive</div><div class="bento-stat-lbl">Instant Feedback</div></div>' +
            '</div>'
          : subject
            ? '<div class="bento-bar" style="max-width:680px;margin:18px auto 24px;">' +
              '<div class="bento-stat"><div class="bento-stat-num">' + Number(item.questionCount || 0).toLocaleString() + '</div><div class="bento-stat-lbl">Questions</div></div>' +
              '<div class="bento-stat"><div class="bento-stat-num">' + item.moduleCount + '</div><div class="bento-stat-lbl">Topics</div></div>' +
              '<div class="bento-stat"><div class="bento-stat-num">4 Exams</div><div class="bento-stat-lbl">NEET PG · INICET · FMGE · SS</div></div>' +
              '<div class="bento-stat"><div class="bento-stat-num">100%</div><div class="bento-stat-lbl">With Rationales</div></div>' +
              '</div>'
            : '';

        var eyebrow = topic
          ? '⚡ ' + esc(subj.name) + ' · ' + esc(mod.section || 'Core syllabus')
          : subject
            ? '⚡ ' + esc(item.name) + ' QBank'
            : '⚡ ' + esc(item.name) + ' Question Bank & PYQs';

        app.innerHTML =
          topBar('Home', function () { goHomeFromSeo(); }) +
          '<main id="mainContent" role="main" class="seo-main">' +
          '<nav class="seo-breadcrumb" aria-label="Breadcrumb">' +
          '<a href="/" id="seoHomeTop">Home</a> ' +
          '<span class="sep" aria-hidden="true">/</span> ' + breadcrumb +
          '</nav>' +
          '<div class="hero-wrap" style="padding:10px 4px 24px;text-align:center;">' +
          '<div class="hero-eyebrow">' + eyebrow + '</div>' +
          '<h1 class="title">' + esc(heading) + ' <span class="brand-gradient">MCQs</span></h1>' +
          '<p class="subtitle" style="max-width:760px;margin:0 auto 18px;line-height:1.65;">' + esc(intro) + '</p>' +
          bentoHtml +
          '<div style="display:flex;flex-wrap:wrap;gap:12px;justify-content:center;margin:22px 0 6px;">' +
          '<button id="seoStartBtn" class="btn" style="font-size:15px;padding:14px 28px;cursor:pointer;">' + esc(startLabel) + '</button>' +
          '<a href="/" id="seoHomeBottom" class="btn secondary" style="font-size:15px;padding:14px 24px;text-decoration:none;">Back to Home</a>' +
          '</div>' +
          '</div>' +
          '<section aria-labelledby="seoTopics" style="margin-top:28px;"><h2 id="seoTopics" class="seo-section-title">What you can practise</h2>' +
          '<ul style="line-height:1.8;padding-left:22px;color:var(--ink-soft);font-size:15px;">' +
          '<li><strong style="color:var(--ink);">Topic-wise medical MCQs</strong> for focused revision</li>' +
          '<li><strong style="color:var(--ink);">Previous-year question practice</strong> across all sessions</li>' +
          '<li><strong style="color:var(--ink);">Detailed explanations</strong> for learning from mistakes</li>' +
          '<li><strong style="color:var(--ink);">Progress and performance tracking</strong></li>' +
          '</ul></section>' +
          linksHtml +
          '<section aria-labelledby="seoExplore" style="margin-top:32px;"><h2 id="seoExplore" class="seo-section-title">Continue your preparation</h2><p style="color:var(--ink-soft);line-height:1.65;">Use the topic links above to move through the syllabus, or return to the MedLadder home page to explore the complete question bank.</p></section>' +
          '</main>' +
          footerHtml(); hideStaticFooter();

        wireTopBar(function () { goHomeFromSeo(); });
        updateSeoMeta(title, description, window.location.pathname);
        trackPageView(window.location.pathname, 'seo', title);

        document.getElementById('seoHomeTop').addEventListener('click', function(e){ e.preventDefault(); goHomeFromSeo(); });
        document.getElementById('seoHomeBottom').addEventListener('click', function(e){ e.preventDefault(); goHomeFromSeo(); });
        // /subjects/* links are left as normal links: the browser loads the pre-rendered page.

        document.getElementById('seoStartBtn').onclick = function () {
          if (topic) {
            renderSetup(subj.subjectId, mod.moduleId);
          } else if (subject) {
            renderModuleList(item.subjectId);
          } else {
            renderPYQSetup(item.pyqId);
          }
        };
      }

      function wireSeoStaticLanding(type, item) {
        state.screen = 'seo';
        scrollToPageTop();
        var subject = type === 'subject';
        var topic = type === 'topic';
        var subj = topic ? item.subject : (subject ? item : null);
        var mod = topic ? item.module : null;

        wireThemeBtn();
        wireAuthControls();

        var topHome = document.getElementById('seoHomeTop');
        if (topHome) topHome.addEventListener('click', function(e){ e.preventDefault(); goHomeFromSeo(); });
        var bottomHome = document.getElementById('seoHomeBottom');
        if (bottomHome) bottomHome.addEventListener('click', function(e){ e.preventDefault(); goHomeFromSeo(); });
        var startBtn = document.getElementById('seoStartBtn');
        if (startBtn) {
          startBtn.onclick = function () {
            if (topic) {
              renderSetup(subj.subjectId, mod.moduleId);
            } else if (subject) {
              renderModuleList(item.subjectId);
            } else {
              renderPYQSetup(item.pyqId);
            }
          };
        }

        // Topic visitors often arrive directly from search. Show the size of the
        // complete subject bank and give them a clear next step beyond the sample.
        if (topic && subj && !document.getElementById('seoFullBankCta')) {
          var topicHero = document.querySelector('.seo-main .hero-wrap');
          if (topicHero) {
            var bankCta = document.createElement('section');
            bankCta.id = 'seoFullBankCta';
            bankCta.className = 'seo-full-bank-cta';
            bankCta.setAttribute('aria-label', 'Explore the complete subject question bank');
            bankCta.innerHTML =
              '<div class="seo-full-bank-copy"><span class="seo-full-bank-eyebrow">More to practise</span>' +
              '<h2>Explore the complete ' + esc(subj.name) + ' question bank</h2>' +
              '<p>This is one topic from a larger bank of <strong>' + Number(subj.questionCount || 0).toLocaleString() +
              ' MCQs across ' + Number(subj.moduleCount || (Array.isArray(subj.modules) ? subj.modules.length : 0)).toLocaleString() +
              ' topics</strong>, with explanations and exam-focused practice.</p></div>' +
              '<div class="seo-full-bank-actions"><a class="btn seo-full-bank-primary" href="' + subjectPath(subj) +
              '">Explore all ' + esc(subj.name) + ' topics</a></div>';
            topicHero.insertAdjacentElement('afterend', bankCta);
          }
        }

        // Static SEO pages keep their pre-rendered content. Inject the same
        // context-aware directory used by SPA-rendered pages into their existing footer.
        // The old keyword/footer link walls are removed separately at startup.
        var staticFooter = document.querySelector('footer.credit');
        var staticFooterContent = staticFooter && staticFooter.querySelector('.footer-content');
        if (staticFooterContent && !staticFooterContent.querySelector('.footer-directory')) {
          var footerTemplate = document.createElement('div');
          footerTemplate.innerHTML = footerHtml();
          var directory = footerTemplate.querySelector('.footer-directory');
          var footerCopy = staticFooterContent.querySelector('.footer-copy');
          if (directory) {
            if (footerCopy) staticFooterContent.insertBefore(directory, footerCopy);
            else staticFooterContent.appendChild(directory);
          }
        }

        // /subjects/* links (breadcrumb, related topics) are normal links: full load of the pre-rendered page.
      }

      function resolveSeoPath(path) {
        var clean = String(path || '').replace(/\/$/, '').toLowerCase();
        if (clean.indexOf('/subjects/') !== 0) return null;
        var parts = clean.split('/').filter(Boolean);
        var ss = parts[1];
        var foundSubject = SUBJECT_INDEX.find(function (s) { return slugifySeo(s.name) === ss; });
        if (!foundSubject) return null;
        if (parts.length === 2) return { type: 'subject', item: foundSubject };
        var ms = parts.slice(2).join('-');
        var subjectModules = Array.isArray(foundSubject.modules) ? foundSubject.modules : [];
        var foundModule = subjectModules.find(function (m) { return slugifySeo(m.name) === ms; });
        return foundModule ? { type: 'topic', subject: foundSubject, module: foundModule } : null;
      }

      function handleSeoRoute() {
        var path = window.location.pathname.replace(/\/$/, '').toLowerCase();
        // Pre-rendered PYQ pages (/pyqs/*) ship full static HTML: leave them alone.
        if (path === '/pyqs' || path.indexOf('/pyqs/') === 0) {
          // Mark this an SEO page, not home: otherwise the logged-in
          // progress refresh (loadUserProgress) treats this document as
          // the SPA home and renderHome() bounces it back to '/'.
          state.screen = 'seo';
          captureOpenPyqDeepLink();
          return;
        }
        // Other pre-rendered static pages ship full HTML too: leave them alone.
        // (Without this, the router falls through to renderHome() and wipes them,
        // the same bug the /pyqs guard fixed.)
        if (path === '/neet-pg-syllabus' || path === '/neet-pg-high-yield-topics' ||
            path === '/neet-pg-top-100-questions' || path === '/medladder-vs-marrow' ||
            path === '/medladder-vs-prepladder' || path === '/best-free-neet-pg-question-bank' ||
            path === '/inicet') {
          // Same as the PYQ guard above: this is an SEO page, not home.
          state.screen = 'seo';
          return;
        }
        if (path === '/mock-test') { return; } // real static page now (no .html hop)
        if (path === '/mock-test.html') {
          window.location.replace('/mock-test' + (window.location.search || ''));
          return;
        }
        if (path === '/admin-mock' || path === '/admin-mock.html') {
          window.location.replace('/admin-mock.html' + (window.location.search || ''));
          return;
        }
        if (path === '/privacy') { return; } // real static page now (no .html hop)
        if (path === '/privacy.html') {
          window.location.replace('/privacy' + (window.location.search || '') + (window.location.hash || ''));
          return;
        }
        if (path === '/terms') { return; } // real static page now (no .html hop)
        if (path === '/terms.html') {
          window.location.replace('/terms' + (window.location.search || '') + (window.location.hash || ''));
          return;
        }
        if (path === '/neet-ss-books') { return; } // real static page now (no .html hop)
        if (path === '/neet-ss-books.html') {
          window.location.replace('/neet-ss-books' + (window.location.search || ''));
          return;
        }
        var exams = {
          '/neet-pg': { name: 'NEET PG', pyqId: 'NEET PG' },
          '/inicet': { name: 'INI-CET', pyqId: 'INICET' },
          '/inicet': { name: 'INI-CET', pyqId: 'INICET' },
          '/fmge': { name: 'FMGE', pyqId: 'FMGE' },
          '/neet-ss': { name: 'NEET SS', pyqId: 'NEET SS' }
        };
        var isPreRendered = !!document.getElementById('seoStartBtn');
        if (exams[path]) {
          if (!isPreRendered) {
            renderSeoLanding('exam', exams[path]);
          } else {
            wireSeoStaticLanding('exam', exams[path]);
          }
          return;
        }
        var resolved = resolveSeoPath(path);
        if (resolved) {
          var item = resolved.type === 'subject' ? resolved.item : { subject: resolved.subject, module: resolved.module };
          if (!isPreRendered) {
            renderSeoLanding(resolved.type, item);
          } else {
            wireSeoStaticLanding(resolved.type, item);
          }
          return;
        }
        updateSeoMeta('MedLadder — FMGE, NEET PG, INI-CET & NEET SS QBank', 'Prepare for FMGE, NEET PG, INI-CET and NEET SS with MedLadder. Practice medical MCQs, previous-year questions, detailed explanations and track your performance.', '/');
        renderHome();

        if (window.location.search && typeof URLSearchParams !== 'undefined') {
          var sp = new URLSearchParams(window.location.search);
          captureOpenPyqDeepLink();
          if (sp.get('screen') === 'pyq') {
            setTimeout(function () {
              var wrap = document.getElementById('pyqCardsWrap');
              var btn = document.getElementById('pyqBankToggle');
              if (wrap && btn) {
                wrap.classList.add('open');
                btn.setAttribute('aria-expanded', 'true');
                var chevron = btn.querySelector('.pyq-chevron');
                if (chevron) chevron.classList.add('open');
                btn.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }
            }, 150);
          } else if (sp.get('action') === 'upgrade' || sp.get('upgrade') === 'true') {
            var targetPlan = sp.get('plan');
            if (targetPlan && PRO_PLANS.some(function (p) { return p.id === targetPlan; })) {
              selectedPlanId = targetPlan;
            }
            setTimeout(function () {
              openProModal('pricing_tier', { planId: selectedPlanId });
            }, 250);
          } else if (sp.get('action') === 'signin' || sp.get('auth') === 'signin') {
            setTimeout(function () { openAuthModal('signin'); }, 250);
          } else if (sp.get('action') === 'signup' || sp.get('auth') === 'signup') {
            setTimeout(function () { openAuthModal('signup'); }, 250);
          }
        }
      }

      window.addEventListener('popstate', function () {
        var p = window.location.pathname.replace(/\/$/, '').toLowerCase();
        var isSeoUrl = p.indexOf('/subjects/') === 0 || ['/neet-pg', '/inicet', '/fmge', '/neet-ss'].indexOf(p) !== -1;
        // The DOM may have been replaced by renderHome()/quiz screens; reload so the current pre-rendered page is shown.
        if (isSeoUrl && !document.getElementById('seoStartBtn')) { window.location.reload(); return; }
        handleSeoRoute();
      });
      handleSeoRoute();
      document.documentElement.classList.add('app-ready');
      initAuth();

      if ('serviceWorker' in navigator) {
        window.addEventListener('load', function () {
          navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(function (e) {
            console.warn('Service worker registration failed:', e && e.message);
          });
        });
      }
    })();
