pub mod area;
pub mod auth;
pub mod hub;
pub mod routes;
pub mod store;

use axum::http::{header, HeaderValue, Method};
use rand::Rng;
use routes::{router, AppState};
use std::net::SocketAddr;
use tower_http::cors::CorsLayer;

pub struct Config {
    pub redis_url: String,
    pub bind: SocketAddr,
    pub jwks_url: Option<String>,
    pub hs_secret: Option<String>,
    pub cors_origins: Vec<HeaderValue>,
}

impl Config {
    pub fn from_env() -> Result<Self, String> {
        let redis_url =
            std::env::var("REDIS_URL").unwrap_or_else(|_| "redis://127.0.0.1:6379".to_string());
        let bind = std::env::var("BIND")
            .unwrap_or_else(|_| "127.0.0.1:8787".to_string())
            .parse()
            .map_err(|_| "BIND is invalid")?;
        let cors_origins = std::env::var("CORS_ORIGINS")
            .unwrap_or_else(|_| "http://localhost:3000,http://127.0.0.1:3000".to_string())
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
            jwks_url: std::env::var("SUPABASE_JWKS_URL").ok(),
            hs_secret: std::env::var("JWT_HS_SECRET").ok(),
            cors_origins,
        })
    }
}

pub async fn serve(config: Config) -> Result<(), String> {
    let redis = store::connect(&config.redis_url)
        .await
        .map_err(|err| err.to_string())?;
    let state = AppState {
        store: store::Store::new(redis),
        auth: auth::Auth::new(config.hs_secret, config.jwks_url),
        hub: hub::Hub::default(),
    };
    let clock_state = state.clone();
    tokio::spawn(async move {
        let mut tick = tokio::time::interval(std::time::Duration::from_secs(60));
        tick.tick().await;
        loop {
            tick.tick().await;
            if let Err(()) = clock_state.store.sweep().await {
                eprintln!("comment sweep failed");
            }
            if let Err(()) = clock_state
                .store
                .release(&clock_state.hub, || rand::rng().random_ratio(1, 4))
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
