#!/usr/bin/env python3
"""DEPRECATED — use build-nutrition-seed-from-slv.py (Livsmedelsverket + USDA gaps).

Legacy: rebuild from worker PER_100G/PIECE_G (removed from gemini.ts).
"""
from __future__ import annotations

raise SystemExit(
    "Deprecated: run scripts/fetch-slv-catalog.py then scripts/build-nutrition-seed-from-slv.py"
)

# --- legacy body kept below for reference; unreachable ---

import json
import re
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
GEMINI = ROOT / "worker/src/gemini.ts"
OUT = ROOT / "scripts/nutrition-seed.json"


def extract_tables(src: str):
    m = re.search(r"const PER_100G[\s\S]*?= \[([\s\S]*?)\];\n\n/\*\* Styckvikter", src)
    chunk = m.group(1)
    per100 = []
    for em in re.finditer(
        r"\{\s*re:\s*/((?:\\.|[^/])+)/([a-z]*)\s*,\s*m:\s*\{\s*kcal:\s*([-\d.]+)\s*,\s*prot:\s*([-\d.]+)\s*,\s*carb:\s*([-\d.]+)\s*,\s*fat:\s*([-\d.]+)\s*\}\s*\}",
        chunk,
    ):
        per100.append(
            {
                "pat": em.group(1),
                "kcal": float(em.group(3)),
                "prot": float(em.group(4)),
                "carb": float(em.group(5)),
                "fat": float(em.group(6)),
            }
        )
    pm = re.search(r"const PIECE_G[\s\S]*?= \[([\s\S]*?)\];\n\n/\*\* Ungefärlig", src)
    piece_chunk = pm.group(1)
    pieces = []
    for em in re.finditer(
        r"\{\s*re:\s*/((?:\\.|[^/])+)/([a-z]*)\s*,\s*g:\s*([-\d.]+)\s*\}", piece_chunk
    ):
        pieces.append({"pat": em.group(1), "g": float(em.group(3))})
    return per100, pieces


def clean_alt(s: str) -> list[str]:
    s = s.strip()
    if not s:
        return []
    while True:
        n = re.sub(r"\(\?[=<!][^)]*\)", "", s)
        if n == s:
            break
        s = n
    s = s.replace("(?:", "(")

    def cls_repl(m):
        body = m.group(1)
        if body.startswith("^"):
            return ""
        letters = []
        for c in re.findall(r"\\.|[^\\\]]", body):
            if c.startswith("\\"):
                continue
            if c.isalpha() or c in "åäöÅÄÖ":
                letters.append(c.lower())
        return letters[0] if letters else ""

    s = re.sub(r"\[([^\]]+)\]", cls_repl, s)
    s = s.replace("\\s", " ").replace("\\b", "").replace("\\B", "")
    s = re.sub(r"\\([./+*?|()[\]{}\\])", r"\1", s)
    s = re.sub(r"[+*?]", "", s)
    s = re.sub(r"\{[^}]*\}", "", s)
    s = s.replace("(", " ").replace(")", " ")
    s = re.sub(r"\s+", " ", s).strip().lower().strip(" .-_")
    if not s or len(s) < 2:
        return []
    if re.search(r"[^a-zåäö0-9 %.\-]", s):
        s2 = re.sub(r"[^a-zåäö0-9 %.\-]", "", s).strip()
        if len(s2) < 2:
            return []
        s = s2
    return [s]


def alts_from_pat(pat: str) -> list[str]:
    parts = []
    depth = 0
    cur = []
    i = 0
    while i < len(pat):
        ch = pat[i]
        if ch == "\\":
            cur.append(ch)
            if i + 1 < len(pat):
                cur.append(pat[i + 1])
                i += 2
                continue
        if ch == "(":
            depth += 1
            cur.append(ch)
        elif ch == ")":
            depth = max(0, depth - 1)
            cur.append(ch)
        elif ch == "|" and depth == 0:
            parts.append("".join(cur))
            cur = []
        else:
            cur.append(ch)
        i += 1
    parts.append("".join(cur))
    aliases = []
    seen = set()
    for p in parts:
        for a in clean_alt(p):
            if a not in seen:
                seen.add(a)
                aliases.append(a)
    return aliases


