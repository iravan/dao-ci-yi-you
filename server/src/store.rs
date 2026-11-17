use crate::area::{self, COMMENT_TTL_SECS, PRESENCE_TTL_SECS};
use crate::hub::Hub;
use chrono::{DateTime, Utc};
use redis::aio::ConnectionManager;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

const POST_SCRIPT: &str = r#"
local token = redis.call('GET', KEYS[1])
if token ~= ARGV[1] then
  return 0
end
local presence = redis.call('GET', KEYS[2])
if presence ~= ARGV[1] then
  return -1
end
redis.call('SET', KEYS[3], ARGV[2], 'EX', ARGV[5])
redis.call('ZADD', KEYS[4], ARGV[3], ARGV[4])
redis.call('DEL', KEYS[1])
redis.call('ZADD', KEYS[5], ARGV[6], ARGV[1] .. '|' .. ARGV[4])
local count = redis.call('INCR', KEYS[6])
if tonumber(count) >= 2 then
  redis.call('GEOADD', KEYS[7], ARGV[7], ARGV[8], ARGV[1])
end
return count
"#;

const FORGET_SCRIPT: &str = r#"
local removed = redis.call('ZREM', KEYS[1], ARGV[2])
local expired = redis.call('ZREM', KEYS[2], ARGV[3])
if removed == 0 and expired == 0 then
  return tonumber(redis.call('GET', KEYS[3])) or 0
end
local count = redis.call('DECR', KEYS[3])
if tonumber(count) < 2 then
  redis.call('ZREM', KEYS[4], ARGV[1])
end
if tonumber(count) <= 0 then
  redis.call('DEL', KEYS[3], KEYS[1])
  return 0
end
return count
"#;

#[derive(Clone)]
pub struct Store {
    redis: ConnectionManager,
}

#[derive(Debug)]
pub enum PostError {
    NoToken,
    WrongArea,
    Redis,
}

#[derive(Serialize, Deserialize, Clone)]
struct StoredComment {
    text: String,
    area: String,
    created_at: String,
}

#[derive(Serialize, Clone)]
pub struct Comment {
    pub id: String,
    pub text: String,
    pub area: String,
    pub created_at: String,
}

#[derive(Serialize, Clone)]
pub struct BusyArea {
    pub area: String,
    pub count: i64,
    pub south: f64,
    pub west: f64,
}

#[derive(Serialize, Clone)]
pub struct ExpiredNote {
    pub id: String,
    pub area: String,
    pub count: i64,
}

impl Store {
    pub fn new(redis: ConnectionManager) -> Self {
        Self { redis }
    }

