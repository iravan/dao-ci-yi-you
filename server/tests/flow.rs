use axum::body::Body;
use axum::http::{Request, StatusCode};
use server::auth::{test_token, Auth};
use server::hub::Hub;
use server::routes::{router, AppState};
use server::store::{connect, Store};
use tower::ServiceExt;

const SECRET: &str = "test-secret";

async fn gate() -> tokio::sync::MutexGuard<'static, ()> {
    static GATE: std::sync::OnceLock<tokio::sync::Mutex<()>> = std::sync::OnceLock::new();
    GATE.get_or_init(|| tokio::sync::Mutex::new(()))
        .lock()
        .await
}

async fn redis_store() -> Store {
    let store = Store::new(
        connect("redis://127.0.0.1:6379/15")
            .await
            .expect("redis db 15"),
    );
    let mut con = connect("redis://127.0.0.1:6379/15")
        .await
        .expect("redis db 15");
    let _: () = redis::cmd("FLUSHDB")
        .query_async(&mut con)
        .await
        .expect("flush");
    store
}

fn state(store: Store) -> AppState {
    AppState {
        store,
        auth: Auth::new(Some(SECRET.to_string()), None),
        hub: Hub::default(),
    }
}

#[tokio::test]
async fn public_reads_need_no_session_and_post_does() {
    let _guard = gate().await;
    let app = router(state(redis_store().await));
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/areas?south=0&west=0&north=1&east=1")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/areas/0:0/comments")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/areas/0:0/comments")
                .header("content-type", "application/json")
                .body(Body::from(r#"{"text":"hello"}"#))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn a_token_only_posts_in_its_own_area_and_is_spent() {
    let _guard = gate().await;
    let store = redis_store().await;
    store.heartbeat("ada", 0.0001, 0.0001).await.unwrap();
    let mut con = connect("redis://127.0.0.1:6379/15").await.unwrap();
    let _: () = redis::cmd("SET")
        .arg("token:ada")
        .arg("0:0")
        .query_async(&mut con)
        .await
        .unwrap();

    let app = router(state(store));
    let token = test_token(SECRET, "google", "ada");
    let wrong = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/areas/1:1/comments")
                .header("authorization", format!("Bearer {token}"))
                .header("content-type", "application/json")
                .body(Body::from(r#"{"text":"no"}"#))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(wrong.status(), StatusCode::FORBIDDEN);
    let held: Option<String> = redis::cmd("GET")
        .arg("token:ada")
        .query_async(&mut con)
        .await
        .unwrap();
    assert_eq!(held.as_deref(), Some("0:0"));

    let posted = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/areas/0:0/comments")
                .header("authorization", format!("Bearer {token}"))
                .header("content-type", "application/json")
                .body(Body::from(r#"{"text":"  hello  "}"#))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(posted.status(), StatusCode::CREATED);
    let again = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/areas/0:0/comments")
                .header("authorization", format!("Bearer {token}"))
                .header("content-type", "application/json")
                .body(Body::from(r#"{"text":"again"}"#))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(again.status(), StatusCode::FORBIDDEN);
    let held: Option<String> = redis::cmd("GET")
        .arg("token:ada")
        .query_async(&mut con)
        .await
        .unwrap();
    assert!(held.is_none());
}

#[tokio::test]
async fn one_comment_is_absent_from_the_map_and_an_aged_comment_is_dropped() {
    let _guard = gate().await;
    let store = redis_store().await;
    store.heartbeat("ada", 0.0001, 0.0001).await.unwrap();
    let mut con = connect("redis://127.0.0.1:6379/15").await.unwrap();
    let _: () = redis::cmd("SET")
        .arg("token:ada")
        .arg("0:0")
        .query_async(&mut con)
        .await
        .unwrap();
    store.post("ada", "0:0", "only one").await.unwrap();
    let busy = store.busy(0.0, 0.0, 0.002, 0.002).await.unwrap();
    assert!(busy.is_empty());
    let comments = store.comments("0:0").await.unwrap();
    assert_eq!(comments.len(), 1);

    let old = r#"{"text":"gone","area":"0:0","created_at":"2000-01-01T00:00:00Z"}"#;
    let _: () = redis::pipe()
        .cmd("SET")
        .arg("comment:old")
        .arg(old)
        .arg("EX")
        .arg(86_400)
        .cmd("ZADD")
        .arg("area:0:0")
        .arg(0)
        .arg("old")
        .cmd("SADD")
        .arg("areas")
        .arg("0:0")
        .query_async(&mut con)
        .await
        .unwrap();
    let comments = store.comments("0:0").await.unwrap();
    assert!(comments.iter().all(|comment| comment.id != "old"));
}

#[tokio::test]
async fn two_sessions_share_one_presence_and_one_draw() {
    let _guard = gate().await;
    let store = redis_store().await;
    store.heartbeat("ada", 0.0001, 0.0001).await.unwrap();
    store.heartbeat("ada", 1.0001, 1.0001).await.unwrap();
    let mut con = connect("redis://127.0.0.1:6379/15").await.unwrap();
    let presence: String = redis::cmd("GET")
        .arg("presence:ada")
        .query_async(&mut con)
        .await
        .unwrap();
    assert_eq!(presence, "1000:1000");
    let members: Vec<String> = redis::cmd("ZRANGE")
        .arg("active")
        .arg(0)
        .arg(-1)
        .query_async(&mut con)
        .await
        .unwrap();
    assert_eq!(members, vec!["ada".to_string()]);

    let hub = Hub::default();
    store.release(&hub, || true).await.unwrap();
    store.release(&hub, || true).await.unwrap();
    let token: Option<String> = redis::cmd("GET")
        .arg("token:ada")
        .query_async(&mut con)
        .await
        .unwrap();
    assert_eq!(token.as_deref(), Some("1000:1000"));
}

#[tokio::test]
async fn a_stale_visitor_loses_the_next_draw_and_their_token() {
    let _guard = gate().await;
    let store = redis_store().await;
    store.heartbeat("ada", 0.0001, 0.0001).await.unwrap();
    let mut con = connect("redis://127.0.0.1:6379/15").await.unwrap();
    let _: () = redis::pipe()
        .cmd("ZADD")
        .arg("active")
        .arg(0)
        .arg("ada")
        .cmd("SET")
        .arg("token:ada")
        .arg("0:0")
        .query_async(&mut con)
        .await
        .unwrap();
    store.release(&Hub::default(), || true).await.unwrap();
    let members: Vec<String> = redis::cmd("ZRANGE")
        .arg("active")
        .arg(0)
        .arg(-1)
        .query_async(&mut con)
        .await
        .unwrap();
    assert!(members.is_empty());
    let token: Option<String> = redis::cmd("GET")
        .arg("token:ada")
        .query_async(&mut con)
        .await
        .unwrap();
    assert!(token.is_none());
}

#[tokio::test]
async fn moving_blocks_clears_the_token() {
    let _guard = gate().await;
    let store = redis_store().await;
    store.heartbeat("ada", 0.0001, 0.0001).await.unwrap();
    let mut con = connect("redis://127.0.0.1:6379/15").await.unwrap();
    let _: () = redis::cmd("SET")
        .arg("token:ada")
        .arg("0:0")
        .query_async(&mut con)
        .await
        .unwrap();
    let (area, cleared) = store.heartbeat("ada", 1.0001, 1.0001).await.unwrap();
    assert_eq!(area, "1000:1000");
    assert!(cleared);
    let token: Option<String> = redis::cmd("GET")
        .arg("token:ada")
        .query_async(&mut con)
        .await
        .unwrap();
    assert!(token.is_none());
}

#[tokio::test]
async fn a_disallowed_provider_cannot_post() {
    let _guard = gate().await;
    let app = router(state(redis_store().await));
    let token = test_token(SECRET, "email", "ada");
    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/areas/0:0/comments")
                .header("authorization", format!("Bearer {token}"))
                .header("content-type", "application/json")
                .body(Body::from(r#"{"text":"no"}"#))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn two_live_comments_are_counted_and_a_fall_back_to_one_is_not() {
    let _guard = gate().await;
    let store = redis_store().await;
    store.heartbeat("ada", 0.0001, 0.0001).await.unwrap();
    let mut con = connect("redis://127.0.0.1:6379/15").await.unwrap();
    for text in ["one", "two"] {
        let _: () = redis::cmd("SET")
            .arg("token:ada")
            .arg("0:0")
            .query_async(&mut con)
            .await
            .unwrap();
        store.post("ada", "0:0", text).await.unwrap();
    }
    let busy = store.busy(-0.01, -0.01, 0.01, 0.01).await.unwrap();
    assert_eq!(busy.len(), 1);
    assert_eq!(busy[0].count, 2);
    let comments = store.comments("0:0").await.unwrap();
    assert_eq!(comments.len(), 2);
    let first = &comments[0].id;
    let _: i32 = redis::cmd("DEL")
        .arg(format!("comment:{first}"))
        .query_async(&mut con)
        .await
        .unwrap();
    let busy = store.busy(-0.01, -0.01, 0.01, 0.01).await.unwrap();
    assert!(busy.is_empty());
    assert_eq!(store.comments("0:0").await.unwrap().len(), 1);
}
