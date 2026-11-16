// The jobs alerts (server.ts sendAlerts): show the note, and open the jobs page when it's tapped.
self.addEventListener("push", (e) => {
  const n = (() => { try { return e.data.json(); } catch { return { title: "ihor.sh jobs", body: e.data?.text() ?? "", url: "/nyc/jobs.html" }; } })();
  e.waitUntil(self.registration.showNotification(n.title, { body: n.body, icon: "/icon-192.png", data: { url: n.url } }));
});
self.addEventListener("notificationclick", (e) => { e.notification.close(); e.waitUntil(clients.openWindow(e.notification.data?.url ?? "/nyc/jobs.html")); });
