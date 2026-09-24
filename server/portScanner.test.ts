import { describe, expect, it } from "vitest";
import { buildPortList, scanPorts } from "./portScanner";

describe("buildPortList", () => {
  it("returns the development preset", () => {
    expect(buildPortList({ mode: "popular" })).toEqual([3000, 3001, 4000, 4173, 5000, 5173, 5432, 6379, 8000, 8080, 8888, 9000]);
  });

  it("limits range scans to 256 ports", () => {
    const ports = buildPortList({ mode: "range", start: 1, end: 65535 });
    expect(ports).toHaveLength(256);
    expect(ports[0]).toBe(1);
    expect(ports[255]).toBe(256);
  });

  it("accepts custom ports without changing their order before scan sorting", () => {
    expect(buildPortList({ mode: "custom", ports: [8080, 3000, 8080] })).toEqual([8080, 3000, 8080]);
  });
});

describe("scanPorts", () => {
  it("removes invalid and duplicate values", async () => {
    const results = await scanPorts([0, 1, 1, 70000]);
    expect(results).toHaveLength(1);
    expect(results[0]?.port).toBe(1);
    expect(results[0]?.state).toBe("free");
  });
});
