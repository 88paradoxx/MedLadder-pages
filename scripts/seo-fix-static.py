#!/usr/bin/env python3
"""Site-wide SEO fixes for the committed static pages (SEOmator audit, Nov 2026).

Safe to run repeatedly: every change checks whether it is already in place.

  python3 scripts/seo-fix-static.py          apply
  python3 scripts/seo-fix-static.py --dry    report only

What it does
  1. Structured data
     - WebPage blocks without a name get name + description (from <title> and
       the meta description) and dateModified.
     - Article blocks without dates get datePublished / dateModified from git
       (when the file was added / last changed).
     - The https://medladder.top/#organization entity is typed
       EducationalOrganization everywhere (it was Organization on some pages).
  2. Topic-page meta descriptions use a shorter template that fits Google's
     snippet width (~920px); og/twitter/schema copies of the old text follow.
  3. "Sample MCQ #n" labels: 11px -> 12px.
  4. Footer: About and Contact links, and an educational-use disclaimer.
  5. A visible "Updated <date>" next to the "reviewed by" line (git date).
  6. Second pass: one absolute @id (and sameAs) for MedLadder, the website
     and Dr Mirbilal; a skip link; an llms.txt <link>; the header logo loads
     with fetchpriority=high; question-image alt text kept under 125 chars;
     social profile links in the footer.
Clinical Cases hub pages are skipped where scripts/build-cases-hubs.mjs owns
the content (descriptions, dates).
"""
import glob, html, json, os, re, subprocess, sys
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
DRY = '--dry' in sys.argv
SKIP_PREFIX = ('dist/', 'node_modules/', 'android/', 'audit-output/', 'www/')

# ---------------------------------------------------------------- git dates
def git_dates():
    """file -> (first date, last date) as YYYY-MM-DD, from one git log pass."""
    out = subprocess.run(['git', 'log', '--format=@%as', '--name-only', '--', '*.html'],
                         capture_output=True, text=True, check=True).stdout
    first, last, cur = {}, {}, None
    for line in out.splitlines():
        if line.startswith('@'):
            cur = line[1:]
        elif line.strip():
            last.setdefault(line, cur)   # log is newest-first
            first[line] = cur            # keeps overwriting -> oldest
    return first, last

FIRST, LAST = git_dates()
TODAY = date.today().isoformat()

# ---------------------------------------------------------------- width
def px(text):
    """Same estimate SEOmator uses for SERP snippet width."""
    w = 0.0
    for ch in text:
        if ch == ' ': w += 4
        elif ch in '.,:;!|il1': w += 4
        elif ch in 'mwMW': w += 11
        elif 'A' <= ch <= 'Z': w += 9.5
        else: w += 7.5
    return round(w)

DESC_MAX = 920

SUBJECT_NAMES = {
    'anatomy': 'Anatomy', 'physiology': 'Physiology', 'biochemistry': 'Biochemistry', 'pathology': 'Pathology',
    'microbiology': 'Microbiology', 'pharmacology': 'Pharmacology', 'forensic-medicine': 'Forensic Medicine',
    'psm': 'PSM', 'ent': 'ENT', 'ophthalmology': 'Ophthalmology', 'medicine': 'Medicine', 'surgery': 'Surgery',
    'ob-g': 'OBG', 'pediatrics': 'Paediatrics', 'paediatrics': 'Paediatrics', 'orthopaedics': 'Orthopaedics',
    'orthopedics': 'Orthopaedics', 'dermatology': 'Dermatology', 'psychiatry': 'Psychiatry',
    'anaesthesia': 'Anaesthesia', 'anesthesia': 'Anaesthesia', 'radiology': 'Radiology',
}

def topic_description(topic, subject):
    """Shortest-first fallbacks; first one that fits the snippet wins."""
    options = [
        f'{topic} MCQs with answers and explanations for MBBS, NEET PG, FMGE & INI-CET. Free {subject} practice on MedLadder.',
        f'{topic} MCQs with answers and explanations for MBBS, NEET PG, FMGE & INI-CET {subject} revision.',
        f'{topic} MCQs with explained answers for MBBS, NEET PG, FMGE & INI-CET.',
        f'{topic} MCQs with explained answers for NEET PG & FMGE.',
        f'{topic}: MCQs with explanations for NEET PG.',
    ]
    for o in options:
        if px(o) <= DESC_MAX:
            return o
    return options[-1]

