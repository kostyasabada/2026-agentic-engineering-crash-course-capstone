import { ChatRoom } from './_chat/chat-room'

// Server Component (design D1); the interactive subtree starts at <ChatRoom />.
export default function Home() {
  return (
    <main>
      <h1>Chat room</h1>
      <ChatRoom />
    </main>
  )
}
