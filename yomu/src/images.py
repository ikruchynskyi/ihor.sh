# Photos for Yomu's scenes: one free-licensed photo per story and Talk scene (and a hero), from Wikimedia Commons,
# picked by hand from search results. Downloads 1000-px copies into yomu/img/ and writes yomu/img/credits.json
# (author, license, link) for the captions. Run: python3 yomu/src/images.py
import json, os, subprocess, re, time, urllib.parse, urllib.request
PICKS = {
 "n5-01": "File:Washington Square Park (51659533217).jpg", "n5-02": "File:Radio collection, Tallahassee Automobile Museum.jpg", "n5-03": "File:Morning Commute, Shinjuku (11920061293).jpg",
 "n5-04": "File:Fall Foliage Central Park New York City, Bow Bridge, U.S.A.jpg", "n5-05": "File:Brooklyn Bridge, view from Brooklyn Bridge Park, New York City, 20231002 0909 1574.jpg",
 "n5-06": "File:HAM RADIO STATION.jpg", "n5-07": "File:IFC Movie Theater 6th Avenue and West 4th Street NYC.jpg", "n5-08": "File:Sunset over the Lower Manhattan skyline as seen from New York Harbor - 20200904.jpg",
 "n5-09": "File:American Museum of Natural History, NYC (2012).jpg", "n5-10": "File:Duck-Billed Dinosaur skeletons at American Museum of Natural History.jpg", "n5-11": "File:Kanji (Unsplash).jpg",
 "n5-12": "File:Coffee preparation in a modern cafe with steaming equipment and skilled barista at work during the morning rush hour.jpg",
 "n4-01": "File:Hands holding an open book as someone writes in a notebook surrounded by scattered pages.jpg", "n4-02": "File:Sheep Meadow Central Park (41250p).jpg", "n4-03": "File:A wing tip of an airplane (40118125441).jpg",
 "n4-04": "File:Whatever Happened to Baby Jane - Flickr - Bistrosavage.jpg", "n4-05": "File:Osaka Dotonbori yoru 02.jpg", "n4-06": "File:50 Street snowstorm vc.jpg", "n4-07": "File:4science dspace cris-or2019-hamburg.jpg",
 "n4-08": "File:Nakamise Shopping Street @ Spring @ Senso-ji Temple @ Asakusa (13582552864).jpg", "n4-09": "File:NYC, 6 Av L train.jpg", "n4-10": "File:8 Śląski Festiwal Nauki, MCK, Katowice,, 09.12.2024, 1234.jpg",
 "n4-11": "File:Reading a newspaper on a rainy day in a train - Japan - 2026 Sept 6.jpeg", "n4-12": "File:Kenwood TS-430 Amateur Radio.jpg",
 "n3-01": "File:Kaminarimon (outer gate), Sensoji Temple, Akakusa, Tokyo.jpg", "n3-02": "File:Tsukiji Outer Market 2.jpg", "n3-03": "File:Shinkansen platform at Tokyo Station 22.jpg",
 "n3-04": "File:Voltmeters & Ammeters, in Akihabara (2009-05-14 08.06.02 by Tristan Ferne).jpg", "n3-05": "File:Japanese Home Dinner 1Soup and Many Dishes.jpg", "n3-06": "File:Fushimi-Inari-Shrine-Senbon-Torii-2018-Luka-Peternel.jpg",
 "n3-07": "File:Mount Fuji from Lake Ashi 20211202-2.jpg", "n3-08": "File:Keisei Narita Airport Terminal 1 Station Platform 4・5.jpg", "n3-09": "File:Uptown 6 train at 14th Street Union Square.jpg",
 "n3-10": "File:Reading in Bangkok (Unsplash).jpg", "n3-11": "File:This is Sapporo (6960447275).jpg", "n3-12": "File:The 66th Sapporo Snow Festival - panoramio.jpg",
 "talk-konbini": "File:FamilyMart Ikoma Kamimachi store on 25th November 2017.jpg", "talk-michi": "File:Pedestrian street on a Sunday in Shinjuku.jpg", "talk-resutoran": "File:ホースショップ (8302087245).jpg",
 "talk-jikoshoukai": "File:頭文字 (43592751545).jpg", "talk-densha": "File:Shibuya Station Yamanote Line Platform 20080522.jpg", "talk-hoteru": "File:Hotel Forza Nagasaki 4F lobby 20170521-001.jpg",
 "hero": "File:Tokyo Skyline20210123.jpg",
}
UA = {"User-Agent": "ihor.sh yomu images (+https://ihor.sh/yomu/)"}
OUT = os.path.join(os.path.dirname(__file__), "..", "img")
credits = {}
strip = lambda h: re.sub(r"<[^>]+>", "", h or "").strip()
for key, title in PICKS.items():
    url = "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode({"action": "query", "titles": title, "prop": "imageinfo", "iiprop": "url|extmetadata", "iiurlwidth": 1000, "format": "json"})
    page = next(iter(json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60))["query"]["pages"].values()))
    ii = page["imageinfo"][0]; m = ii.get("extmetadata", {})
    credits[key] = {"title": title, "author": strip(m.get("Artist", {}).get("value", ""))[:80], "license": m.get("LicenseShortName", {}).get("value", ""), "licenseUrl": m.get("LicenseUrl", {}).get("value", ""), "page": ii.get("descriptionurl", "")}
    path = os.path.join(OUT, f"{key}.jpg")
    if not os.path.exists(path):
        with urllib.request.urlopen(urllib.request.Request(ii["thumburl"], headers=UA), timeout=120) as r, open(path, "wb") as f: f.write(r.read())
        subprocess.run(["sips", "-s", "format", "jpeg", "-s", "formatOptions", "62", "--resampleWidth", "960", path, "--out", path + ".tmp"], capture_output=True)  # macOS: shrink
        if os.path.exists(path + ".tmp"): os.replace(path + ".tmp", path)
        time.sleep(0.3)
    print(key, credits[key]["license"], os.path.getsize(path) // 1024, "KB")
json.dump(credits, open(os.path.join(OUT, "credits.json"), "w"), ensure_ascii=False, indent=1)
