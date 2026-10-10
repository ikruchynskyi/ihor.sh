// Bike + train escapes: can a full-size bike ride this train? The three railroads' rules for non-folding bikes, as data,
// from their official pages (checked 2026-10-10; SOURCES below). Pure functions: node ride/escapes.test.mjs

export const SOURCES = {
  MNR: "https://www.mta.info/guides/bikes/bike-regulations-mnr",
  LIRR: "https://www.mta.info/guides/bikes/bike-regulations-lirr",
  NJT: "https://www.njtransit.com/bike-other-services",
};
export const NAMES = { MNR: "Metro-North", LIRR: "Long Island Rail Road", NJT: "NJ Transit" };
export const LIMITS = {
  MNR: "Weekdays: at most 4 bikes a train, 2 a car. Weekends: 8 a train, 2 a car (designated bicycle trains take more).",
  LIRR: "Weekdays: 4 bikes a train, 2 in the first car and 2 in the last. Weekends: 1 a car, 8 a train.",
  NJT: "2 bikes per single-level car, 8 per double-decker, if it isn't crowded; riders with disabilities have priority.",
};

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const nth = (y, m, wd, n) => { const d = new Date(y, m, 1); d.setDate(1 + ((wd - d.getDay() + 7) % 7) + 7 * (n - 1)); return d; }; // n-th weekday wd of month m
const last = (y, m, wd) => { const d = new Date(y, m + 1, 0); d.setDate(d.getDate() - ((d.getDay() - wd + 7) % 7)); return d; };
const add = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
// Rosh Hashanah and Yom Kippur begin at sunset on these "eves" (Hebrew calendar dates, so listed per year).
const EVES = { 2026: ["2026-09-11", "2026-09-20"], 2027: ["2027-10-01", "2027-10-10"], 2028: ["2028-09-20", "2028-09-29"] };

/** The named days of a year that the rules refer to, as YYYY-MM-DD. */
export function days(y) {
  const thanks = nth(y, 10, 4, 4), memorial = last(y, 4, 1), labor = nth(y, 8, 1, 1), july4 = new Date(y, 6, 4);
  const friBefore = (d) => add(d, -((d.getDay() - 5 + 7) % 7 || 7));
  return {
    newYear: iso(new Date(y, 0, 1)), mlk: iso(nth(y, 0, 1, 3)), presidents: iso(nth(y, 1, 1, 3)), stPatrick: iso(new Date(y, 2, 17)),
    mothers: iso(nth(y, 4, 0, 2)), memorial: iso(memorial), friMemorial: iso(friBefore(memorial)), july4: iso(july4), friJuly4: iso(friBefore(july4)),
    labor: iso(labor), friLabor: iso(friBefore(labor)), columbus: iso(nth(y, 9, 1, 2)), roshEve: EVES[y]?.[0], yomEve: EVES[y]?.[1],
    thanksEve: iso(add(thanks, -1)), thanks: iso(thanks), thanksAfter: iso(add(thanks, 1)), thanksSunday: iso(add(thanks, 3)),
    xmasEve: `${y}-12-24`, xmas: `${y}-12-25`, nyEve: `${y}-12-31`, tueAfterLabor: iso(add(labor, 1)),
  };
}

const at = (d) => d.getHours() * 60 + d.getMinutes(), hhmm = (h, m = 0) => h * 60 + m;
const inWin = (t, a, b) => t >= a && t < b;

/**
 * Can a non-folding bike ride? `rr`: "MNR" | "LIRR" | "NJT". `dir`: "out" (leaving the city: the time is the departure
 * from Grand Central / Penn / Hoboken / Newark) or "in" (coming back: the time is the arrival there). `when`: a Date.
 * Returns { ok, why, note? }. A folding bike (`folding: true`) is fine on all three at all times.
 */
