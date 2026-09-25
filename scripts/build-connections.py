"""Build 100 distinct, source-backed Fotballkoblinger boards from Norway XI files.

Run manually after changing match data. The committed JSON is the editorial snapshot;
the runtime never invents a daily board or exposes future answers to the browser.
"""
import glob
import itertools
import json
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MATCHES = [json.loads(Path(p).read_text()) for p in glob.glob(str(ROOT / "data/source/matches/*.json"))]
MATCHES = sorted((m for m in MATCHES if m["status"] in ("verified", "single_source")
                  and len(m.get("lineup", [])) == 11 and m.get("sources")), key=lambda m: m["id"])
BUCKETS = [(1990, 1998), (1999, 2007), (2008, 2016), (2017, 2026)]
RNG = random.Random(281117)


def members(match):
    return {p["name"] for p in match["lineup"]}


def group(match, other=None):
    people = members(match) if other is None else members(match) & members(other)
    if len(people) < 4:
        return None
    match_ids = [match["id"]] + ([other["id"]] if other else [])
    dates = [match["date"]] + ([other["date"]] if other else [])
    def format_date(d):
        return f"{int(d[8:10])}.{int(d[5:7])}.{d[:4]}"
    label = (f"Startet mot {match['opponent']} {format_date(match['date'])}"
             if not other else f"Startet både mot {match['opponent']} {format_date(match['date'])} og {other['opponent']} {format_date(other['date'])}")
    sources = [{"title": s["title"], "url": s["url"]} for m in (match, other) if m for s in m["sources"] if s.get("url")]
    return {"id": "xi-" + "--".join(match_ids), "label": label, "members": sorted(people),
            "matchIds": match_ids, "sources": sources, "status": "single_source"}


def candidates(low, high):
    subset = [m for m in MATCHES if low <= int(m["date"][:4]) <= high]
    singles = [group(m) for m in subset]
    doubles = [group(a, b) for a, b in itertools.combinations(subset, 2)
               if abs(int(a["date"][:4]) - int(b["date"][:4])) <= 1]
    doubles = [g for g in doubles if g and len(g["members"]) >= 5]
    RNG.shuffle(singles)
    RNG.shuffle(doubles)
    return singles + doubles


POOLS = [candidates(a, b) for a, b in BUCKETS]
BOARDS = []
USED = set()
USED_QUARTETS = set()
for day in range(100):
    found = None
    # Prefer single-match clues; pair clues fill the 41+ missing slots.
    for attempt in range(6000):
        chosen = []
        for pool in POOLS:
            available = [g for g in pool if g["id"] not in USED]
            if not available:
                break
            # Prefer a single, easy-to-explain match; try two-match intersections only
            # when singles are exhausted or cannot form four exclusive groups.
            singles = [g for g in available if len(g["matchIds"]) == 1]
            preferred = singles if singles and attempt < 3000 else available
            g = preferred[(day * 17 + attempt * 127 + len(chosen) * 13) % len(preferred)]
            chosen.append(g)
        if len(chosen) != 4:
            continue
        exclusive = [sorted(set(g["members"]) - set().union(*(set(h["members"]) for h in chosen if h is not g))) for g in chosen]
        if min(map(len, exclusive)) < 4:
            continue
        quartets = [tuple(RNG.sample(people, 4)) for people in exclusive]
        if any(tuple(sorted(q)) in USED_QUARTETS for q in quartets):
            continue
        found = (chosen, quartets)
        break
    if not found:
        raise RuntimeError(f"Cannot fill day {day + 1} with exclusive, fresh connections")
    chosen, quartets = found
    for g, q in zip(chosen, quartets):
        USED.add(g["id"])
        USED_QUARTETS.add(tuple(sorted(q)))
    cards = [{"id": f"{day+1:03d}-{i}-{j}", "name": name, "groupId": chosen[i]["id"]}
             for i, q in enumerate(quartets) for j, name in enumerate(q)]
    RNG.shuffle(cards)
    BOARDS.append({"id": f"koblinger-{day+1:03d}", "groups": [
        {"id": g["id"], "label": g["label"], "members": list(q), "matchIds": g["matchIds"],
         "sources": g["sources"], "status": g["status"]} for g, q in zip(chosen, quartets)],
        "cards": cards})

path = ROOT / "data/source/fotballkoblinger.json"
path.write_text(json.dumps(BOARDS, ensure_ascii=False, indent=2) + "\n")
print(f"Wrote {len(BOARDS)} boards, {len(USED)} unique connections, {len(USED_QUARTETS)} distinct quartets to {path}")
