export type VenueCategory =
  | 'Landmark'
  | 'Lunch'
  | 'Dinner'
  | 'Breweries'
  | 'Cocktail Bars'
  | 'Rooftops'
  | 'Sweets'

export type Venue = {
  name: string
  slug: string // stable kebab-case id; used to build the venue's spot_key
  category: VenueCategory
  area?: string // the doc's subcategory: "Fast Spots", "Sit Down Spots", "Further Away", etc.
  notes: string
  schedule?: string // group plan attached to this spot in the doc
  tags?: VenueCategory[] // other categories this spot also appears under
  landmark?: boolean
  hub?: boolean // home base — the convention center; gets a standout pin + Guide section
  lat: number
  lng: number
  url?: string
}

// Deterministic kebab-case slug from a name. Strips diacritics and apostrophes
// so slugs stay clean and stable — the slug feeds each venue's spot_key, so it
// must not change once venues are live (rename the display name freely; the
// slug only shifts if you also change it here).
function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // drop accents (é → e)
    .toLowerCase()
    .replace(/['’]/g, '') // drop apostrophes so "Freddy's" → "freddys"
    .replace(/[^a-z0-9]+/g, '-') // any run of non-alphanumerics → single hyphen
    .replace(/^-+|-+$/g, '') // trim leading/trailing hyphens
}

// A curated venue's spot_key. User-added spots use their DB uuid instead.
export function venueKey(v: { slug: string }): string {
  return 'venue:' + v.slug
}

// NOTE ON COORDINATES: these were cross-referenced against each venue's real
// street address (verified via web search + geocoding) so the pins land on the
// actual buildings in downtown San Diego (Gaslamp / East Village / Little Italy).
// To move a pin, just edit its lat/lng here.
const rawVenues: Omit<Venue, 'slug'>[] = [
  // --- Landmarks / key schedule spots ---
  { name: 'San Diego Convention Center', category: 'Landmark', landmark: true, hub: true, notes: 'Home base — plenary, sessions, exhibit hall.', schedule: 'Plenary Mon 7/13 · 8:30 AM', lat: 32.70639, lng: -117.16139 },
  { name: 'Marriott Marquis', category: 'Landmark', landmark: true, notes: 'Badge pickup + Central Coast Meetup (Pacific Ballroom Salon 14).', lat: 32.70806, lng: -117.16556 },
  { name: 'Petco Park', category: 'Landmark', landmark: true, notes: 'Ballpark next to the convention center.', lat: 32.7073, lng: -117.1566 },
  { name: 'Balboa Park', category: 'Landmark', landmark: true, notes: 'Balboa Park Party, Thu 7/16 · 5:30–9:00.', lat: 32.73139, lng: -117.14528 },
  { name: 'Balboa Park Golf Course', category: 'Landmark', landmark: true, notes: 'Golf Thu 7/16, 9:36 AM tee time.', lat: 32.7286, lng: -117.1369 },

  // --- Lunch ---
  { name: 'La Puerta', category: 'Dinner', area: 'Sit Down Spots', notes: 'Tacos and drinks. Saturday-night group dinner spot.', schedule: 'Sat 7/11 group dinner · 6 PM', tags: ['Lunch'], lat: 32.71118, lng: -117.16119 },
  { name: 'Puesto', category: 'Lunch', area: 'Sit Down Spots', notes: 'Nice courtyard, Mexican food. Monday group lunch.', schedule: 'Mon 7/13 group lunch · 12 PM', tags: ['Dinner'], lat: 32.71064, lng: -117.17 },
  { name: 'Waves Taco Club', category: 'Lunch', area: 'Fast Spots', notes: 'Fish tacos, birria.', lat: 32.7149, lng: -117.16025 },
  { name: 'Taquería Los Chuchys', category: 'Lunch', area: 'Fast Spots', notes: 'Authentic tacos.', lat: 32.711, lng: -117.1609 },
  { name: 'Tacos el Gordo', category: 'Lunch', area: 'Fast Spots', notes: 'Authentic tacos, long lines.', lat: 32.71347, lng: -117.15993 },
  { name: 'El Chingon', category: 'Lunch', area: 'Fast Spots', notes: 'Tacos, good happy hour deals. GUICE social Mon 6–9.', schedule: 'Mon 7/13 · GUICE Social 6–9', lat: 32.71118, lng: -117.16029 },
  { name: 'The Taco Stand', category: 'Lunch', area: 'Further Away', notes: 'California Burrito.', lat: 32.7177, lng: -117.15868 },

  // --- Dinner ---
  { name: 'Garage and Kitchen', category: 'Dinner', notes: 'American food and beer.', lat: 32.71221, lng: -117.16088 },
  { name: 'Werewolf', category: 'Dinner', notes: 'Casual food and karaoke at night — if you know, you know.', schedule: 'Sat 7/11 follow-up · karaoke', lat: 32.71194, lng: -117.16076 },
  { name: "Freddy's Chophouse", category: 'Dinner', notes: 'Steak house.', lat: 32.71098, lng: -117.16119 },
  { name: "Nason's Beer Hall", category: 'Dinner', area: 'Drink Focused + Food', notes: 'Pizza and drinks; casual craft-beer spot inside the Pendry.', schedule: 'Sun 7/12 group dinner · 6 PM', lat: 32.70957, lng: -117.15939 },
  { name: 'Field Irish Pub', category: 'Dinner', area: 'Drink Focused + Food', notes: 'Irish pub.', lat: 32.71106, lng: -117.16029 },

  // --- Breweries ---
  { name: 'East Village Brewing Company', category: 'Breweries', notes: 'Good reviews, near Petco Park.', lat: 32.70761, lng: -117.15449 },
  { name: 'Mission Brewing – East Village', category: 'Breweries', notes: 'Historic 1894 Wonder Bread building; Old Mission Lager & Saison, dog-friendly, no food menu.', lat: 32.70709, lng: -117.15156 },
  { name: 'The Church by The Lost Abbey', category: 'Breweries', notes: 'Belgian-inspired Lost Abbey tasting room in a converted 1906 church — stained glass, pew seating, taco kitchen.', lat: 32.70925, lng: -117.15244 },
  { name: 'Bay City Brewing Co Tasting Room', category: 'Breweries', notes: 'Group social spot.', schedule: 'Mon 7/13 · Bowman/Surdex 5 PM', lat: 32.71202, lng: -117.15724 },
  { name: 'Knotty Brewing Co.', category: 'Breweries', notes: 'Small East Village brewery next to Knotty Barrel; clean British/European styles, cozy patio.', lat: 32.71159, lng: -117.15698 },
  { name: 'Mike Hess', category: 'Breweries', notes: 'Closest brewery to the conference, but expensive; served in aluminum cups.', lat: 32.7088, lng: -117.16878 },
  { name: 'Burgeon at The Arbor', category: 'Breweries', area: 'Further Away', notes: 'Fantastic hazy IPAs.', lat: 32.71929, lng: -117.16936 },
  { name: 'Stone Brewing Tap Room – Kettner', category: 'Breweries', area: 'Further Away', notes: 'Iconic San Diego brewery.', lat: 32.71792, lng: -117.16948 },
  { name: 'Ballast Point Brewing', category: 'Breweries', area: 'Further Away', notes: 'Famous for Sculpin IPA; fun waterfront-area location.', lat: 32.72778, lng: -117.16974 },

  // --- Cocktail Bars ---
  { name: 'Noble Experiment', category: 'Cocktail Bars', notes: 'Hidden behind a wall of kegs — speakeasy.', lat: 32.71242, lng: -117.15754 },
  { name: 'Lions Share', category: 'Cocktail Bars', notes: 'Nice cocktails, also has dinner.', tags: ['Dinner'], lat: 32.71193, lng: -117.16894 },
  { name: 'Prohibition Lounge', category: 'Cocktail Bars', notes: 'Live jazz, Prohibition-era décor, creative cocktails.', lat: 32.7111, lng: -117.16028 },
  { name: 'Fifth & Rose', category: 'Cocktail Bars', notes: 'Stylish hotel cocktail bar inside the Pendry — ideal for starting the evening.', lat: 32.70977, lng: -117.15965 },
  { name: 'Whiskey House', category: 'Cocktail Bars', notes: 'Whiskey bar.', schedule: 'Sat/Sun follow-up spot', lat: 32.70972, lng: -117.16223 },

  // --- Rooftops ---
  { name: 'Altitude Sky Lounge', category: 'Rooftops', notes: 'Incredible views of Petco Park and downtown, especially at sunset.', schedule: 'Tue 7/14 · Dell/Nvidia VIP Rooftop Social', lat: 32.7086, lng: -117.15873 },
  { name: 'Rustic Root', category: 'Rooftops', area: 'Drink Focused + Food', notes: 'Only second story; ok food, good drinks; gets loud/busy at night. Cocktails + American food.', tags: ['Dinner', 'Cocktail Bars'], lat: 32.71082, lng: -117.16002 },
  { name: 'The Nolen Rooftop', category: 'Rooftops', notes: '14th-floor lounge atop the Courtyard Gaslamp — Petco to Coronado Bridge views; fire pits, 21+ after 8pm.', lat: 32.71012, lng: -117.15891 },
  { name: "5 O'Clock Somewhere Rooftop Bar", category: 'Rooftops', notes: 'Tropical, Margaritaville-themed rooftop pool bar; cocktails, light bites, weekly live music.', lat: 32.70965, lng: -117.15854 },
  { name: 'Top of the Hyatt', category: 'Rooftops', notes: 'Bar on top of the Manchester Grand Hyatt.', lat: 32.7099, lng: -117.16791 },
  { name: 'Kettner Exchange', category: 'Rooftops', notes: 'Little Italy nice rooftop bar.', lat: 32.72538, lng: -117.16973 },
  { name: 'Borrego Rooftop (Hotel Indigo)', category: 'Rooftops', notes: 'Desert-inspired rooftop on the 9th floor of Hotel Indigo; skyline + Petco views, firepits, craft cocktails.', lat: 32.71062, lng: -117.15618 },
  { name: 'Poolhouse (Pendry)', category: 'Rooftops', notes: 'Rooftop pool lounge at the Pendry — cabanas, daybeds, California-style menu; open to locals.', lat: 32.71008, lng: -117.15992 },
  { name: 'Sunbird', category: 'Rooftops', notes: 'Reimagined rooftop at the AC Hotel Gaslamp (formerly Techo Beso); coastal small plates, skyline views.', lat: 32.71317, lng: -117.15968 },

  // --- Sweets ---
  { name: 'Salt and Straw', category: 'Sweets', notes: 'Famous ice cream in Little Italy.', lat: 32.72277, lng: -117.16845 },
]

// Each venue gets a stable slug derived from its name (see slugify above).
export const venues: Venue[] = rawVenues.map((v) => ({ ...v, slug: slugify(v.name) }))

// Home base: the convention center. Everything on the trip orbits it, so it gets
// a standout pin on the map and its own section on the Guide.
export const hubVenue: Venue | undefined = venues.find((v) => v.hub)

export const categoryOrder: VenueCategory[] = [
  'Landmark',
  'Lunch',
  'Dinner',
  'Breweries',
  'Cocktail Bars',
  'Rooftops',
  'Sweets',
]

// The food/drink categories — the curated set minus Landmark. A user-added food
// spot must fall in one of these (no free-form, no POI), so the Food list and
// the "add a food spot" picker share this one source of truth.
export const foodCategories: VenueCategory[] = categoryOrder.filter((c) => c !== 'Landmark')

export const categoryColor: Record<VenueCategory, string> = {
  Landmark: '#38E1FF',
  Lunch: '#FF6B4A',
  Dinner: '#F5A65B',
  Breweries: '#E7C24B',
  'Cocktail Bars': '#C58BF2',
  Rooftops: '#4DBFA6',
  Sweets: '#F58BB6',
}

// User-added spots (Phase 5) can carry any curated category plus a catch-all
// "point of interest". SpotCategory is the widened category used for spots.
export type SpotCategory = VenueCategory | 'poi'

// Muted survey-ink swatch for generic POIs — sits quietly next to the vivid
// category colors so a user's dropped pin reads as a "field note", not a venue.
export const poiColor = '#9db2c4'

// The picker's category options: the curated set, then the POI catch-all.
export const spotCategoryOptions: SpotCategory[] = [...categoryOrder, 'poi']

// Marker / swatch color for any spot category.
export function colorForCategory(cat: SpotCategory): string {
  return cat === 'poi' ? poiColor : categoryColor[cat]
}

// Human label for a spot category (curated names pass through; 'poi' spells out).
export function categoryLabel(cat: SpotCategory): string {
  return cat === 'poi' ? 'Point of interest' : cat
}