export function bikeOK(rr, dir, when, { folding = false } = {}) {
  if (folding) return { ok: true, why: `Folding bikes ride every ${NAMES[rr]} train, folded the whole time.` };
  const y = when.getFullYear(), D = days(y), day = iso(when), t = at(when), wd = when.getDay(), weekend = wd === 0 || wd === 6;
  const no = (why) => ({ ok: false, why }), yes = (why, note) => ({ ok: true, why, ...(note ? { note } : {}) });
  const eveNote = D.roshEve ? "" : ` (we don't have ${y}'s Rosh Hashanah and Yom Kippur dates: check ${NAMES[rr]}'s page)`;
  if (rr === "MNR") {
    const banned = { [D.newYear]: "New Year's Day", [D.stPatrick]: "St. Patrick's Day", [D.mothers]: "Mother's Day", [D.roshEve]: "Rosh Hashanah eve", [D.yomEve]: "Yom Kippur eve", [D.thanksEve]: "the day before Thanksgiving", [D.thanks]: "Thanksgiving", [D.xmasEve]: "Christmas Eve", [D.xmas]: "Christmas Day", [D.nyEve]: "New Year's Eve" };
    if (banned[day]) return no(`No bikes on any Metro-North train on ${banned[day]}.`);
    if (dir === "out" && [D.friMemorial, D.friJuly4, D.friLabor].includes(day) && inWin(t, hhmm(12), hhmm(20, 30))) return no("Holiday Friday: no bikes on trains leaving Grand Central from noon to 8:30 pm.");
    const dec = when.getMonth() === 11 && when.getDate() >= 26 && when.getDate() <= 30;
    if ((day === D.thanksAfter || dec) && (inWin(t, hhmm(5, 30), hhmm(12)) || inWin(t, hhmm(15), hhmm(20)))) return no("Holiday week: no bikes on trains to or from Grand Central 5:30 am–noon and 3–8 pm.");
    if (!weekend && dir === "in" && inWin(t, hhmm(6), hhmm(10))) return no("Weekday rush: no bikes on trains arriving at Grand Central 6–10 am.");
    if (!weekend && dir === "out" && inWin(t, hhmm(16), hhmm(20))) return no("Weekday rush: no bikes on trains leaving Grand Central 4–8 pm.");
    return yes(`Bikes allowed${eveNote}.`, "Some individual trains don't take bikes: TrainTime shows them.");
  }
  if (rr === "LIRR") {
    const banned = { [D.newYear]: "New Year's Day", [D.stPatrick]: "St. Patrick's Day", [D.mothers]: "Mother's Day", [D.friMemorial]: "the Friday before Memorial Day", [D.memorial]: "Memorial Day", [D.friJuly4]: "the Friday before Independence Day", [D.july4]: "Independence Day", [D.friLabor]: "the Friday before Labor Day", [D.labor]: "Labor Day", [D.roshEve]: "Rosh Hashanah eve", [D.yomEve]: "Yom Kippur eve", [D.columbus]: "Columbus Day", [D.thanksEve]: "the day before Thanksgiving", [D.thanks]: "Thanksgiving", [D.thanksAfter]: "the day after Thanksgiving", [D.xmasEve]: "Christmas Eve", [D.xmas]: "Christmas Day", [D.nyEve]: "New Year's Eve" };
    if (banned[day]) return no(`No bikes on any LIRR train on ${banned[day]}.`);
    if (!weekend && dir === "in" && inWin(t, hhmm(6), hhmm(10))) return no("Weekday rush: no bikes on trains arriving in the city 6–10 am.");
    if (!weekend && dir === "out" && inWin(t, hhmm(15), hhmm(20))) return no("Weekday rush: no bikes on trains leaving the city 3–8 pm.");
    const summer = day >= D.friMemorial && day <= D.tueAfterLabor;
    if (summer && wd === 5 && dir === "out" && inWin(t, hhmm(10, 30), hhmm(20))) return yes("Bikes allowed on most trains, but not on Montauk-branch trains leaving the city 10:30 am–8 pm on summer Fridays.", "Summer weekends also ban bikes on some Greenport and Montauk trains: the timetable marks them.");
    return yes(`Bikes allowed${eveNote}.`, summer ? "Summer weekends ban bikes on some Greenport and Montauk trains: check the timetable." : "Weekends: look for bicycle trains (a bike symbol in the timetable).");
  }
  // NJ Transit (rules for all lines except the Atlantic City Line, which takes bikes at all times)
  const banned = { [D.newYear]: "New Year's Day", [D.mlk]: "Martin Luther King Jr. Day", [D.presidents]: "Presidents' Day", [D.memorial]: "Memorial Day", [D.july4]: "Independence Day", [D.labor]: "Labor Day", [D.thanks]: "Thanksgiving", [D.thanksAfter]: "the day after Thanksgiving", [D.thanksSunday]: "the Sunday after Thanksgiving", [D.xmas]: "Christmas Day" };
  if (banned[day]) return no(`No bikes on NJ Transit trains on ${banned[day]} (the Atlantic City Line excepted).`);
  if (!weekend && dir === "in" && inWin(t, hhmm(6), hhmm(10))) return no("Weekday rush: no bikes on trains ending at Hoboken, Newark or New York 6–10 am.");
  if (!weekend && dir === "out" && inWin(t, hhmm(16), hhmm(19))) return no("Weekday rush: no bikes on trains leaving Hoboken, Newark or New York 4–7 pm.");
  if (weekend && dir === "in" && inWin(t, hhmm(9), hhmm(12))) return no("Weekends: no bikes on trains ending in New York 9 am–noon.");
  if (weekend && dir === "out" && inWin(t, hhmm(17), hhmm(20))) return no("Weekends: no bikes on trains leaving New York 5–8 pm.");
  return yes("Bikes allowed.", "The conductor can still say no if the train is crowded.");
}

