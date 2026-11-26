# Employers hiring professionals around NYC, from the Labor Department's H-1B wage filings (LCA disclosure data, public
# domain; https://www.dol.gov/agencies/eta/foreign-labor/performance). Its servers turn automated downloads away, so the
# owner downloads LCA_Disclosure_Data_FY*_Q*.xlsx into data/ by hand, about once a quarter, and runs this. Each file
# holds one quarter (FY2026 Q4: 119,207 filings and 487,682 blank rows), so every quarter of the newest fiscal year
# found is added up:
#   python3 scripts/h1b.py
# It writes data/h1b-nyc.json, which server/coverage.ts reads for its big-employers list. Only employer totals are kept:
# the file's names, emails and phone numbers of contacts, lawyers and preparers are never read into the output.
# Certified filings with a worksite in the five boroughs, the New York suburbs, Fairfield County (CT) or New Jersey.
import glob, json, os, re, statistics, sys, time, zipfile, xml.etree.ElementTree as ET
from collections import defaultdict

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
ROOT = os.path.join(os.path.dirname(__file__), "..")
NYC = {"NEW YORK", "KINGS", "QUEENS", "BRONX", "RICHMOND"}
SUBURBS = {"NASSAU", "SUFFOLK", "WESTCHESTER", "ROCKLAND", "PUTNAM"}
YEAR = {"Year": 1, "Month": 12, "Bi-Weekly": 26, "Week": 52, "Hour": 2080}

found = glob.glob(os.path.join(ROOT, "data", "LCA_Disclosure_Data_FY*_Q*.xlsx"))
if not found:
    sys.exit("no LCA_Disclosure_Data_FY*_Q*.xlsx in data/")
fy = max(int(re.search(r"FY(\d{4})", f).group(1)) for f in found)
files = sorted(f for f in found if f"FY{fy}_" in f)

def col(ref):  # "BC12" -> 54
    n = 0
    for ch in re.match(r"[A-Z]+", ref).group():
        n = n * 26 + ord(ch) - 64
    return n - 1

def rows(z, strings):
    for _, el in ET.iterparse(z.open("xl/worksheets/sheet1.xml")):
        if el.tag != NS + "row":
            continue
        out = {}
        for c in el.findall(NS + "c"):
            v = c.find(NS + "v")
            out[col(c.get("r"))] = strings[int(v.text)] if c.get("t") == "s" and v is not None else (v.text if v is not None else "".join(x.text or "" for x in c.iter(NS + "t")))
        el.clear()
        yield out

need = ["CASE_STATUS", "EMPLOYER_NAME", "TRADE_NAME_DBA", "NAICS_CODE", "TOTAL_WORKER_POSITIONS", "WORKSITE_COUNTY", "WORKSITE_STATE", "SOC_TITLE", "WAGE_RATE_OF_PAY_FROM", "WAGE_UNIT_OF_PAY"]
emp = defaultdict(lambda: {"filings": 0, "positions": 0, "nyc": 0, "nj": 0, "metro": 0, "titles": defaultdict(int), "wages": [], "dba": "", "naics": ""})
total = kept = 0
t0 = time.time()
for src in files:
    z = zipfile.ZipFile(src)
    strings = []
    for _, el in ET.iterparse(z.open("xl/sharedStrings.xml")):
        if el.tag == NS + "si":
            strings.append("".join(t.text or "" for t in el.iter(NS + "t")))
            el.clear()
    it = rows(z, strings)
    at = {name: i for i, name in next(it).items()}
    missing = [n for n in need if n not in at]
    if missing:
        sys.exit(f"{os.path.basename(src)}: columns not found: {missing}")
    for r in it:
        g = lambda n: (r.get(at[n]) or "").strip()
        status = g("CASE_STATUS")
        if not status:  # the files end in blank rows
            continue
        total += 1
        if status != "Certified":
            continue
        st, county = g("WORKSITE_STATE").upper(), g("WORKSITE_COUNTY").upper().replace(" COUNTY", "")
        area = "nyc" if st == "NY" and county in NYC else "metro" if (st == "NY" and county in SUBURBS) or (st == "CT" and county == "FAIRFIELD") else "nj" if st == "NJ" else None
        if not area:
            continue
        kept += 1
        name = re.sub(r"\s+", " ", g("EMPLOYER_NAME")).strip()
        e, n = emp[name.upper()], int(float(g("TOTAL_WORKER_POSITIONS") or 1))
        e["name"] = e.get("name") or name
        e["filings"] += 1; e["positions"] += n; e[area] += n
        e["titles"][g("SOC_TITLE")] += n
        e["dba"] = e["dba"] or g("TRADE_NAME_DBA"); e["naics"] = e["naics"] or g("NAICS_CODE")
        try:
            w = float(g("WAGE_RATE_OF_PAY_FROM")) * YEAR.get(g("WAGE_UNIT_OF_PAY"), 0)
            if 20_000 <= w <= 2_000_000:
                e["wages"].append(w)
        except ValueError:
            pass
    print(f"  {os.path.basename(src)}: {total:,} filings so far, {time.time() - t0:.0f} s", flush=True)

out = sorted(({"name": e["name"], "dba": e["dba"] or None, "naics": e["naics"] or None, "filings": e["filings"], "positions": e["positions"], "nyc": e["nyc"], "nj": e["nj"], "metro": e["metro"],
               "titles": [t for t, _ in sorted(e["titles"].items(), key=lambda x: -x[1])[:4] if t], "medianWage": round(statistics.median(e["wages"])) if e["wages"] else None}
              for e in emp.values() if e["filings"] >= 3), key=lambda x: -x["positions"])
path = os.path.join(ROOT, "data", "h1b-nyc.json")
with open(path, "w") as fh:
    json.dump({"source": "U.S. Department of Labor, LCA disclosure data", "files": [os.path.basename(f) for f in files], "fiscalYear": fy,
               "quarters": sorted(int(re.search(r"_Q(\d)", f).group(1)) for f in files), "made": int(time.time()), "filings": total, "here": kept, "employers": out}, fh)
print(f"{total:,} filings, {kept:,} certified around NYC, {len(out):,} employers with 3+ filings -> {path} ({time.time() - t0:.0f} s)")
