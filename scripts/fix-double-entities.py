#!/usr/bin/env python3
"""Fix double-escaped HTML entities on static topic pages (e.g. a visible
"Adler&rsquo;s" caused by &amp;rsquo; in the markup).  Idempotent.
  python3 scripts/fix-double-entities.py [--dry]
HTML body: &amp;name;  ->  &name;   (browser then shows the real character)
JSON-LD:   &amp;name;  ->  the real character (JSON-LD is not HTML-decoded)
"""
import glob, html, re, sys
DRY = '--dry' in sys.argv
PAT = re.compile(r'&amp;(#\d+|#x[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]{1,9});')
LD = re.compile(r'(<script type="application/ld\+json">)(.*?)(</script>)', re.S)

def dec(m):
    ch = html.unescape('&' + m.group(1) + ';')
    return ch if not ch.startswith('&') else m.group(0)

def fix(src):
    parts, last, out = [], 0, []
    for m in LD.finditer(src):
        out.append(PAT.sub(lambda x: '&' + x.group(1) + ';', src[last:m.start()]))
        body = PAT.sub(dec, m.group(2)).replace(' ', ' ')
        out.append(m.group(1) + body + m.group(3))
        last = m.end()
    out.append(PAT.sub(lambda x: '&' + x.group(1) + ';', src[last:]))
    return ''.join(out)

n = 0
for f in sorted(glob.glob('subjects/**/index.html', recursive=True)):
    s = open(f, encoding='utf-8').read()
    t = fix(s)
    if t != s:
        n += 1
        if not DRY: open(f, 'w', encoding='utf-8').write(t)
print(('would change' if DRY else 'changed'), n, 'pages')