    pub async fn post(
        &self,
        user: &str,
        area: &str,
        text: &str,
    ) -> Result<(Comment, i64), PostError> {
        let id = Uuid::new_v4().to_string();
        let created_at = Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true);
        let stored = StoredComment {
            text: text.to_string(),
            area: area.to_string(),
            created_at: created_at.clone(),
        };
        let body = serde_json::to_string(&stored).map_err(|_| PostError::Redis)?;
        let score = Utc::now().timestamp();
        let (lon, lat) = cell_center(area).ok_or(PostError::Redis)?;
        let mut redis = self.redis.clone();
        let code: i64 = redis::cmd("EVAL")
            .arg(POST_SCRIPT)
            .arg(7)
            .arg(format!("token:{user}"))
            .arg(format!("presence:{user}"))
            .arg(format!("comment:{id}"))
            .arg(format!("area:{area}"))
            .arg("expire")
            .arg(format!("count:{area}"))
            .arg("busy")
            .arg(area)
            .arg(body)
            .arg(score)
            .arg(&id)
            .arg(COMMENT_TTL_SECS)
            .arg(score + COMMENT_TTL_SECS)
            .arg(lon)
            .arg(lat)
            .query_async(&mut redis)
            .await
            .map_err(|_| PostError::Redis)?;
        match code {
            count if count > 0 => Ok((
                Comment {
                    id,
                    text: text.to_string(),
                    area: area.to_string(),
                    created_at,
                },
                count,
            )),
            -1 => Err(PostError::WrongArea),
            _ => Err(PostError::NoToken),
        }
    }

    pub async fn comments(&self, area: &str) -> Result<Vec<Comment>, ()> {
        let ids = self.live_ids(area).await?;
        let mut comments = Vec::new();
        let mut redis = self.redis.clone();
        for id in ids {
            let raw: Option<String> = redis::cmd("GET")
                .arg(format!("comment:{id}"))
                .query_async(&mut redis)
                .await
                .map_err(|_| ())?;
            let Some(raw) = raw else {
                continue;
            };
            let stored: StoredComment = match serde_json::from_str(&raw) {
                Ok(stored) => stored,
                Err(_) => continue,
            };
            comments.push(Comment {
                id,
                text: stored.text,
                area: stored.area,
                created_at: stored.created_at,
            });
        }
        Ok(comments)
    }

    pub async fn busy(
        &self,
        south: f64,
        west: f64,
        north: f64,
        east: f64,
    ) -> Result<Vec<BusyArea>, ()> {
        let areas = if west <= east {
            self.geosearch(south, west, north, east).await?
        } else {
            let mut areas = self.geosearch(south, west, north, 180.0).await?;
            areas.extend(self.geosearch(south, -180.0, north, east).await?);
            areas
        };
        if areas.is_empty() {
            return Ok(Vec::new());
        }
        let mut redis = self.redis.clone();
        let mut counts = redis::cmd("MGET");
        for area in &areas {
            counts.arg(format!("count:{area}"));
        }
        let counts: Vec<Option<i64>> = counts.query_async(&mut redis).await.map_err(|_| ())?;
        let mut busy = Vec::new();
        for (area, count) in areas.into_iter().zip(counts) {
            let Some(count) = count else { continue };
            if count < 2 || !area::intersects(&area, south, west, north, east) {
                continue;
            }
            let Some((cell_south, cell_west)) = area::southwest(&area) else {
                continue;
            };
            busy.push(BusyArea {
                area,
                count,
                south: cell_south,
                west: cell_west,
            });
        }
        Ok(busy)
    }

    pub async fn heartbeat(
        &self,
        user: &str,
        latitude: f64,
        longitude: f64,
    ) -> Result<(String, bool), ()> {
        let area = area::area_id(latitude, longitude);
        let now = Utc::now().timestamp();
        let mut redis = self.redis.clone();
        let _: () = redis::pipe()
            .cmd("SET")
            .arg(format!("presence:{user}"))
            .arg(&area)
            .arg("EX")
            .arg(PRESENCE_TTL_SECS)
            .cmd("ZADD")
            .arg("active")
            .arg(now)
            .arg(user)
            .query_async(&mut redis)
            .await
            .map_err(|_| ())?;
        let token: Option<String> = redis::cmd("GET")
            .arg(format!("token:{user}"))
            .query_async(&mut redis)
            .await
            .map_err(|_| ())?;
        let cleared = if token.as_deref().is_some_and(|held| held != area) {
            let _: () = redis::pipe()
                .cmd("DEL")
                .arg(format!("token:{user}"))
                .cmd("SADD")
                .arg("waiting")
                .arg(user)
                .query_async(&mut redis)
                .await
                .map_err(|_| ())?;
            true
        } else if token.is_none() {
            let _: i32 = redis::cmd("SADD")
                .arg("waiting")
                .arg(user)
                .query_async(&mut redis)
                .await
                .map_err(|_| ())?;
            false
        } else {
            let _: i32 = redis::cmd("SREM")
                .arg("waiting")
                .arg(user)
                .query_async(&mut redis)
                .await
                .map_err(|_| ())?;
            false
        };
        Ok((area, cleared))
    }

    pub async fn token(&self, user: &str) -> Option<String> {
        let mut redis = self.redis.clone();
        redis::cmd("GET")
            .arg(format!("token:{user}"))
            .query_async(&mut redis)
            .await
            .ok()
            .flatten()
    }

    pub async fn sweep(&self) -> Result<Vec<ExpiredNote>, ()> {
        let now = Utc::now().timestamp();
        let mut redis = self.redis.clone();
        let due: Vec<String> = redis::cmd("ZRANGEBYSCORE")
            .arg("expire")
            .arg("-inf")
            .arg(now)
            .query_async(&mut redis)
            .await
            .map_err(|_| ())?;
        let mut expired = Vec::new();
        for member in due {
            let Some((area, id)) = member.rsplit_once('|') else {
                let _: i32 = redis::cmd("ZREM")
                    .arg("expire")
                    .arg(&member)
                    .query_async(&mut redis)
                    .await
                    .map_err(|_| ())?;
                continue;
            };
            let count = self.forget(area, id).await?;
            expired.push(ExpiredNote {
                id: id.to_string(),
                area: area.to_string(),
                count,
            });
        }
        Ok(expired)
    }

    pub async fn release<F>(&self, hub: &Hub, mut draw: F) -> Result<(), ()>
    where
        F: FnMut() -> bool,
    {
        let now = Utc::now().timestamp();
        let mut redis = self.redis.clone();
        let stale: Vec<String> = redis::cmd("ZRANGEBYSCORE")
            .arg("active")
            .arg("-inf")
            .arg(format!("({}", now - PRESENCE_TTL_SECS))
            .query_async(&mut redis)
            .await
            .map_err(|_| ())?;
        for user in stale {
            let _: i32 = redis::cmd("ZREM")
                .arg("active")
                .arg(&user)
                .query_async(&mut redis)
                .await
                .map_err(|_| ())?;
            let removed: i32 = redis::cmd("DEL")
                .arg(format!("token:{user}"))
                .query_async(&mut redis)
                .await
                .map_err(|_| ())?;
            let _: i32 = redis::cmd("SREM")
                .arg("waiting")
                .arg(&user)
                .query_async(&mut redis)
                .await
                .map_err(|_| ())?;
            if removed > 0 {
                hub.send(&user, r#"{"type":"token_cleared"}"#);
            }
        }
        let waiting: Vec<String> = redis::cmd("SMEMBERS")
            .arg("waiting")
            .query_async(&mut redis)
            .await
            .map_err(|_| ())?;
        for user in waiting {
            if !draw() {
                continue;
            }
            let area: Option<String> = redis::cmd("GET")
                .arg(format!("presence:{user}"))
                .query_async(&mut redis)
                .await
                .map_err(|_| ())?;
            let Some(area) = area else {
                continue;
            };
            let _: () = redis::pipe()
                .cmd("SET")
                .arg(format!("token:{user}"))
                .arg(&area)
                .cmd("SREM")
                .arg("waiting")
                .arg(&user)
                .query_async(&mut redis)
                .await
                .map_err(|_| ())?;
            hub.send(
                &user,
                &serde_json::json!({"type": "token", "area": area}).to_string(),
            );
        }
        Ok(())
    }

    async fn live_ids(&self, area: &str) -> Result<Vec<String>, ()> {
        let mut redis = self.redis.clone();
        let ids: Vec<String> = redis::cmd("ZRANGE")
            .arg(format!("area:{area}"))
            .arg(0)
            .arg(-1)
            .query_async(&mut redis)
            .await
            .map_err(|_| ())?;
        let mut live = Vec::new();
        for id in ids {
            let raw: Option<String> = redis::cmd("GET")
                .arg(format!("comment:{id}"))
                .query_async(&mut redis)
                .await
                .map_err(|_| ())?;
            if raw.as_deref().is_none_or(|body| expired(body)) {
                self.forget(area, &id).await?;
                if raw.is_some() {
                    let _: i32 = redis::cmd("DEL")
                        .arg(format!("comment:{id}"))
                        .query_async(&mut redis)
                        .await
                        .map_err(|_| ())?;
                }
                continue;
            }
            live.push(id);
        }
        Ok(live)
    }

    async fn geosearch(
        &self,
        south: f64,
        west: f64,
        north: f64,
        east: f64,
    ) -> Result<Vec<String>, ()> {
        let south = south - area::STEP;
        let north = north + area::STEP;
        let west = west - area::STEP;
        let east = east + area::STEP;
        let lat = (south + north) / 2.0;
        let lon = (west + east) / 2.0;
        let height = (north - south).abs() * 111_320.0;
        let width = (east - west).abs() * 111_320.0 * lat.to_radians().cos().abs().max(0.2);
        let mut redis = self.redis.clone();
        redis::cmd("GEOSEARCH")
            .arg("busy")
            .arg("FROMLONLAT")
            .arg(lon)
            .arg(lat)
            .arg("BYBOX")
            .arg(width.max(1.0))
            .arg(height.max(1.0))
            .arg("M")
            .query_async(&mut redis)
            .await
            .map_err(|_| ())
    }

    async fn forget(&self, area: &str, id: &str) -> Result<i64, ()> {
        let mut redis = self.redis.clone();
        redis::cmd("EVAL")
            .arg(FORGET_SCRIPT)
            .arg(4)
            .arg(format!("area:{area}"))
            .arg("expire")
            .arg(format!("count:{area}"))
            .arg("busy")
            .arg(area)
            .arg(id)
            .arg(format!("{area}|{id}"))
            .query_async(&mut redis)
            .await
            .map_err(|_| ())
    }
}

fn cell_center(area: &str) -> Option<(f64, f64)> {
    let (lat, lng) = area::southwest(area)?;
    Some((lng + area::STEP / 2.0, lat + area::STEP / 2.0))
}

fn expired(body: &str) -> bool {
    let Ok(stored) = serde_json::from_str::<StoredComment>(body) else {
        return true;
    };
    let Ok(created) = DateTime::parse_from_rfc3339(&stored.created_at) else {
        return true;
    };
    Utc::now().signed_duration_since(created.with_timezone(&Utc))
        >= chrono::Duration::seconds(COMMENT_TTL_SECS)
}

pub async fn connect(url: &str) -> Result<ConnectionManager, redis::RedisError> {
    let client = redis::Client::open(url)?;
    client.get_connection_manager().await
}
