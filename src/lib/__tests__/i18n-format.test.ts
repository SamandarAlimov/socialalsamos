import { describe, it, expect } from "vitest";
import { formatRelative, formatCompact, pluralize, formatNumber } from "@/lib/i18n-format";

describe("i18n-format: formatRelative", () => {
  const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000);

  it("renders relative time in Uzbek", () => {
    const out = formatRelative(twoMinAgo, "uz");
    // date-fns uz locale uses "minut"; we also accept native "daqiqa"
    expect(out.toLowerCase()).toMatch(/minut|daqiqa/);
    expect(out.toLowerCase()).toMatch(/oldin/);
  });

  it("renders relative time in English", () => {
    const out = formatRelative(twoMinAgo, "en");
    expect(out.toLowerCase()).toMatch(/minute/);
    expect(out.toLowerCase()).toMatch(/ago/);
  });

  it("renders relative time in Russian", () => {
    const out = formatRelative(twoMinAgo, "ru");
    expect(out.toLowerCase()).toMatch(/минут/);
  });
});

describe("i18n-format: pluralize", () => {
  const formsEn = { one: "1 item", other: "{n} items" };
  const formsRu = { one: "элемент", few: "элемента", many: "элементов", other: "элемента" };
  const formsUz = { one: "ta", other: "ta" };

  it("English: 1 -> one, 2 -> other", () => {
    expect(pluralize(1, formsEn, "en")).toBe("1 item");
    expect(pluralize(2, formsEn, "en")).toBe("{n} items");
    expect(pluralize(5, formsEn, "en")).toBe("{n} items");
  });

  it("Russian: 1 one, 2 few, 5 many", () => {
    expect(pluralize(1, formsRu, "ru")).toBe("элемент");
    expect(pluralize(2, formsRu, "ru")).toBe("элемента");
    expect(pluralize(5, formsRu, "ru")).toBe("элементов");
    expect(pluralize(21, formsRu, "ru")).toBe("элемент");
  });

  it("Uzbek: invariant (uses 'ta')", () => {
    expect(pluralize(1, formsUz, "uz")).toBe("ta");
    expect(pluralize(2, formsUz, "uz")).toBe("ta");
    expect(pluralize(5, formsUz, "uz")).toBe("ta");
  });
});

describe("i18n-format: formatCompact / formatNumber", () => {
  it("formats compact numbers", () => {
    expect(formatCompact(1500, "en")).toMatch(/1\.5K/i);
    expect(formatCompact(2_400_000, "en")).toMatch(/2\.4M/i);
  });

  it("formats numbers locale-aware", () => {
    expect(formatNumber(1234, "en")).toBe("1,234");
    // ru/uz use NBSP or regular space — just confirm digits present
    expect(formatNumber(1234, "ru")).toMatch(/1.?234/);
  });
});
