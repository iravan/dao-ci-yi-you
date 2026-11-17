pub mod area;
pub mod auth;
pub mod hub;
pub mod routes;
pub mod store;

use axum::http::{header, HeaderValue, Method};
use routes::{router, AppState};
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::OnceLock;
use tower_http::cors::CorsLayer;

static FILE_ENV: OnceLock<HashMap<String, String>> = OnceLock::new();

pub struct Config {
    pub redis_url: String,
    pub bind: SocketAddr,
    pub jwks_url: Option<String>,
    pub hs_secret: Option<String>,
    pub cors_origins: Vec<HeaderValue>,
    pub token_release_secs: u64,
}

/// The hosted integration injects `SUPABASE_URL`, not the JWKS address.
fn jwks_url_for(supabase_url: &str) -> String {
    format!(
        "{}/auth/v1/.well-known/jwks.json",
        supabase_url.trim_end_matches('/')
    )
}

fn jwks_url() -> Option<String> {
    if let Some(url) = var("SUPABASE_JWKS_URL") {
        return Some(url);
    }
    var("SUPABASE_URL").map(|url| jwks_url_for(&url))
}

/// `cargo run` does not export `.env`. A variable already set in the process
/// wins, so a host can still inject `SUPABASE_JWKS_URL`.
pub fn load_dotenv() {
    let _ = FILE_ENV.get_or_init(read_dotenv);
}

fn read_dotenv() -> HashMap<String, String> {
    let manifest = std::env::var("CARGO_MANIFEST_DIR").ok();
    let mut candidates = Vec::new();
    for name in [".env", ".env.local"] {
        if let Some(dir) = &manifest {
            candidates.push(format!("{dir}/{name}"));
        }
        candidates.push(name.to_string());
        candidates.push(format!("server/{name}"));
    }
    let mut file = HashMap::new();
    for path in candidates {
        let Ok(text) = std::fs::read_to_string(&path) else {
            continue;
        };
        for line in text.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                continue;
            }
            let Some((key, raw)) = line.split_once('=') else {
                continue;
            };
            let key = key.trim();
            if key.is_empty() || std::env::var(key).is_ok() || file.contains_key(key) {
                continue;
            }
            file.insert(key.to_string(), unquote(raw.trim()).to_string());
        }
    }
    file
}

fn var(key: &str) -> Option<String> {
    std::env::var(key)
        .ok()
        .or_else(|| FILE_ENV.get().and_then(|file| file.get(key).cloned()))
}

fn unquote(value: &str) -> &str {
    let bytes = value.as_bytes();
    if bytes.len() >= 2 && bytes[0] == bytes[bytes.len() - 1] && (bytes[0] == 34 || bytes[0] == 39)
    {
        &value[1..value.len() - 1]
    } else {
        value
    }
}

impl Config {
    pub fn from_env() -> Result<Self, String> {
        load_dotenv();
        let redis_url = var("REDIS_URL").unwrap_or_else(|| "redis://127.0.0.1:6379".to_string());
        let bind: SocketAddr = match var("BIND") {
            Some(bind) => bind.parse().map_err(|_| "BIND is invalid")?,
            // The host sets PORT for a deployed service.
            None => match var("PORT") {
                Some(port) => format!("0.0.0.0:{port}")
                    .parse()
                    .map_err(|_| "PORT is invalid")?,
                None => "127.0.0.1:8787".parse().map_err(|_| "BIND is invalid")?,
            },
        };
        let cors_origins = var("CORS_ORIGINS")
            .unwrap_or_else(|| "http://localhost:3000,http://127.0.0.1:3000".to_string())
            .split(',')
            .map(str::trim)
            .filter(|origin| !origin.is_empty())
            .map(|origin| {
                origin
                    .parse::<HeaderValue>()
                    .map_err(|_| format!("CORS origin is invalid: {origin}"))
            })
            .collect::<Result<Vec<_>, _>>()?;
        Ok(Self {
            redis_url,
            bind,
            jwks_url: jwks_url(),
            hs_secret: var("JWT_HS_SECRET"),
            cors_origins,
            token_release_secs: token_release_secs()?,
        })
    }
}

fn sso_providers() -> Vec<String> {
    let providers: Vec<String> = var("SSO_PROVIDERS")
        .unwrap_or_default()
        .split(',')
        .map(str::trim)
        .filter(|provider| !provider.is_empty())
        .map(str::to_string)
        .collect();
    if providers.is_empty() {
        vec!["google".to_string()]
    } else {
        providers
    }
}

fn token_release_secs() -> Result<u64, String> {
    let Some(value) = var("TOKEN_RELEASE_SECS") else {
        return Ok(1);
    };
    match value.parse::<u64>() {
        Ok(secs) if secs > 0 => Ok(secs),
        _ => Err("TOKEN_RELEASE_SECS is invalid".to_string()),
    }
}

pub async fn serve(config: Config) -> Result<(), String> {
    match &config.jwks_url {
        Some(url) => println!("checking tokens with {url}"),
        None => eprintln!("SUPABASE_JWKS_URL is unset; sign-in tokens will be rejected"),
    }
    let redis = store::connect(&config.redis_url)
        .await
        .map_err(|err| err.to_string())?;
    let state = AppState {
        store: store::Store::new(redis),
        auth: auth::Auth::new(config.hs_secret, config.jwks_url, sso_providers()),
        hub: hub::Hub::default(),
        live: tokio::sync::broadcast::channel(64).0,
    };
    let clock_state = state.clone();
    let release_secs = config.token_release_secs;
    tokio::spawn(async move {
        let mut tick = tokio::time::interval(std::time::Duration::from_secs(release_secs));
        tick.tick().await;
        loop {
            tick.tick().await;
            if let Err(()) = clock_state.store.sweep().await {
                eprintln!("comment sweep failed");
            }
            if let Err(()) = clock_state
                .store
                .release(&clock_state.hub, || true)
                .await
            {
                eprintln!("token release failed");
            }
        }
    });
    let cors = CorsLayer::new()
        .allow_origin(config.cors_origins)
        .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
        .allow_headers([header::AUTHORIZATION, header::CONTENT_TYPE]);
    let app = router(state).layer(cors);
    let listener = tokio::net::TcpListener::bind(config.bind)
        .await
        .map_err(|err| err.to_string())?;
    println!("listening on http://{}", config.bind);
    axum::serve(listener, app)
        .await
        .map_err(|err| err.to_string())
}

#[cfg(test)]
mod tests {
    use super::jwks_url_for;

    #[test]
    fn jwks_url_follows_the_project_url() {
        assert_eq!(
            jwks_url_for("https://abc.supabase.co"),
            "https://abc.supabase.co/auth/v1/.well-known/jwks.json"
        );
        assert_eq!(
            jwks_url_for("https://abc.supabase.co/"),
            "https://abc.supabase.co/auth/v1/.well-known/jwks.json"
        );
    }
}
