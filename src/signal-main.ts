import "@fontsource/ibm-plex-sans-condensed/latin-400.css";
import "@fontsource/ibm-plex-sans-condensed/latin-500.css";
import "@fontsource/ibm-plex-sans-condensed/latin-600.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "./signal.css";
import { signalRelease } from "./signal-release";

const SOUND_KEY = "raidSignalSound";

export class SignalSound {
  enabled = (() => {
    try {
      return localStorage.getItem(SOUND_KEY) === "on";
    } catch {
      return false;
    }
  })();
  private context: AudioContext | null = null;

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    try {
      localStorage.setItem(SOUND_KEY, enabled ? "on" : "off");
    } catch {
      /* session-only preference */
    }
    if (enabled) this.cue("acquire");
  }

  cue(type: "acquire" | "relay" | "resolve") {
    if (!this.enabled) return;
    this.context ||= new AudioContext();
    if (this.context.state === "suspended") void this.context.resume();
    const start = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type === "relay" ? "square" : "sine";
    oscillator.frequency.setValueAtTime(type === "acquire" ? 420 : type === "relay" ? 155 : 620, start);
    oscillator.frequency.exponentialRampToValueAtTime(type === "relay" ? 110 : 880, start + 0.075);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.018, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.095);
    oscillator.connect(gain).connect(this.context.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.11);
  }
}

function initializeRelease() {
  const primary = document.querySelector<HTMLAnchorElement>("#download");
  const mirror = document.querySelector<HTMLAnchorElement>("[data-download-mirror]");
  void fetch("/release.json", { cache: "no-store" })
    .then((response) => {
      if (!response.ok) throw new Error("No release");
      return response.json() as Promise<unknown>;
    })
    .then((value) => {
      const release = signalRelease(value);
      if (!release) throw new Error("Invalid release");
      for (const link of [primary, mirror]) {
        if (!link) continue;
        link.href = release.downloadUrl;
        link.textContent = `DOWNLOAD ${release.version} FOR WINDOWS`;
        link.removeAttribute("aria-disabled");
      }
      const note = document.querySelector("#release-note");
      if (note) note.textContent = `Unsigned stable installer · SHA-256 ${release.sha256}`;
    })
    .catch(() => undefined);
}

const sound = new SignalSound();
const toggle = document.querySelector<HTMLButtonElement>("[data-sound-toggle]");
const syncSound = () => {
  if (!toggle) return;
  toggle.textContent = sound.enabled ? "SND ON" : "SND OFF";
  toggle.setAttribute("aria-pressed", String(sound.enabled));
};
toggle?.addEventListener("click", () => {
  sound.setEnabled(!sound.enabled);
  syncSound();
});
syncSound();
initializeRelease();

const modeButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-signal-mode]"));
const readout = document.querySelector<HTMLElement>("[data-stage-readout]");
const labels = ["LOCAL FIX", "SEALED RELAY", "SQUAD VIEW"];
modeButtons.forEach((button, index) =>
  button.addEventListener("click", () => {
    modeButtons.forEach((item, itemIndex) => {
      const active = itemIndex === index;
      item.classList.toggle("is-active", active);
      item.setAttribute("aria-pressed", String(active));
    });
    if (readout) readout.textContent = labels[index] ?? labels[0];
    sound.cue(index === 1 ? "relay" : index === 2 ? "resolve" : "acquire");
    document.dispatchEvent(new CustomEvent("raid-signal:mode", { detail: index }));
  }),
);

const atlas = document.querySelector<HTMLElement>("[data-signal-atlas]");
if (atlas && !matchMedia("(prefers-reduced-motion: reduce), (max-width: 680px)").matches) {
  const observer = new IntersectionObserver(
    ([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      void import("./signal-scene").then(({ initializeSignalScene }) => initializeSignalScene());
    },
    { rootMargin: "180px" },
  );
  observer.observe(atlas);
}
