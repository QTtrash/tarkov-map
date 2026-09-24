import L from "leaflet";
import { layoutExtractionLabels } from "../extraction-labels";
import type { ExtractPoi } from "../types";

export function installExtractionLabels(
  map: L.Map,
  extracts: Array<{ poi: ExtractPoi; marker: L.Marker }>,
  active: ReadonlySet<string>,
  selectedId: string | null,
) {
  const container = map.getContainer();
  const layer = document.createElement("div");
  layer.className = "extraction-label-layer";
  const mapPane = map.getPane("mapPane")!;
  mapPane.append(layer);
  let frame = 0;
  let disposed = false;
  const removeNumbers = () =>
    extracts.forEach(({ marker }) => marker.getElement()?.querySelector(".extract-number")?.remove());
  const update = () => {
    if (disposed) return;
    removeNumbers();
    layer.replaceChildren();
    layer.style.visibility = "visible";
    const { x: width, y: height } = map.getSize();
    layer.style.width = `${width}px`;
    layer.style.height = `${height}px`;
    // Names use screen coordinates inside the map pane, below tooltips and popups.
    L.DomUtil.setPosition(layer, L.DomUtil.getPosition(mapPane).multiplyBy(-1));
    const containerRect = container.getBoundingClientRect();
    const reserved = Array.from(
      container.parentElement?.querySelectorAll<HTMLElement>(
        ".leaflet-control-zoom, .map-title-plate, .intel-shell, .companion-roster, .overlay-readout, .clear-waypoints, .raid-map-banner",
      ) ?? [],
    )
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          x: rect.left - containerRect.left,
          y: rect.top - containerRect.top,
          width: rect.width,
          height: rect.height,
        };
      })
      .filter((rect) => rect.width > 0 && rect.height > 0);
    const elements = new Map<string, HTMLSpanElement>();
    const anchors = extracts.map(({ poi, marker }) => {
      const point = map.latLngToContainerPoint(marker.getLatLng());
      const label = document.createElement("span");
      label.className = `extraction-label ${poi.category}${active.has(poi.id) ? " raid-active" : ""}${selectedId === poi.id ? " selected" : ""}`;
      label.dataset.extractId = poi.id;
      label.textContent = poi.name;
      label.setAttribute("aria-hidden", "true");
      layer.append(label);
      elements.set(poi.id, label);
      const rect = label.getBoundingClientRect();
      return {
        id: poi.id,
        x: point.x,
        y: point.y,
        width: rect.width,
        height: rect.height,
        priority: selectedId === poi.id ? 2 : active.has(poi.id) ? 1 : 0,
      };
    });
    let result = layoutExtractionLabels(anchors, width, height, reserved);
    const listWidth = Math.min(260, width - 80);
    const listHeight = Math.min(150, height * 0.35);
    if (result.overflow.length) {
      result = layoutExtractionLabels(anchors, width, height, [
        ...reserved,
        { x: 8, y: height - listHeight - 42, width: listWidth, height: listHeight },
      ]);
    }
    const lines = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    lines.setAttribute("width", String(width));
    lines.setAttribute("height", String(height));
    lines.setAttribute("aria-hidden", "true");
    layer.prepend(lines);
    const placedIds = new Set(result.placed.map(({ id }) => id));
    for (const [id, label] of elements) if (!placedIds.has(id)) label.remove();
    for (const label of result.placed) {
      const element = elements.get(label.id)!;
      element.style.left = `${label.x}px`;
      element.style.top = `${label.y}px`;
      const line = document.createElementNS(lines.namespaceURI, "line");
      line.setAttribute("x1", String(label.anchorX));
      line.setAttribute("y1", String(label.anchorY));
      line.setAttribute("x2", String(Math.max(label.x, Math.min(label.x + label.width, label.anchorX))));
      line.setAttribute("y2", String(Math.max(label.y, Math.min(label.y + label.height, label.anchorY))));
      lines.append(line);
    }
    if (result.overflow.length) {
      const list = document.createElement("div");
      list.className = "extraction-overflow";
      list.setAttribute("role", "region");
      list.setAttribute("aria-label", "Crowded extraction names");
      list.style.width = `${listWidth}px`;
      list.style.maxHeight = `${listHeight}px`;
      L.DomEvent.disableClickPropagation(list);
      L.DomEvent.disableScrollPropagation(list);
      list.addEventListener("keydown", (event) => event.stopPropagation());
      result.overflow
        .sort((a, b) => a.id.localeCompare(b.id))
        .forEach(({ id }, index) => {
          const { poi, marker } = extracts.find((entry) => entry.poi.id === id)!;
          const number = document.createElement("span");
          number.className = "extract-number";
          number.textContent = String(index + 1);
          number.setAttribute("aria-hidden", "true");
          marker.getElement()?.append(number);
          const button = document.createElement("button");
          button.type = "button";
          button.className = active.has(id) ? "raid-active" : "";
          button.textContent = `${index + 1}. ${poi.name}`;
          button.dataset.extractId = id;
          button.addEventListener("click", () => {
            marker.openPopup();
            marker.fire("click");
          });
          list.append(button);
        });
      layer.append(list);
    }
  };
  const schedule = () => {
    if (disposed) return;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(update);
  };
  const hide = () => {
    layer.style.visibility = "hidden";
  };
  map.on("movestart zoomstart", hide);
  map.on("moveend zoomend resize", schedule);
  schedule();
  void document.fonts?.ready.then(schedule);
  return () => {
    disposed = true;
    cancelAnimationFrame(frame);
    map.off("movestart zoomstart", hide);
    map.off("moveend zoomend resize", schedule);
    removeNumbers();
    layer.remove();
  };
}
