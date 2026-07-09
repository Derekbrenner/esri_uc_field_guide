export type Attendee = {
  name: string
  arrival: string | null
  departure: string | null
  note?: string
}

export type CrewGroup = {
  group: string
  people: Attendee[]
}

// Straight from the trip doc. "?" in the doc becomes null (unknown).
export const crew: CrewGroup[] = [
  {
    group: 'Enterprise GIS & ITD',
    people: [
      { name: 'Jinna', arrival: '7/10', departure: '7/17' },
      { name: 'Dominic', arrival: '7/11', departure: '7/17' },
      { name: 'Mike', arrival: '7/12', departure: '7/17' },
      { name: 'Keelan', arrival: '7/12', departure: '7/17' },
      { name: 'Aimee', arrival: '7/11', departure: null },
      { name: 'Matt M.', arrival: '7/11', departure: null },
    ],
  },
  {
    group: 'Public Works',
    people: [
      { name: 'Alex', arrival: '7/11', departure: '7/17' },
      { name: 'Greg', arrival: '7/11', departure: '7/17' },
      { name: 'Jadah', arrival: '7/12', departure: '7/17' },
      { name: 'Mostafa', arrival: '7/11', departure: '7/17' },
      { name: 'Erik', arrival: '7/11', departure: '7/17' },
      { name: 'Udy', arrival: '7/14', departure: '7/17' },
      { name: 'Larry', arrival: '7/13', departure: '7/17' },
      { name: 'Tenell', arrival: '7/8', departure: '7/17' },
      { name: 'Erin', arrival: '7/10', departure: '7/15' },
    ],
  },
  {
    group: 'Other',
    people: [
      { name: 'Tom', arrival: '7/11', departure: '7/17', note: 'SBCAG' },
      { name: 'Harry', arrival: null, departure: null, note: 'Fire' },
      { name: 'Ben', arrival: null, departure: null, note: 'Sheriff' },
      { name: 'Susan', arrival: null, departure: null, note: 'Sheriff' },
      { name: 'Sam', arrival: null, departure: null, note: 'Sheriff' },
      { name: 'Carlos', arrival: '7/12', departure: '7/17', note: 'Assessor' },
    ],
  },
  {
    group: 'Friends & Family',
    people: [
      { name: 'Caleb', arrival: null, departure: '7/17' },
      { name: 'Henry', arrival: null, departure: '7/17' },
      { name: 'Kacie', arrival: null, departure: '7/17' },
      { name: 'Tanner', arrival: null, departure: null, note: 'TBC' },
      { name: 'Molly', arrival: null, departure: '7/17' },
      { name: 'Frank', arrival: null, departure: null },
      { name: 'Maricopa County +2', arrival: '7/11', departure: '7/17' },
      { name: 'Maricopa County +2', arrival: '7/12', departure: '7/17' },
      { name: "Caleb's Team +3", arrival: '7/12', departure: '7/17' },
    ],
  },
]

// Flat list of individual first names, handy for the "who am I" picker on the map.
export const attendeeNames: string[] = crew
  .flatMap((g) => g.people.map((p) => p.name))
  .filter((n) => !/\+\d|Team|County/.test(n))
