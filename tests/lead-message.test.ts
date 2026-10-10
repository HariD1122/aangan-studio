import { describe, it, expect } from "vitest";
import { budgetText, escapeHtml, leadMessage, type LeadForMessage } from "../src/lib/lead-message";

const lead: LeadForMessage = {
  id: "11111111-1111-1111-1111-111111111111", full_name: "Rhea <b>Kulkarni</b>", project_type: "Full home", project_location: "Kothrud, Pune",
  property_type: "3BHK", area_value: "1400.00", area_unit: "sqft", budget_min: "2500000", budget_max: "3000000",
  timeline: "By March", source: "Phone call", qualification_status: "qualified",
};

describe("lead message", () => {
  it("includes the useful facts and a link to the app", () => {
    const m = leadMessage(lead, "https://app.example.com");
    expect(m).toContain("Project: Full home · 3BHK");
    expect(m).toContain("Area: 1400 sq ft");
    expect(m).toContain("₹25,00,000 – ₹30,00,000");
    expect(m).toContain('href="https://app.example.com/clients/11111111-1111-1111-1111-111111111111"');
  });
  it("never includes phone or email", () => {
    const m = leadMessage({ ...lead, ...({ phone: "+919876543210", email: "x@y.com" } as object) } as LeadForMessage, "https://a.b");
    expect(m).not.toMatch(/9876543210|x@y\.com/);
  });
  it("escapes HTML so a customer name cannot break or inject into the message", () => {
    expect(leadMessage(lead, "https://a.b")).toContain("Rhea &lt;b&gt;Kulkarni&lt;/b&gt;");
    expect(escapeHtml("a & b < c")).toBe("a &amp; b &lt; c");
  });
  it("skips fields the customer did not give instead of printing blanks", () => {
    const m = leadMessage({ ...lead, budget_min: null, budget_max: null, timeline: null, area_value: null }, "https://a.b");
    expect(m).not.toMatch(/Budget|Timeline|Area/);
    expect(budgetText(null, null)).toBeNull();
  });
});
