---
name: add-websocket-event
description: Add a new WebSocket event for real-time communication between server and clients. Use when adding player actions, game state updates, server broadcasts, or any real-time feature.
---

# Add WebSocket Event

This skill guides the creation of new WebSocket events in the blind-test system.

## Architecture Overview

```
Server (Elysia)                    Client (Svelte)
─────────────────                  ────────────────
websocket/handler.ts      <──>     stores/socket.svelte.ts
     │                                    │
     │ broadcasts                         │ subscribes
     ▼                                    ▼
All connected clients              Component $effect()
```

## Step-by-Step Checklist

### 1. Define Types in Shared Package

**File**: `packages/shared/src/types.ts`

```typescript
// Add to the WebSocket events section
export interface MyNewEvent {
  type: 'my:event';
  data: {
    // event payload
  };
}
```

### 2. Server: Add Handler or Broadcast

**File**: `apps/server/src/websocket/handler.ts`

For incoming client messages:
```typescript
case 'my:action':
  handleMyAction(ws, roomId, message.data);
  break;
```

For server broadcasts:
```typescript
broadcastToRoom(roomId, {
  type: 'my:event',
  data: { /* payload */ }
});
```

### 3. Client: Add to Socket Store

**File**: `apps/client/src/lib/stores/socket.svelte.ts`

Add to `GameEvents` interface:
```typescript
interface GameEvents {
  // ... existing events
  myEvent: MyEventData | null;
}
```

Add to message handler switch:
```typescript
case 'my:event':
  console.log('[WS] My event received', message.data);
  this.events.myEvent = message.data;
  break;
```

Add clear method if needed:
```typescript
clear(event: keyof GameEvents) {
  // ... add 'myEvent' case
}
```

### 4. Client: Subscribe in Components

**File**: Component that needs the event

```typescript
$effect(() => {
  const event = socket.events.myEvent;
  if (event) {
    console.log('[Component] Processing my event', event);
    // Handle event
    socket.events.clear('myEvent');
  }
});
```

### 5. Update Documentation

**File**: `docs/WEBSOCKETS.md`

Add event to the appropriate section with:
- Event name and direction (server→client or client→server)
- Payload structure
- When it's triggered
- Expected client behavior

## Event Naming Conventions

| Pattern | Usage | Example |
|---------|-------|---------|
| `noun:verb` | State changes | `song:started`, `game:paused` |
| `noun:adjective` | Status updates | `player:connected`, `room:full` |
| `action:result` | Response events | `answer:result`, `buzz:accepted` |

## Common Patterns

### Broadcast to all players in room
```typescript
broadcastToRoom(roomId, { type: 'event', data });
```

### Send to specific player
```typescript
sendMessage(ws, { type: 'event', data });
```

### Broadcast to all except sender
```typescript
broadcastToRoom(roomId, { type: 'event', data }, ws);
```

## Testing

1. Add console.log on both server and client
2. Open browser DevTools → Network → WS tab
3. Trigger the event and verify payload
4. Check all clients receive broadcast events
