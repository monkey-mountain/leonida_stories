// Leonida Stories — game data.
// The setting is based on what has been made public about Grand Theft Auto VI
// (official trailers, Rockstar's website and press coverage). Everything else
// is fan-made and fictional.
'use strict';

const LEONIDA = {
  info: {
    title: 'Grand Theft Auto VI',
    developer: 'Rockstar Games',
    release: 'November 19, 2026',
    platforms: 'PlayStation 5, Xbox Series X|S (PC not announced)',
    state: 'Leonida, Rockstar\'s take on Florida',
    trailers: [
      'Trailer 1: December 2023 (posted early after a leak)',
      'Trailer 2: May 6, 2025',
    ],
    delays: [
      'First announced for 2025',
      'Delayed to May 26, 2026',
      'Delayed again to November 19, 2026',
    ],
    supporting: [
      ['Cal Hampton', 'Jason\'s friend. Spends his time listening in on Coast Guard radio chatter.'],
      ['Boobie Ike', 'A Vice City local who runs a strip club and a recording studio.'],
      ['Dre\'Quan Priest', 'A music manager who signs talent to Boobie\'s label.'],
      ['Real Dimez', 'A rap duo making a name for themselves.'],
      ['Raul Bautista', 'A veteran bank robber who is always planning the next score.'],
      ['Brian Heder', 'An old-school smuggler who rents Jason a place in the Keys.'],
    ],
  },

  characters: {
    lucia: {
      id: 'lucia', name: 'Lucia Caminos', short: 'Lucia', color: '#e8457a', skin: '#c68a5e', hair: '#1b1210',
      bio: 'Just out of the Leonida Penitentiary. Her father taught her to fight from the moment she could walk, and she wants the good life her mother dreamed of.',
    },
    jason: {
      id: 'jason', name: 'Jason Duval', short: 'Jason', color: '#2fa3d6', skin: '#e0b48f', hair: '#5b3b22',
      bio: 'Grew up around grifters and crooks. After a stint in the Army he ended up in the Keys doing jobs for local drug runners. Maybe Lucia is his way out.',
    },
  },

  // Region rectangles in tiles: [x0, y0, x1, y1]
  regions: [
    { id: 'vice', name: 'Vice City', rect: [168, 0, 256, 200], desc: 'Miami-inspired city of neon, beaches, nightlife and new money.', color: '#ff4fa3' },
    { id: 'keys', name: 'Leonida Keys', rect: [100, 204, 256, 256], desc: 'A chain of islands linked by a long ocean highway. Boats, bars and smugglers.', color: '#39d0c8' },
    { id: 'grass', name: 'Grassrivers', rect: [84, 96, 168, 204], desc: 'Swampland wilderness of airboats, alligators and back-road dealers.', color: '#7bb84a' },
    { id: 'gellhorn', name: 'Port Gellhorn', rect: [0, 0, 84, 90], desc: 'A faded resort town on the Gulf coast, now a port full of dockworkers.', color: '#f0a040' },
    { id: 'ambrosia', name: 'Ambrosia', rect: [84, 0, 168, 96], desc: 'Industrial heartland built on sugar refineries and farmland. Home of the Leonida Penitentiary.', color: '#d6c04a' },
    { id: 'kalaga', name: 'Mount Kalaga National Park', rect: [0, 90, 84, 204], desc: 'Forest trails, rivers and campgrounds in the rural north.', color: '#3e9a5a' },
  ],

  vehicles: {
    sedan:   { name: 'Stanier',      maxSpeed: 330, accel: 260, brake: 520, turn: 2.6, grip: 7,  w: 18, l: 38, hp: 900,  colors: ['#c9c9c9', '#3a5fa0', '#7a2a2a', '#2d2d2d', '#e3e0d4'] },
    compact: { name: 'Blista',       maxSpeed: 300, accel: 280, brake: 520, turn: 3.0, grip: 8,  w: 16, l: 30, hp: 700,  colors: ['#f2c94c', '#56ccf2', '#eb5757', '#6fcf97'] },
    sports:  { name: 'Banshee',      maxSpeed: 470, accel: 380, brake: 640, turn: 2.8, grip: 6,  w: 18, l: 38, hp: 800,  colors: ['#ff2e88', '#00c2c7', '#ffb300', '#ffffff'] },
    super:   { name: 'Infernus',     maxSpeed: 540, accel: 460, brake: 700, turn: 2.9, grip: 6.5, w: 19, l: 40, hp: 800, colors: ['#ff5a1f', '#f5f5f5'] },
    muscle:  { name: 'Dominator',    maxSpeed: 430, accel: 360, brake: 520, turn: 2.4, grip: 4.5, w: 19, l: 40, hp: 1000, colors: ['#111111', '#8b1e1e', '#e8a33d'] },
    suv:     { name: 'Baller',       maxSpeed: 340, accel: 270, brake: 520, turn: 2.3, grip: 7,  w: 21, l: 42, hp: 1300, colors: ['#1d1d1d', '#e6e6e6', '#2b3a55'] },
    pickup:  { name: 'Bison',        maxSpeed: 320, accel: 250, brake: 480, turn: 2.3, grip: 6,  w: 21, l: 44, hp: 1300, colors: ['#8d6e4a', '#4a6b3a', '#a33', '#ddd'] },
    truck:   { name: 'Mule',         maxSpeed: 250, accel: 160, brake: 400, turn: 1.8, grip: 7,  w: 24, l: 60, hp: 2000, colors: ['#e0e0e0', '#3a6ea5'] },
    police:  { name: 'Police Cruiser', maxSpeed: 430, accel: 380, brake: 640, turn: 2.8, grip: 7.5, w: 19, l: 40, hp: 1100, colors: ['#f4f4f4'] },
  },

  trafficMix: ['sedan', 'sedan', 'compact', 'compact', 'suv', 'pickup', 'sports', 'muscle', 'truck', 'sedan', 'suv'],

  weapons: [
    { id: 'fist',    name: 'Fists',   dmg: 15, rate: 0.4, speed: 0,   spread: 0,    range: 28,  pellets: 0 },
    { id: 'pistol',  name: 'Pistol',  dmg: 25, rate: 0.28, speed: 1100, spread: 0.04, range: 520, pellets: 1 },
    { id: 'smg',     name: 'SMG',     dmg: 16, rate: 0.08, speed: 1200, spread: 0.09, range: 480, pellets: 1 },
    { id: 'shotgun', name: 'Shotgun', dmg: 18, rate: 0.85, speed: 1000, spread: 0.22, range: 300, pellets: 6 },
    { id: 'rifle',   name: 'Carbine', dmg: 30, rate: 0.12, speed: 1500, spread: 0.035, range: 700, pellets: 1 },
  ],

  radio: [
    'Radio Off',
    'Vice City FM — 80s & 2020s Hits',
    'Leonida Bass Radio',
    'Keys Island Rhythms',
    'Grassrivers Country',
    'WCTR Talk — Leonida Today',
    'Flash Latino',
  ],

  newsFeed: [
    ['@LeonidaToday', 'Florida Man... sorry, LEONIDA Man arrested for walking an alligator through a Vice City mall.'],
    ['@ViceBeachBabe', 'Sunset at Ocean Drive hits different 🌴🌅 #ViceCity'],
    ['@RealDimez', 'New track droppin tonight. Pull up to the studio. 🔥'],
    ['@KeysFishing', 'Caught a 40lb snapper off the Seven Bridges. Coast guard said nothing about the bales.'],
    ['@VCPD', 'Reminder: robbing convenience stores is a crime. Even if you film it.'],
    ['@GrassriversGator', 'Saw two folks on an airboat doing 60 through the reeds. Wild.'],
    ['@PortGellhornNews', 'Dockworkers union announces strike. Cargo piles up at the port.'],
    ['@AmbrosiaSugar', 'Refinery tours resume this weekend. Free samples!'],
    ['@CalHampton', 'Coast Guard scanner says big shipment coming thru the Keys tonight. Not that I care.'],
  ],

  // Mission coordinates use road-grid nodes: node [i, j] = tile (12i+1, 12j+1)
  missions: [
    {
      id: 'm1', title: 'Out on Good Behavior', char: 'lucia', start: [9, 4], reward: 1500,
      intro: [
        ['Lucia', 'Six years. Six years in that place.'],
        ['Lucia', 'Jason said he\'d be waiting in Vice City. First, I need wheels.'],
      ],
      steps: [
        { type: 'getcar', text: 'Steal a car. Walk up to one and press F.' },
        { type: 'goto', at: [17, 7], inVehicle: true, text: 'Drive to Jason\'s safehouse in Vice City.' },
      ],
      outro: [['Jason', 'You look good, Lucia. Real good. Welcome back.']],
    },
    {
      id: 'm2', title: 'Keys to Paradise', char: 'jason', start: [17, 7], reward: 6000,
      intro: [
        ['Jason', 'Brian wants an Infernus down in the Keys. Some rich kid parked one at a Vice Beach valet.'],
        ['Jason', 'Grab it and get it to Brian\'s garage before the owner calls it in.'],
      ],
      steps: [
        { type: 'getcar', spawn: 'super', at: [19, 3], text: 'Steal the Infernus from the Vice Beach valet.' },
        { type: 'goto', at: [17, 19], inVehicle: true, keepVehicle: true, time: 95, text: 'Deliver the Infernus to Brian\'s garage in the Keys.' },
      ],
      outro: [['Brian', 'Not a scratch. Well... a few scratches. Here\'s your cut.']],
    },
    {
      id: 'm3', title: 'Quick Stop', char: 'lucia', start: [15, 10], reward: 3000,
      intro: [
        ['Lucia', 'Rent\'s due and Jason\'s cut won\'t last.'],
        ['Lucia', 'There\'s a store around here. In and out. Nobody gets hurt.'],
      ],
      steps: [
        { type: 'rob', text: 'Rob any store (green $ on the map). Hold E at the door.' },
        { type: 'lose', text: 'Lose the cops.' },
        { type: 'goto', at: [17, 7], text: 'Lay low at the safehouse.' },
      ],
      outro: [['Lucia', 'Easy money. Never gets old.']],
    },
    {
      id: 'm4', title: 'Swamp Business', char: 'jason', start: [10, 13], reward: 9000,
      intro: [
        ['Jason', 'Some swamp boys ripped off Brian\'s people out by the bait shop.'],
        ['Cal', 'Scanner says they\'re armed. Don\'t get eaten by a gator, man.'],
      ],
      steps: [
        { type: 'goto', at: [10, 15], text: 'Head to the bait shop in Grassrivers.' },
        { type: 'kill', at: [10, 15], count: 5, text: 'Take out the swamp dealers.' },
        { type: 'goto', at: [10, 15], onFoot: true, text: 'Grab the package.', icon: 'package' },
        { type: 'goto', at: [17, 19], text: 'Bring the package to Brian in the Keys.' },
      ],
      outro: [['Brian', 'That\'s what I like to see. Professional.']],
    },
    {
      id: 'm5', title: 'Port Authority', char: 'lucia', start: [3, 3], reward: 12000,
      intro: [
        ['Lucia', 'A rival crew is moving product out of Port Gellhorn in a delivery truck.'],
        ['Lucia', 'Raul pays good money to make that truck disappear.'],
      ],
      steps: [
        { type: 'destroy', spawn: 'truck', at: [2, 5], text: 'Destroy the rival\'s truck.' },
        { type: 'lose', text: 'Lose your wanted level.' },
      ],
      outro: [['Raul', 'Burned. Beautiful. You have talent, Lucia.']],
    },
    {
      id: 'm6', title: 'Bonnie & Clyde', char: 'any', start: [16, 9], reward: 250000,
      intro: [
        ['Raul', 'The Maze Bank on Vice Boulevard. Vault\'s loaded on Fridays.'],
        ['Lucia', 'Only way we survive this is if we got each other\'s backs.'],
        ['Jason', 'Ride or die.'],
      ],
      steps: [
        { type: 'goto', at: [18, 9], onFoot: true, text: 'Go to the bank entrance on foot.' },
        { type: 'rob', at: [18, 9], hold: 5, stars: 4, cash: 0, text: 'Hold E to crack the vault.' },
        { type: 'lose', text: 'Lose the cops!' },
        { type: 'goto', at: [17, 19], text: 'Get to Brian\'s place in the Keys.' },
      ],
      outro: [['Jason', 'We did it. We actually did it.'], ['Lucia', 'This is just the beginning.']],
    },
  ],

  // Pickups: [type, tileX, tileY]
  pickups: [
    ['pistol', 202, 86], ['smg', 186, 40], ['shotgun', 230, 150], ['rifle', 199, 120], ['armor', 214, 62],
    ['health', 226, 98], ['health', 190, 170], ['smg', 40, 40], ['health', 30, 64], ['armor', 50, 28],
    ['shotgun', 112, 60], ['health', 130, 49], ['rifle', 122, 150], ['armor', 158, 228], ['health', 210, 227],
    ['cash', 230, 30], ['cash', 175, 180], ['cash', 60, 130], ['cash', 145, 228], ['cash', 100, 97],
  ],
};
