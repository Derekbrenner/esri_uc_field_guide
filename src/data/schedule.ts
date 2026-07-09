export type ScheduleItem = {
  time?: string
  text: string
  detail?: string
}

export type ScheduleBlock = {
  title: string
  group?: boolean // highlighted group meetup / event (yellow in the doc)
  items: ScheduleItem[]
}

export type ScheduleDay = {
  date: string // e.g. "7/13"
  weekday: string
  iso: string // for "is this today" checks — 2026 dates
  arriving?: string[]
  leaving?: string[]
  blocks: ScheduleBlock[]
}

export const schedule: ScheduleDay[] = [
  {
    date: '7/10',
    weekday: 'Friday',
    iso: '2026-07-10',
    arriving: ['Jinna', '+?'],
    blocks: [
      { title: 'Settle in', items: [{ text: 'Badge pickup (if open)' }, { text: 'Relax' }] },
    ],
  },
  {
    date: '7/11',
    weekday: 'Saturday',
    iso: '2026-07-11',
    arriving: ['Alex', 'Greg', 'Dominic', 'Matt M.', 'Erin', 'Erik', 'Mostafa', 'Tenell'],
    blocks: [
      {
        title: 'Badge pickup',
        items: [
          { text: 'Hall E/D — Convention Center' },
          { text: 'Marriott Marquis' },
        ],
      },
      {
        title: 'Dinner / Meetup',
        group: true,
        items: [{ time: '6:00 PM', text: 'La Puerta', detail: 'Tacos and drinks' }],
      },
      {
        title: 'Follow-up spots',
        items: [
          { text: 'Werewolf', detail: 'Karaoke' },
          { text: 'Rustic Root', detail: 'Cocktails + more food, semi-rooftop' },
          { text: 'Whiskey House', detail: 'Whiskey bar' },
        ],
      },
    ],
  },
  {
    date: '7/12',
    weekday: 'Sunday',
    iso: '2026-07-12',
    arriving: ['Mike', 'Jadah', 'Tom', '…'],
    blocks: [
      {
        title: 'Badge pickup options',
        items: [
          { text: 'Marriott Marquis — in front of Leadership Conference (morning)' },
          { time: '2–4 PM', text: 'Badge Pickup Social Hour @ Hall E' },
        ],
      },
      {
        title: 'Leadership Summit',
        items: [
          { time: '9:00–10:00', text: 'Setting a Vision for Success' },
          { time: '10:30–12:00', text: 'Being a Geospatial Leader' },
          { time: '12:00–1:15', text: 'Hosted Lunch' },
          { time: '1:15–3:00', text: 'Engaging and Growing' },
          { time: '3:00–3:45', text: 'Buy-in and Advocacy' },
        ],
      },
      {
        title: 'Dinner / Meetup',
        group: true,
        items: [{ time: '6:00 PM', text: "Nason's Beer Hall", detail: 'Pizza + drinks (Pendry)' }],
      },
      {
        title: 'Follow-up spots (TBD)',
        items: [{ text: 'Whiskey House', detail: 'Whiskey bar' }],
      },
    ],
  },
  {
    date: '7/13',
    weekday: 'Monday',
    iso: '2026-07-13',
    arriving: ['Larry'],
    blocks: [
      {
        title: 'Plenary — morning',
        items: [
          { time: '8:30–10:00', text: 'Plenary Part 1' },
          { time: '10:30–12:15', text: 'Plenary Part 2', detail: 'Leave early to beat lunch crowds' },
        ],
      },
      {
        title: 'Lunch',
        group: true,
        items: [{ time: '12:00 PM', text: 'Puesto', detail: 'Nice courtyard, Mexican' }],
      },
      {
        title: 'Plenary — afternoon',
        items: [{ time: '2:00–4:00', text: 'Plenary Conclusion', detail: 'Leave early to avoid the rush' }],
      },
      {
        title: 'Map Gallery Reception',
        items: [{ time: '4–6 PM', text: '1 free drink', detail: 'Get there at 4 — it gets busy' }],
      },
      {
        title: 'Socials',
        items: [
          { time: '5:00 PM', text: 'Bowman / Surdex @ Bay City Brewing', detail: 'Reserve spot' },
          { time: '6–9 PM', text: 'GUICE Social @ El Chingon', detail: 'Reserve spot' },
        ],
      },
    ],
  },
  {
    date: '7/14',
    weekday: 'Tuesday',
    iso: '2026-07-14',
    arriving: ['Udy'],
    blocks: [
      {
        title: 'Morning sessions',
        items: [
          { time: '7:00–8:00', text: 'Presentation Skills Workshop' },
          { time: '8:30–11:00', text: 'AI and ArcGIS' },
          { time: '10:00–11:00', text: 'Reimagining Right-of-Way Management with Real-Time, Automated Workflows' },
        ],
      },
      {
        title: 'Lunch',
        items: [
          { time: '11:30–12:30', text: 'Public Works SIG' },
          { time: '11:30 AM', text: 'Not attending PW SIG? Meetup location TBD' },
        ],
      },
      {
        title: 'Afternoon sessions',
        items: [
          { time: '1:00–2:00', text: 'Accessibility Essentials for GIS and Mapping' },
          { time: '2:30–3:30', text: 'Automating and Enhancing Apps for Accessibility' },
          { time: '4:00–5:00', text: 'Public Works as a Platform for Innovation' },
        ],
      },
      {
        title: 'Socials',
        items: [
          { text: 'Water Utilities & Water Resources @ Marina Terrace' },
          { text: 'Dell & Nvidia VIP Rooftop @ Altitude Sky Lounge (Marriott)', detail: 'Reserve spot' },
          { text: 'Electric & Gas / Telecommunications' },
          { text: 'GIS for Good' },
          { text: 'Transportation' },
        ],
      },
    ],
  },
  {
    date: '7/15',
    weekday: 'Wednesday',
    iso: '2026-07-15',
    leaving: ['Greg'],
    blocks: [
      {
        title: 'Morning sessions',
        items: [
          { time: '8:30–9:30', text: 'Strategic Asset Management' },
          { time: '10:00–10:20', text: 'Mobile Data Collection' },
          { time: '11:30–12:15', text: 'Indoor GIS' },
        ],
      },
      {
        title: 'Central Coast Meetup',
        group: true,
        items: [{ time: '1:00–3:00 PM', text: 'Marriott — Pacific Ballroom Salon 14', detail: 'Lunch or artisan desserts' }],
      },
      {
        title: 'Afternoon sessions',
        items: [{ time: '4:00–5:00', text: 'Modernizing Facilities Management for the Future' }],
      },
      {
        title: 'Balboa Park Party wristband pickup',
        items: [{ text: 'Best to grab today', detail: 'Requires wearing the wristband overnight' }],
      },
      {
        title: 'Socials',
        items: [
          { text: 'AEC' },
          { time: '6:00–6:30', text: 'Advantage Program @ Marina Terrace', detail: 'First stop' },
          { text: 'Forestry & Ag' },
          { time: '7:00–8:00', text: 'State and Local Gov @ Bayfront Park', detail: 'Second stop' },
          { text: 'YPN' },
        ],
      },
    ],
  },
  {
    date: '7/16',
    weekday: 'Thursday',
    iso: '2026-07-16',
    blocks: [
      {
        title: 'Golf',
        group: true,
        items: [{ time: '9:36 AM', text: 'Balboa Park Golf Course', detail: 'Alex / Larry / Udy / open spot?' }],
      },
      {
        title: 'Wristband pickup',
        items: [{ text: 'Balboa Park Party — do it early, the line gets long today' }],
      },
      {
        title: 'Morning sessions',
        items: [{ time: '10:00–11:00', text: 'Advancing Public Works Assets with Real-Time Data' }],
      },
      {
        title: 'Afternoon sessions',
        items: [
          { time: '2:30–3:30', text: 'Strategies for Delivering Enterprise-Wide Asset Management', detail: 'Jinna is speaking' },
          { time: '2:30–3:30', text: 'Revealing Access Gaps: GIS Insights for More Equitable Communities', detail: 'Tom Vo is speaking' },
        ],
      },
      {
        title: 'Balboa Park Party',
        group: true,
        items: [{ time: '5:30–9:00', text: 'Balboa Park' }],
      },
      {
        title: 'Little Italy evening',
        items: [
          { time: '8/9 PM?', text: 'Craft & Commerce' },
          { text: 'Trolley green line runs Little Italy ↔ Convention Center' },
        ],
      },
    ],
  },
  {
    date: '7/17',
    weekday: 'Friday',
    iso: '2026-07-17',
    blocks: [
      {
        title: 'Morning sessions',
        items: [{ time: '9:00–10:00', text: 'Aligning Geospatial and IT Strategies' }],
      },
      { title: 'Closing', items: [{ text: 'Closing session' }, { text: 'Departure' }] },
    ],
  },
]

export const tips: string[] = [
  'Download the Esri Events App to plan your schedule — keep a spreadsheet as backup for sessions.',
  'Pick up your badge early — Marriott Marquis lobby or the Convention Center.',
  'Sessions listed are Alex’s picks — feel free to add your own.',
  'Grab the Balboa Park Party wristband on Wed 7/15; you’ll wear it overnight.',
  'Trolley green line connects Little Italy and the Convention Center.',
]
