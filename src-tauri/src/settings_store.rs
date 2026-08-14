use crate::model::Settings;
use std::path::Path;

pub fn load(path: &Path) -> Settings {
    let parse = |candidate: &Path| {
        std::fs::read_to_string(candidate)
            .ok()
            .and_then(|json| serde_json::from_str::<Settings>(&json).ok())
            .filter(|settings| settings.validate().is_ok())
    };
    parse(path)
        .or_else(|| parse(&path.with_extension("json.bak")))
        .unwrap_or_default()
}

pub fn save(path: &Path, settings: &Settings) -> Result<(), String> {
    settings.validate()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let json = serde_json::to_string_pretty(settings).map_err(|error| error.to_string())?;
    let temporary = path.with_extension("json.tmp");
    let backup = path.with_extension("json.bak");
    {
        use std::io::Write;
        let mut file = std::fs::File::create(&temporary).map_err(|error| error.to_string())?;
        file.write_all(json.as_bytes())
            .map_err(|error| error.to_string())?;
        file.sync_all().map_err(|error| error.to_string())?;
    }
    if path.exists() {
        std::fs::copy(path, &backup).map_err(|error| error.to_string())?;
        std::fs::remove_file(path).map_err(|error| error.to_string())?;
    }
    std::fs::rename(&temporary, path).map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::{load, save};
    use crate::model::Settings;

    #[test]
    fn write_keeps_a_recoverable_backup() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("settings.json");
        let first = Settings {
            selected_map: "woods".into(),
            ..Settings::default()
        };
        save(&path, &first).unwrap();
        let mut second = first.clone();
        second.selected_map = "customs".into();
        save(&path, &second).unwrap();
        std::fs::write(&path, "not json").unwrap();
        assert_eq!(load(&path).selected_map, "woods");
    }
}
