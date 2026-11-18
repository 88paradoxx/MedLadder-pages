"""Add one image MCQ card (from the question bank) to each static topic page.
Input: JSON list of rows {id, subject, module, question_text, option_a..e, answer, explanation}.
Usage: add_image_mcq.py ROWS.json [--only SLUGPATH]"""
import html, json, re, sys
from html.parser import HTMLParser

R2 = 'https://pub-5e62ac2b4d1c43fcb7fb6b025a52e189.r2.dev'
MARK = 'data-ml-image-mcq'

def slug(v): return re.sub(r'^-|-$', '', re.sub(r'[^a-z0-9]+', '-', str(v or '').lower()))

def r2(src):
    m = re.match(r'^https?://[^/]+\.supabase\.co/storage/v1/(?:object|render/image)/public/question-images/([^?#]+)', src or '')
    return R2 + '/' + m.group(1) if m else (src or '')

def plain(h):
    t = re.sub(r'<[^>]*>', ' ', h or ''); t = html.unescape(t).replace('\xa0', ' ')
    return re.sub(r'\s+', ' ', t).strip()

def snippet(t, n=110):
    return t if len(t) <= n else re.sub(r'\s+\S*$', '', t[:n]) + '…'

ALLOWED = {'p','ul','ol','li','strong','b','em','i','br','sub','sup','table','thead','tbody','tr','td','th','span','div'}
class Clean(HTMLParser):
    def __init__(self, alt):
        super().__init__(convert_charrefs=False); self.out = []; self.alt = alt; self.skip = 0
    def handle_starttag(self, tag, attrs):
        if tag in ('script','style','iframe','object'): self.skip += 1; return
        if self.skip: return
        if tag == 'img':
            src = r2(dict(attrs).get('src', ''))
            if src.startswith('https://'):
                self.out.append('<img src="%s" alt="%s" loading="lazy" decoding="async" style="max-width:100%%;height:auto;border-radius:10px;display:block;margin:10px 0;">' % (html.escape(src, True), html.escape(self.alt, True)))
            return
        if tag in ALLOWED: self.out.append('<%s>' % tag)
    def handle_startendtag(self, tag, attrs): self.handle_starttag(tag, attrs)
    def handle_endtag(self, tag):
        if tag in ('script','style','iframe','object'): self.skip = max(0, self.skip - 1); return
        if self.skip or tag == 'img': return
        if tag in ALLOWED and tag != 'br': self.out.append('</%s>' % tag)
    def handle_data(self, d):
        if not self.skip: self.out.append(html.escape(html.unescape(d), quote=False))
    def handle_entityref(self, n):
        if not self.skip: self.out.append('&%s;' % n)
    def handle_charref(self, n):
        if not self.skip: self.out.append('&#%s;' % n)

def clean(h, alt):
    c = Clean(alt); c.feed(h or ''); c.close(); return ''.join(c.out).strip()

def build(row, num):
    q_plain = plain(row['question_text'])
    sn = snippet(q_plain)
    topic = '%s (%s)' % (row['module'], row['subject'])
    q_alt = '%s: image for the MCQ “%s”' % (topic, sn)
    e_alt = '%s: explanation image for the MCQ “%s”' % (topic, sn)
    imgs = re.findall(r'<img\b[^>]*>', row['question_text'] or '', re.I)
    img_html = ''.join(clean(t, q_alt) for t in imgs)
    letters = [L for L in 'ABCDE' if (row.get('option_' + L.lower()) or '').strip()]
    opts = ''.join('<div class="seo-opt"><span class="letter">%s</span><span>%s</span></div>' % (L, html.escape(plain(row['option_' + L.lower()]))) for L in letters)
    ans = (row.get('answer') or '').strip().upper()[:1]
    ans_txt = plain(row.get('option_' + ans.lower()) or '') if ans else ''
    expl = clean(row.get('explanation') or '', e_alt)
    card = ('<article class="seo-qcard" %s="%s"><div class="qnum-eyebrow" style="color:var(--accent);font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;margin-bottom:8px;">Sample MCQ #%d · Image-based</div>'
            '<h3 style="font-size:16.5px;font-weight:700;line-height:1.45;margin:0 0 14px;color:var(--ink);">%s</h3>%s'
            '<div style="margin-bottom:12px;">%s</div>'
            '<details style="margin-top:12px;"><summary class="btn secondary" style="display:inline-flex;align-items:center;gap:6px;font-size:12.5px;padding:8px 16px;cursor:pointer;list-style:none;">Show Answer &amp; Explanation ▾</summary>'
            '<div class="explain show" style="display:block;margin-top:12px;border-left:4px solid var(--accent);"><div class="exlabel" style="color:var(--green);font-weight:800;margin-bottom:8px;">✓ Correct Answer: %s. %s</div>'
            '<div class="seo-ex" style="margin:0;line-height:1.65;color:var(--ink);font-size:14.5px;">%s</div></div></details></article>') % (
            MARK, row['id'], num, html.escape(q_plain), img_html, opts, ans, html.escape(ans_txt), expl)
    first_img = re.search(r'src="([^"]+)"', img_html)
    part = {'@type': 'Question', 'eduQuestionType': 'Multiple choice', 'text': q_plain,
            'suggestedAnswer': [{'@type': 'Answer', 'position': i + 1, 'text': plain(row['option_' + L.lower()]), 'encodingFormat': 'text/plain'} for i, L in enumerate(letters)],
            'acceptedAnswer': {'@type': 'Answer', 'position': letters.index(ans) + 1 if ans in letters else 1, 'text': ans_txt,
                               'answerExplanation': {'@type': 'Comment', 'text': snippet(plain(row.get('explanation') or ''), 300)}}}
    if first_img: part['image'] = {'@type': 'ImageObject', 'url': html.unescape(first_img.group(1)), 'caption': q_alt}
    return card, part

def patch(path, row):
    s = open(path, encoding='utf-8').read()
    if MARK in s: return 'already'
    cards = list(re.finditer(r'<article class="seo-qcard"[\s\S]*?</article>', s))
    if not cards: return 'no-cards'
    card, part = build(row, len(cards) + 1)
    end = cards[-1].end(); s = s[:end] + card + s[end:]
    def addpart(m):
        try: d = json.loads(m.group(2))
        except Exception: return m.group(0)
        if d.get('@type') != 'Quiz': return m.group(0)
        d.setdefault('hasPart', []).append(part)
        return m.group(1) + '\n' + json.dumps(d, ensure_ascii=False, indent=2) + '\n' + m.group(3)
    s = re.sub(r'(<script type="application/ld\+json">)(.*?)(</script>)', addpart, s, flags=re.S)
    open(path, 'w', encoding='utf-8').write(s); return 'ok'

if __name__ == '__main__':
    rows = json.load(open(sys.argv[1])); only = sys.argv[3] if len(sys.argv) > 3 and sys.argv[2] == '--only' else None
    from collections import Counter; res = Counter(); missing = []
    for r in rows:
        p = 'subjects/%s/%s/index.html' % (slug(r['subject']), slug(r['module']))
        if only and only not in p: continue
        try: res[patch(p, r)] += 1
        except FileNotFoundError: res['no-page'] += 1; missing.append(p)
    print(dict(res)); print('missing pages:', missing[:10])
