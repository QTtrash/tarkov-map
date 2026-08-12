import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/ibm-plex-sans-condensed/latin-400.css";
import "@fontsource/ibm-plex-sans-condensed/latin-500.css";
import "@fontsource/ibm-plex-sans-condensed/latin-600.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "./styles.css";
import { App } from "./App";
import { OverlayApp } from "./components/OverlayApp";

const overlay = new URLSearchParams(window.location.search).has("overlay");
document.body.classList.toggle("overlay-body", overlay);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {overlay ? <OverlayApp /> : <App />}
  </StrictMode>,
);
