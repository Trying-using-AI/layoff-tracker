import sys, json
from pypdf import PdfReader
def info(path, pw=None):
    r = PdfReader(path)
    if r.is_encrypted:
        ok = r.decrypt(pw or '')
        if not ok: return {'encrypted': True, 'decrypted': False}
    pages = []
    for p in r.pages:
        try: t = (p.extract_text() or '').strip().replace('\n', ' | ')
        except Exception as e: t = 'ERR ' + str(e)
        pages.append({'w': round(float(p.mediabox.width), 1), 'h': round(float(p.mediabox.height), 1), 'rot': int(p.get('/Rotate', 0) or 0), 'text': t[:90]})
    def walk(o, d=0):
        out = []
        for x in o:
            if isinstance(x, list): out += walk(x, d+1)
            else:
                try: out.append((d, x.title, r.get_destination_page_number(x)))
                except Exception: out.append((d, getattr(x, 'title', '?'), None))
        return out
    try: ol = walk(r.outline)
    except Exception: ol = []
    md = r.metadata or {}
    return {'n': len(r.pages), 'encrypted': r.is_encrypted, 'pages': pages, 'outline': ol, 'meta': {k: str(v) for k, v in md.items()}}
if __name__ == '__main__':
    print(json.dumps(info(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None), ensure_ascii=False))
