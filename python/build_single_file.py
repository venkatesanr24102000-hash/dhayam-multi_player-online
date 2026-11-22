"""Builds ONE self-contained HTML file (css, js, sounds and images inlined) -> dist/dhayam-single.html
Usage: python python/build_single_file.py"""
import re, base64, os, mimetypes
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
rd = lambda p: open(os.path.join(root, p), encoding='utf-8').read()
def uri(p):
    mime = {'.wav': 'audio/wav', '.mp3': 'audio/mpeg'}.get(os.path.splitext(p)[1]) or mimetypes.guess_type(p)[0]
    return f'data:{mime};base64,' + base64.b64encode(open(os.path.join(root, p), 'rb').read()).decode()
h = rd('index.html')
h = re.sub(r'<link rel="stylesheet" href="([^"]+)">', lambda m: '<style>' + rd(m.group(1)) + '</style>', h)
h = re.sub(r'(<audio[^>]*src=")([^"]+)(")', lambda m: m.group(1) + uri(m.group(2)) + m.group(3), h)
js = ''.join(rd(s) + '\n' for s in re.findall(r'<script src="([^"]+)"></script>', h))
js = re.sub(r"'(assets/images/[^']+)'", lambda m: "'" + uri(m.group(1)) + "'", js)
h = re.sub(r'(<script src="[^"]+"></script>\s*)+', lambda m: '<script>' + js + '</script>\n', h, count=1)
h = re.sub(r'<link rel="(manifest|apple-touch-icon)"[^>]*>\s*', '', h)
h = re.sub(r"<script>if\('serviceWorker'.*?</script>\s*", '', h, flags=re.S)
os.makedirs(os.path.join(root, 'dist'), exist_ok=True)
open(os.path.join(root, 'dist', 'dhayam-single.html'), 'w', encoding='utf-8').write(h)
print('written dist/dhayam-single.html', len(h) // 1024, 'KB')