# Hand-written replacements for descriptions too wide for the snippet.
# Counts such as 36,219 are kept verbatim: the Worker swaps in live numbers.
OVERRIDES = {
    'index.html': 'MCQ question bank for FMGE, NEET PG, INI-CET & NEET SS: 36,219 questions across 19 subjects, with explained answers.',
    'landing.html': '36,219 topic-wise MCQs and previous-year papers for MBBS, NEET PG, FMGE, INI-CET & NEET SS. 8 topics free in every subject.',
    'landing/index.html': '36,219 topic-wise MCQs and previous-year papers for MBBS, NEET PG, FMGE, INI-CET & NEET SS. 8 topics free in every subject.',
    'neet-pg/index.html': 'NEET PG preparation: 36,219 MCQs, previous-year questions from 2018–2025 and clear explanations on MedLadder.',
    'fmge/index.html': 'FMGE preparation: previous-year questions from 2020–2025, 19 subject QBanks and explained answers on MedLadder.',
    'inicet/index.html': 'INI-CET MCQs from 10 exam sessions (2020–2025), AIIMS PG recalls and clinical vignettes, with explanations.',
    'neet-ss/index.html': 'NEET SS preparation: previous-year papers (2022–2024), high-yield MCQs and detailed explanations on MedLadder.',
    'neet-pg-syllabus/index.html': 'NEET PG syllabus with subject-wise weightage from 1,484 recall questions, topic counts and practice links.',
    'pyqs/index.html': 'Free 50-question previews of NEET PG, FMGE and INI-CET previous-year papers, full papers as PDF, and free mocks.',
    'pyqs/neet-pg/index.html': 'Free 50-question previews of NEET PG recall papers 2018–2025, full papers as PDF, and a free All-India mock.',
    'pyqs/ini-cet/index.html': 'Free 50-question previews of INI-CET recall papers 2020–2025, full papers as PDF, and a free mock test.',
    'pyqs/fmge/index.html': 'Free 50-question previews of FMGE recall papers 2020–2025, full papers as PDF, and a free mock test.',
    'books/index.html': 'Free PDF books and notes for MBBS, NEET PG, FMGE, INI-CET & NEET SS, by exam and subject. No sign-up.',
    'mock-test/index.html': 'Free live mock tests for NEET PG, INI-CET, FMGE, USMLE and PLAB with an All-India rank and live leaderboard.',
    'mock-test.html': 'Free live mock tests for NEET PG, INI-CET, FMGE, USMLE and PLAB with an All-India rank and live leaderboard.',
    'editorial-team/index.html': 'Who reviews MedLadder questions: Dr Mirbilal, MBBS, MD (Pediatrics), checks every explanation against textbooks.',
    'medladder-vs-prepladder/index.html': 'MedLadder vs PrepLadder: free tier, Pro from ₹199 a month, 30,000+ questions and free live mocks compared.',
    'medladder-vs-marrow/index.html': 'MedLadder vs Marrow: free tier, Pro from ₹199 a month, 30,000+ questions and free live mocks compared.',
    'best-free-neet-pg-question-bank/index.html': "What's free on MedLadder: 8 modules per subject and free All-India mocks; the full bank is ₹199 a month.",
    'subjects/anatomy/index.html': 'Anatomy MCQs for MBBS, NEET PG, FMGE & INI-CET: gross anatomy, neuroanatomy, embryology and histology.',
    'subjects/physiology/index.html': 'Physiology MCQs for MBBS, NEET PG, FMGE & INI-CET: nerve and muscle, CVS, respiratory, renal and endocrine.',
    'subjects/biochemistry/index.html': 'Biochemistry MCQs for MBBS, NEET PG, FMGE & INI-CET: metabolism, enzymes, molecular biology and vitamins.',
    'subjects/pathology/index.html': 'Pathology MCQs for MBBS, NEET PG, FMGE & INI-CET: general and systemic pathology, haematology and neoplasia.',
    'subjects/microbiology/index.html': 'Microbiology MCQs for MBBS, NEET PG, FMGE & INI-CET: bacteria, viruses, fungi, parasites and immunology.',
    'subjects/pharmacology/index.html': 'Pharmacology MCQs for MBBS, NEET PG, FMGE & INI-CET: mechanisms, kinetics, adverse effects and ANS drugs.',
    'subjects/forensic-medicine/index.html': 'Forensic medicine MCQs for MBBS, NEET PG, FMGE & INI-CET: jurisprudence, injuries, toxicology and autopsy.',
    'subjects/psm/index.html': 'PSM MCQs for MBBS, NEET PG, FMGE & INI-CET: epidemiology, biostatistics, screening and immunisation.',
    'subjects/ophthalmology/index.html': 'Ophthalmology MCQs for MBBS, NEET PG, FMGE & INI-CET: optics, glaucoma, retina, cornea and ocular trauma.',
    'subjects/ent/index.html': 'ENT MCQs for MBBS, NEET PG, FMGE & INI-CET: ear, nose, sinuses, pharynx, larynx and audiology.',
    'subjects/medicine/index.html': 'Medicine MCQs for MBBS, NEET PG, FMGE & INI-CET: cardiology, neurology, renal, endocrine and infections.',
    'subjects/surgery/index.html': 'Surgery MCQs for MBBS, NEET PG, FMGE & INI-CET: trauma, breast, thyroid, GI surgery and urology.',
    'subjects/ob-g/index.html': 'OBG MCQs for MBBS, NEET PG, FMGE & INI-CET: pregnancy, labour, obstetric complications and gynaecology.',
    'subjects/pediatrics/index.html': 'Paediatrics MCQs for MBBS, NEET PG, FMGE & INI-CET: neonatology, growth, nutrition and immunisation.',
    'subjects/dermatology/index.html': 'Dermatology MCQs for MBBS, NEET PG, FMGE & INI-CET: lesions, infections, inflammatory and pigment disorders.',
    'subjects/psychiatry/index.html': 'Psychiatry MCQs for MBBS, NEET PG, FMGE & INI-CET: psychosis, mood, anxiety, substance use and treatment.',
    'subjects/anaesthesia/index.html': 'Anaesthesia MCQs for MBBS, NEET PG, FMGE & INI-CET: airway, general and regional anaesthesia, resuscitation.',
    'subjects/radiology/index.html': 'Radiology MCQs for MBBS, NEET PG, FMGE & INI-CET: X-ray, CT, MRI, ultrasound, contrast and radiological signs.',
}
PYQ_RE = re.compile(r'^Practise a free 50-question preview of the (.+?) recall paper with answers and explanations\. Download the complete paper as a PDF\.$')

