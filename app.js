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
          if (state.screen === 'modules' && state.subjectId) renderModuleList(state.subjectId);
          else if (state.screen === 'setup' && state.subjectId && state.moduleId) renderSetup(state.subjectId, state.moduleId);
          else if (state.screen === 'home') renderHome(true);
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
          '<p class="pro-modal-sub" id="proModalSub">Free registered accounts get 8 topics per subject. Upgrade to Pro for unrestricted access to all 739 topics and 37,076 questions.</p>' +
          '</div>' +
          '<div class="pro-modal-body">' +
          '<div class="pro-features-list">' +
          '<div class="pro-feature-item">' +
          '<div class="pro-feature-icon">✓</div>' +
          '<div class="pro-feature-text">' +
          '<strong>All 739 Topics Unlocked</strong>' +
          '<span>Full access across all 19 preclinical, paraclinical &amp; clinical subjects.</span>' +
          '</div>' +
          '</div>' +
          '<div class="pro-feature-item">' +
          '<div class="pro-feature-icon">✓</div>' +
          '<div class="pro-feature-text">' +
          '<strong>37,076 NEET PG, FMGE &amp; NEET SS MCQs</strong>' +
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
          subEl.innerHTML = 'Free registered accounts include the <strong>first 8 topics</strong> in this subject. Upgrade to MedLadder Pro to unlock ' + esc(context.moduleName) + ' and all 739 topics!';
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
                showToast('⭐ MedLadder Pro is now ACTIVE. All 739 modules & PYQ bank unlocked!', 'success');
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
        showToast('⭐ Congratulations! MedLadder Pro is now ACTIVE. All 739 modules & PYQ bank are unlocked!', 'success');
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
          '<div class="admin-sec-title"><span>QBank &amp; PYQ System Overview</span></div>' +
          '<div class="admin-stats-grid">' +
          '<div class="admin-stat-card"><div class="admin-stat-num">30,214</div><div class="admin-stat-label">Standard Subject MCQs</div></div>' +
          '<div class="admin-stat-card"><div class="admin-stat-num">6,862</div><div class="admin-stat-label">Extracted PYQ Questions</div></div>' +
          '<div class="admin-stat-card"><div class="admin-stat-num">19 / 19</div><div class="admin-stat-label">Subjects (Pre, Para, Clinical)</div></div>' +
          '<div class="admin-stat-card"><div class="admin-stat-num">5 Exams</div><div class="admin-stat-label">NEET PG, INICET, FMGE, etc.</div></div>' +
          '</div>' +
          '</div>';

        document.getElementById('adminLockSessionBtn').addEventListener('click', function () {
          handleSignOut();
          closeAdminModal();
        });

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
          b.innerHTML = gIcon + '<span>' + (isSignUp ? 'Sign up with Google' : 'Continue with Google') + '</span>';
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
          // Re-render current screen to show updated progress pills
          if (state.screen === 'home') renderHome();
          else if (state.screen === 'modules') renderModuleList(state.subjectId);
        });
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
        if (btn) {
          e.preventDefault();
          downloadMedLadderApkInPage(btn.getAttribute('href') || '/MedLadder-latest.apk');
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
          '<div class="dropdown-divider"></div>' +
          '<button class="dropdown-action-btn" id="authSignOutBtn">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>' +
          'Sign Out' +
          '</button>' +
          '</div>' +
          '</div>';
      }

      function footerHtml() {
        var isNative = !!(
          (window.MedLadderNative && window.MedLadderNative.isNative) ||
          window.MedLadderAndroidApp ||
          (window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform()) ||
          (document.documentElement && document.documentElement.classList.contains('is-native-app')) ||
          (document.body && document.body.classList.contains('is-native-app'))
        );
        var apkBtnHtml = isNative ? '' :
          '<a href="/MedLadder-latest.apk" class="footer-apk-btn" download="MedLadder-latest.apk" title="Download MedLadder Android APK">' +
          '<span class="footer-apk-icon">' +
          '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.523 15.3414c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.551 0 .9993.4482.9993.9993.0001.5511-.4483.9997-.9993.9997m-11.046 0c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.5511 0 .9993.4482.9993.9993 0 .5511-.4482.9997-.9993.9997m11.4045-6.02l1.9973-3.4592a.416.416 0 00-.1521-.5676.416.416 0 00-.5676.1521l-2.0223 3.503C15.5902 8.4116 13.8533 8.125 12 8.125s-3.5902.2866-5.1368.8247L4.8409 5.4467a.4161.4161 0 00-.5677-.1521.4157.4157 0 00-.1521.5676l1.9973 3.4592C2.6889 11.1867.3432 14.6589 0 18.761h24c-.3432-4.1021-2.6889-7.5743-6.1185-9.4396"/></svg>' +
          '</span>' +
          '<span class="footer-apk-text">' +
          '<span class="footer-apk-sub">Android App</span>' +
          '<span class="footer-apk-title">Download APK</span>' +
          '</span>' +
          '<span class="footer-apk-badge">' +
          '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>' +
          '<span>Latest</span>' +
          '</span>' +
          '</a>';
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
          '<div class="footer-links-row">' +
          '<a href="/privacy.html" class="footer-link">Privacy Policy</a>' +
          '<span class="footer-dot" aria-hidden="true">·</span>' +
          '<a href="/terms.html" class="footer-link">Terms of Service</a>' +
          '<span class="footer-dot" aria-hidden="true">·</span>' +
          '<a href="/terms.html#cancellation-refund" class="footer-link">Refund Policy</a>' +
          (isAdmin(currentUser) ? '<span class="footer-dot" aria-hidden="true">·</span><a href="#" class="admin-footer-link footer-link admin-pill">👑 Admin Access</a>' : '') +
          '</div>' +
          '<div class="footer-copy"><strong>MedLadder</strong> · Medical Entrance Exam Question Bank</div>' +
          '<div class="footer-subcopy">MBBS · FMGE · NEET PG · INI-CET · NEET SS · USMLE · MCAT · PLAB · MRCS · MRCP · State PG</div>' +
          '</div>' +
          '</footer>';
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

      function updateMastheadAuth() {
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
            openAdminModal();
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
          '<p class="auth-modal-sub" id="authModalSub">Access your test history and sync progress across devices.</p>' +
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
          '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"/><path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"/><path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/></svg><span>Continue with Google</span>' +
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
          '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"/><path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"/><path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/></svg><span>Sign up with Google</span>' +
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
          subEl.textContent = 'Access your test history and sync progress across devices.';
          var emailIn = document.getElementById('authSignInEmail');
          if (emailIn) setTimeout(function () { emailIn.focus(); }, 80);
        } else if (tab === 'signup') {
          titleEl.textContent = 'Create Account';
          subEl.textContent = 'Register to track quiz performance and preserve test scores.';
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

        var redirectUrl = window.location.origin + window.location.pathname;
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

        supabaseClient.auth.getSession().then(function (res) {
          if (res && res.data && res.data.session && res.data.session.user) {
            currentUser = res.data.session.user;
            loadUserProgress(currentUser.id);
            updateMastheadAuth();
            updateProModalUI();
            refreshProStatus();
            if (recoveryMode) { cleanAuthReturnUrl(); openAuthModal('reset'); }
          } else {
            // No session: still render the masthead auth controls, so the
            // signed-out Sign In pill also appears on the pre-rendered SEO
            // pages (subject/topic hubs), whose static header markup has no
            // auth element of its own.
            updateMastheadAuth();
            updateProModalUI();
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
            }
            updateMastheadAuth();
            updateProModalUI();
            // Deferred: supabase-js must not be re-entered from inside this callback.
            if (userChanged) setTimeout(refreshProStatus, 0);
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
        var t = 0;
        for (var i = 0; i < SUBJECT_INDEX.length; i++) t += SUBJECT_INDEX[i].questionCount;
        t += 6862; // PYQ bank questions (NEET PG, FMGE, INI-CET, AIIMS, NEET SS)
        return t;
      }

      var activeHomeCategory = 'all';

      // ---------- HOME: subject list ----------
      function renderHome(force) {
        clearTimer();
        releaseQuizPayload();
        state.screen = 'home';
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
            '<a href="/" class="brand" style="text-decoration:none;"><span class="brand-icon" style="overflow:hidden;display:inline-flex;align-items:center;justify-content:center;"><img src="/icons/icon-72.png" alt="MedLadder" style="width:100%;height:100%;border-radius:inherit;display:block;object-fit:cover;"></span><span>MedLadder</span></a>' +
            '<span class="right"><span class="stat"><span class="stat-dot"></span>' + totalQuestions().toLocaleString() + ' MCQs</span>' + proHeaderBtnHtml() + authBtnHtml() + themeBtnHtml() + '</span>' +
            '</header>' +
            '<main id="mainContent" role="main">' +
            '<div class="hero-wrap">' +
            '<div class="hero-eyebrow">⚡ FMGE · NEET PG · INI-CET · NEET SS</div>' +
            '<h1 class="title">Med<span class="brand-gradient">Ladder</span></h1>' +
            '<p class="subtitle">Your climb through FMGE, NEET PG, INICET &amp; NEET SS — ' + SUBJECT_INDEX.length + ' subjects, ' + totalQuestions().toLocaleString() + ' MCQs including Previous Year Questions. Pick a subject or launch a PYQ test.</p>' +
            '<div class="bento-bar">' +
            '<div class="bento-stat"><div class="bento-stat-num">' + SUBJECT_INDEX.length + '</div><div class="bento-stat-lbl">Subjects</div></div>' +
            '<div class="bento-stat"><div class="bento-stat-num">739</div><div class="bento-stat-lbl">Topics</div></div>' +
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
            '<div class="subject-grid" id="subjectGrid">' + rows + '</div>' +
            '<div class="custom-module-card" id="customModuleCard" role="button" tabindex="0">' +
            '<span class="custom-module-icon">🧩</span>' +
            '<span class="custom-module-copy"><strong>Custom Module</strong><span>Build a mixed quiz from every subject and topic.</span><small>50 · 100 · 150 · 200 · 300 · Custom&nbsp;&nbsp; · &nbsp;Practice or timed · Shuffle</small></span>' +
            '<span class="custom-module-arrow">›</span>' +
            '</div>' +
            '<div id="homeNoMatch" class="no-match-card hidden">No subjects match your search.</div>' +
            pyqSectionHtml +
            modeNoteHtml() +
            '</main>' +
            footerHtml();
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
          var resetBtn = document.getElementById('resetAll');
          if (resetBtn) {
            resetBtn.onclick = function () {
              progress = {};
              persistProgress();
              if (currentUser && currentUser.id && supabaseClient) {
                supabaseClient.from('module_progress').delete().eq('user_id', currentUser.id).then(function () {}).catch(function () {});
              }
              showToast('Reset quiz progress and test state.');
              renderHome(true);
            };
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

        // Pro gate
        if (!isUserPro(currentUser)) {
          openProModal('pyq_bank', { examId: examId });
          return;
        }

        var exam = PYQ_EXAMS.find(function (e) { return e.id === examId; }) || { id: examId, icon: '📝', name: examId, label: examId, years: ['All Years'] };

        state.screen = 'setup';
        state.isPyqMode = true;
        state.pyqExam = examId;
        state.subjectId = null;
        state.moduleId = 'pyq_' + examId;

        var yearsList = exam.years || ['All Years'];
        if (!setupChoice.pyqYear || yearsList.indexOf(setupChoice.pyqYear) === -1) {
          setupChoice.pyqYear = yearsList[0];
        }

        var yearsHtml = yearsList.map(function (y) {
          var activeCls = (setupChoice.pyqYear === y) ? 'active' : '';
          return '<button class="pyq-year-pill ' + activeCls + '" data-year="' + esc(y) + '">' + esc(y) + '</button>';
        }).join('');

        // PYQ Bank: Every year PYQ acts as a dedicated single test covering the full paper
        setupChoice.count = 'all';

        // Exam Timers: 120 min (2 Hours) for INICET, 180 min (3 Hours) for NEET PG & FMGE
        var PYQ_TIME_OPTIONS = [
          { label: '120 min (2 Hours)', value: 7200, hint: 'INICET Standard' },
          { label: '180 min (3 Hours)', value: 10800, hint: 'NEET PG / FMGE Standard' },
          { label: 'Untimed / Practice', value: 0, hint: 'Self-paced study' },
          { label: 'Custom minutes', value: 'custom', hint: 'Set your own countdown' }
        ];

        if (setupChoice.timeLimit !== 7200 && setupChoice.timeLimit !== 10800 && setupChoice.timeLimit !== 0 && setupChoice.timeLimit !== 'custom') {
          setupChoice.timeLimit = (examId === 'inicet' ? 7200 : 10800);
        }

        var pool = {
          title: exam.icon + ' ' + exam.name + ' — ' + setupChoice.pyqYear,
          isPyq: true,
          pyqExam: examId,
          pyqYear: setupChoice.pyqYear,
          questionCount: 0,
          key: 'pyq:' + examId + ':' + setupChoice.pyqYear
        };
        setupChoice.pool = pool;

        var typeHtml =
          '<button class="type-card ' + (setupChoice.quizType === 'practice' ? 'active' : '') + '" data-type="practice">' +
          '<span class="tname">Practice Mode</span><span class="tdesc">Instant clinical explanations and correct answer keys after each question.</span>' +
          '</button>' +
          '<button class="type-card ' + (setupChoice.quizType === 'timed' ? 'active' : '') + '" data-type="timed">' +
          '<span class="tname">Exam Simulation</span><span class="tdesc">Complete official test paper with a countdown timer (' + (setupChoice.timeLimit === 7200 ? '120 min' : (setupChoice.timeLimit === 10800 ? '180 min' : 'unlimited')) + ').</span>' +
          '</button>';

        var timeHtml = PYQ_TIME_OPTIONS.map(function (t) {
          return '<button class="pill-choice ' + (setupChoice.timeLimit === t.value ? 'active' : '') + '" data-time="' + t.value + '">' +
            '<span style="font-weight:700;">' + esc(t.label) + '</span>' +
            '</button>';
        }).join('');
        var pyqCustomTimeHtml = setupChoice.timeLimit === 'custom' ? '<div class="custom-setup-control"><label for="customTimeInput">Minutes</label><input id="customTimeInput" type="number" min="1" max="600" value="' + esc(String(setupChoice.customTime || 30)) + '" inputmode="numeric"><span>1–600 min</span></div>' : '';

        app.innerHTML =
          topBar('Back to Home', renderHome) +
          '<main id="mainContent" role="main">' +
          '<div class="pyq-setup-badge">📚 PYQ BANK · ' + esc(exam.name) + '</div>' +
          '<h1 class="setup-chapname">' + esc(exam.icon + ' ' + exam.name) + ' Official Exam Papers</h1>' +
          '<p class="setup-sub">' + esc(exam.label) + ' · Each year acts as a complete, single full-length official test.</p>' +
          '<div class="setup-section pyq-year-section">' +
          '<div class="setup-label">Select Exam Year / Session (Single Official Test)</div>' +
          '<div class="pyq-years-scroll" id="yearRow">' + yearsHtml + '</div>' +
          '<div class="pyq-source-note">💡 Each year session is an independent full paper with authentic recall questions and explanations</div>' +
          '</div>' +
          '<div class="setup-section">' +
          '<div class="setup-label">Test Format</div>' +
          '<div class="pyq-single-test-card glass">' +
          '<div class="pyq-single-test-badge-row">' +
          '<span class="pyq-full-badge">📋 Single Full Test</span>' +
          '<span class="pyq-paper-badge">' + esc(exam.name) + ' · ' + esc(setupChoice.pyqYear) + '</span>' +
          '</div>' +
          '<div class="pyq-single-test-title">Official Complete Paper (' + esc(setupChoice.pyqYear) + ')</div>' +
          '<p class="pyq-single-test-desc">Every year PYQ acts as a single comprehensive test containing all official recall MCQs, image-based stems, answer keys, and high-yield clinical explanations.</p>' +
          '</div>' +
          '</div>' +
          '<div class="setup-section"><div class="setup-label">Test Mode</div><div class="type-grid" id="typeGrid">' + typeHtml + '</div></div>' +
          '<div class="setup-section"><div class="setup-label">Exam Duration (Timer)</div><div class="pill-row" id="timeRow">' + timeHtml + '</div>' + pyqCustomTimeHtml +
          '<div class="pyq-time-hint">⏱ 180 min (3 Hours) for NEET PG &amp; FMGE · 120 min (2 Hours) for INICET</div>' +
          '</div>' +
          '<div class="setup-section"><div class="setup-label">Question Order</div><div class="pill-row" id="orderRow">' +
          '<button class="pill-choice ' + (setupChoice.orderMode === 'structured' ? 'active' : '') + '" data-order="structured">Paper Sequence (Original Order)</button>' +
          '<button class="pill-choice ' + (setupChoice.orderMode === 'shuffled' ? 'active' : '') + '" data-order="shuffled">Shuffled (Exam Mode)</button>' +
          '</div></div>' +
          '<div class="start-btn-wrap"><button class="btn start" id="startBtn">🚀 Start ' + esc(exam.name) + ' ' + esc(setupChoice.pyqYear) + ' Test</button></div>' +
          '</main>';

        wireTopBar(renderHome);
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
          topBar('Back to PYQ Setup', function () { renderPYQSetup(examId); }) +
          '<main id="mainContent" role="main">' +
          '<div class="loading-screen" style="position:relative;margin:80px auto;max-width:440px;">' +
          '<div class="loading-card glass" style="padding:36px 24px;text-align:center;">' +
          '<div class="loading-logo">MedLadder</div>' +
          '<div class="loading-sub">' + esc(exam.icon + ' ' + exam.name + ' · ' + yearDisplay) + ' </div>' +
          '<div class="loading-text" style="margin-top:14px;font-weight:600;">Loading questions<span class="loading-dots"></span></div>' +
          '<div class="loading-spinner"></div>' +
          '</div>' +
          '</div>' +
          '</main>';
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
              poolTitle: exam.icon + ' ' + exam.name + yearLabelInTitle,
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

          renderQuiz();
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
        clearTimer();
        releaseQuizPayload();
        state.screen = 'modules';
        if (app) {
          app.classList.remove('screen-quiz', 'screen-setup', 'screen-results');
        }
        var subjMeta = SUBJECT_INDEX.find(function (s) { return s.subjectId === subjectId; });
        var modules = getSubjectModules(subjectId);
        state.subjectId = subjectId;

        var allCount = modules.reduce(function (s, m) { return s + m.questionCount; }, 0);
        var pAll = progress[subjectId + ':all'];
        var allScore = pAll && pAll.done > 0 ? Math.round((pAll.correct / pAll.done) * 100) + '% last run' : '';

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
              '<span class="info"><span class="cname">' + esc(m.name) + '</span>' +
              progHtml +
              '<span class="cmeta">' + m.questionCount + ' questions</span></span>' +
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
          footerHtml();

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
        if (!quizStylesReady) {
          ensureQuizStyles().then(renderCustomSetup);
          return;
        }
        clearTimer();
        releaseQuizPayload();
        state.screen = 'setup';
        state.isPyqMode = false;
        state.subjectId = null;
        state.moduleId = 'custom';
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
        app.innerHTML = topBar('Back to Home', renderHome) + '<main id="mainContent" role="main"><h1 class="setup-chapname">✦ Custom Module</h1><p class="setup-sub">Choose questions from all ' + SUBJECT_INDEX.length + ' subjects and every topic.</p><div class="setup-section"><div class="setup-label">Quiz type</div><div class="type-grid" id="typeGrid">' + typeHtml + '</div></div><div class="setup-section"><div class="setup-label">Number of questions</div><div class="pill-row" id="countRow">' + countHtml + '</div>' + customCountHtml + '</div><div class="setup-section"><div class="setup-label">Time limit</div><div class="pill-row" id="timeRow">' + timeHtml + '</div>' + customTimeHtml + '</div><div class="setup-section"><div class="setup-label">Question order</div><div class="pill-row" id="orderRow"><button class="pill-choice ' + (setupChoice.orderMode === 'structured' ? 'active' : '') + '" data-order="structured">Structured</button><button class="pill-choice ' + (setupChoice.orderMode === 'shuffled' ? 'active' : '') + '" data-order="shuffled">Shuffled</button></div></div><div class="start-btn-wrap"><button class="btn start" id="startBtn">Start custom quiz</button></div></main>';
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

      function renderSetup(subjectId, moduleId) {
        if (!quizStylesReady) {
          ensureQuizStyles().then(function () { renderSetup(subjectId, moduleId); });
          return;
        }
        clearTimer();
        releaseQuizPayload();
        state.screen = 'setup';
        app.classList.remove('screen-quiz');
        app.classList.add('screen-setup');
        state.subjectId = subjectId;
        state.moduleId = moduleId;
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

        var startBtnLabel = isLocked
          ? '🔒 Unlock with MedLadder Pro (₹' + PRO_CONFIG.PRICE_INR + ')'
          : (currentUser ? 'Start quiz' : '🔒 Sign in to start quiz');
        var startBtnClass = isLocked ? 'btn start btn-locked-pro' : 'btn start';

        var setupNoteHtml = isLocked
          ? '<div class="mode-note" style="margin-top:10px;text-align:center;color:#FF7A3D;font-weight:600;">⭐ This topic is a MedLadder Pro exclusive. The first 8 topics in this subject are free!</div>'
          : (!currentUser ? '<div class="mode-note" style="margin-top:10px;text-align:center;">Sign in or create a free account to take quizzes and save test history. <button class="auth-link" id="setupAuthLink" style="font-weight:700;">Sign In / Register</button></div>' : '');

        app.innerHTML =
          topBar('Back to topics', function () { renderModuleList(subjectId); }) +
          '<main id="mainContent" role="main">' +
          '<h1 class="setup-chapname">' + esc(pool.title) + '</h1>' +
          '<p class="setup-sub">' + total + ' questions available in this bank.</p>' +
          '<div class="setup-section"><div class="setup-label">Quiz type</div><div class="type-grid" id="typeGrid">' + typeHtml + '</div></div>' +
          '<div class="setup-section"><div class="setup-label">Number of questions</div><div class="pill-row" id="countRow">' + countHtml + '</div>' + customCountHtml + '</div>' +
          '<div class="setup-section"><div class="setup-label">Time limit</div><div class="pill-row" id="timeRow">' + timeHtml + '</div>' + customTimeHtml + '</div>' +
          '<div class="setup-section"><div class="setup-label">Question order</div><div class="pill-row" id="orderRow">' +
          '<button class="pill-choice ' + (setupChoice.orderMode === 'structured' ? 'active' : '') + '" data-order="structured">Structured (Topic Order)</button>' +
          '<button class="pill-choice ' + (setupChoice.orderMode === 'shuffled' ? 'active' : '') + '" data-order="shuffled">Shuffled (Exam Mode)</button>' +
          '</div></div>' +
          '<div class="start-btn-wrap">' +
          '<button class="' + startBtnClass + '" id="startBtn">' + startBtnLabel + '</button>' +
          '</div>' +
          setupNoteHtml +
          '</main>';

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

        if (!currentUser) {
          openAuthModal('signin', {
            reason: 'Please sign in or create an account to start practicing questions.',
            onSuccess: function () {
              startQuiz();
            }
          });
          return;
        }

        var pool = setupChoice.pool;
        quizLoadInFlight = true;

        // Show loading screen while fetching from Supabase
        app.innerHTML =
          topBar('Back to setup', function () { isCustom ? renderCustomSetup() : renderSetup(state.subjectId, state.moduleId || 'all'); }) +
          '<main id="mainContent" role="main">' +
          '<div class="loading-screen" style="position:relative;margin:80px auto;max-width:440px;">' +
          '<div class="loading-card glass" style="padding:36px 24px;text-align:center;">' +
          '<div class="loading-logo">MedLadder</div>' +
          '<div class="loading-sub">' + esc(pool.title) + '</div>' +
          '<div class="loading-text" style="margin-top:14px;font-weight:600;">Securely retrieving MCQs from cloud<span class="loading-dots"></span></div>' +
          '<div class="loading-spinner"></div>' +
          '</div>' +
          '</div>' +
          '</main>';
        wireTopBar(function () { isCustom ? renderCustomSetup() : renderSetup(state.subjectId, state.moduleId || 'all'); });

        // Build Supabase Query
        var query = supabaseClient.from('questions').select('id,question_num,question_text,option_a,option_b,option_c,option_d,option_e,answer,explanation');
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

          renderQuiz();
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
          console.error('Fetch questions error:', err);
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
        if (!currentUser) {
          openAuthModal('signin', {
            reason: 'Please sign in or create an account to view and solve questions.'
          });
          renderSetup(state.subjectId, state.moduleId || 'all');
          return;
        }

        state.screen = 'quiz';
        if (app) {
          app.classList.remove('screen-setup');
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
          explainHtml = '<div class="explain show"><span class="exlabel">💡 Clinical Rationale &amp; Explanation</span>' +
            (q.explanation ? formatExplanation(q.explanation, q.explanationImages) : '<span class="no-explain">No explanation was captured for this item in the source text.</span>') +
            (existing && existing.skipped ? '<div class="skip-tag">Time ran out before you answered.</div>' : '') +
            '</div>';
        }

        var timerHtml = state.timeLimit > 0 ? '<span class="timer-badge" id="timerBadge">--:--</span>' : '';
        var isLast = state.idx + 1 >= total;
        var backFn = state.isPyqMode ? function () { renderPYQSetup(state.pyqExam); } : (state.moduleId === 'custom' ? function () { renderCustomSetup(); } : function () { renderModuleList(state.subjectId); });

        releaseQuestionImages();
        app.innerHTML =
          topBar('Back', backFn) +
          '<main id="mainContent" role="main">' +
          '<div class="qmeta-row">' +
          '<span class="chap-tag">' + esc(state.poolTitle) + '</span>' +
          '<span class="score-tag" style="display:flex;align-items:center;gap:8px;">' + timerHtml + '<span id="scoreText">' + correctSoFar + ' / ' + answeredCount + ' correct</span></span>' +
          '</div>' +
          '<div class="qprog-track"><div class="qprog-fill" style="width:' + Math.round(((state.idx) / total) * 100) + '%"></div></div>' +
          '<div class="qcard glass">' +
          '<h1 class="qnum-eyebrow" style="margin:0 0 10px;font-size:11px;line-height:1.4;">Question ' + (state.idx + 1) + ' of ' + total + ' · <span style="color:var(--accent);text-transform:none;letter-spacing:normal;font-weight:700;">' + esc(state.poolTitle) + '</span></h1>' +
          '<div class="qtext">' + renderQuestionContent(q.question || '', q.questionImages) + '</div>' +
          '<div class="options">' + optsHtml + '</div>' +
          explainHtml +
          '</div>' +
          '<div class="quiz-actions" style="display:flex;align-items:center;justify-content:space-between;margin-top:18px;">' +
          '<div class="quiz-shortcuts-hint" style="font-size:12px;color:var(--ink-soft);opacity:0.8;">Keys <strong>1-4</strong> or <strong>A-D</strong> · <strong>Enter</strong> to advance</div>' +
          '<button class="btn" id="nextBtn" ' + (existing ? '' : 'disabled') + '>' + (isLast ? 'See results' : 'Next question') + '</button>' +
          '</div>' +
          '</main>';

        wireTopBar(backFn);
        wireRipples('.opt, .btn, .auth-btn');
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
            if (scoreText) scoreText.textContent = correctNow + ' / ' + Object.keys(state.answers).length + ' correct';

            // 2) Explanation, guarded so bad editorial HTML cannot break the tap.
            try {
              var explanationHtml = '<div class="explain show"><span class="exlabel">💡 Clinical Rationale &amp; Explanation</span>' +
                (q.explanation ? formatExplanation(q.explanation, q.explanationImages) : '<span class="no-explain">No explanation was captured for this item in the source text.</span>') +
                '</div>';
              var optionsContainer = app.querySelector('.options');
              if (optionsContainer && !app.querySelector('.explain')) optionsContainer.insertAdjacentHTML('afterend', explanationHtml);
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

            // 3) Persistence (localStorage + Supabase) deferred off the tap's critical path.
            setTimeout(function () {
              try { saveProgress(); } catch (err) { console.warn('saveProgress failed:', err); }
            }, 0);
          });
        });
        document.getElementById('nextBtn').addEventListener('click', function () { commitAndAdvance(); });

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
          if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
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
        var answered = Object.keys(state.answers).length;
        var correct = Object.values(state.answers).filter(function (a) { return a.isCorrect; }).length;
        var total = state.order.length;
        // Update local map
        progress[state.progressKey] = { done: answered, correct: correct, total: total };
        persistProgress();
        // Persist to Supabase after a short quiet period so rapid mobile taps do
        // not create a burst of overlapping writes.
        if (progressSaveTimer) clearTimeout(progressSaveTimer);
        var saveKey = state.progressKey;
        progressSaveTimer = setTimeout(function () {
          progressSaveTimer = null;
          saveModuleProgressToDB(saveKey, answered, correct, total);
        }, 350);
      }

      // ---------- RESULTS ----------
      function verdictFor(pct) {
        if (pct === 100) return 'Perfect score — every question nailed.';
        if (pct >= 85) return 'Strong grasp of this topic.';
        if (pct >= 70) return 'Solid, with a few gaps to revisit.';
        if (pct >= 50) return 'Halfway there — worth a second pass.';
        return 'This topic needs another round.';
      }

      function renderResults(timedOut) {
        clearTimer();
        releaseQuestionImages();
        state.screen = 'results';
        if (app) {
          app.classList.remove('screen-setup');
          app.classList.add('screen-quiz', 'screen-results');
        }
        var total = state.order.length;
        var correct = Object.values(state.answers).filter(function (a) { return a.isCorrect; }).length;
        var pct = Math.round((correct / total) * 100);
        saveProgress();
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

        var resBackFn = state.isPyqMode ? function () { renderPYQSetup(state.pyqExam); } : (state.moduleId === 'custom' ? function () { renderCustomSetup(); } : function () { renderModuleList(state.subjectId); });

        app.innerHTML =
          topBar('Back', resBackFn) +
          '<main id="mainContent" role="main">' +
          '<div class="result-hero glass">' +
          '<div class="pct">' + pct + '%</div>' +
          '<div class="frac">' + correct + ' of ' + total + ' correct' + (timedOut ? ' · time ran out' : '') + '</div>' +
          '<h1 class="chapname" style="margin:14px 0 0;font-size:12.5px;line-height:1.4;">' + esc(state.poolTitle) + ' · Test Results</h1>' +
          '<div class="verdict">' + verdictFor(pct) + '</div>' +
          '</div>' +
          '<div class="result-actions">' +
          '<button class="btn" id="retryBtn">Retry same setup</button>' +
          '<button class="btn secondary" id="setupBtn">' + (state.isPyqMode ? 'Change PYQ Setup' : 'Change setup') + '</button>' +
          '</div>' +
          '<button class="review-toggle" id="reviewToggle">Show full review ▾</button>' +
          '<div id="reviewBlock" class="hidden" data-loaded="false">' + reviewHtml + '</div>' +
          '</main>' +
          footerHtml();

        wireTopBar(resBackFn);
        wireRipples('.btn, .auth-btn');

        document.getElementById('retryBtn').addEventListener('click', function () {
          if (state.isPyqMode) startPYQQuiz(state.pyqExam);
          else startQuiz();
        });
        document.getElementById('setupBtn').addEventListener('click', function () {
          if (state.isPyqMode) {
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
          progress = {};
          persistProgress();
          if (currentUser && currentUser.id && supabaseClient) {
            supabaseClient.from('module_progress').delete().eq('user_id', currentUser.id).then(function () {}).catch(function () {});
          }
          showToast('Reset quiz progress and test state.');
          renderHome(true);
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

        // GA4 SPA Virtual Pageview Telemetry
        trackEvent('page_view', {
          page_title: title,
          page_location: window.location.href,
          page_path: path || window.location.pathname
        });
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
          footerHtml();

        wireTopBar(function () { goHomeFromSeo(); });
        updateSeoMeta(title, description, window.location.pathname);

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
        if (path === '/mock-test' || path === '/mock-test.html') {
          window.location.replace('/mock-test.html' + (window.location.search || ''));
          return;
        }
        if (path === '/admin-mock' || path === '/admin-mock.html') {
          window.location.replace('/admin-mock.html' + (window.location.search || ''));
          return;
        }
        if (path === '/privacy' || path === '/privacy.html') {
          window.location.replace('/privacy.html' + (window.location.search || '') + (window.location.hash || ''));
          return;
        }
        if (path === '/terms' || path === '/terms.html') {
          window.location.replace('/terms.html' + (window.location.search || '') + (window.location.hash || ''));
          return;
        }
        if (path === '/neet-ss-books' || path === '/neet-ss-books.html') {
          window.location.replace('/neet-ss-books.html' + (window.location.search || ''));
          return;
        }
        var exams = {
          '/neet-pg': { name: 'NEET PG', pyqId: 'NEET PG' },
          '/inicet': { name: 'INI-CET', pyqId: 'INICET' },
          '/ini-cet': { name: 'INI-CET', pyqId: 'INICET' },
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
        var isSeoUrl = p.indexOf('/subjects/') === 0 || ['/neet-pg', '/inicet', '/ini-cet', '/fmge', '/neet-ss'].indexOf(p) !== -1;
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