def main():
    per100, pieces = extract_tables(GEMINI.read_text())
    ingredients = []
    alias_owner = {}

    for e in per100:
        alts = alts_from_pat(e["pat"])
        if not alts:
            continue
        canon = alts[0]
        for a in alts:
            if re.search(r"[åäö]", a) or re.match(
                r"^(kyckling|nöt|fläsk|lax|ägg|ost|mjölk|yoghurt|kvarg|keso)", a
            ):
                canon = a
                break
        row = {
            "id": len(ingredients) + 1,
            "canonical_name": canon,
            "category": None,
            "kcal_per_100g": e["kcal"],
            "protein_per_100g": e["prot"],
            "fat_per_100g": e["fat"],
            "carbs_per_100g": e["carb"],
            "piece_weight_g": None,
            "density_g_per_ml": None,
            "needs_review": 0,
            "aliases": [],
        }
        for a in alts:
            if a == canon:
                continue
            if a in alias_owner:
                continue
            alias_owner[a] = row["id"]
            row["aliases"].append(a)
        alias_owner.setdefault(canon, row["id"])
        ingredients.append(row)

    for p in pieces:
        for a in alts_from_pat(p["pat"]):
            iid = alias_owner.get(a)
            if iid is None:
                continue
            ing = ingredients[iid - 1]
            if ing["piece_weight_g"] is None:
                ing["piece_weight_g"] = p["g"]

    gaps = [
        dict(
            canonical_name="hjortfärs",
            aliases=["hjortfars", "viltfärs", "venison mince", "ground venison", "deer mince"],
            kcal_per_100g=120,
            protein_per_100g=21,
            fat_per_100g=4,
            carbs_per_100g=0,
            piece_weight_g=None,
            category="kott",
            needs_review=1,
        ),
        dict(
            canonical_name="rådjurfärs",
            aliases=["radjursfärs"],
            kcal_per_100g=120,
            protein_per_100g=21,
            fat_per_100g=4,
            carbs_per_100g=0,
            piece_weight_g=None,
            category="kott",
            needs_review=1,
        ),
        dict(
            canonical_name="palsternacka",
            aliases=["parsnip", "palsternackor"],
            kcal_per_100g=75,
            protein_per_100g=1.2,
            fat_per_100g=0.3,
            carbs_per_100g=18,
            piece_weight_g=120,
            category="gronsak",
            needs_review=0,
        ),
        dict(
            canonical_name="timjan",
            aliases=["thyme", "färsk timjan"],
            kcal_per_100g=101,
            protein_per_100g=5.6,
            fat_per_100g=1.7,
            carbs_per_100g=24,
            piece_weight_g=None,
            category="ort",
            needs_review=0,
        ),
        dict(
            canonical_name="rosmarin",
            aliases=["rosemary", "färsk rosmarin"],
            kcal_per_100g=131,
            protein_per_100g=3.3,
            fat_per_100g=5.9,
            carbs_per_100g=21,
            piece_weight_g=None,
            category="ort",
            needs_review=0,
        ),
        dict(
            canonical_name="kycklingbuljong",
            aliases=["chicken broth", "chicken stock", "kycklingfond", "fond kyckling"],
            kcal_per_100g=5,
            protein_per_100g=0.5,
            fat_per_100g=0,
            carbs_per_100g=0.5,
            piece_weight_g=None,
            category="buljong",
            needs_review=0,
        ),
        dict(
            canonical_name="grönsaksbuljong",
            aliases=["vegetable broth", "vegetable stock", "gronsaksbuljong"],
            kcal_per_100g=5,
            protein_per_100g=0.3,
            fat_per_100g=0,
            carbs_per_100g=0.7,
            piece_weight_g=None,
            category="buljong",
            needs_review=0,
        ),
        dict(
            canonical_name="nötbuljong",
            aliases=["beef broth", "beef stock"],
            kcal_per_100g=6,
            protein_per_100g=0.8,
            fat_per_100g=0.2,
            carbs_per_100g=0.4,
            piece_weight_g=None,
            category="buljong",
            needs_review=0,
        ),
        dict(
            canonical_name="vitlöksklyfta",
            aliases=["garlic clove"],
            kcal_per_100g=149,
            protein_per_100g=6.4,
            fat_per_100g=0.5,
            carbs_per_100g=33,
            piece_weight_g=3,
            category="gronsak",
            needs_review=0,
        ),
        dict(
            canonical_name="schalottenlök",
            aliases=["schalotten", "shallot", "schalottenlökar"],
            kcal_per_100g=72,
            protein_per_100g=2.5,
            fat_per_100g=0.1,
            carbs_per_100g=17,
            piece_weight_g=30,
            category="gronsak",
            needs_review=0,
        ),
    ]

    for g in gaps:
        if g["canonical_name"] in alias_owner:
            ing = ingredients[alias_owner[g["canonical_name"]] - 1]
            for a in g.get("aliases", []):
                if a not in alias_owner:
                    alias_owner[a] = ing["id"]
                    ing["aliases"].append(a)
            if g.get("piece_weight_g") and ing["piece_weight_g"] is None:
                ing["piece_weight_g"] = g["piece_weight_g"]
            continue
        nid = len(ingredients) + 1
        row = {
            "id": nid,
            "canonical_name": g["canonical_name"],
            "category": g.get("category"),
            "kcal_per_100g": g["kcal_per_100g"],
            "protein_per_100g": g["protein_per_100g"],
            "fat_per_100g": g["fat_per_100g"],
            "carbs_per_100g": g["carbs_per_100g"],
            "piece_weight_g": g.get("piece_weight_g"),
            "density_g_per_ml": None,
            "needs_review": g.get("needs_review", 0),
            "aliases": [],
        }
        alias_owner[g["canonical_name"]] = nid
        for a in g.get("aliases", []):
            if a not in alias_owner:
                alias_owner[a] = nid
                row["aliases"].append(a)
        ingredients.append(row)

    for ing in ingredients:
        if ing["canonical_name"] in ("vitlök", "vitlok") and not ing["piece_weight_g"]:
            ing["piece_weight_g"] = 3
        if ing["canonical_name"] == "lök" and not ing["piece_weight_g"]:
            ing["piece_weight_g"] = 80

    # Aliases lost in regex→literal extraction (were covered by old cascade).
    EXTRA_ALIASES = {
        "rökt paprika": [  # spice catch-all row (canonical varies by extract)
            "svartpeppar",
            "vitpeppar",
            "cayennepeppar",
            "vitlökspulver",
            "lökpulver",
            "chilipulver",
            "chiliflingor",
            "chiliflakes",
            "peperoncino",
            "torkad chili",
            "smulad torkad chili",
            "smulad torkad chili/peperoncino",
            "persiljeflakes",
            "flingsalt",
            "spiskummin",
            "gurkmeja",
            "kardemumma",
            "oregano",
            "kanel",
            "gochugaru",
            "sichuan",
            "sichuanpepparkorn",
            "tajín",
            "tajin",
            "torkad dill",
            "vitlökspasta",
        ],
        "sesamolja": ["rostad sesamolja", "sesame oil"],
        "sesamfrö": ["sesamfrön", "rostat sesamfrö", "rostat sesamfrön", "sesame seed"],
        "olivolja": ["extra virgin olivolja", "extra virgin olive oil"],
        "matolja": ["neutral matolja", "avokadoolja", "rapsolja"],
        "örter": ["bladpersilja", "thaibasilika", "koriander"],
        "miso": ["vit misopasta", "misopasta", "gochujangpasta", "gochujang"],
        "grekisk yoghurt": [
            "grekisk yoghurt 0%",
            "grekisk yoghurt 2%",
            "naturell grekisk yoghurt 0%",
            "tjock grekisk yoghurt",
            "tjock grekisk yoghurt 0%",
        ],
        "keso": ["keso 4%", "keso 1,5%", "keso 1.5%"],
        "kvarg": [],
        "vinäger": [
            "risvinsvinäger",
            "risvinäger",
            "osötad risvinäger",
            "balsamicovinäger",
            "kinesisk svart vinäger",
            "chinkiang",
        ],
        "paprika": ["röd paprika", "grön paprika"],
        "lök": ["röd lök", "gul lök"],
        "rödlök": ["röd lök"],
        "ris": ["kokt ris", "kokt vitt ris", "kokt kortkornat ris", "basmatiris", "okokat klibbigt ris", "klibbigt ris"],
        "chili crisp": ["chili crunch", "chili olja", "kelp chili crisp"],
        "majs": ["konserverad majs"],
        "edamame": ["fryst edamame"],
        "grönkål": ["fryst grönkål"],
        "dumpling": ["frysta dumplings", "dumplings"],
        "gnocchi": ["potatisgnocchi"],
        "panko": ["panko-ströbröd"],
        "pb2": ["pulveriserat jordnötssmör"],
        "nötfärs": ["extra mager nötfärs", "malet nötkött"],
        "kycklingfärs": ["kycklingfärs mager", "malet kyckling"],
        "kycklingbröst": ["malet kycklingbröst"],
        "fläskfärs": ["malet fläskkött", "malet fläsk"],
        "buffalosås": ["extra buffalosås"],
        "parmesan": ["parmesanost", "riven parmesanost"],
        "choklad": ["mörk choklad", "mörk choklad 70%", "hackad mörk choklad"],
        "banana": ["mogna bananer"],
        "banan": ["mogna bananer"],
        "ansjovis": ["ansjovisfilé"],
        "selleri": ["selleristjälkar"],
        "pickles": ["hela pickles"],
        "kryddmix": ["italiensk kryddmix", "italiensk örtkrydda"],
        "jäste": [],
        "jäst": ["torrjäst"],
        "vetemjöl": ["vetemjöl special", "självjäsande mjöl"],
        "bröd": ["libanesiska tunnbröd", "brioche hamburgerbröd"],
        "brioche": ["brioche hamburgerbröd"],
        "cotija": ["cotijaost", "smulad cotija-ost"],
        "lättost": ["lättost 50% cheddar"],
        "proteinpulver": ["vaniljproteinpulver"],
        "mandel": ["mandelmjöl"],
        "mjölk": ["skummjölk"],
        "citron": ["citronzest", "citronskal", "citronskal rivet", "pressad lime", "citron juice", "citronsaft"],
        "lime": ["pressad lime"],
        "vårlök": [],
        "salt": ["salt och peppar", "salt till pastavattnet"],
    }

    by_canon = {ing["canonical_name"]: ing for ing in ingredients}

    def attach(canon: str, aliases: list[str]):
        # Find by canon or any existing alias
        ing = by_canon.get(canon)
        if not ing:
            for row in ingredients:
                if canon in row["aliases"] or row["canonical_name"] == canon:
                    ing = row
                    break
        if not ing:
            return
        for a in aliases:
            key = a.lower().strip()
            if not key or key in alias_owner:
                continue
            alias_owner[key] = ing["id"]
            ing["aliases"].append(key)

    for canon, aliases in EXTRA_ALIASES.items():
        attach(canon, aliases)

    # Chili crisp / crunch as own ingredient if missing
    if "chili crisp" not in alias_owner and "chilicrisp" not in alias_owner:
        # attach to existing chili oil / chili crisp row if any
        found = None
        for row in ingredients:
            if any("chili" in a and ("crisp" in a or "crunch" in a or "olja" in a) for a in [row["canonical_name"], *row["aliases"]]):
                found = row
                break
        if found:
            attach(found["canonical_name"], ["chili crisp", "chili crunch", "chili olja", "kelp chili crisp"])
        else:
            nid = len(ingredients) + 1
            row = {
                "id": nid,
                "canonical_name": "chili crisp",
                "category": "sas",
                "kcal_per_100g": 450,
                "protein_per_100g": 1,
                "fat_per_100g": 48,
                "carbs_per_100g": 5,
                "piece_weight_g": None,
                "density_g_per_ml": None,
                "needs_review": 0,
                "aliases": ["chili crunch", "chili olja", "kelp chili crisp"],
            }
            ingredients.append(row)
            alias_owner["chili crisp"] = nid
            for a in row["aliases"]:
                alias_owner[a] = nid

    OUT.write_text(json.dumps({"ingredients": ingredients}, ensure_ascii=False, indent=2) + "\n")
    print(f"Wrote {OUT} ({len(ingredients)} ingredients)")


if __name__ == "__main__":
    main()