# ---------------------------------------------------------------- helpers
LD_RE = re.compile(r'(<script type="application/ld\+json">)(\s*)([\s\S]*?)(\s*</script>)')

def dump(obj, original):
    multi = '\n' in original.strip()
    s = json.dumps(obj, ensure_ascii=False, indent=2 if multi else None)
    return s.replace('</', '<\\/')

def nodes(o):
    """Yield every dict in a JSON-LD tree."""
    if isinstance(o, dict):
        yield o
        for v in o.values(): yield from nodes(v)
    elif isinstance(o, list):
        for v in o: yield from nodes(v)

def attr_text(h, pattern):
    m = re.search(pattern, h)
    return html.unescape(m.group(1)) if m else None

def fmt_date(iso):
    y, m, d = map(int, iso.split('-'))
    return f'{d} {["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][m-1]} {y}'

FOOTER_OLD = '<a href="/editorial-team" class="footer-link">Editorial team</a>'
FOOTER_NEW = ('<a href="/editorial-team" class="footer-link">Editorial team</a>\n'
              '          <span class="footer-dot" aria-hidden="true">·</span>\n'
              '          <a href="/about" class="footer-link">About</a>\n'
              '          <span class="footer-dot" aria-hidden="true">·</span>\n'
              '          <a href="/contact" class="footer-link">Contact</a>')
DISCLAIMER = ('<p class="footer-disclaimer">MedLadder is for medical exam preparation and education only. '
              'It is not medical advice and is not a substitute for clinical judgement.</p>')

ORG_ID = 'https://medladder.top/#organization'
SITE_ID = 'https://medladder.top/#website'
PERSON_ID = 'https://medladder.top/editorial-team#mirbilal'
SAME_AS = [
    'https://play.google.com/store/apps/details?id=com.medladder.app',
    'https://www.facebook.com/profile.php?id=61568903965858',
    'https://www.instagram.com/medladder2026/',
    'https://x.com/medladder2026',
    'https://t.me/+JdqZ1YlJ-NhlOThl',
]
LLMS_LINK = '<link rel="alternate" type="text/markdown" href="/llms.txt" title="llms.txt">'
SKIP_CSS = ('<style id="skipLinkCss">.skip-link{position:absolute;left:12px;top:-60px;z-index:10000;padding:10px 14px;'
            'border-radius:10px;background:#13806B;color:#fff;font-weight:600;text-decoration:none}'
            '.skip-link:focus{top:12px}</style>')
