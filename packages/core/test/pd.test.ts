import { describe, it, expect } from "vitest";
import { scanText, maskText } from "../src/pd";

describe("personal-data scan (v1 PD_SEND)", () => {
  it("finds emails, Indian phones and ID numbers and counts them by kind", () => {
    const r = scanText("Write to asha@uni.ac.in or call +91 98765 43210, roll 9876543210. Aadhaar 1234 5678 9012, PAN ABCDE1234F.");
    expect(r.counts).toEqual({ "email address": 1, "phone number": 2, "ID number": 2 });
    expect(r.total).toBe(5);
    expect(r.sig).toContain("email address");
  });
  it("ignores numbers that are not phones or ids", () => {
    expect(scanText("n = 120, M = 3.45, SD = 0.9, year 2024, 12345").total).toBe(0);
  });
  it("masks with the v1 placeholders and keeps surrounding text", () => {
    expect(maskText("Mail asha@uni.ac.in, phone 9876543210, PAN ABCDE1234F.")).toBe("Mail [email], phone [phone], PAN [id number].");
  });
  it("gives the same signature for the same findings, so 'Send as it is' can be remembered", () => {
    expect(scanText("a@b.co x").sig).toBe(scanText("a@b.co y").sig);
    expect(scanText("a@b.co").sig).not.toBe(scanText("c@d.co").sig);
  });
});
