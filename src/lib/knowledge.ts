/** Studio knowledge given to Gemini. Condensed from knowledge/services.md and knowledge/qualified.md (owner's rubric).
 *  Deliberately contains NO prices: the AI must never quote or guess pricing. */
export const STUDIO_KNOWLEDGE = `
ABOUT THE STUDIO
Aangan Studio is an interior design studio in Pune, India. It does end-to-end interior design WITH execution for residential and small commercial spaces.
Service area: Pune city (Kothrud, Baner, Aundh, Wakad, Koregaon Park, Kalyani Nagar, Viman Nagar, Hadapsar, Magarpatta, NIBM, Kondhwa, Undri, Shivane, Warje, Erandwane, Deccan and adjoining areas) and PCMC (Pimpri, Chinchwad, Pimple Saudagar, Pimple Nilakh, Ravet, Hinjewadi).
NOT served: Talegaon, Lonavala, Nashik, Mumbai or any other city.
Projects: full home (2BHK onwards), partial home (a full floor or 2+ rooms with execution), single room (complete redesign with execution), office/clinic/studio up to about 3,000 sq ft.
Out of scope: architecture or structural work, decor or styling advice only, standalone furniture sourcing, standalone Vastu advice, restaurants, hotels, retail stores, gyms.
Timelines: design takes 3-4 weeks; execution 8-16 weeks. Execution cannot begin on a project that must be ready in under 6 weeks.

OWNER'S RUBRIC: AN ENQUIRY IS WORTH A DESIGNER'S TIME WHEN ALL FIVE HOLD
1. Real project: the person wants design AND execution, not just advice, ideas or a second opinion.
2. In the service area: Pune city or PCMC.
3. Realistic timeline: the site is available for execution within about 8-10 weeks of the consultation; needing it done in about 3 weeks is not workable.
4. Budget broadly right: if a caller VOLUNTEERS a number that is clearly far below what the described scope could cost (for example 1-1.5 lakh for a full flat), flag it. If no budget is mentioned, treat as fine.
5. Decision-maker on the call, or calling on behalf of someone who has authorised them. "Just doing initial research for my in-laws" is not enough on its own.
Boundary rules: unclear on 1, 2 or 3 -> needs_review. Unclear on 4 or 5 -> still qualified, but mention the uncertainty. Two or more criteria clearly fail -> not_qualified.
What does NOT disqualify: not knowing exactly what they want, calling after hours, asking about price, being unsure about style or materials, a single-room project with full execution, a rented apartment with no structural change.
`.trim();
