#!/usr/bin/env python3
"""Import the reviewed XI workbook without manufacturing source facts.

The workbook has complete starting elevens and a source URL, but no positions,
shirt numbers, competition or venue.  It therefore imports a known goalkeeper
and `OUT` for the other starters, preserves the exact source URL, and assigns
`single_source` rather than upgrading the workbook's label to our stricter
two-source `verified` status.

Usage:
  python3 scripts/import/import_verified_xi.py --workbook /path/to/file.xlsx --dry-run
  python3 scripts/import/import_verified_xi.py --workbook /path/to/file.xlsx
"""

import argparse
import json
import re
import unicodedata
from pathlib import Path
from urllib.parse import urlparse

from openpyxl import load_workbook


ROOT = Path(__file__).resolve().parents[2]
MATCH_DIR = ROOT / "data" / "source" / "matches"
TEAM_FILE = ROOT / "scripts" / "import" / "national-teams.ts"

# These are display/canonical-name normalisations only. They are used to avoid
# creating two answer identities for the same player; no player is merged based
# merely on a fuzzy name match.
NAME_FIXES = {
    "Karl Petter Løken": "Karl-Petter Løken",
    "Lars Bohinen": "Lars Roar Bohinen",
    "Per Egil Ahlsen": "Per-Egil Ahlsen",
    "Ole-Martin Årst": "Ole Martin Årst",
    "Christer Basma": "Ole Christer Basma",
    "Andre Bergdølmo": "André Bergdølmo",
    "Harald Martin Brattbakk": "Harald Brattbakk",
    "John Alieu Carew": "John Carew",
    "Claus Eftevaag": "Claus Lehland Eftevaag",
    "Geir Frigård": "Geir Arild Frigård",
    "Alfe-Inge Haaland": "Alf-Inge Håland",
    "Alfie Haaland": "Alf-Inge Håland",
    "Brede Paulsen Hangeland": "Brede Hangeland",
    "Thorstein Heggem Helstad": "Thorstein Helstad",
    "Thomas Myhre": "Thomas Harald Myhre",
    "Pa Modou Kah": "Pa-Modou Kah",
    "Håkon Opdal": "Håkon Eikemo Opdal",
    "Egil Østenstad": "Egil Johan Østenstad",
    "Thomas Pereira": "Thomas Austin Pereira",
    "Kjetil Rekdal": "Kjetil André Rekdal",
    "John Arne Riise": "John Arne Semundseth Riise",
    "Petter Rudi": "Petter Normann Rudi",
    "Bent Skammelsrud": "Bent André Skammelsrud",
    "Jarl-Andre Storbæk": "Jarl-André Storbæk",
    "Jo Tessem": "Jo Stuen Tessem",
    "Alexander Tettey": "Alexander Banor Tettey",
    "Fredrik Winsnes": "Fredrik Lærum Winsnes",
    "Jean Ronny Johnsen": "Ronny Johnsen",
    "Mini Jakobsen": "Jan Ove Jakobsen",
    "Tore André Pedersen": "Tore Pedersen",
}

# Goalkeepers are the only position data carried into these files. This list is
# explicit so a new or unrecognised name fails the import rather than guessing.
GOALKEEPERS = {
    "Ola By Rise", "Erik Thorstvedt", "Einar Rossbach", "Frode Grodås",
    "Erik Holtan", "Espen Baardsen", "Espen Bugge Pettersen", "Espen Johnsen",
    "Frode Olsen", "Håkon Eikemo Opdal", "Jon Knudsen", "Kenneth Høie",
    "Jørn Jamtfall", "Morten Bakke", "Rune Almenning Jarstein", "Sten Grytebust", "Ørjan Håskjold Nyland",
    "Terje Stenehjem Skjeldestad", "Thomas Gill", "Thomas Harald Myhre", "André Hansen",
}


