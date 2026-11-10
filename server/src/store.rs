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
  return 2
end
redis.call('SET', KEYS[3], ARGV[2], 'EX', ARGV[5])
redis.call('ZADD', KEYS[4], ARGV[3], ARGV[4])
redis.call('DEL', KEYS[1])
redis.call('SADD', KEYS[5], ARGV[1])
return 1
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

impl Store {
    pub fn new(redis: ConnectionManager) -> Self {
        Self { redis }
    }

    pub async fn post(&self, user: &str, area: &str, text: &str) -> Result<Comment, PostError> {
        let id = Uuid::new_v4().to_string();
        let created_at = Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true);
        let stored = StoredComment {
            text: text.to_string(),
            area: area.to_string(),
            created_at: created_at.clone(),
        };
        let body = serde_json::to_string(&stored).map_err(|_| PostError::Redis)?;
        let score = Utc::now().timestamp();
        let mut redis = self.redis.clone();
        let code: i32 = redis::cmd("EVAL")
            .arg(POST_SCRIPT)
            .arg(5)
            .arg(format!("token:{user}"))
            .arg(format!("presence:{user}"))
            .arg(format!("comment:{id}"))
            .arg(format!("area:{area}"))
            .arg("areas")
            .arg(area)
            .arg(body)
            .arg(score)
            .arg(&id)
            .arg(COMMENT_TTL_SECS)
            .query_async(&mut redis)
            .await
            .map_err(|_| PostError::Redis)?;
        match code {
            1 => Ok(Comment {
                id,
                text: text.to_string(),
                area: area.to_string(),
                created_at,
            }),
            2 => Err(PostError::WrongArea),
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
        let mut redis = self.redis.clone();
        let areas: Vec<String> = redis::cmd("SMEMBERS")
            .arg("areas")
            .query_async(&mut redis)
            .await
            .map_err(|_| ())?;
        let mut busy = Vec::new();
        for area in areas {
            if !area::intersects(&area, south, west, north, east) {
                continue;
            }
            let ids = self.live_ids(&area).await?;
            if ids.len() < 2 {
                continue;
            }
            let Some((cell_south, cell_west)) = area::southwest(&area) else {
                continue;
            };
            busy.push(BusyArea {
                area,
                count: ids.len() as i64,
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
            let _: i32 = redis::cmd("DEL")
                .arg(format!("token:{user}"))
                .query_async(&mut redis)
                .await
                .map_err(|_| ())?;
            true
        } else {
            false
        };
        Ok((area, cleared))
    }

    pub async fn sweep(&self) -> Result<(), ()> {
        let mut redis = self.redis.clone();
        let areas: Vec<String> = redis::cmd("SMEMBERS")
            .arg("areas")
            .query_async(&mut redis)
            .await
            .map_err(|_| ())?;
        for area in areas {
            self.live_ids(&area).await?;
        }
        Ok(())
    }

    pub async fn release<F>(&self, hub: &Hub, mut draw: F) -> Result<(), ()>
    where
        F: FnMut() -> bool,
    {
        let now = Utc::now().timestamp();
        let mut redis = self.redis.clone();
        let members: Vec<(String, f64)> = redis::cmd("ZRANGE")
            .arg("active")
            .arg(0)
            .arg(-1)
            .arg("WITHSCORES")
            .query_async(&mut redis)
            .await
            .map_err(|_| ())?;
        for (user, score) in members {
            if (now as f64) - score > PRESENCE_TTL_SECS as f64 {
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
                if removed > 0 {
                    hub.send(&user, r#"{"type":"token_cleared"}"#);
                }
                continue;
            }
            let held: bool = redis::cmd("EXISTS")
                .arg(format!("token:{user}"))
                .query_async(&mut redis)
                .await
                .map_err(|_| ())?;
            if held || !draw() {
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
            let _: () = redis::cmd("SET")
                .arg(format!("token:{user}"))
                .arg(&area)
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
                let _: i32 = redis::cmd("ZREM")
                    .arg(format!("area:{area}"))
                    .arg(&id)
                    .query_async(&mut redis)
                    .await
                    .map_err(|_| ())?;
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
        let left: i64 = redis::cmd("ZCARD")
            .arg(format!("area:{area}"))
            .query_async(&mut redis)
            .await
            .map_err(|_| ())?;
        if left == 0 {
            let _: (i32, i32) = redis::pipe()
                .cmd("DEL")
                .arg(format!("area:{area}"))
                .cmd("SREM")
                .arg("areas")
                .arg(area)
                .query_async(&mut redis)
                .await
                .map_err(|_| ())?;
        }
        Ok(live)
    }
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
