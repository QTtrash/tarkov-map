use crate::AppState;
use axum::{
    body::Body,
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State as AxumState,
    },
    http::{
        header::{CACHE_CONTROL, CONTENT_SECURITY_POLICY, CONTENT_TYPE, X_CONTENT_TYPE_OPTIONS},
        Request, StatusCode,
    },
    response::{IntoResponse, Response},
    routing::get,
    Router,
};
use serde::Serialize;
use std::{
    net::{IpAddr, Ipv4Addr, UdpSocket},
    sync::{
        atomic::{AtomicUsize, Ordering},
        Arc,
    },
};
use tauri::State;
use tokio::sync::{broadcast, oneshot};

const MAX_CLIENTS: usize = 8;
const MAX_MESSAGE_BYTES: usize = 4096;
const LAN_CSP: &str = "default-src 'self'; base-uri 'none'; frame-ancestors 'none'; img-src 'self' data: blob:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' ws: wss:";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShareInfo {
    pub phone_url: String,
    pub web_socket_url: String,
}

pub struct ShareServer {
    info: ShareInfo,
    shutdown: Option<oneshot::Sender<()>>,
}

#[derive(Clone)]
struct LanState {
    app: tauri::AppHandle,
    sender: broadcast::Sender<Vec<u8>>,
    clients: Arc<AtomicUsize>,
}

struct ClientGuard(Arc<AtomicUsize>);

impl Drop for ClientGuard {
    fn drop(&mut self) {
        self.0.fetch_sub(1, Ordering::AcqRel);
    }
}

fn lan_ip() -> IpAddr {
    UdpSocket::bind((Ipv4Addr::UNSPECIFIED, 0))
        .and_then(|socket| {
            socket.connect((Ipv4Addr::new(1, 1, 1, 1), 80))?;
            socket.local_addr()
        })
        .map(|address| address.ip())
        .unwrap_or(IpAddr::V4(Ipv4Addr::LOCALHOST))
}

fn reserve_client(clients: &Arc<AtomicUsize>) -> Option<ClientGuard> {
    clients
        .fetch_update(Ordering::AcqRel, Ordering::Acquire, |current| {
            (current < MAX_CLIENTS).then_some(current + 1)
        })
        .ok()
        .map(|_| ClientGuard(clients.clone()))
}

async fn upgrade(
    ws: WebSocketUpgrade,
    AxumState(state): AxumState<LanState>,
) -> Response {
    let Some(guard) = reserve_client(&state.clients) else {
        return (StatusCode::SERVICE_UNAVAILABLE, "LAN session is full").into_response();
    };
    ws.max_message_size(MAX_MESSAGE_BYTES)
        .on_upgrade(move |socket| relay(socket, state.sender, guard))
        .into_response()
}

async fn relay(
    mut socket: WebSocket,
    sender: broadcast::Sender<Vec<u8>>,
    _guard: ClientGuard,
) {
    let mut receiver = sender.subscribe();
    loop {
        tokio::select! {
            incoming = socket.recv() => match incoming {
                Some(Ok(Message::Binary(bytes))) if bytes.len() <= MAX_MESSAGE_BYTES => { let _ = sender.send(bytes.to_vec()); }
                Some(Ok(Message::Text(text))) if text.len() <= MAX_MESSAGE_BYTES => { let _ = sender.send(text.as_bytes().to_vec()); }
                Some(Ok(Message::Close(_))) | None | Some(Err(_)) => break,
                _ => {}
            },
            outgoing = receiver.recv() => match outgoing {
                Ok(bytes) => if socket.send(Message::Binary(bytes.into())).await.is_err() { break; },
                Err(broadcast::error::RecvError::Closed) => break,
                Err(broadcast::error::RecvError::Lagged(_)) => continue,
            }
        }
    }
}

fn valid_room_id(value: &str) -> bool {
    value.len() == 27
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-')
}

