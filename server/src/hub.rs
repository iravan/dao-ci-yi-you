use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tokio::sync::mpsc::{unbounded_channel, UnboundedReceiver, UnboundedSender};
use uuid::Uuid;

#[derive(Clone, Default)]
pub struct Hub {
    sockets: Arc<Mutex<HashMap<String, Vec<(Uuid, UnboundedSender<String>)>>>>,
}

impl Hub {
    pub fn connect(&self, user: &str) -> (Uuid, UnboundedReceiver<String>) {
        let (sender, receiver) = unbounded_channel();
        let id = Uuid::new_v4();
        self.sockets
            .lock()
            .expect("socket lock")
            .entry(user.to_string())
            .or_default()
            .push((id, sender));
        (id, receiver)
    }

    pub fn disconnect(&self, user: &str, id: Uuid) {
        let mut sockets = self.sockets.lock().expect("socket lock");
        let Some(list) = sockets.get_mut(user) else {
            return;
        };
        list.retain(|(socket_id, _)| *socket_id != id);
        if list.is_empty() {
            sockets.remove(user);
        }
    }

    pub fn send_one(&self, user: &str, id: Uuid, message: &str) {
        let sockets = self.sockets.lock().expect("socket lock");
        let Some(list) = sockets.get(user) else {
            return;
        };
        if let Some((_, sender)) = list.iter().find(|(socket_id, _)| *socket_id == id) {
            let _ = sender.send(message.to_string());
        }
    }

    pub fn send(&self, user: &str, message: &str) {
        let mut sockets = self.sockets.lock().expect("socket lock");
        let Some(list) = sockets.get_mut(user) else {
            return;
        };
        list.retain(|(_, sender)| sender.send(message.to_string()).is_ok());
    }
}