/** The first time at or after `from`, in 15-minute steps within the next 3 days, when a bike is allowed. */
export function nextOK(rr, dir, from) {
  const t = new Date(from); t.setSeconds(0, 0); t.setMinutes(Math.ceil(t.getMinutes() / 15) * 15);
  for (let k = 0; k < 4 * 24 * 3; k++, t.setMinutes(t.getMinutes() + 15)) if (bikeOK(rr, dir, t).ok) return new Date(t);
  return null;
}

/** Is today inside a campground's season ("MM-DD" to "MM-DD")? */
export const inSeason = (when, open, close) => { const md = iso(when).slice(5); return md >= open && md <= close; };

// The trips. Every campground's season and every station checked on its official page or OpenStreetMap (2026-10-10).
export const ESCAPES = [
  {
    id: "harlem", title: "Harlem Valley Rail Trail to Copake Falls", rr: "MNR", line: "Harlem Line, Grand Central → Wassaic (the end of the line)",
    blurb: "The easiest overnight from the city: a flat, paved rail trail almost the whole way, through farms and the edge of the Taconic hills, to a state-park campground by a waterfall trail.",
    ride: "About 40 km each way on the Harlem Valley Rail Trail (Wassaic to Millerton, then north to Copake Falls), nearly flat.",
    camp: { name: "Taconic State Park, Copake Falls Area", season: ["05-08", "11-14"], book: "https://newyorkstateparks.reserveamerica.com/", info: "https://parks.ny.gov/visit/state-parks/taconic-state-park-copake-falls-area" },
    back: "Ride back to Wassaic, or stay a second night.",
    plan: [[41.81482, -73.56232, "Wassaic station"], [42.12252, -73.51439, "Copake Falls campground"]],
  },
  {
    id: "norrie", title: "Walkway Over the Hudson to Mills-Norrie", rr: "MNR", line: "Hudson Line, Grand Central → Poughkeepsie",
    blurb: "Cross the Hudson on the Walkway (a railroad bridge turned park, 65 m up), then follow the river north to a campground on the bluffs next to Staatsburgh, a Gilded Age mansion you can tour.",
    ride: "About 25 km from Poughkeepsie, mostly on roads; plan it in the notebook to see the route and the climbing.",
    camp: { name: "Mills-Norrie State Park campground, Staatsburg", season: ["04-26", "10-18"], book: "https://newyorkstateparks.reserveamerica.com/", info: "https://parks.ny.gov/visit/state-parks/mills-norrie-state-park-margaret-lewis-norrie" },
    back: "Back to Poughkeepsie (Metro-North), or north to Rhinecliff for Amtrak (its own bike rules and reservations).",
    plan: [[41.70664, -73.93868, "Poughkeepsie station"], [41.83822, -73.94302, "Mills-Norrie campground"]],
  },
  {
    id: "northfork", title: "North Fork: Riverhead, Wildwood, Greenport", rr: "LIRR", line: "Ronkonkoma Branch to Riverhead (some trains need a change at Ronkonkoma)",
    blurb: "A short ride to a campground on the bluffs of Long Island Sound, then a day along the North Fork's farm stands and vineyards to Greenport.",
    ride: "About 15 km from Riverhead to Wildwood, then about 50 km east to Greenport, gently rolling.",
    camp: { name: "Wildwood State Park campground, Wading River", season: ["04-17", "10-11"], book: "https://newyorkstateparks.reserveamerica.com/", info: "https://parks.ny.gov/visit/state-parks/wildwood-state-park" },
    back: "LIRR from Greenport: few trains a day, so check the timetable before you set off; in summer some Greenport trains don't take bikes.",
    plan: [[40.91979, -72.66691, "Riverhead station"], [40.96061, -72.80131, "Wildwood campground"], [41.09971, -72.36312, "Greenport station"]],
  },
  {
    id: "montauk", title: "Montauk: Hither Hills by the ocean", rr: "LIRR", line: "Montauk Branch to Montauk, the end of the line (about 3 hours from Penn Station; few trains a day)",
    blurb: "The far end of Long Island: an oceanfront state-park campground in the dunes, a short ride from the last stop, with the lighthouse and the bluffs for day 2.",
    ride: "About 9 km from Montauk station to the campground, flat; add the 10 km out to Montauk Point Lighthouse and back on day 2.",
    camp: { name: "Hither Hills State Park campground", season: ["04-10", "11-22"], book: "https://newyorkstateparks.reserveamerica.com/", info: "https://parks.ny.gov/visit/state-parks/hither-hills-state-park" },
    back: "LIRR from Montauk. In summer (Memorial Day to Labor Day) Friday Montauk trains from the city don't take bikes from 10:30 am to 8 pm, and some weekend trains don't either: check the timetable.",
    plan: [[41.04925, -71.95374, "Montauk station"], [41.00861, -72.01086, "Hither Hills campground"]],
  },
  {
    id: "spruce", title: "Spruce Run Reservoir, New Jersey", rr: "NJT", line: "Raritan Valley Line to Annandale (most trains need a change at Newark Penn)",
    blurb: "Hunterdon County's hills and a campground on the shore of one of New Jersey's largest reservoirs, a short ride from the station: a good first night out.",
    ride: "About 10 km from Annandale station to the campground (the bike route goes around the reservoir); add a loop through the hills on day 2.",
    camp: { name: "Spruce Run Recreation Area campground, Clinton", season: ["04-01", "10-31"], book: "https://camping.nj.gov/", info: "https://nj.gov/dep/parksandforests/parks/sprucerunrecreationarea.html" },
    back: "Back to Annandale. Weekend inbound trains reaching New York 9 am–noon don't take bikes.",
    plan: [[40.64514, -74.8789, "Annandale station"], [40.65612, -74.93032, "Spruce Run campground"]],
  },
];
