use crate::model::{PlayerFixPayload, QuaternionPayload, Vec3Payload};
use regex::Regex;
use std::sync::LazyLock;
use std::time::{SystemTime, UNIX_EPOCH};

static SCREENSHOT_PATTERN: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r"(?xi)
        \]
        [\s_]*
        (?P<x>-?\d+(?:\.\d+)?)\s*,\s*
        (?P<y>-?\d+(?:\.\d+)?)\s*,\s*
        (?P<z>-?\d+(?:\.\d+)?)
        (?:\s*_\s*
          (?P<qx>-?\d+(?:\.\d+)?)\s*,\s*
          (?P<qy>-?\d+(?:\.\d+)?)\s*,\s*
          (?P<qz>-?\d+(?:\.\d+)?)\s*,\s*
          (?P<qw>-?\d+(?:\.\d+)?)
        )?
        (?:\s*_\s*(?P<game>\d+(?:\.\d+)?))?
        \s*(?:\(\d+\))?\.png$",
    )
    .expect("valid screenshot filename regex")
});

fn capture_f32(captures: &regex::Captures<'_>, name: &str) -> Option<f32> {
    captures
        .name(name)?
        .as_str()
        .parse::<f32>()
        .ok()
        .filter(|v| v.is_finite())
}

pub fn parse_screenshot_filename(
    filename: &str,
    map_id: Option<String>,
) -> Result<PlayerFixPayload, String> {
    let captures = SCREENSHOT_PATTERN
        .captures(filename)
        .ok_or_else(|| "Filename does not contain Tarkov position metadata".to_string())?;

    let x = capture_f32(&captures, "x").ok_or("Invalid X coordinate")?;
    let y = capture_f32(&captures, "y").ok_or("Invalid Y coordinate")?;
    let z = capture_f32(&captures, "z").ok_or("Invalid Z coordinate")?;
    if [x, y, z].iter().any(|value| value.abs() > 100_000.0) {
        return Err("Coordinate is outside the supported range".into());
    }

    let raw_quaternion = match (
        capture_f32(&captures, "qx"),
        capture_f32(&captures, "qy"),
        capture_f32(&captures, "qz"),
        capture_f32(&captures, "qw"),
    ) {
        (Some(qx), Some(qy), Some(qz), Some(qw)) => Some((qx, qy, qz, qw)),
        _ => None,
    };

    let (quaternion, forward) = if let Some((qx, qy, qz, qw)) = raw_quaternion {
        let norm = (qx * qx + qy * qy + qz * qz + qw * qw).sqrt();
        if norm <= 0.0001 || !norm.is_finite() {
            (None, None)
        } else {
            let (qx, qy, qz, qw) = (qx / norm, qy / norm, qz / norm, qw / norm);
            let fx = 2.0 * (qx * qz + qw * qy);
            let fy = 2.0 * (qy * qz - qw * qx);
            let fz = 1.0 - 2.0 * (qx * qx + qy * qy);
            let forward_norm = (fx * fx + fy * fy + fz * fz).sqrt();
            let forward = (forward_norm > 0.0001).then_some(Vec3Payload {
                x: fx / forward_norm,
                y: fy / forward_norm,
                z: fz / forward_norm,
            });
            (
                Some(QuaternionPayload {
                    x: qx,
                    y: qy,
                    z: qz,
                    w: qw,
                }),
                forward,
            )
        }
    } else {
        (None, None)
    };

    let game_time = capture_f32(&captures, "game").filter(|value| (0.0..24.0).contains(value));
    let observed_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;

    Ok(PlayerFixPayload {
        observed_at,
        filename: filename.to_string(),
        position: Vec3Payload { x, y, z },
        quaternion,
        forward,
        game_time,
        map_id,
        floor_id: None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_current_filename_with_heading_and_game_time() {
        let fix = parse_screenshot_filename(
            "2025-07-19[16-54] _ 268.98, 5.65, 509.42_0.09307, 0.67026, -0.08530, 0.73131_18.34 (0).png",
            Some("woods".into()),
        )
        .unwrap();
        assert_eq!(fix.position.x, 268.98);
        assert_eq!(fix.position.y, 5.65);
        assert_eq!(fix.position.z, 509.42);
        assert_eq!(fix.game_time, Some(18.34));
        assert!(fix.quaternion.is_some());
        assert!(fix.forward.is_some());
        assert_eq!(fix.map_id.as_deref(), Some("woods"));
    }

    #[test]
    fn parses_compact_and_position_only_variants() {
        let full = parse_screenshot_filename(
            "2026-01-02[03-04]_-123.45, 6.78, 90.12_0.0, 0.7, 0.0, 0.7 (2).PNG",
            None,
        )
        .unwrap();
        assert!(full.quaternion.is_some());

        let position =
            parse_screenshot_filename("2024-01-02[03-04]_1, -2.5, 3.25 (0).png", None).unwrap();
        assert!(position.quaternion.is_none());
        assert_eq!(position.position.y, -2.5);
    }

    #[test]
    fn rejects_invalid_or_unrelated_filenames() {
        assert!(parse_screenshot_filename("holiday.png", None).is_err());
        assert!(
            parse_screenshot_filename("2026-01-02[03-04]_999999.0, 2.0, 3.0 (0).png", None,)
                .is_err()
        );
    }

    #[test]
    fn normalizes_quaternion_and_computes_forward() {
        let fix = parse_screenshot_filename(
            "2026-01-02[03-04]_1.0, 2.0, 3.0_0.0, 1.4142135, 0.0, 1.4142135 (0).png",
            None,
        )
        .unwrap();
        let q = fix.quaternion.unwrap();
        let norm = (q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w).sqrt();
        assert!((norm - 1.0).abs() < 0.0001);
    }
}
