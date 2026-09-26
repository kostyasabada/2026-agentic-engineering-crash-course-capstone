# Spec Delta

## Purpose

Lets people join one shared chat room under a self-chosen nickname, exchange text messages in real time, and see the recent conversation history, which is preserved across server restarts.

## ADDED Requirements

### Requirement: Character counting
Every length limit in this capability SHALL be measured in UTF-16 code units (the JavaScript string `length`) after trimming leading and trailing whitespace. The browser validation and the server validation MUST count length the same way, so a value accepted by one is accepted by the other. Input fields MUST NOT silently truncate what the person types or pastes; an over-limit value is kept in full and reported by validation, and the server's check is authoritative.

#### Scenario: Astral characters count as two units
- **WHEN** a person enters a nickname of 16 copies of `𠀀` (U+20000, a Unicode letter outside the Basic Multilingual Plane, 2 UTF-16 code units each), and separately one of 17 copies
- **THEN** the 16-copy nickname (32 code units) is accepted and the 17-copy nickname (34 code units) is rejected as too long, both in the browser and on the server

#### Scenario: Limit is consistent between browser and server
- **WHEN** a modified client sends a message text of 1000 UTF-16 code units that contains astral characters
- **THEN** the server accepts it on the length rule, as the browser would

### Requirement: Nickname entry without registration
The system SHALL require a person to choose a nickname before sending messages, without any account, password, or registration. A valid nickname MUST be 1 to 32 characters long after trimming leading and trailing whitespace and MUST consist only of Unicode letters, Unicode digits, spaces, hyphens (`-`), underscores (`_`), and periods (`.`). The system SHALL store the trimmed nickname, not the raw input. Nicknames are not unique: two people MAY use the same nickname at the same time. The chosen nickname SHALL be remembered in the same browser so that reloading the page does not ask for it again, and the person SHALL be able to change it at any time; messages sent after the change carry the new nickname, and earlier messages keep the nickname they were sent with.

#### Scenario: Valid nickname is accepted
- **WHEN** a person enters `  Alice_1  ` as a nickname and confirms
- **THEN** the chat view is shown with the message input enabled
- **AND** messages sent by this person are attributed to `Alice_1`

#### Scenario: Empty or whitespace-only nickname is rejected
- **WHEN** a person confirms a nickname that is empty or contains only whitespace
- **THEN** the nickname is not accepted, a validation message is shown, and the message input stays unavailable

#### Scenario: Too-long nickname is rejected
- **WHEN** a person confirms a nickname that is 33 or more characters long after trimming
- **THEN** the nickname is not accepted and a validation message states the 32-character limit

#### Scenario: Nickname with disallowed characters is rejected
- **WHEN** a person confirms the nickname `<script>` or `bob@home`
- **THEN** the nickname is not accepted and a validation message lists the allowed characters

#### Scenario: Server rejects an invalid nickname sent by a modified client
- **WHEN** a client bypasses browser validation and sends a message whose nickname violates the nickname rules
- **THEN** the server does not store or broadcast the message and returns an error to that client only

#### Scenario: Duplicate nicknames are allowed
- **WHEN** two independent clients both choose the nickname `Sam` and each sends a message
- **THEN** both messages are accepted and delivered, each attributed to `Sam`

#### Scenario: Nickname is remembered after reload
- **WHEN** a person who chose the nickname `Alice` reloads the page in the same browser
- **THEN** the chat view is shown with `Alice` as the current nickname without asking again

#### Scenario: Nickname is changed
- **WHEN** a person using the nickname `Alice` sends `first`, changes the nickname to `Alicia`, and sends `second`
- **THEN** every client shows `first` attributed to `Alice` and `second` attributed to `Alicia`
- **AND** after a reload the current nickname is `Alicia`

#### Scenario: Invalid nickname change is rejected
- **WHEN** a person tries to change the nickname to an invalid value
- **THEN** the change is not accepted, a validation message is shown, and the previous nickname stays in use

### Requirement: Real-time message delivery
The system SHALL deliver every accepted message to all clients connected to the room, including the sender, without the recipients reloading the page. Each accepted message SHALL be shown with its nickname, its text, and its server-assigned timestamp. Message text SHALL be displayed exactly as plain text with its line breaks: markup in a message MUST NOT be interpreted as HTML or executed as script, and Markdown or links MUST NOT be rendered.

#### Scenario: Message reaches another independent client
- **WHEN** client A (nickname `Alice`) and client B (nickname `Bob`) are open in separate browser contexts and Alice sends `Hello Bob`
- **THEN** client B shows `Hello Bob` attributed to `Alice` without reloading
- **AND** client A also shows the message in the conversation

