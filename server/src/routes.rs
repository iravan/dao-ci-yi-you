use crate::area::{self, MAX_TEXT_CHARS};
use crate::auth::Auth;
use crate::hub::Hub;
use crate::store::{PostError, Store};
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Path, Query, State};
use axum::http::{header, HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::{Json, Router};
use futures::{SinkExt, StreamExt};
use serde::Deserialize;
use serde_json::{json, Value};
use std::sync::Arc;

#[derive(Clone)]
pub struct AppState {
    pub store: Store,
    pub auth: Auth,
    pub hub: Hub,
}

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/areas", get(list_areas))
        .route(
            "/areas/{area}/comments",
            get(list_comments).post(post_comment),
        )
        .route("/ws", get(socket))
        .with_state(Arc::new(state))
}

#[derive(Deserialize)]
struct Bounds {
    south: f64,
    west: f64,
    north: f64,
    east: f64,
}

#[derive(Deserialize)]
struct PostBody {
    text: String,
}

async fn list_areas(State(state): State<Arc<AppState>>, Query(bounds): Query<Bounds>) -> Response {
    if !bounds.south.is_finite()
        || !bounds.west.is_finite()
        || !bounds.north.is_finite()
        || !bounds.east.is_finite()
        || bounds.south >= bounds.north
    {
        return error(StatusCode::BAD_REQUEST, "bounds are invalid");
    }
    match state
        .store
        .busy(bounds.south, bounds.west, bounds.north, bounds.east)
        .await
    {
        Ok(areas) => Json(json!({ "areas": areas })).into_response(),
        Err(()) => error(StatusCode::INTERNAL_SERVER_ERROR, "the store failed"),
    }
}

async fn list_comments(State(state): State<Arc<AppState>>, Path(area): Path<String>) -> Response {
    if area::parse_area(&area).is_none() {
        return error(StatusCode::BAD_REQUEST, "area is invalid");
    }
    match state.store.comments(&area).await {
        Ok(comments) => Json(json!({ "comments": comments })).into_response(),
        Err(()) => error(StatusCode::INTERNAL_SERVER_ERROR, "the store failed"),
    }
}

async fn post_comment(
    State(state): State<Arc<AppState>>,
    Path(area): Path<String>,
    headers: HeaderMap,
    Json(body): Json<PostBody>,
) -> Response {
    if area::parse_area(&area).is_none() {
        return error(StatusCode::BAD_REQUEST, "area is invalid");
    }
    let text = body.text.trim();
    if text.is_empty() {
        return error(StatusCode::BAD_REQUEST, "text is empty");
    }
    if text.chars().count() > MAX_TEXT_CHARS {
        return error(StatusCode::BAD_REQUEST, "text is too long");
    }
    let Some(token) = bearer(&headers) else {
        return error(StatusCode::UNAUTHORIZED, "sign in is required");
    };
    let user = match state.auth.verify(token).await {
        Ok(user) => user,
        Err(err) => {
            let status = if err.0 == "provider is not allowed" {
                StatusCode::FORBIDDEN
            } else {
                StatusCode::UNAUTHORIZED
            };
            return error(status, err.0);
        }
    };
    match state.store.post(&user.id, &area, text).await {
        Ok(comment) => (StatusCode::CREATED, Json(comment)).into_response(),
        Err(PostError::NoToken) => error(StatusCode::FORBIDDEN, "a token is required"),
        Err(PostError::WrongArea) => error(StatusCode::FORBIDDEN, "that is not your block"),
        Err(PostError::Redis) => error(StatusCode::INTERNAL_SERVER_ERROR, "the store failed"),
    }
}

async fn socket(State(state): State<Arc<AppState>>, upgrade: WebSocketUpgrade) -> Response {
    upgrade.on_upgrade(move |socket| async move {
        if let Err(err) = session(state, socket).await {
            eprintln!("socket closed: {err}");
        }
    })
}

async fn session(state: Arc<AppState>, socket: WebSocket) -> Result<(), &'static str> {
    let (mut write, mut read) = socket.split();
    let first = tokio::time::timeout(std::time::Duration::from_secs(10), read.next())
        .await
        .map_err(|_| "auth timed out")?
        .ok_or("socket closed")?
        .map_err(|_| "socket closed")?;
    let Message::Text(text) = first else {
        return Err("auth is required");
    };
    let value: Value = serde_json::from_str(&text).map_err(|_| "auth is required")?;
    if value.get("type").and_then(|kind| kind.as_str()) != Some("auth") {
        return Err("auth is required");
    }
    let token = value
        .get("access_token")
        .and_then(|token| token.as_str())
        .ok_or("auth is required")?;
    let user = state.auth.verify(token).await.map_err(|err| err.0)?;
    write
        .send(Message::Text(r#"{"type":"ready"}"#.into()))
        .await
        .map_err(|_| "socket closed")?;
    let (socket_id, mut incoming) = state.hub.connect(&user.id);
    let mut write_task = tokio::spawn(async move {
        while let Some(message) = incoming.recv().await {
            if write.send(Message::Text(message.into())).await.is_err() {
                break;
            }
        }
    });
    let state_for_read = state.clone();
    let user_id = user.id.clone();
    let read_socket = socket_id;
    let mut read_task = tokio::spawn(async move {
        while let Some(Ok(message)) = read.next().await {
            let Message::Text(text) = message else {
                continue;
            };
            let Ok(value) = serde_json::from_str::<Value>(&text) else {
                continue;
            };
            if value.get("type").and_then(|kind| kind.as_str()) != Some("heartbeat") {
                continue;
            }
            let Some(latitude) = value.get("latitude").and_then(|value| value.as_f64()) else {
                continue;
            };
            let Some(longitude) = value.get("longitude").and_then(|value| value.as_f64()) else {
                continue;
            };
            if !latitude.is_finite() || !longitude.is_finite() {
                continue;
            }
            let Ok((area, cleared)) = state_for_read
                .store
                .heartbeat(&user_id, latitude, longitude)
                .await
            else {
                continue;
            };
            if cleared {
                state_for_read
                    .hub
                    .send(&user_id, r#"{"type":"token_cleared"}"#);
            }
            state_for_read.hub.send_one(
                &user_id,
                read_socket,
                &json!({"type": "here", "area": area}).to_string(),
            );
        }
    });
    tokio::select! {
        _ = &mut write_task => read_task.abort(),
        _ = &mut read_task => write_task.abort(),
    }
    state.hub.disconnect(&user.id, socket_id);
    Ok(())
}

fn bearer(headers: &HeaderMap) -> Option<&str> {
    headers
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .filter(|token| !token.is_empty())
}

fn error(status: StatusCode, message: &str) -> Response {
    (status, Json(json!({ "error": message }))).into_response()
}
