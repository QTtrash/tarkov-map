use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
pub struct Settings {
    pub schema_version: u32,
    pub screenshots_dir: Option<PathBuf>,
    pub logs_dir: Option<PathBuf>,
    pub always_on_top: bool,
    pub follow_player: bool,
    pub auto_floor: bool,
    pub delete_parsed_screenshots: bool,
    pub selected_map: String,
    pub visible_map_layers: Vec<String>,
    pub legend_open: bool,
    pub high_contrast: bool,
    pub overlay_opacity: f64,
    pub overlay_scale: f64,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            schema_version: 2,
            screenshots_dir: None,
            logs_dir: None,
            always_on_top: false,
            follow_player: true,
            auto_floor: true,
            delete_parsed_screenshots: false,
            selected_map: "customs".into(),
            visible_map_layers: vec![
                "extract-pmc".into(),
                "extract-scav".into(),
                "extract-shared".into(),
                "transit".into(),
                "switch".into(),
                "btr".into(),
            ],
            legend_open: false,
            high_contrast: false,
            overlay_opacity: 0.92,
            overlay_scale: 1.0,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Vec3Payload {
    pub x: f32,
    pub y: f32,
    pub z: f32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuaternionPayload {
    pub x: f32,
    pub y: f32,
    pub z: f32,
    pub w: f32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerFixPayload {
    pub observed_at: u64,
    pub filename: String,
    pub position: Vec3Payload,
    pub quaternion: Option<QuaternionPayload>,
    pub forward: Option<Vec3Payload>,
    pub game_time: Option<f32>,
    pub map_id: Option<String>,
    pub floor_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MapContextPayload {
    pub map_id: Option<String>,
    pub in_raid: bool,
    pub source: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocatorStatusPayload {
    pub level: String,
    pub message: String,
    pub screenshots_dir: Option<String>,
    pub logs_dir: Option<String>,
    pub screenshot_watcher_ready: bool,
    pub log_watcher_ready: bool,
    pub last_filename: Option<String>,
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrTextPayload {
    pub observed_at: u64,
    pub map_id: Option<String>,
    pub raw_text: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocatorSnapshotPayload {
    pub fix: Option<PlayerFixPayload>,
    pub map_context: MapContextPayload,
    pub status: Option<LocatorStatusPayload>,
    pub ocr_text: Option<OcrTextPayload>,
}

impl Default for LocatorSnapshotPayload {
    fn default() -> Self {
        Self {
            fix: None,
            map_context: MapContextPayload {
                map_id: None,
                in_raid: false,
                source: "manual".into(),
            },
            status: None,
            ocr_text: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::Settings;

    #[test]
    fn older_settings_gain_map_intelligence_defaults() {
        let settings: Settings = serde_json::from_str(
            r#"{
                "screenshotsDir": "C:\\\\Tarkov\\\\Screenshots",
                "logsDir": null,
                "alwaysOnTop": true,
                "followPlayer": false,
                "autoFloor": true,
                "deleteParsedScreenshots": false,
                "selectedMap": "woods"
            }"#,
        )
        .expect("legacy settings should migrate through serde defaults");

        assert_eq!(settings.selected_map, "woods");
        assert!(settings.always_on_top);
        assert!(!settings.follow_player);
        assert_eq!(
            settings.visible_map_layers,
            vec![
                "extract-pmc",
                "extract-scav",
                "extract-shared",
                "transit",
                "switch",
                "btr"
            ]
        );
        assert!(!settings.legend_open);
    }
}