fn requested_asset(path: &str) -> Option<String> {
    if path.contains('%') || path.contains('\\') || path.contains("//") {
        return None;
    }
    let trimmed = path.trim_start_matches('/');
    if trimmed.is_empty() {
        return Some("companion.html".to_string());
    }
    let segments = trimmed.split('/').collect::<Vec<_>>();
    if segments.iter().any(|segment| segment.is_empty() || *segment == "." || *segment == "..") {
        return None;
    }
    if segments.len() == 2 && segments[0] == "lan" && valid_room_id(segments[1]) {
        return Some("companion.html".to_string());
    }
    if matches!(segments.first().copied(), Some("assets" | "maps")) {
        return Some(trimmed.to_string());
    }
    None
}

async fn asset(AxumState(state): AxumState<LanState>, request: Request<Body>) -> Response {
    let Some(path) = requested_asset(request.uri().path()) else {
        return StatusCode::NOT_FOUND.into_response();
    };
    let Some(asset) = state.app.asset_resolver().get(path.clone()) else {
        return StatusCode::NOT_FOUND.into_response();
    };
    let cache_control = if path == "companion.html" {
        "no-store"
    } else {
        "public, max-age=3600"
    };
    Response::builder()
        .status(StatusCode::OK)
        .header(CONTENT_TYPE, asset.mime_type)
        .header(CACHE_CONTROL, cache_control)
        .header(CONTENT_SECURITY_POLICY, LAN_CSP)
        .header(X_CONTENT_TYPE_OPTIONS, "nosniff")
        .body(Body::from(asset.bytes))
        .unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response())
}

#[tauri::command]
pub async fn start_lan_share(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<ShareInfo, String> {
    if let Some(server) = state
        .share_server
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .as_ref()
    {
        return Ok(server.info.clone());
    }
    let listener = tokio::net::TcpListener::bind((Ipv4Addr::UNSPECIFIED, 0))
        .await
        .map_err(|error| error.to_string())?;
    let port = listener
        .local_addr()
        .map_err(|error| error.to_string())?
        .port();
    let ip = lan_ip();
    let info = ShareInfo {
        phone_url: format!("http://{ip}:{port}/"),
        web_socket_url: format!("ws://127.0.0.1:{port}/ws"),
    };
    let (sender, _) = broadcast::channel::<Vec<u8>>(64);
    let router = Router::new()
        .route("/ws", get(upgrade))
        .fallback(get(asset))
        .with_state(LanState {
            app,
            sender,
            clients: Arc::new(AtomicUsize::new(0)),
        });
    let (shutdown, receiver) = oneshot::channel();
    tauri::async_runtime::spawn(async move {
        let _ = axum::serve(listener, router)
            .with_graceful_shutdown(async {
                let _ = receiver.await;
            })
            .await;
    });
    *state
        .share_server
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner()) = Some(ShareServer {
        info: info.clone(),
        shutdown: Some(shutdown),
    });
    Ok(info)
}

#[tauri::command]
pub fn stop_lan_share(state: State<'_, AppState>) {
    if let Some(mut server) = state
        .share_server
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .take()
    {
        if let Some(shutdown) = server.shutdown.take() {
            let _ = shutdown.send(());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{requested_asset, reserve_client, MAX_CLIENTS};
    use std::sync::{atomic::AtomicUsize, Arc};

    #[test]
    fn only_serves_companion_assets() {
        assert_eq!(requested_asset("/"), Some("companion.html".to_string()));
        assert_eq!(requested_asset("/lan/Abcdefghijklmnopqrstuvwxy_-"), Some("companion.html".to_string()));
        assert_eq!(requested_asset("/assets/companion.js"), Some("assets/companion.js".to_string()));
        assert_eq!(requested_asset("/maps/image/customs/base.png"), Some("maps/image/customs/base.png".to_string()));
        assert_eq!(requested_asset("/index.html"), None);
        assert_eq!(requested_asset("/assets/%2e%2e/index.html"), None);
        assert_eq!(requested_asset("/maps/../index.html"), None);
    }

    #[test]
    fn caps_simultaneous_clients() {
        let clients = Arc::new(AtomicUsize::new(0));
        let guards = (0..MAX_CLIENTS)
            .map(|_| reserve_client(&clients).expect("client slot"))
            .collect::<Vec<_>>();
        assert!(reserve_client(&clients).is_none());
        drop(guards);
        assert!(reserve_client(&clients).is_some());
    }
}
