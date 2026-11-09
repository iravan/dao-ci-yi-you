# 到此一遊

A chatroom for the place you are standing. People close to each other share one room. A comment lives for 24 hours, then it is gone. Speaking costs a token, and the server hands those out at random to people who still have the page open.

This repository is that idea, and it has no app code yet.

## Area

An area is a grid cell on latitude and longitude. Two visitors are in the same room when they snap to the same cell. The snap uses a positive remainder so southern and western coordinates fall in stable cells. The ordinary `%` operator keeps the sign of a negative number, which would split one cell into two.

```text
step = 0.001
remainder(value, step) = ((value % step) + step) % step
snapped = value - remainder(value, step)
area = snappedLatitude + "," + snappedLongitude
```

`step` is 0.001 degrees. North to south that is about 111 metres. East to west it is about `111 * cos(latitude)` metres, so the cell is narrower as you leave the equator. Everyone whose snapped pair matches is in that chatroom. The area id is the snapped pair, not a place name.

A person standing just across a grid line is in the next room, even when they are a few metres away. That is the grouping rule. The room does not grow to include neighbours.

The client sends the device latitude and longitude. The server computes `area`. The client does not choose the room id.

## Comments

A comment belongs to one `area`. It stores the text, the time it was written, and the area id. It does not store a long-lived profile.

Every comment has a life of 24 hours from the time it was stored. After that the server deletes it. A reader never receives a comment whose age is 24 hours or more. Leaving the page does not keep the comment. The clock is the server clock.

The room view is the comments for the current `area` that are still inside that window, oldest first.

## Presence

A visitor is active while the page is open and the client is sending a heartbeat. The heartbeat carries the latest latitude and longitude. The server recomputes `area` from it.

The heartbeat interval is 15 seconds. A visitor with no heartbeat for 45 seconds is no longer active. A hidden or closed page stops the heartbeat, so that visitor drops out of the next token release.

## Tokens

A token is permission to write one comment in one `area`. The server is the only issuer.

Every 60 seconds the server releases tokens. It considers only active visitors who do not already hold a token. For each of them it draws a random chance of 1 in 4. A successful draw gives that visitor one token bound to the `area` they are in at that moment. The others get nothing and wait for the next release.

The client shows a wait state until a token arrives. The comment control stays closed without one.

Posting consumes the token. The comment is stored only when the token's `area` equals the visitor's current `area`. A mismatch is rejected. An unspent token is dropped when the visitor's snapped area changes, or when they stop being active. They wait for a later release in the area they are in now.

Tokens are not shared and not saved across visits.

## What this does not do yet

It does not open a socket, store a comment, or draw a map. The next step is the heartbeat, the area snap, the 24-hour comment store, and the 60-second token draw.
