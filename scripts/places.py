# Makes server/places.json: the places in New York and Connecticut within 60 km of Manhattan, from GeoNames
# (cities1000: places of 1,000+ people; CC BY 4.0, credited in terms.html), for the jobs' region() (server/jobs.ts).
# A job "in Jamaica, NY" or "Lake Success, NY" was dropped: the hand-written town lists knew 261 of 519 such places of
# 5,000+ people (2026-11-23). The five boroughs' places are "nyc", the rest "metro"; New Jersey is "nj" by its state.
# Run: python3 scripts/places.py (downloads ~10 MB once into /tmp)
import io, json, math, os, urllib.request, zipfile

SRC = "https://download.geonames.org/export/dump/cities1000.zip"
CACHE = "/tmp/geonames-cities1000.zip"
NYC_COUNTIES = {"005", "047", "061", "081", "085"}  # Bronx, Kings, New York, Queens, Richmond
KM = 60

if not os.path.exists(CACHE):
    urllib.request.urlretrieve(SRC, CACHE)
out = {"NY": {}, "CT": {}}
with zipfile.ZipFile(CACHE) as z:
    for line in io.TextIOWrapper(z.open("cities1000.txt"), encoding="utf-8"):
        f = line.rstrip("\n").split("\t")
        if f[8] != "US" or f[10] not in out:
            continue
        lat, lon = float(f[4]), float(f[5])
        a = math.sin(math.radians(lat - 40.7128) / 2) ** 2 + math.cos(math.radians(40.7128)) * math.cos(math.radians(lat)) * math.sin(math.radians(lon + 74.006) / 2) ** 2
        if 6371 * 2 * math.asin(math.sqrt(a)) > KM:
            continue
        r = "nyc" if f[10] == "NY" and f[11] in NYC_COUNTIES else "metro"
        for name in {f[1].lower(), f[2].lower(), f[2].lower().replace("-", " ")}:  # usPlace() writes hyphens as spaces
            if out[f[10]].get(name) != "nyc":  # a name in the boroughs and outside them: the boroughs win
                out[f[10]][name] = r
# Neighbourhoods GeoNames' cities1000 leaves out (checked 2026-11-23), added by hand: all in the five boroughs
for name in ["flushing", "bay ridge", "dumbo", "bedford-stuyvesant", "bed-stuy", "crown heights", "red hook", "midtown", "midtown manhattan",
             "soho", "noho", "nolita", "upper east side", "greenwich village", "lower east side", "lower manhattan", "murray hill", "gramercy",
             "gramercy park", "flatiron", "flatiron district", "union square", "hudson square", "hudson yards", "pelham bay", "st. george",
             "saint george", "tottenville", "kips bay", "nomad", "downtown brooklyn", "brooklyn heights", "east elmhurst"]:
    out["NY"][name] = "nyc"
path = os.path.join(os.path.dirname(__file__), "..", "server", "places.json")
with open(path, "w") as fh:
    json.dump({st: dict(sorted(v.items())) for st, v in out.items()}, fh, ensure_ascii=False, separators=(",", ":"))
print({st: len(v) for st, v in out.items()}, "places written to server/places.json")
