"""Build data/ktc_hist.json: weekly KeepTradeCut value history (superflex and 1QB) for every player and
future pick that appears in an SPDL trade. Used to grade trades on each asset's average value
between the trade date and today. Run weekly by GitHub Actions."""
import html as htmllib, json, re, sys, time, datetime, pathlib, urllib.request, urllib.error

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "data"
UA = {"User-Agent": "Mozilla/5.0 (SPDL league hub; weekly history refresh)"}
BASE = "https://keeptradecut.com"

# Players whose KTC page uses a different name, or who are no longer in KTC's rankings or sitemaps.
MANUAL = {
    "Le'Veon Bell": "le-veon-bell-263", "T.Y. Hilton": "ty-hilton-300", "Emmanuel Sanders": "emmanuel-sanders-403",
    "Gabe Davis": "gabriel-davis-533", "William Fuller": "will-fuller-213", "Eric Ebron": "eric-ebron-387",
}

def get(path, tries=3):
    for k in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(BASE + path, headers=UA), timeout=60) as r:
                return r.read().decode("utf-8")
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            time.sleep(3 * (k + 1))
        except Exception:
            time.sleep(3 * (k + 1))
    return None

def norm(s):
    s = re.sub(r"\b(jr|sr|ii|iii|iv|v)\b\.?", "", s.lower())
    return re.sub(r"[^a-z]", "", s)

def trade_names():
    d = json.loads((OUT / "static.json").read_text())
    names, picks = set(), set()
    for t in d["trades"]:
        for s in t[3]:
            for it in (s[2] or "").split("; "):
                m = re.match(r"^\d{4} R\d → (.+) \([A-Z]+\)$", it) or re.match(r"^(?!\d{4} R)(.+) \([A-Z?]+\)$", it)
                if m:
                    names.add(m.group(1))
                    continue
                m = re.match(r"^(\d{4}) R(\d) \(", it)
                if m:
                    picks.add(f"{m.group(1)} Mid {['1st', '2nd', '3rd', '4th'][int(m.group(2)) - 1]}")
    return sorted(names), sorted(picks)

def slug_index():
    idx = {}
    for sm in ("/sitemap-dynasty.xml", "/sitemap-fantasy.xml"):
        t = get(sm) or ""
        for s in re.findall(r"players/([a-z0-9-]+)", t):
            idx.setdefault(norm(re.sub(r"-\d+$", "", s)), s)
    t = get("/dynasty-rankings?page=0&filters=QB|WR|RB|TE|RDP&format=2") or ""
    m = re.search(r'id=["\']ktc-players["\'][^>]*>(.*?)</script>', t, re.S)
    if m:
        raw = m.group(1)
        for p in json.loads(htmllib.unescape(raw) if raw.lstrip().startswith("&") else raw):
            if p.get("slug"):
                idx[norm(p["playerName"])] = p["slug"]
    return idx

def weekly(series):
    """[{d:'yymmdd', v}] -> [[yymmdd, v], ...] keeping one point per 7 days plus the last point."""
    out, last = [], None
    for pt in series:
        d = datetime.datetime.strptime(pt["d"], "%y%m%d").date()
        if last is None or (d - last).days >= 7:
            out.append([int(pt["d"]), int(pt["v"])])
            last = d
    if series and (not out or out[-1][0] != int(series[-1]["d"])):
        out.append([int(series[-1]["d"]), int(series[-1]["v"])])
    return out

def history(slug):
    t = get("/dynasty-rankings/players/" + slug)
    if not t:
        return None
    res = {}
    for key, el in (("sf", "pd-superflex"), ("q", "pd-oneqb")):
        m = re.search(r'id=["\']' + el + r'["\'][^>]*>(.*?)</script>', t, re.S)
        if m:
            raw = m.group(1)
            data = json.loads(htmllib.unescape(raw) if raw.lstrip().startswith("&") else raw)
            res[key] = weekly(data.get("overallValue") or [])
    return res if res.get("sf") else None

def main():
    names, picks = trade_names()
    idx = slug_index()
    out = {"gen": datetime.datetime.now(datetime.timezone.utc).isoformat(), "players": {}, "picks": {}, "missing": []}
    for n in names + picks:
        slug = MANUAL.get(n) or idx.get(norm(n))
        h = history(slug) if slug else None
        if h:
            (out["picks"] if n in picks else out["players"])[n] = h
        else:
            out["missing"].append(n)
        time.sleep(0.5)
    if len(out["players"]) < 200:
        raise SystemExit(f"Only {len(out['players'])} histories; refusing to overwrite")
    (OUT / "ktc_hist.json").write_text(json.dumps(out, separators=(",", ":")))
    print("players", len(out["players"]), "picks", len(out["picks"]), "missing", len(out["missing"]), out["missing"])

if __name__ == "__main__":
    main()
