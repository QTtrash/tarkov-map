import { describe, expect, it } from "vitest";
import { maps } from "./data/maps";
import { pathWithAssetRevision, prepareSvgMap } from "./map-assets";

describe("map assets", () => {
  const customs = maps.find((map) => map.id === "customs")!;
  const source = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <g id="Ground_Level"><path /></g>
    <g id="First_Floor" data-keep-with-group="Ground_Level"><path /></g>
    <g id="Second_Floor"><path /></g>
    <g id="Third_Floor"><path /></g>
  </svg>`;

  it("keeps the base artwork while revealing the requested upper floor", () => {
    const svg = prepareSvgMap(source, customs, "Second_Floor");
    expect(svg.querySelector("#Ground_Level")?.getAttribute("style")).toBe("");
    expect(svg.querySelector("#First_Floor")?.getAttribute("style")).toBe("");
    expect(svg.querySelector("#Second_Floor")?.getAttribute("style")).toBe("");
    expect(svg.querySelector("#Third_Floor")?.getAttribute("style")).toBe("display: none;");
  });

  it("rejects a floor that is missing from the packaged SVG", () => {
    expect(() => prepareSvgMap(source, customs, "Underground_Level")).toThrow("missing floor layer Underground_Level");
  });

  it("uses the packaged checksum as a cache revision", () => {
    expect(
      pathWithAssetRevision("/maps/svg/Customs.svg", {
        "svg/Customs.svg": "ee53a5c0faf185a1a4e7be82c2533cd76e70372ac2cac5e9d75b6f3be226768e",
      }),
    ).toBe("/maps/svg/Customs.svg?v=ee53a5c0faf185a1");
  });
});
