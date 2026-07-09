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

// NOTE ON COORDINATES: these are best-effort locations in downtown San Diego
// (Gaslamp / East Village / Little Italy) so the map is useful out of the box.
// A few may be a block off — every one is easy to nudge: just edit lat/lng here.
const rawVenues: Omit<Venue, 'slug'>[] = [
  // --- Landmarks / key schedule spots ---
  { name: 'San Diego Convention Center', category: 'Landmark', landmark: true, notes: 'Home base — plenary, sessions, exhibit hall.', lat: 32.7065, lng: -117.161 },
  { name: 'Marriott Marquis', category: 'Landmark', landmark: true, notes: 'Badge pickup + Central Coast Meetup (Pacific Ballroom Salon 14).', lat: 32.7062, lng: -117.1622 },
  { name: 'Petco Park', category: 'Landmark', landmark: true, notes: 'Ballpark next to the convention center.', lat: 32.7073, lng: -117.1566 },
  { name: 'Balboa Park', category: 'Landmark', landmark: true, notes: 'Balboa Park Party, Thu 7/16 · 5:30–9:00.', lat: 32.7341, lng: -117.1447 },
  { name: 'Balboa Park Golf Course', category: 'Landmark', landmark: true, notes: 'Golf Thu 7/16, 9:36 AM tee time.', lat: 32.728, lng: -117.137 },

  // --- Lunch ---
  { name: 'La Puerta', category: 'Dinner', area: 'Sit Down Spots', notes: 'Tacos and drinks. Saturday-night group dinner spot.', schedule: 'Sat 7/11 group dinner · 6 PM', tags: ['Lunch'], lat: 32.7108, lng: -117.1597 },
  { name: 'Puesto', category: 'Lunch', area: 'Sit Down Spots', notes: 'Nice courtyard, Mexican food. Monday group lunch.', schedule: 'Mon 7/13 group lunch · 12 PM', tags: ['Dinner'], lat: 32.7096, lng: -117.1686 },
  { name: 'Waves Taco Club', category: 'Lunch', area: 'Fast Spots', notes: 'Fish tacos, birria.', lat: 32.7132, lng: -117.1638 },
  { name: 'Taquería Los Chuchys', category: 'Lunch', area: 'Fast Spots', notes: 'Authentic tacos.', lat: 32.7101, lng: -117.1543 },
  { name: 'Tacos el Gordo', category: 'Lunch', area: 'Fast Spots', notes: 'Authentic tacos, long lines.', lat: 32.7148, lng: -117.161 },
  { name: 'El Chingon', category: 'Lunch', area: 'Fast Spots', notes: 'Tacos, good happy hour deals. GUICE social Mon 6–9.', schedule: 'Mon 7/13 · GUICE Social 6–9', lat: 32.7228, lng: -117.169 },
  { name: 'The Taco Stand', category: 'Lunch', area: 'Further Away', notes: 'California Burrito.', lat: 32.7245, lng: -117.1685 },

  // --- Dinner ---
  { name: 'Garage and Kitchen', category: 'Dinner', notes: 'American food and beer.', lat: 32.7118, lng: -117.1585 },
  { name: 'Werewolf', category: 'Dinner', notes: 'Casual food and karaoke at night — if you know, you know.', schedule: 'Sat 7/11 follow-up · karaoke', lat: 32.7146, lng: -117.1618 },
  { name: "Freddy's Chophouse", category: 'Dinner', notes: 'Steak house.', lat: 32.7125, lng: -117.1602 },
  { name: "Nason's Beer Hall", category: 'Dinner', area: 'Drink Focused + Food', notes: 'Pizza and drinks; casual craft-beer spot inside the Pendry.', schedule: 'Sun 7/12 group dinner · 6 PM', lat: 32.7107, lng: -117.1592 },
  { name: 'Field Irish Pub', category: 'Dinner', area: 'Drink Focused + Food', notes: 'Irish pub.', lat: 32.7122, lng: -117.1596 },

  // --- Breweries ---
  { name: 'East Village Brewing Company', category: 'Breweries', notes: 'Good reviews, near Petco Park.', lat: 32.7095, lng: -117.1548 },
  { name: 'Mission Brewing – East Village', category: 'Breweries', notes: 'Historic 1894 Wonder Bread building; Old Mission Lager & Saison, dog-friendly, no food menu.', lat: 32.7062, lng: -117.164 },
  { name: 'The Church by The Lost Abbey', category: 'Breweries', notes: 'Belgian-inspired Lost Abbey tasting room in a converted 1906 church — stained glass, pew seating, taco kitchen.', lat: 32.71, lng: -117.154 },
  { name: 'Bay City Brewing Co Tasting Room', category: 'Breweries', notes: 'Group social spot.', schedule: 'Mon 7/13 · Bowman/Surdex 5 PM', lat: 32.7085, lng: -117.156 },
  { name: 'Knotty Brewing Co.', category: 'Breweries', notes: 'Small East Village brewery next to Knotty Barrel; clean British/European styles, cozy patio.', lat: 32.7118, lng: -117.156 },
  { name: 'Mike Hess', category: 'Breweries', notes: 'Closest brewery to the conference, but expensive; served in aluminum cups.', lat: 32.7112, lng: -117.1547 },
  { name: 'Burgeon at The Arbor', category: 'Breweries', area: 'Further Away', notes: 'Fantastic hazy IPAs.', lat: 32.7189, lng: -117.1712 },
  { name: 'Stone Brewing Tap Room – Kettner', category: 'Breweries', area: 'Further Away', notes: 'Iconic San Diego brewery.', lat: 32.728, lng: -117.1699 },
  { name: 'Ballast Point Brewing', category: 'Breweries', area: 'Further Away', notes: 'Famous for Sculpin IPA; fun waterfront-area location.', lat: 32.7245, lng: -117.17 },

  // --- Cocktail Bars ---
  { name: 'Noble Experiment', category: 'Cocktail Bars', notes: 'Hidden behind a wall of kegs — speakeasy.', lat: 32.7115, lng: -117.1568 },
  { name: 'Lions Share', category: 'Cocktail Bars', notes: 'Nice cocktails, also has dinner.', tags: ['Dinner'], lat: 32.7135, lng: -117.1615 },
  { name: 'Prohibition Lounge', category: 'Cocktail Bars', notes: 'Live jazz, Prohibition-era décor, creative cocktails.', lat: 32.7128, lng: -117.16 },
  { name: 'Fifth & Rose', category: 'Cocktail Bars', notes: 'Stylish hotel cocktail bar inside the Pendry — ideal for starting the evening.', lat: 32.7108, lng: -117.1592 },
  { name: 'Whiskey House', category: 'Cocktail Bars', notes: 'Whiskey bar.', schedule: 'Sat/Sun follow-up spot', lat: 32.7112, lng: -117.1598 },

  // --- Rooftops ---
  { name: 'Altitude Sky Lounge', category: 'Rooftops', notes: 'Incredible views of Petco Park and downtown, especially at sunset.', schedule: 'Tue 7/14 · Dell/Nvidia VIP Rooftop Social', lat: 32.7069, lng: -117.1596 },
  { name: 'Rustic Root', category: 'Rooftops', area: 'Drink Focused + Food', notes: 'Only second story; ok food, good drinks; gets loud/busy at night. Cocktails + American food.', tags: ['Dinner', 'Cocktail Bars'], lat: 32.7118, lng: -117.16 },
  { name: 'The Nolen Rooftop', category: 'Rooftops', notes: '14th-floor lounge atop the Courtyard Gaslamp — Petco to Coronado Bridge views; fire pits, 21+ after 8pm.', lat: 32.7115, lng: -117.1605 },
  { name: "5 O'Clock Somewhere Rooftop Bar", category: 'Rooftops', notes: 'Tropical, Margaritaville-themed rooftop pool bar; cocktails, light bites, weekly live music.', lat: 32.7116, lng: -117.1604 },
  { name: 'Top of the Hyatt', category: 'Rooftops', notes: 'Bar on top of the Manchester Grand Hyatt.', lat: 32.7065, lng: -117.1693 },
  { name: 'Kettner Exchange', category: 'Rooftops', notes: 'Little Italy nice rooftop bar.', lat: 32.7264, lng: -117.1707 },
  { name: 'Borrego Rooftop (Hotel Indigo)', category: 'Rooftops', notes: 'Desert-inspired rooftop on the 9th floor of Hotel Indigo; skyline + Petco views, firepits, craft cocktails.', lat: 32.71, lng: -117.1568 },
  { name: 'Poolhouse (Pendry)', category: 'Rooftops', notes: 'Rooftop pool lounge at the Pendry — cabanas, daybeds, California-style menu; open to locals.', lat: 32.7106, lng: -117.1592 },
  { name: 'Sunbird', category: 'Rooftops', notes: 'Reimagined rooftop at the AC Hotel Gaslamp (formerly Techo Beso); coastal small plates, skyline views.', lat: 32.711, lng: -117.161 },

  // --- Sweets ---
  { name: 'Salt and Straw', category: 'Sweets', notes: 'Famous ice cream in Little Italy.', lat: 32.7238, lng: -117.169 },
]

// Each venue gets a stable slug derived from its name (see slugify above).
export const venues: Venue[] = rawVenues.map((v) => ({ ...v, slug: slugify(v.name) }))

export const categoryOrder: VenueCategory[] = [
  'Landmark',
  'Lunch',
  'Dinner',
  'Breweries',
  'Cocktail Bars',
  'Rooftops',
  'Sweets',
]

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
