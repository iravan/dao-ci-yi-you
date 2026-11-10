pub const STEP: f64 = 0.001;
pub const COMMENT_TTL_SECS: i64 = 86_400;
pub const PRESENCE_TTL_SECS: i64 = 45;
pub const MAX_TEXT_CHARS: usize = 280;

/// `floor(value / step)`, snapping values that are a rounding error away from a boundary.
pub fn cell_index(value: f64) -> i64 {
    let scaled = value / STEP;
    let nearest = scaled.round();
    if (scaled - nearest).abs() < 1e-6 {
        nearest as i64
    } else {
        scaled.floor() as i64
    }
}

pub fn area_id(latitude: f64, longitude: f64) -> String {
    format!("{}:{}", cell_index(latitude), cell_index(longitude))
}

pub fn parse_area(area: &str) -> Option<(i64, i64)> {
    let (lat, lng) = area.split_once(':')?;
    let lat_cell: i64 = lat.parse().ok()?;
    let lng_cell: i64 = lng.parse().ok()?;
    if lat != lat_cell.to_string() || lng != lng_cell.to_string() {
        return None;
    }
    Some((lat_cell, lng_cell))
}

pub fn southwest(area: &str) -> Option<(f64, f64)> {
    let (lat_cell, lng_cell) = parse_area(area)?;
    Some((lat_cell as f64 * STEP, lng_cell as f64 * STEP))
}

pub fn intersects(area: &str, south: f64, west: f64, north: f64, east: f64) -> bool {
    let Some((lat_cell, lng_cell)) = parse_area(area) else {
        return false;
    };
    let cell_south = lat_cell as f64 * STEP;
    let cell_north = cell_south + STEP;
    let cell_west = lng_cell as f64 * STEP;
    let cell_east = cell_west + STEP;
    let lat_hit = cell_north > south && cell_south < north;
    let lng_hit = if west <= east {
        cell_east > west && cell_west < east
    } else {
        cell_east > west || cell_west < east
    };
    lat_hit && lng_hit
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn snaps_the_documented_coordinates() {
        assert_eq!(area_id(22.3194, 114.1698), "22319:114169");
        assert_eq!(southwest("22319:114169"), Some((22.319, 114.169)));
        assert_eq!(cell_index(-0.0001), -1);
        assert_eq!(southwest("-1:0"), Some((-0.001, 0.0)));
    }

    #[test]
    fn boundary_belongs_to_the_cell_that_starts_there() {
        assert_eq!(cell_index(0.001), 1);
        assert_eq!(cell_index(-0.001), -1);
        assert_eq!(cell_index(0.0), 0);
        assert_eq!(cell_index(-1.0), -1000);
        assert_eq!(cell_index(-0.0010000000001), -1);
    }

    #[test]
    fn rejects_a_non_integer_area() {
        assert_eq!(parse_area("1.5:2"), None);
        assert_eq!(parse_area("1"), None);
        assert_eq!(parse_area("01:2"), None);
    }

    #[test]
    fn box_includes_overlapping_cells_only() {
        let area = area_id(1.0004, 2.0004);
        assert!(intersects(&area, 1.0, 2.0, 1.002, 2.002));
        assert!(!intersects(&area, 1.001, 2.0, 1.002, 2.002));
        let wrapped = area_id(1.0004, -179.9996);
        assert!(intersects(&wrapped, 1.0, 179.0, 1.002, -179.0));
    }
}
