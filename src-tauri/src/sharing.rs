use crate::AppState;
use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State as AxumState,
    },
    response::{Html, IntoResponse},
    routing::get,
    Router,
};
use serde::Serialize;
use std::net::{IpAddr, Ipv4Addr, UdpSocket};
use tauri::State;
use tokio::sync::{broadcast, oneshot};

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

fn lan_ip() -> IpAddr {
    UdpSocket::bind((Ipv4Addr::UNSPECIFIED, 0))
        .and_then(|socket| {
            socket.connect((Ipv4Addr::new(1, 1, 1, 1), 80))?;
            socket.local_addr()
        })
        .map(|address| address.ip())
        .unwrap_or(IpAddr::V4(Ipv4Addr::LOCALHOST))
}

async fn upgrade(
    ws: WebSocketUpgrade,
    AxumState(sender): AxumState<broadcast::Sender<Vec<u8>>>,
) -> impl IntoResponse {
    ws.max_message_size(4096)
        .on_upgrade(move |socket| relay(socket, sender))
}

async fn relay(mut socket: WebSocket, sender: broadcast::Sender<Vec<u8>>) {
    let mut receiver = sender.subscribe();
    loop {
        tokio::select! {
            incoming = socket.recv() => match incoming {
                Some(Ok(Message::Binary(bytes))) if bytes.len() <= 4096 => { let _ = sender.send(bytes.to_vec()); }
                Some(Ok(Message::Text(text))) if text.len() <= 4096 => { let _ = sender.send(text.as_bytes().to_vec()); }
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

async fn companion() -> Html<&'static str> {
    Html(include_str!("companion.html"))
}

#[tauri::command]
pub async fn start_lan_share(state: State<'_, AppState>) -> Result<ShareInfo, String> {
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
        .route("/", get(companion))
        .route("/ws", get(upgrade))
        .with_state(sender);
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