#### Scenario: Markup is rendered as text
- **WHEN** a person sends the message `<img src=x onerror=alert(1)><b>bold</b>`
- **THEN** every client shows that exact text literally, no image or bold element is created, and no script runs

#### Scenario: Line breaks are preserved
- **WHEN** a person sends a message with the three lines `one`, `two`, and `three`
- **THEN** every client shows the message on three separate lines in that order

#### Scenario: Sender is informed when a send fails
- **WHEN** the server rejects a message or does not confirm it within 5 seconds
- **THEN** the sender sees an error for that message and the typed text is kept in the input so it can be retried

### Requirement: Message validation
The system SHALL trim leading and trailing whitespace from message text and SHALL accept only messages whose trimmed text is 1 to 1000 characters long; line breaks inside the text are preserved. The server MUST enforce these rules independently of the client. A rejected message MUST NOT be stored or broadcast, and the rejection MUST be reported to the sender only.

#### Scenario: Empty message is rejected
- **WHEN** a person tries to send a message that is empty
- **THEN** the message is not sent, stored, or shown to any client

#### Scenario: Whitespace-only message is rejected
- **WHEN** a person tries to send a message consisting only of spaces, tabs, or line breaks
- **THEN** the message is not sent, stored, or shown to any client

#### Scenario: Oversized message is rejected in the browser
- **WHEN** a person types or pastes a message longer than 1000 characters after trimming
- **THEN** the full text stays in the input without truncation, sending is prevented, and a message states the 1000-character limit

#### Scenario: Surrounding whitespace does not count toward the limit
- **WHEN** a person sends a message of 1000 characters surrounded by 10 spaces on each side (1020 characters before trimming)
- **THEN** the message is accepted and delivered as the 1000-character trimmed text

#### Scenario: Oversized message is rejected by the server
- **WHEN** a modified client sends a message whose trimmed text is 1001 characters long
- **THEN** the server rejects it with an error to that client only, and no client receives the message

#### Scenario: Message at the limit is accepted
- **WHEN** a person sends a message of exactly 1000 characters
- **THEN** the message is stored and delivered to all connected clients

#### Scenario: Surrounding whitespace is trimmed
- **WHEN** a person sends `   hi there   `
- **THEN** every client shows the message text as `hi there`

### Requirement: Server-assigned ordering and timestamps
The server SHALL assign each accepted message a unique, increasing identifier and a UTC timestamp at the moment it accepts the message. Clients MUST display messages ordered by that identifier, oldest first, regardless of the order in which they arrive, and MUST NOT show the same message twice. Client-supplied identifiers or timestamps MUST be ignored. Clients SHALL display each timestamp as local time in hours and minutes (`HH:MM`).

#### Scenario: Messages appear in server order on every client
- **WHEN** clients A and B each send a message in quick succession
- **THEN** both clients show the two messages in the same order, matching their server identifiers

#### Scenario: Client clock does not affect ordering
- **WHEN** a client whose system clock is wrong sends a message
- **THEN** the message's displayed timestamp is the server's acceptance time and its position follows its server identifier

#### Scenario: Timestamp is shown as local hours and minutes
- **WHEN** a message accepted at 2026-09-26T14:05:00Z is shown in a browser whose time zone is UTC
- **THEN** its displayed time is `14:05`

### Requirement: Recent history for a joining client
When a client connects to the room, the system SHALL send it the latest 100 accepted messages (or all messages if there are fewer), ordered oldest to newest, before or together with any new live messages. Older messages SHALL NOT be shown. The conversation SHALL be scrolled to the newest message after the history loads, and SHALL scroll to a newly arrived message when the person is already viewing the newest message.

#### Scenario: New client receives the latest 100 messages in order
- **WHEN** 105 messages numbered 1 to 105 have been accepted and a new client opens the room
- **THEN** the client shows exactly messages 6 to 105, with message 6 first and message 105 last
- **AND** message 105 is visible without scrolling

#### Scenario: New message scrolls into view at the bottom
- **WHEN** a person is viewing the newest message and another client sends a new message
- **THEN** the conversation scrolls so that the new message is visible

#### Scenario: Reading older messages is not interrupted
- **WHEN** a person has scrolled up to read older messages and another client sends a new message
- **THEN** the scroll position stays where the person left it

#### Scenario: New client receives fewer than 100 messages
- **WHEN** 3 messages have been accepted and a new client opens the room
- **THEN** the client shows exactly those 3 messages, oldest first

#### Scenario: Empty room
- **WHEN** no messages have ever been accepted and a client opens the room
- **THEN** the client shows an empty conversation with a hint that there are no messages yet

