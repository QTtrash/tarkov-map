import type { PoiCategory } from "../types";

type UiIconName = "target" | "pin" | "settings" | "info" | "layers" | "close" | "folder" | "search" | "center";

export function UiIcon({ name, size = 18 }: { name: UiIconName; size?: number }) {
  const paths: Record<UiIconName, React.ReactNode> = {
    target: (
      <>
        <circle cx="12" cy="12" r="7" />
        <circle cx="12" cy="12" r="2" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
      </>
    ),
    pin: (
      <>
        <path d="m9 3 6 0-.8 6 2.8 3v1H7v-1l2.8-3L9 3Z" />
        <path d="M12 13v8" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path
          d="M19 13.5v-3l-2-.7-.7-1.7.9-2-2.2-2.2-2 .9-1.8-.7-.7-2h-3l-.7 2-1.7.7-2-.9L.9 6.1l.9 2-.7 1.7-2 .7v3l2 .7.7 1.7-.9 2 2.2 2.2 2-.9 1.7.7.7 2h3l.7-2 1.8-.7 2 .9 2.2-2.2-.9-2 .7-1.7 2-.7Z"
          transform="translate(2) scale(.83)"
        />
      </>
    ),
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v6M12 7h.01" />
      </>
    ),
    layers: (
      <>
        <path d="m12 3 9 5-9 5-9-5 9-5Z" />
        <path d="m4 12 8 4 8-4M4 16l8 4 8-4" />
      </>
    ),
    close: <path d="m5 5 14 14M19 5 5 19" />,
    folder: <path d="M3 6h7l2 2h9v10H3V6Z" />,
    search: (
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m15.5 15.5 5 5" />
      </>
    ),
    center: (
      <>
        <path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
  };
  return (
    <svg
      className="ui-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

export function PoiGlyph({ category, size = 18 }: { category: PoiCategory; size?: number }) {
  let content: React.ReactNode;
  if (category.startsWith("extract-")) {
    content = (
      <>
        <path d="M5 5h8v3M5 19h8v-3M11 12h10M17 8l4 4-4 4" />
        <path d="M5 5v14" />
      </>
    );
  } else if (category === "transit") {
    content = (
      <>
        <path d="M4 8h15M15 4l4 4-4 4M20 16H5M9 12l-4 4 4 4" />
      </>
    );
  } else if (category === "switch") {
    content = <path d="m13 2-7 11h6l-1 9 7-12h-6l1-8Z" />;
  } else if (category === "hazard") {
    content = (
      <>
        <path d="m12 3 10 18H2L12 3Z" />
        <path d="M12 9v5M12 17h.01" />
      </>
    );
  } else if (category === "btr") {
    content = (
      <>
        <path d="M3 8h13l4 4v5H3V8ZM16 8l-2-3H8L6 8" />
        <circle cx="7" cy="18" r="2" />
        <circle cx="16" cy="18" r="2" />
      </>
    );
  } else if (category === "boss-zone") {
    content = (
      <>
        <path d="M7 9V5l3 2 2-4 2 4 3-2v4" />
        <path d="M6 10h12v9H6zM9 14h.01M15 14h.01M10 18h4" />
      </>
    );
  } else if (category === "locked-door") {
    content = (
      <>
        <rect x="5" y="10" width="14" height="11" rx="1" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" />
      </>
    );
  } else if (category === "quest-objective") {
    content = (
      <>
        <path d="M12 21s7-5.2 7-12a7 7 0 1 0-14 0c0 6.8 7 12 7 12Z" />
        <circle cx="12" cy="9" r="2" />
      </>
    );
  } else if (category === "custom-pin") {
    content = (
      <>
        <path d="M12 21s7-5.2 7-12a7 7 0 1 0-14 0c0 6.8 7 12 7 12Z" />
        <path d="M9 9h6M12 6v6" />
      </>
    );
  } else if (category.startsWith("spawn-")) {
    content = (
      <>
        <circle cx="12" cy="12" r="7" />
        <path d="M12 2v5M12 17v5M2 12h5M17 12h5" />
      </>
    );
  } else if (category === "loot") {
    content = (
      <>
        <path d="M3 8h18v12H3V8ZM7 8V4h10v4" />
        <path d="M9 13h6" />
      </>
    );
  } else {
    content = (
      <>
        <path d="M4 15h12l4 3H8l-4-3ZM7 15l3-8h7l3 3" />
        <circle cx="14" cy="7" r="2" />
      </>
    );
  }
  return (
    <svg
      className="poi-glyph"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {content}
    </svg>
  );
}