SOCIAL_ROW = ('<p class="footer-social">'
              '<a href="https://www.instagram.com/medladder2026/" rel="noopener">Instagram</a> · '
              '<a href="https://www.facebook.com/profile.php?id=61568903965858" rel="noopener">Facebook</a> · '
              '<a href="https://x.com/medladder2026" rel="noopener">X</a> · '
              '<a href="https://t.me/+JdqZ1YlJ-NhlOThl" rel="noopener">Telegram</a></p>')
ALT_RE = re.compile(r'alt="([^"]*?): ((?:explanation )?image) for the MCQ “([^”]*)”"')

def short_alt(mo):
    head, kind, stem = mo.group(1), mo.group(2), mo.group(3)
    full = f'{head}: {kind} for the MCQ “{stem}”'
    if len(html.unescape(full)) <= 120:
        return mo.group(0)
    room = 120 - len(html.unescape(f'{head}: {kind} for the MCQ “…”'))
    if room < 15:
        return f'alt="{head}: MCQ {kind}"'
    cut = html.unescape(stem)[:room].rsplit(' ', 1)[0].rstrip(' ,;:.')
    return 'alt="' + f'{head}: {kind} for the MCQ “{html.escape(cut, quote=True)}…”' + '"'

# ---------------------------------------------------------------- per file
stats = {k: 0 for k in ('files', 'webpage', 'article', 'org', 'desc', 'eyebrow', 'footer', 'updated',
                         'ids', 'skip', 'llms', 'logo', 'alt', 'social')}
long_left = []

