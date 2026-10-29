"""Refresh data/players.json (Sleeper) and data/ktc.json (KeepTradeCut superflex). Run daily by GitHub Actions."""
import html as htmllib, json, re, sys, urllib.request, datetime, pathlib
OUT = pathlib.Path(__file__).resolve().parent.parent / "data"
UA = {"User-Agent": "Mozilla/5.0 (SPDL league hub; daily refresh)"}
now = datetime.datetime.now(datetime.timezone.utc).isoformat()

def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
        return r.read().decode("utf-8")

def players():
    raw = json.loads(get("https://api.sleeper.app/v1/players/nfl"))
    out = {}
    for pid, p in raw.items():
        pos = p.get("position")
        if pos not in ("QB", "RB", "WR", "TE", "K", "DEF"):
            continue
        name = p.get("full_name") or f"{p.get('first_name','')} {p.get('last_name','')}".strip() or pid
        out[pid] = [name, pos, p.get("team"), p.get("age")]
    (OUT / "players.json").write_text(json.dumps({"gen": now, "players": out}, separators=(",", ":")))
    print("players:", len(out))

def ktc():
    html = get("https://keeptradecut.com/dynasty-rankings?page=0&filters=QB|WR|RB|TE|RDP&format=2")
    # The full list lives in <script id="ktc-players" type="application/json">…</script>.
    m = re.search(r'id=["\']ktc-players["\'][^>]*>(.*?)</script>', html, re.S)
    if not m:
        raise RuntimeError(f"KTC ktc-players block not found ({len(html)} bytes)")
    arr = json.loads(htmllib.unescape(m.group(1).strip()) if m.group(1).lstrip().startswith("&") else m.group(1))
    plist, picks = [], {}
    for p in arr:
        v = (p.get("superflexValues") or {}).get("value") or p.get("value") or 0
        if p.get("position") == "RDP":
            picks[p["playerName"]] = v
        else:
            plist.append([p["playerName"], p.get("position"), p.get("team"), p.get("age"), v])
    if len(plist) < 200:
        raise RuntimeError(f"Only {len(plist)} KTC players parsed; refusing to overwrite")
    (OUT / "ktc.json").write_text(json.dumps({"gen": now, "players": plist, "picks": picks}, separators=(",", ":")))
    print("ktc players:", len(plist), "picks:", len(picks))

if __name__ == "__main__":
    status = {"gen": now}
    for fn in (players, ktc):
        try:
            fn(); status[fn.__name__] = "ok"
            if fn is ktc:
                k = json.loads((OUT / "ktc.json").read_text()); status["ktc_count"] = [len(k["players"]), len(k["picks"])]; status["ktc_top"] = sorted(k["players"], key=lambda x: -x[4])[:3]
        except Exception as e:
            status[fn.__name__] = f"failed: {type(e).__name__}: {e}"[:1500]
            print(f"{fn.__name__} failed: {e}", file=sys.stderr)
    (OUT / "refresh_status.json").write_text(json.dumps(status, indent=1))
