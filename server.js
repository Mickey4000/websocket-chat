const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const server = http.createServer((req, res) => {
  const filePath = path.join(__dirname, 'index.html');
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(500);
      res.end('Error loading page');
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(data);
  });
});

const wss = new WebSocket.Server({ server });
const clients = new Set();

function log(...parts) {
  console.log(new Date().toISOString(), ...parts);
}

function safeSend(ws, payload) {
  if (ws.readyState !== WebSocket.OPEN) {
    return;
  }

  const encoded = JSON.stringify(payload);
  log('SEND ->', ws.meta?.name || 'unknown', encoded);
  ws.send(encoded);
}

function broadcastToChannel(channel, payload) {
  const targets = [];

  for (const client of clients) {
    if (client.meta?.channel === channel) {
      targets.push(client.meta?.name || 'unknown');
      safeSend(client, payload);
    }
  }

  log('BROADCAST', `channel=${channel}`, `targets=${targets.join(',') || 'none'}`);
}

function getChannelMembers(channel) {
  const members = [];

  for (const client of clients) {
    if (client.meta?.channel === channel && client.meta.name) {
      members.push(client.meta.name);
    }
  }

  return members;
}

function relayMessage(ws, data) {
  const meta = ws.meta;
  if (!meta?.channel || !meta?.name || !data.topic) {
    log('SKIP relay due to missing meta/topic', JSON.stringify({
      channel: meta?.channel,
      name: meta?.name,
      topic: data.topic
    }));
    return;
  }

  log('RELAY request', `from=${meta.name}`, `channel=${meta.channel}`, `topic=${data.topic}`, `message=${JSON.stringify(data.message)}`);

  if (data.topic === 'list') {
    const members = getChannelMembers(meta.channel);
    broadcastToChannel(meta.channel, {
      type: 'message',
      topic: 'list',
      name: meta.name,
      message: members
    });
    return;
  }

  broadcastToChannel(meta.channel, {
    type: 'message',
    topic: data.topic,
    name: meta.name,
    message: data.message
  });
}

wss.on('connection', (ws, req) => {
  ws.meta = {
    channel: null,
    name: null,
    lastMessage: 0
  };

  clients.add(ws);
  log('CONNECT', req.socket.remoteAddress, `clients=${clients.size}`);

  ws.on('message', (rawMessage) => {
    const text = rawMessage.toString();
    log('RAW <-', text);

    let data;
    try {
      data = JSON.parse(text);
    } catch (error) {
      log('INVALID JSON', error.message);
      return;
    }

    log('PARSED', `type=${data.type}`, `topic=${data.topic || 'none'}`);

    if (data.type === 'init') {
      ws.meta.channel = data.channel || null;
      ws.meta.name = data.name || null;
      ws.meta.lastMessage = data.lastMessage || 0;
      log('INIT', `name=${ws.meta.name}`, `channel=${ws.meta.channel}`, `lastMessage=${ws.meta.lastMessage}`);
      return;
    }

    if (data.type === 'message') {
      relayMessage(ws, data);
      return;
    }

    log('UNKNOWN TYPE', JSON.stringify(data));
  });

  ws.on('close', (code, reason) => {
    clients.delete(ws);
    log('CLOSE', `code=${code}`, `reason=${reason.toString()}`, `clients=${clients.size}`, `name=${ws.meta?.name || 'unknown'}`);
  });

  ws.on('error', (error) => {
    log('SOCKET ERROR', error.message);
  });
});

const PORT = process.env.PORT || 8008;

server.listen(PORT, '0.0.0.0', () => {
  log(`BotServer running on port ${PORT}`);
});