def fix(path):
    h = open(path, encoding='utf-8').read()
    orig = h
    hub = path.startswith('clinical-cases/')
    title = attr_text(h, r'<title>([^<]*)</title>') or ''
    last = LAST.get(path, TODAY)
    first = FIRST.get(path, last)

    # 2. topic-page description (before schema, so schema copies the new one)
    m = re.match(r'subjects/([^/]+)/([^/]+)/index\.html$', path)
    old_desc = attr_text(h, r'<meta name="description" content="([^"]*)"')
    new_desc = None
    if old_desc and px(old_desc) > DESC_MAX:
        if path in OVERRIDES:
            new_desc = OVERRIDES[path]
        elif PYQ_RE.match(old_desc):
            new_desc = f'Free 50-question preview of the {PYQ_RE.match(old_desc).group(1)} recall paper with explained answers, plus the full PDF.'
        elif m:
            topic = re.sub(r'\s+MCQs\b.*$', '', title).strip()
            subject = SUBJECT_NAMES.get(m.group(1), m.group(1).replace('-', ' ').title())
            if topic: new_desc = topic_description(topic, subject)
    if new_desc:
        if True:
            esc_old, esc_new = html.escape(old_desc, quote=True), html.escape(new_desc, quote=True)
            for a in ('name="description"', 'property="og:description"', 'name="twitter:description"'):
                h = h.replace(f'<meta {a} content="{esc_old}"', f'<meta {a} content="{esc_new}"')
                # some pages escape & but not quotes
                h = h.replace(f'<meta {a} content="{old_desc.replace("&", "&amp;")}"', f'<meta {a} content="{esc_new}"')
            h = h.replace(json.dumps(old_desc, ensure_ascii=False)[1:-1], json.dumps(new_desc, ensure_ascii=False)[1:-1])
            stats['desc'] += 1
    desc = attr_text(h, r'<meta name="description" content="([^"]*)"')
    if desc and px(desc) > DESC_MAX and not hub:
        long_left.append((px(desc), path, desc))

    # 1. structured data
    def ld(mo):
        open_tag, ws, body, close = mo.groups()
        try:
            obj = json.loads(body)
        except Exception:
            return mo.group(0)
        before = json.dumps(obj, sort_keys=True)
        for n in nodes(obj):
            t = n.get('@type')
            if t == 'WebPage' and 'name' not in n and title:
                n['name'] = title
                if desc: n['description'] = desc
                n.setdefault('dateModified', last)
                stats['webpage'] += 1
            if t in ('Article', 'BlogPosting') and 'datePublished' not in n:
                n['datePublished'] = first
                n.setdefault('dateModified', last)
                stats['article'] += 1
            if n.get('@id') == 'https://medladder.top/#organization' and t != 'EducationalOrganization':
                n['@type'] = 'EducationalOrganization'
                stats['org'] += 1
            # 6. one identity per entity
            if t in ('Organization', 'EducationalOrganization') and n.get('name') == 'MedLadder':
                if n.get('@id') != ORG_ID or t != 'EducationalOrganization' or 'sameAs' not in n:
                    n['@type'] = 'EducationalOrganization'
                    n['@id'] = ORG_ID
                    n.setdefault('sameAs', SAME_AS)
                    stats['ids'] += 1
            if t == 'WebSite' and n.get('name') == 'MedLadder' and '@id' not in n:
                n['@id'] = SITE_ID
                stats['ids'] += 1
            if t == 'Person' and 'Mirbilal' in str(n.get('name', '')) and '@id' not in n:
                n['@id'] = PERSON_ID
                stats['ids'] += 1
        if json.dumps(obj, sort_keys=True) == before:
            return mo.group(0)
        return open_tag + ws + dump(obj, body) + close
    h = LD_RE.sub(ld, h)

    # 3. sample MCQ label size
    n_eb = h.count('class="qnum-eyebrow" style="color:var(--accent);font-size:11px;')
    if n_eb:
        h = h.replace('class="qnum-eyebrow" style="color:var(--accent);font-size:11px;', 'class="qnum-eyebrow" style="color:var(--accent);font-size:12px;')
        stats['eyebrow'] += 1

    # 4. footer links + disclaimer
    if FOOTER_OLD in h and 'href="/about" class="footer-link"' not in h:
        h = h.replace(FOOTER_OLD, FOOTER_NEW, 1)
        h = re.sub(r'(<div class="footer-links-row">[\s\S]*?</div>)', lambda mo: mo.group(1) + '\n        ' + DISCLAIMER, h, count=1)
        stats['footer'] += 1

    # 5. visible updated date beside the reviewer credit
    if not hub and 'class="ml-updated"' not in h:
        def upd(mo):
            return mo.group(1) + f' · <span class="ml-updated">Updated <time datetime="{last}">{fmt_date(last)}</time></span>' + mo.group(2)
        h2 = re.sub(r'(<p class="ml-reviewed"[^>]*>[\s\S]*?</a>)(</p>)', upd, h, count=1)
        if h2 != h:
            h = h2
            stats['updated'] += 1

    # 6. skip link to the first <main>
    if 'class="skip-link"' not in h and '<main' in h:
        mm = re.search(r'<main\b([^>]*)>', h)
        idm = re.search(r'\bid="([^"]+)"', mm.group(1))
        target = idm.group(1) if idm else 'main'
        if not idm:
            h = h[:mm.start()] + '<main id="main"' + mm.group(1) + '>' + h[mm.end():]
        h = re.sub(r'(<body\b[^>]*>)', lambda b: b.group(1) + f'\n<a class="skip-link" href="#{target}">Skip to content</a>', h, count=1)
        if 'id="skipLinkCss"' not in h:
            if re.search(r'<link rel="canonical"[^>]*>', h):
                h = re.sub(r'(<link rel="canonical"[^>]*>)', lambda c: c.group(1) + '\n' + SKIP_CSS, h, count=1)
            else:
                h = h.replace('</head>', SKIP_CSS + '\n</head>', 1)
        stats['skip'] += 1
    # llms.txt reference, next to the canonical link (inside every head template)
    if 'href="/llms.txt"' not in h:
        h2 = re.sub(r'(<link rel="canonical"[^>]*>)', lambda c: c.group(1) + '\n' + LLMS_LINK, h, count=1)
        if h2 != h:
            h = h2; stats['llms'] += 1
    # header logo: the most likely LCP image, fetch it first
    hm = re.search(r'<header\b[\s\S]*?</header>', h)
    if hm and 'fetchpriority=' not in hm.group(0):
        seg = re.sub(r'<img src="(/icons/icon-[^"]+)"', r'<img src="\1" fetchpriority="high"', hm.group(0), count=1)
        if seg != hm.group(0):
            h = h[:hm.start()] + seg + h[hm.end():]; stats['logo'] += 1
    # question-image alt text <= ~120 chars
    h2 = ALT_RE.sub(short_alt, h)
    if h2 != h:
        h = h2; stats['alt'] += 1
    # social profiles in the footer
    if 'class="footer-social"' not in h and 'class="footer-disclaimer"' in h:
        h = re.sub(r'(<p class="footer-disclaimer">[\s\S]*?</p>)', lambda f: f.group(1) + '\n        ' + SOCIAL_ROW, h, count=1)
        stats['social'] += 1

    if h != orig:
        stats['files'] += 1
        if not DRY:
            open(path, 'w', encoding='utf-8').write(h)

files = sorted(f for f in glob.glob('**/*.html', recursive=True) if not f.startswith(SKIP_PREFIX))
for f in files:
    fix(f)
print(json.dumps(stats))
for w, p, d in sorted(long_left, reverse=True):
    print(f'long description {w}px  {p}  :: {d}')
