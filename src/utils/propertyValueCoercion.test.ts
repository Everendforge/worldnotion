import { describe, expect, it } from "vitest";
import { coercePropertyValue } from "./propertyValueCoercion";

describe("coercePropertyValue", () => {
  it("converts strings to lists and back", () => {
    expect(coercePropertyValue("a, b, c", "multiselect")).toEqual(["a", "b", "c"]);
    expect(coercePropertyValue(["a", "b"], "text")).toBe("a, b");
    expect(coercePropertyValue("mara", "entity-ref-list")).toEqual(["mara"]);
  });

  it("converts numeric strings to numbers and leaves ambiguous values alone", () => {
    expect(coercePropertyValue("42", "number")).toBe(42);
    expect(coercePropertyValue("4.5", "number")).toBe(4.5);
    expect(coercePropertyValue("not-a-number", "number")).toBe("not-a-number");
  });

  it("converts clear boolean strings only", () => {
    expect(coercePropertyValue("true", "boolean")).toBe(true);
    expect(coercePropertyValue("No", "boolean")).toBe(false);
    expect(coercePropertyValue("maybe", "boolean")).toBe("maybe");
    expect(coercePropertyValue(0, "boolean")).toBe(false);
  });

  it("stringifies scalars for text-like types", () => {
    expect(coercePropertyValue(7, "text")).toBe("7");
    expect(coercePropertyValue(true, "select")).toBe("true");
    expect(coercePropertyValue("kept", "url")).toBe("kept");
  });

  it("passes through null and undefined untouched", () => {
    expect(coercePropertyValue(null, "text")).toBeNull();
    expect(coercePropertyValue(undefined, "multiselect")).toBeUndefined();
  });
});
