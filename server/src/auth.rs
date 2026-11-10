use jsonwebtoken::{decode, decode_header, Algorithm, DecodingKey, Validation};
use serde::Deserialize;
use std::time::{Duration, Instant};

const PROVIDERS: [&str; 3] = ["apple", "google", "facebook"];

#[derive(Clone)]
pub struct Auth {
    hs_secret: Option<String>,
    jwks_url: Option<String>,
    http: reqwest::Client,
    cache: std::sync::Arc<tokio::sync::Mutex<Option<(Instant, Vec<serde_json::Value>)>>>,
}

#[derive(Debug)]
pub struct User {
    pub id: String,
    pub provider: String,
}

#[derive(Debug)]
pub struct AuthError(pub &'static str);

#[derive(Deserialize)]
struct Claims {
    sub: String,
    #[serde(default)]
    app_metadata: AppMetadata,
}

#[derive(Deserialize, Default)]
struct AppMetadata {
    #[serde(default)]
    provider: String,
}

impl Auth {
    pub fn new(hs_secret: Option<String>, jwks_url: Option<String>) -> Self {
        Self {
            hs_secret: hs_secret.filter(|secret| !secret.is_empty()),
            jwks_url: jwks_url.filter(|url| !url.is_empty()),
            http: reqwest::Client::new(),
            cache: std::sync::Arc::new(tokio::sync::Mutex::new(None)),
        }
    }

    pub async fn verify(&self, token: &str) -> Result<User, AuthError> {
        let header = decode_header(token).map_err(|_| AuthError("invalid token"))?;
        let key = match header.alg {
            Algorithm::HS256 => {
                let secret = self
                    .hs_secret
                    .as_deref()
                    .ok_or(AuthError("invalid token"))?;
                DecodingKey::from_secret(secret.as_bytes())
            }
            algorithm => self.jwk(&header.kid, algorithm).await?,
        };
        let mut validation = Validation::new(header.alg);
        validation.set_audience(&["authenticated"]);
        let data =
            decode::<Claims>(token, &key, &validation).map_err(|_| AuthError("invalid token"))?;
        if !PROVIDERS.contains(&data.claims.app_metadata.provider.as_str()) {
            return Err(AuthError("provider is not allowed"));
        }
        if data.claims.sub.is_empty() {
            return Err(AuthError("invalid token"));
        }
        Ok(User {
            id: data.claims.sub,
            provider: data.claims.app_metadata.provider,
        })
    }

    async fn jwk(
        &self,
        kid: &Option<String>,
        algorithm: Algorithm,
    ) -> Result<DecodingKey, AuthError> {
        let url = self.jwks_url.as_deref().ok_or(AuthError("invalid token"))?;
        let keys = self.keys(url).await?;
        let matched = keys.iter().find(|key| {
            let key_kid = key.get("kid").and_then(|value| value.as_str());
            kid.as_deref() == key_kid || kid.is_none()
        });
        let Some(value) = matched else {
            return Err(AuthError("invalid token"));
        };
        let _ = algorithm;
        let jwk = serde_json::from_value(value.clone()).map_err(|_| AuthError("invalid token"))?;
        DecodingKey::from_jwk(&jwk).map_err(|_| AuthError("invalid token"))
    }

    async fn keys(&self, url: &str) -> Result<Vec<serde_json::Value>, AuthError> {
        {
            let cache = self.cache.lock().await;
            if let Some((stored, keys)) = cache.as_ref() {
                if stored.elapsed() < Duration::from_secs(600) {
                    return Ok(keys.clone());
                }
            }
        }
        let response = self
            .http
            .get(url)
            .send()
            .await
            .map_err(|_| AuthError("invalid token"))?;
        let body: Jwks = response
            .json()
            .await
            .map_err(|_| AuthError("invalid token"))?;
        *self.cache.lock().await = Some((Instant::now(), body.keys.clone()));
        Ok(body.keys)
    }
}

#[derive(Deserialize)]
struct Jwks {
    keys: Vec<serde_json::Value>,
}

pub fn test_token(secret: &str, provider: &str, sub: &str) -> String {
    use jsonwebtoken::{encode, EncodingKey, Header};
    let claims = serde_json::json!({
        "sub": sub,
        "aud": "authenticated",
        "exp": chrono::Utc::now().timestamp() + 3600,
        "app_metadata": { "provider": provider }
    });
    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
    .expect("test token")
}
