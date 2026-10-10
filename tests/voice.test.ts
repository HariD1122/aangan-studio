import { describe, it, expect } from "vitest";
import { fallbackNotes, leadFields, NotesSchema, parseWebhook } from "../src/lib/voice";

describe("parseWebhook", () => {
  it("reads the nested call_postprocessing shape (duration in milliseconds)", () => {
    const p = parseWebhook({
      event: "call_postprocessing", call_id: "outbound-1", timestamp: "2026-10-10T10:00:00Z",
      data: { room_name: "room-1", call_id: "outbound-1", call_duration: 42500, end_reason: "user_hangup", summary: "Wants a 3BHK redesign.",
        entities: { budget: "25 lakh" }, dispositions: ["interested"], recording_url: "https://x/y.mp3", transcript: "AGENT: Hi\nUSER: Hello" },
    });
    expect(p).toMatchObject({ event: "call_postprocessing", callId: "outbound-1", roomName: "room-1", durationSeconds: 42.5, summary: "Wants a 3BHK redesign." });
    expect(p.transcript).toContain("USER: Hello");
  });
  it("reads the flat call_started shape and the phone number", () => {
    const p = parseWebhook({ event: "call_started", room_name: "room-9", status: "dialing", phone_number: "+919876543210" });
    expect(p).toMatchObject({ event: "call_started", roomName: "room-9", phone: "+919876543210", status: "dialing" });
  });
  it("call_ended duration is already seconds", () => {
    expect(parseWebhook({ event: "call_ended", room_name: "r", call_duration: 42.5, end_reason: "x" }).durationSeconds).toBe(42.5);
  });
  it("flattens a transcript given as turns, and survives garbage", () => {
    const p = parseWebhook({ event: "call_postprocessing", data: { transcript: [{ role: "agent", text: "Hello" }, { role: "user", text: "Hi" }] } });
    expect(p.transcript).toBe("AGENT: Hello\nUSER: Hi");
    expect(parseWebhook(null).event).toBeNull();
    expect(parseWebhook("nonsense").callId).toBeNull();
  });
});

describe("Gemini notes", () => {
  const good = {
    short_notes: ["3BHK in Baner, about 1,100 sq ft", "Full redesign by March"], customer_name: "Priya Verma", project_type: "Full home",
    property_type: "3BHK apartment", project_location: "Baner, Pune", area_value: 1100, area_unit: "sqft", budget_min: 2400000, budget_max: 2600000,
    timeline: "By March", requirements: "Kitchen, wardrobes, living room", customer_questions: [], follow_ups: ["Book a consultation"],
    qualification: "qualified", qualification_reason: "Real project in Baner with a workable timeline.", missing_fields: [],
  };
  it("accepts a valid result", () => {
    expect(NotesSchema.safeParse(good).success).toBe(true);
  });
  it("accepts requirements given as a list by joining it", () => {
    const r = NotesSchema.safeParse({ ...good, requirements: ["Kitchen", "Wardrobes"] });
    expect(r.success && r.data.requirements).toBe("Kitchen; Wardrobes");
  });
  it("rejects invented or malformed values instead of trusting them", () => {
    expect(NotesSchema.safeParse({ ...good, qualification: "great lead" }).success).toBe(false);
    expect(NotesSchema.safeParse({ ...good, budget_min: -5 }).success).toBe(false);
    expect(NotesSchema.safeParse({ ...good, area_unit: "acres" }).success).toBe(false);
  });
  it("maps to lead fields and repairs a reversed budget range", () => {
    const f = leadFields({ ...good, budget_min: 3000000, budget_max: 2000000 } as never);
    expect([f.budget_min, f.budget_max]).toEqual([2000000, 3000000]);
    expect(f.requirements).toContain("- 3BHK in Baner");
    expect(f.qualification_status).toBe("qualified");
  });
  it("the fallback always asks a human to review", () => {
    const f = fallbackNotes("Caller wants help.");
    expect(f.qualification).toBe("needs_review");
    expect(f.short_notes).toEqual(["Caller wants help."]);
  });
});