### Requirement: History survives a server restart
Accepted messages SHALL be stored durably before they are broadcast, so that stopping and starting the server does not lose them.

#### Scenario: History after restart
- **WHEN** messages have been accepted, the server process is stopped and started again, and a client opens the room
- **THEN** the client shows the same latest messages, in the same order, with the same nicknames, texts, and timestamps

### Requirement: Connection status and reconnection
The system SHALL show the person the current connection state as `Connected`, `Reconnecting`, or `Disconnected`. While not connected, sending MUST be disabled and the typed text MUST be kept; messages are not queued for later sending. The client SHALL try to reconnect automatically. After reconnecting, the client SHALL receive the messages accepted while it was disconnected, without duplicates, in order; if more than 100 messages were missed, the client SHALL show the latest 100 messages instead.

#### Scenario: Connection loss is visible
- **WHEN** a connected client loses its connection to the server
- **THEN** the client shows the `Reconnecting` or `Disconnected` status and the send action is disabled
- **AND** text already typed in the input is kept

#### Scenario: Automatic reconnection
- **WHEN** the server becomes reachable again after a connection loss
- **THEN** the client reconnects without a page reload, shows the `Connected` status, and enables sending

#### Scenario: Missed messages are caught up
- **WHEN** client B is disconnected, client A sends messages `m1` and `m2`, and client B then reconnects
- **THEN** client B shows `m1` and `m2` after the messages it already had, in order, and shows no message twice

#### Scenario: More than 100 missed messages
- **WHEN** client B last saw message 10, is disconnected while messages 11 to 150 are accepted, and then reconnects
- **THEN** client B shows exactly messages 51 to 150, oldest first, and no earlier message

#### Scenario: Reconnect after server restart
- **WHEN** the server restarts while clients are open
- **THEN** the clients reconnect automatically and still show the persisted history without duplicates

### Requirement: Local host and origin restriction
The application SHALL define its own hosts as `localhost`, `127.0.0.1`, and `[::1]` on the configured port, plus the configured host on the configured port unless the configured host is a wildcard address (`0.0.0.0` or `::`). Host names and ports SHALL be compared in normalized form (host lowercase, default port omitted). The server MUST refuse every HTTP request, including page requests and real-time connection requests on any transport, whose `Host` header is missing, cannot be parsed, or is not one of its own hosts. In addition, the real-time endpoint MUST refuse a connection request whose `Origin` header is present but is not one of the application's own origins (scheme `http` with one of its own hosts), including the value `null` and values that cannot be parsed; a request without an `Origin` header is accepted only when its `Host` is one of the application's own hosts. The purpose is that a foreign site open in the person's browser, including one that uses DNS rebinding, cannot read or write the chat.

#### Scenario: Foreign host without an origin is refused on every transport
- **WHEN** a real-time connection request without an `Origin` header carries `Host: evil.example:3000` while the application listens on port 3000 (what a DNS-rebinding page's same-origin request looks like), using either the long-polling or the WebSocket transport
- **THEN** the request is refused, no session is created, no history is returned, and no message can be sent through it

#### Scenario: Page request with a foreign host is refused
- **WHEN** an HTTP request for the chat page carries `Host: evil.example:3000`
- **THEN** the server refuses it without serving the page

#### Scenario: Foreign origin is refused
- **WHEN** a connection request with an allowed `Host` carries `Origin: http://evil.example`
- **THEN** the connection is refused, no history is sent to it, and it cannot send messages

#### Scenario: Null or malformed origin is refused
- **WHEN** a connection request with an allowed `Host` carries `Origin: null` or an `Origin` value that is not a valid URL
- **THEN** the connection is refused and the server keeps running

#### Scenario: Request without an origin on an own host is accepted
- **WHEN** a non-browser client connects to `127.0.0.1:<port>` without an `Origin` header
- **THEN** the connection is accepted and receives the history

#### Scenario: Own origin is accepted
- **WHEN** the chat page is opened at `http://localhost:<port>` or `http://127.0.0.1:<port>` and connects
- **THEN** the page is served, the connection is accepted, and it receives the history

#### Scenario: Wildcard listen address adds no foreign hosts
- **WHEN** the server is configured with host `0.0.0.0` and receives a request with `Host: 0.0.0.0:<port>` or with the machine's LAN address
- **THEN** the request is refused, while requests to `localhost`, `127.0.0.1`, and `[::1]` on the port are accepted

#### Scenario: Host comparison is normalized
- **WHEN** a request carries `Host: LOCALHOST:<port>`
- **THEN** it is treated as the own host `localhost:<port>` and accepted
