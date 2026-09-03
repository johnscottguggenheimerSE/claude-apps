#!/usr/bin/env python3
"""Download Livsmedelsverket Livsmedelsdatabas → scripts/slv-raw.json

Attribution: Livsmedelsverkets Livsmedelsdatabas
https://www.livsmedelsverket.se/om-oss/psidata/livsmedelsdatabasen
"""
from __future__ import annotations

import concurrent.futures
import json
import pathlib
import time
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "scripts" / "slv-raw.json"
BASE = "https://dataportal.livsmedelsverket.se/livsmedel/api/v1/livsmedel"
UA = {"User-Agent": "receptbok-slv-import/1.0 (personal recipe app)"}


def get_json(url: str):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def fetch_macros(nummer: int):
    rows = get_json(f"{BASE}/{nummer}/naringsvarden?sprak=1")
    kcal = prot = fat = carb = None
    for r in rows:
        code = r.get("euroFIRkod")
        unit = (r.get("enhet") or "").lower()
        val = r.get("varde")
        if code == "ENERC" and "kcal" in unit:
            kcal = val
        elif code == "PROT":
            prot = val
        elif code == "FAT":
            fat = val
        elif code == "CHO":
            carb = val
    return nummer, {"kcal": kcal, "prot": prot, "fat": fat, "carb": carb}


def main() -> None:
    print("Listing foods...")
    foods = []
    offset = 0
    while True:
        d = get_json(f"{BASE}?offset={offset}&limit=500&sprak=1")
        batch = d["livsmedel"]
        foods.extend(batch)
        total = d["_meta"]["totalRecords"]
        print(f"  {len(foods)}/{total}")
        if len(foods) >= total:
            break
        offset += len(batch)

    print("Fetching macros...")
    t0 = time.time()
    macros: dict[int, dict] = {}
    errors: list[tuple[int, str]] = []
    nummers = [f["nummer"] for f in foods]
    with concurrent.futures.ThreadPoolExecutor(24) as ex:
        futs = {ex.submit(fetch_macros, n): n for n in nummers}
        done = 0
        for fut in concurrent.futures.as_completed(futs):
            done += 1
            try:
                n, m = fut.result()
                macros[n] = m
            except Exception as e:  # noqa: BLE001
                errors.append((futs[fut], str(e)))
            if done % 250 == 0 or done == len(nummers):
                print(f"  {done}/{len(nummers)} ({round(time.time() - t0, 1)}s) err={len(errors)}")

    for n, _ in list(errors):
        try:
            _, m = fetch_macros(n)
            macros[n] = m
            errors = [(x, e) for x, e in errors if x != n]
        except Exception:  # noqa: BLE001
            pass

    catalog = []
    missing = 0
    for f in foods:
        n = f["nummer"]
        m = macros.get(n) or {}
        if m.get("kcal") is None and m.get("prot") is None:
            missing += 1
        catalog.append(
            {
                "nummer": n,
                "namn": f.get("namn"),
                "typ": f.get("livsmedelsTyp"),
                "version": f.get("version"),
                "kcal_per_100g": m.get("kcal") if m.get("kcal") is not None else 0,
                "protein_per_100g": m.get("prot") if m.get("prot") is not None else 0,
                "fat_per_100g": m.get("fat") if m.get("fat") is not None else 0,
                "carbs_per_100g": m.get("carb") if m.get("carb") is not None else 0,
                "macros_complete": all(m.get(k) is not None for k in ("kcal", "prot", "fat", "carb")),
            }
        )

    payload = {
        "source": "Livsmedelsverket Livsmedelsdatabas",
        "source_url": "https://www.livsmedelsverket.se/om-oss/psidata/livsmedelsdatabasen",
        "attribution": "Livsmedelsverkets Livsmedelsdatabas",
        "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "count": len(catalog),
        "missing_macros": missing,
        "foods": catalog,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False))
    print("Wrote", OUT, "foods", len(catalog), "missing", missing, "errors", len(errors))


if __name__ == "__main__":
    main()
