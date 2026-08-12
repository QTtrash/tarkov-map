use regex::Regex;
use std::sync::LazyLock;

static SCENE_PATTERN: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)scene preset path:\s*maps/(?P<bundle>[a-z0-9_\-]+)\.bundle(?:.*?\brcid:(?P<rcid>[a-z0-9_\-]+)(?:\.scenespreset)?\.asset)?")
        .expect("valid scene regex")
});
static LOCATION_PATTERN: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)\bLocation:\s*(?P<location>[^,|\s]+)").expect("valid location regex")
});

#[derive(Debug, Clone, PartialEq)]
pub enum LogEvent {
    MapDetected(String),
    RaidStarted,
    RaidEnded,
}

pub fn canonical_map_id(value: &str) -> Option<&'static str> {
    let mut normalized = value
        .trim()
        .trim_end_matches(".bundle")
        .trim_end_matches(".scenespreset.asset")
        .trim_end_matches(".asset")
        .to_ascii_lowercase();
    for suffix in ["_preset", "-preset"] {
        if let Some(stripped) = normalized.strip_suffix(suffix) {
            normalized = stripped.to_string();
            break;
        }
    }
    match normalized.as_str() {
        "bigmap" | "customs" => Some("customs"),
        "factory4_day" | "factory4_night" | "factory" | "night-factory" => Some("factory"),
        "sandbox" | "sandbox_high" | "groundzero" | "ground-zero" | "ground-zero-21" => {
            Some("ground-zero")
        }
        "icebreaker" => Some("icebreaker"),
        "interchange" => Some("interchange"),
        "lighthouse" => Some("lighthouse"),
        "rezervbase" | "reserve" => Some("reserve"),
        "shoreline" => Some("shoreline"),
        "tarkovstreets" | "streets" | "streets-of-tarkov" => Some("streets-of-tarkov"),
        "terminal" => Some("terminal"),
        "laboratory" | "lab" | "the-lab" | "the-lab-dark" => Some("the-lab"),
        "labyrinth" | "the-labyrinth" => Some("the-labyrinth"),
        "woods" => Some("woods"),
        _ => None,
    }
}

pub fn parse_log_chunk(pending: &mut String, chunk: &str) -> Vec<LogEvent> {
    pending.push_str(chunk);
    let complete_until = pending
        .rfind('\n')
        .map(|position| position + 1)
        .unwrap_or(0);
    if complete_until == 0 {
        if pending.len() > 1_048_576 {
            pending.clear();
        }
        return Vec::new();
    }

    let complete = pending[..complete_until].to_string();
    pending.drain(..complete_until);
    let mut events = Vec::new();

    for line in complete.lines() {
        if let Some(captures) = SCENE_PATTERN.captures(line) {
            let detected = canonical_map_id(&captures["bundle"]).or_else(|| {
                captures
                    .name("rcid")
                    .and_then(|capture| canonical_map_id(capture.as_str()))
            });
            if let Some(id) = detected {
                events.push(LogEvent::MapDetected(id.into()));
            }
        } else if let Some(captures) = LOCATION_PATTERN.captures(line) {
            if let Some(id) = canonical_map_id(&captures["location"]) {
                events.push(LogEvent::MapDetected(id.into()));
            }
        }

        if line.contains("|application|GameStarted:") || line.contains("|application|GameStarting")
        {
            events.push(LogEvent::RaidStarted);
        }
        if line.contains("PrepareSelectedProfileLocally") || line.contains("UserMatchOver") {
            events.push(LogEvent::RaidEnded);
        }
    }

    events
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_all_current_locations() {
        let cases = [
            ("bigmap", "customs"),
            ("customs_preset", "customs"),
            ("bigmap.scenespreset.asset", "customs"),
            ("factory4_day", "factory"),
            ("sandbox_high", "ground-zero"),
            ("icebreaker", "icebreaker"),
            ("interchange", "interchange"),
            ("lighthouse", "lighthouse"),
            ("rezervbase", "reserve"),
            ("shoreline", "shoreline"),
            ("tarkovstreets", "streets-of-tarkov"),
            ("terminal", "terminal"),
            ("laboratory", "the-lab"),
            ("labyrinth", "the-labyrinth"),
            ("woods", "woods"),
        ];
        for (input, expected) in cases {
            assert_eq!(canonical_map_id(input), Some(expected));
        }
    }

    #[test]
    fn carries_partial_lines_and_emits_raid_lifecycle() {
        let mut pending = String::new();
        assert!(
            parse_log_chunk(&mut pending, "x|application|scene preset path:maps/ice").is_empty()
        );
        let events = parse_log_chunk(
            &mut pending,
            "breaker.bundle\nx|application|GameStarted:\nx|application|PrepareSelectedProfileLocally\n",
        );
        assert_eq!(
            events,
            vec![
                LogEvent::MapDetected("icebreaker".into()),
                LogEvent::RaidStarted,
                LogEvent::RaidEnded,
            ]
        );
    }

    #[test]
    fn parses_current_scene_preset_and_rcid_format() {
        let mut pending = String::new();
        let events = parse_log_chunk(
            &mut pending,
            "x|application|scene preset path:maps/customs_preset.bundle rcid:bigmap.scenespreset.asset\n",
        );
        assert_eq!(events, vec![LogEvent::MapDetected("customs".into())]);
    }

    #[test]
    fn falls_back_to_rcid_when_bundle_alias_is_unknown() {
        let mut pending = String::new();
        let events = parse_log_chunk(
            &mut pending,
            "x|application|scene preset path:maps/future_name.bundle rcid:bigmap.scenespreset.asset\n",
        );
        assert_eq!(events, vec![LogEvent::MapDetected("customs".into())]);
    }
}