def key(value: str) -> str:
    plain = "".join(c for c in unicodedata.normalize("NFKD", value) if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", " ", plain.lower()).strip()


def team_lookup() -> dict[str, tuple[str, str]]:
    text = TEAM_FILE.read_text(encoding="utf-8")
    teams: dict[str, tuple[str, str]] = {}
    pattern = re.compile(r'^\s{2}([A-Z]{3}): \{ en: "([^"]+)", nb: "([^"]+)"(?:, aliases: \[([^\]]*)\])? \},?$', re.M)
    for code, english, norwegian, raw_aliases in pattern.findall(text):
        for name in [english, norwegian, *re.findall(r'"([^"]+)"', raw_aliases)]:
            teams[key(name)] = (code, norwegian)
    return teams


def source_title(url: str, opponent: str, date: str) -> str:
    host = urlparse(url).hostname or "kampkilde"
    return f"{host} – Norge mot {opponent}, {date}"


def import_rows(workbook: Path, dry_run: bool) -> dict[str, int]:
    teams = team_lookup()
    existing = {p.stem for p in MATCH_DIR.glob("*.json")}
    ws = load_workbook(workbook, read_only=True, data_only=True)["Kamper"]
    header = [str(c.value or "") for c in next(ws.iter_rows(min_row=1, max_row=1))]
    expected = ["Dato", "Motstander", "Resultat (Norge)", "H/B", *[f"Spiller {n}" for n in range(1, 12)], "Kilde", "Status"]
    if header != expected:
        raise ValueError(f"Unexpected columns: {header}")

    pending: list[tuple[str, dict]] = []
    skipped = 0
    row_count = 0
    for line, row in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
        row_count += 1
        date, opponent_raw, result, home_away, *rest = row
        player_cells, url, sheet_status = rest[:11], rest[11], rest[12]
        if sheet_status != "VERIFISERT":
            raise ValueError(f"Row {line}: status is {sheet_status!r}, expected VERIFISERT")
        if not isinstance(date, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", date):
            raise ValueError(f"Row {line}: invalid date {date!r}")
        team = teams.get(key(str(opponent_raw)))
        if not team:
            raise ValueError(f"Row {line}: unknown opponent {opponent_raw!r}")
        code, opponent = team
        match_id = f"{date}-{'nor' if home_away == 'H' else code.lower()}-{'nor' if home_away == 'B' else code.lower()}"
        if home_away not in {"H", "B"}:
            raise ValueError(f"Row {line}: invalid H/B value {home_away!r}")
        if match_id in existing:
            skipped += 1
            continue
        score = re.fullmatch(r"(\d+)-(\d+)", str(result))
        if not score:
            raise ValueError(f"Row {line}: invalid result {result!r}")
        if not isinstance(url, str) or not url.startswith(("https://", "http://")):
            raise ValueError(f"Row {line}: missing or invalid source URL")
        names = [NAME_FIXES.get(str(name).strip(), str(name).strip()) for name in player_cells]
        if len(names) != 11 or any(not name for name in names):
            raise ValueError(f"Row {line}: incomplete starting eleven")
        keepers = [name for name in names if name in GOALKEEPERS]
        if len(keepers) != 1:
            raise ValueError(f"Row {line}: expected one known goalkeeper, got {keepers}")
        pending.append((match_id, {
            "id": match_id,
            "date": date,
            "competition": "friendly",
            "opponent": opponent,
            "opponentCode": code,
            "norwayHome": home_away == "H",
            "score": [int(score.group(1)), int(score.group(2))],
            "importance": 2,
            "tags": ["import:verified-xi-workbook", "position:undocumented"],
            "status": "single_source",
            "sources": [{
                "url": url,
                "title": source_title(url, opponent, date),
                "kind": "web",
                "accessed": "2026-09-11",
                "note": "Komplett faktisk startellever importert fra kontrollert arbeidsbok. Kilden dokumenterer ikke posisjonene; bare keeper er angitt.",
            }],
            "notes": "Startelleveren er dokumentert. Utespillernes roller og draktnumre er bevisst ikke antatt.",
            "goalsPartial": True,
            "lineup": [{"name": name, "pos": "GK" if name in GOALKEEPERS else "OUT"} for name in names],
        }))

    if not dry_run:
        for match_id, record in pending:
            (MATCH_DIR / f"{match_id}.json").write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {"workbook_rows": row_count, "already_present": skipped, "created": len(pending)}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--workbook", type=Path, required=True)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    print(json.dumps(import_rows(args.workbook, args.dry_run), ensure_ascii=False))
