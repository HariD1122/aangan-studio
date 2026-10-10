// 10 DEMO client profiles. Fictional people (names, numbers and emails are made up), loosely based on the shape of
// the September 2026 enquiries. Every record is flagged is_demo and shows a DEMO badge in the app and in HubSpot.
// `outcome` is what the admin would later type in HubSpot (deal stage, final budget, lost reason).

export const DEMO_DESIGNERS = [
  { name: "Ananya Rao", specializations: ["Residential", "Kitchens"], years: 9 },
  { name: "Rahul Kulkarni", specializations: ["Residential", "Small offices"], years: 6 },
  { name: "Kavya Joshi", specializations: ["Full homes", "Lighting"], years: 11 },
];

export const DEMO_CLIENTS = [
  { n: 1, name: "Rhea Kulkarni", loc: "Dahanukar Colony, Kothrud, Pune", type: "Full home", prop: "3BHK apartment", area: 1400, min: 2500000, max: 3000000,
    timeline: "Done by March, no rush", qual: "qualified", designer: 0, source: "Referral",
    req: "Full redesign: kitchen, living room and both bedrooms. Referred by a past client. Husband agrees; both will attend the consultation.",
    outcome: { stage: "Deal Won", amount: 2750000 } },
  { n: 2, name: "Manish Patil", loc: "Wakad, Pune", type: "Full home", prop: "2BHK apartment", area: 950, min: 1400000, max: 1800000,
    timeline: "Move in November; design from October", qual: "qualified", designer: 1, source: "Instagram",
    req: "Modular kitchen, wardrobes, living room and both bedrooms. Asked for a price range on the call and was told the designer will explain at the consultation.",
    outcome: { stage: "In Negotiation", amount: 1600000 } },
  { n: 3, name: "Sheena Rao", loc: "Hinjewadi Phase 1, Pune", type: "Commercial office", prop: "Shell and core office", area: 2200, min: 6000000, max: 8000000,
    timeline: "Operational by 15 January", qual: "qualified", designer: 0, source: "Referral",
    req: "Office for a team of 60: workstations for 55, four cabins, a boardroom, two meeting rooms, a lounge and a pantry. Speed matters.",
    outcome: { stage: "Demo delivered", amount: 7000000 } },
  { n: 4, name: "Meena Iyer", loc: "NIBM Road, Pune", type: "Full home", prop: "4BHK ground floor", area: 1950, min: 3500000, max: 4000000,
    timeline: "Moving out temporarily, start February 2027", qual: "qualified", designer: 2, source: "Press article",
    req: "New kitchen, three bedrooms redone, new living-room flooring and a proper study. Likes warm, earthy, minimal. Shortlisted three studios; budget is not flexible upward.",
    outcome: { stage: "Deal Won", amount: 3800000 } },
  { n: 5, name: "Karan Mehta", loc: "Aundh, Pune", type: "Full home + home office", prop: "3BHK apartment", area: 1300, min: 1800000, max: 2200000,
    timeline: "Ready to start immediately", qual: "qualified", designer: 1, source: "LinkedIn",
    req: "Two people work from home and each need a dedicated workspace, plus a full home design. Both are product designers and want a collaborative process with several options.",
    outcome: { stage: "Lead Nurtured", amount: 2000000 } },
  { n: 6, name: "Nidhi Shah", loc: "Wakad, Pune", type: "Partial: living room + kitchen", prop: "2BHK apartment", area: 875, min: 400000, max: 500000,
    timeline: "Guests arrive in 3 weeks", qual: "not_qualified", designer: 2, source: "Web form",
    req: "Wants the living room and kitchen presentable before guests arrive from abroad.",
    outcome: { stage: "Deal Lost", reason: "Timeline too short (execution needs at least 6 weeks)" } },
  { n: 7, name: "Suresh Joshi", loc: "Talegaon Dabhade", type: "Full home", prop: "3BHK independent house", area: 1400, min: 1500000, max: 2000000,
    timeline: "3-4 months, flexible", qual: "not_qualified", designer: null, source: "Web form",
    req: "Needs everything done from scratch after possession. Site is outside the Pune and PCMC service area.",
    outcome: { stage: "Deal Lost", reason: "Outside service area" } },
  { n: 8, name: "Anand Deshmukh", loc: "Kalyani Nagar, Pune", type: "Full home", prop: "Villa, ground + two floors", area: 5500, min: null, max: null,
    timeline: "March next year, no rush", qual: "qualified", designer: 0, source: "Phone call",
    req: "New construction, completely empty. Wants the principal designer to visit the site for the first consultation this week or next.",
    outcome: null },
  { n: 9, name: "Smita Bhosale", loc: "Undri, Pune", type: "Full home", prop: "2BHK apartment", area: 875, min: null, max: null,
    timeline: "Possession in about six weeks", qual: "needs_review", designer: null, source: "Phone call",
    req: "Kitchen, wardrobes and living room. Owner with husband's approval. Builder allows early site access. Timeline is close to the six-week minimum, so a person should review.",
    outcome: null },
  { n: 10, name: "Chinmay Gokhale", loc: "Chinchwad, Pimpri-Chinchwad", type: "Commercial office", prop: "Bare shell office", area: 1200, min: null, max: null,
    timeline: "Operational by January", qual: "qualified", designer: 1, source: "WhatsApp",
    req: "Workstations for 30 people, two cabins and one meeting room. Asked for a calendar link to book a site visit.",
    outcome: null },
];

export const demoPhone = (n) => `+9190000001${String(n).padStart(2, "0")}`;
export const demoEmail = (n) => `demo-client-${n}@example.com`;
