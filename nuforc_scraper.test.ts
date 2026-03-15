import { describe, it, expect } from "vitest";
import { parseSighting, parseArgs, shouldAbortWrite } from "./nuforc_scraper.js";

describe("parseSighting", () => {
  it("parses a normal row with a link", () => {
    const row = [
      '<a href="https://nuforc.org/sighting/?id=12345">Details</a>',
      "2024-01-15",
      "Portland",
      "OR",
      "USA",
      "Triangle",
      "Saw a triangular craft",
      "2024-01-16",
      "Y",
      null,
    ] as const;
    const result = parseSighting([...row]);
    expect(result.id).toBe("12345");
    expect(result.href).toBe("https://nuforc.org/sighting/?id=12345");
    expect(result.occurredAt).toBe("2024-01-15");
    expect(result.city).toBe("Portland");
    expect(result.state).toBe("OR");
    expect(result.country).toBe("USA");
    expect(result.shape).toBe("Triangle");
    expect(result.summary).toBe("Saw a triangular craft");
    expect(result.reportedAt).toBe("2024-01-16");
    expect(result.mediaIncluded).toBe(true);
    expect(result.explanation).toBeNull();
  });

  it("handles missing link (plain text)", () => {
    const row = [
      "Just some text",
      "2024-02-01",
      "Denver",
      "CO",
      "USA",
      "Sphere",
      "Round object",
      "2024-02-02",
      "N",
      null,
    ] as const;
    const result = parseSighting([...row]);
    expect(result.id).toBe("");
    expect(result.href).toBe("");
    expect(result.city).toBe("Denver");
    expect(result.mediaIncluded).toBe(false);
  });

  it("handles null/empty fields", () => {
    const row = [
      '<a href="https://nuforc.org/sighting/?id=99">X</a>',
      "",
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
    ] as const;
    const result = parseSighting([...row]);
    expect(result.id).toBe("99");
    expect(result.occurredAt).toBe("");
    expect(result.city).toBeNull();
    expect(result.state).toBeNull();
    expect(result.country).toBeNull();
    expect(result.shape).toBeNull();
    expect(result.summary).toBeNull();
    expect(result.reportedAt).toBeNull();
    expect(result.mediaIncluded).toBe(false);
    expect(result.explanation).toBeNull();
  });

  it("returns mediaIncluded true only for 'Y'", () => {
    const makeRow = (media: string | null) => [
      '<a href="https://nuforc.org/sighting/?id=1">X</a>',
      "", null, null, null, null, null, null, media, null,
    ] as const;
    expect(parseSighting([...makeRow("Y")]).mediaIncluded).toBe(true);
    expect(parseSighting([...makeRow("N")]).mediaIncluded).toBe(false);
    expect(parseSighting([...makeRow("")]).mediaIncluded).toBe(false);
    expect(parseSighting([...makeRow(null)]).mediaIncluded).toBe(false);
  });

  it("handles malformed HTML without throwing", () => {
    const row = [
      '<a href="broken>no closing quote',
      "2024-01-01",
      null, null, null, null, null, null, null, null,
    ] as const;
    expect(() => parseSighting([...row])).not.toThrow();
    const result = parseSighting([...row]);
    expect(result).toHaveProperty("id");
    expect(result).toHaveProperty("occurredAt", "2024-01-01");
  });
});

describe("parseArgs", () => {
  it("parses --max-records=500", () => {
    const result = parseArgs(["node", "script.ts", "--max-records=500"]);
    expect(result.maxRecords).toBe(500);
  });

  it("parses --max-records 500 (space-separated)", () => {
    const result = parseArgs(["node", "script.ts", "--max-records", "500"]);
    expect(result.maxRecords).toBe(500);
  });

  it("parses --force", () => {
    const result = parseArgs(["node", "script.ts", "--force"]);
    expect(result.force).toBe(true);
  });

  it("parses --pretty", () => {
    const result = parseArgs(["node", "script.ts", "--pretty"]);
    expect(result.pretty).toBe(true);
  });

  it("returns defaults when no relevant args", () => {
    const result = parseArgs(["node", "script.ts"]);
    expect(result.maxRecords).toBeUndefined();
    expect(result.force).toBe(false);
    expect(result.pretty).toBe(false);
  });

  // M3: parseArgs now throws for invalid --max-records values
  it("throws for --max-records=abc", () => {
    expect(() => parseArgs(["node", "script.ts", "--max-records=abc"])).toThrow(
      "Invalid value for --max-records. Must be a positive number."
    );
  });

  it("throws for --max-records=0", () => {
    expect(() => parseArgs(["node", "script.ts", "--max-records=0"])).toThrow(
      "Invalid value for --max-records. Must be a positive number."
    );
  });

  it("throws for --max-records=-5", () => {
    expect(() => parseArgs(["node", "script.ts", "--max-records=-5"])).toThrow(
      "Invalid value for --max-records. Must be a positive number."
    );
  });
});

describe("shouldAbortWrite", () => {
  it("returns true when newCount < 50% of existing and force is false", () => {
    expect(shouldAbortWrite(40, 100, false)).toBe(true);
  });

  it("returns false when newCount < 50% of existing but force is true", () => {
    expect(shouldAbortWrite(40, 100, true)).toBe(false);
  });

  it("returns false when newCount >= 50% of existing", () => {
    expect(shouldAbortWrite(50, 100, false)).toBe(false);
    expect(shouldAbortWrite(80, 100, false)).toBe(false);
  });

  it("returns false when existingCount is 0", () => {
    expect(shouldAbortWrite(0, 0, false)).toBe(false);
    expect(shouldAbortWrite(10, 0, false)).toBe(false);
  });
});
