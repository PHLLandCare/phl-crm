import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

interface Message {
  id: string
  channel: string
  sender_id: string
  sender_name: string
  sender_initials: string
  body: string
  attachment_url?: string
  attachment_name?: string
  created_at: string
  reactions?: Record<string, string[]>
  thread_count?: number
}

const CHANNELS = [
  { id: 'general', label: '# general', icon: '#' },
  { id: 'lawn-tree', label: '# lawn-tree', icon: '🌿' },
  { id: 'irrigation', label: '# irrigation', icon: '💧' },
  { id: 'extermination', label: '# extermination', icon: '🐛' },
  { id: 'nursery', label: '# nursery', icon: '🌱' },
  { id: 'farm', label: '# farm', icon: '🚜' },
]

const EMOJIS = ['👍', '❤️', '😂', '🔥', '✅', '💪', '👏', '🌿']

export default function TeamChatPage() {
  const [channel, setChannel] = useState('general')
  const [messages, setMessages] = useState<Message[]>([])
  const [newMsg, setNewMsg] = useState('')
  const [userId, setUserId] = useState('')
  const [userName, setUserName] = useState('')
  const [userInitials, setUserInitials] = useState('')
  const [dmTarget, setDmTarget] = useState<{ id: string; name: string } | null>(null)
  const [employees, setEmployees] = useState<any[]>([])
  const [showEmoji, setShowEmoji] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [thread, setThread] = useState<Message | null>(null)
  const [threadReplies, setThreadReplies] = useState<Message[]>([])
  const [threadMsg, setThreadMsg] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const channelKey = dmTarget ? `dm_${[userId, dmTarget.id].sort().join('_')}` : channel

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setUserId(user.id)
        const { data: p } = await supabase.from('user_profiles').select('full_name').eq('id', user.id).single()
        if (p?.full_name) {
          setUserName(p.full_name)
          setUserInitials(p.full_name.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase())
        }
      }
      const { data: emps } = await supabase.from('user_profiles').select('id,full_name').order('full_name')
      setEmployees(emps ?? [])
    }
    init()
  }, [])

  useEffect(() => {
    if (!channelKey) return
    loadMessages()
    const sub = supabase.channel(`chat_${channelKey}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_messages' }, () => loadMessages())
      .subscribe()
    return () => { supabase.removeChannel(sub) }
  }, [channelKey])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const loadMessages = async () => {
    const { data } = await supabase.from('team_messages').select('*')
      .eq('channel', channelKey).order('created_at').limit(200)
    setMessages(data ?? [])
  }

  const loadThread = async (msg: Message) => {
    setThread(msg)
    const { data } = await supabase.from('team_messages').select('*')
      .eq('channel', `thread_${msg.id}`).order('created_at')
    setThreadReplies(data ?? [])
  }

  const send = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!newMsg.trim() && !uploading) return
    await supabase.from('team_messages').insert({
      channel: channelKey,
      sender_id: userId,
      sender_name: userName,
      sender_initials: userInitials,
      body: newMsg.trim(),
    })
    setNewMsg('')
  }

  const sendThread = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!threadMsg.trim() || !thread) return
    await supabase.from('team_messages').insert({
      channel: `thread_${thread.id}`,
      sender_id: userId,
      sender_name: userName,
      sender_initials: userInitials,
      body: threadMsg.trim(),
    })
    // Increment thread count
    const current = thread.thread_count || 0
    await supabase.from('team_messages').update({ thread_count: current + 1 }).eq('id', thread.id)
    setThreadMsg('')
    loadThread(thread)
    loadMessages()
  }

  const handleFile = async (file: File) => {
    setUploading(true)
    const path = `chat/${Date.now()}_${file.name}`
    await supabase.storage.from('chat-attachments').upload(path, file, { upsert: true })
    const { data: { publicUrl } } = supabase.storage.from('chat-attachments').getPublicUrl(path)
    await supabase.from('team_messages').insert({
      channel: channelKey,
      sender_id: userId,
      sender_name: userName,
      sender_initials: userInitials,
      body: '',
      attachment_url: publicUrl,
      attachment_name: file.name,
    })
    setUploading(false)
  }

  const toggleReaction = async (msgId: string, emoji: string, currentReactions: Record<string, string[]> = {}) => {
    const users = currentReactions[emoji] || []
    const updated = users.includes(userId)
      ? { ...currentReactions, [emoji]: users.filter(u => u !== userId) }
      : { ...currentReactions, [emoji]: [...users, userId] }
    await supabase.from('team_messages').update({ reactions: updated }).eq('id', msgId)
    setShowEmoji(null)
    loadMessages()
  }

  const deleteMsg = async (id: string) => {
    await supabase.from('team_messages').delete().eq('id', id)
    loadMessages()
  }

  const formatTime = (ts: string) => new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  const formatDate = (ts: string) => new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  const avatarColors = ['#16a34a','#2563eb','#9333ea','#dc2626','#d97706','#0891b2']
  const getColor = (name: string) => avatarColors[name.charCodeAt(0) % avatarColors.length]

  const MsgList = ({ msgs, onThread }: { msgs: Message[], onThread?: (m: Message) => void }) => (
    <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: 2 }}>
      {msgs.length === 0 && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569', fontSize: 14 }}>
          No messages yet — say hello! 👋
        </div>
      )}
      {msgs.map((msg, i) => {
        const isMe = msg.sender_id === userId
        const showAvatar = i === 0 || msgs[i - 1].sender_id !== msg.sender_id
        return (
          <div key={msg.id} style={{ display: 'flex', gap: 10, padding: '4px 0', position: 'relative' }}
            onMouseEnter={e => { const el = e.currentTarget.querySelector('.msg-actions') as HTMLElement; if (el) el.style.opacity = '1' }}
            onMouseLeave={e => { const el = e.currentTarget.querySelector('.msg-actions') as HTMLElement; if (el) el.style.opacity = '0'; setShowEmoji(null) }}>
            <div style={{ width: 34, flexShrink: 0, display: 'flex', alignItems: 'flex-start', paddingTop: showAvatar ? 2 : 0 }}>
              {showAvatar && (
                <div style={{ width: 34, height: 34, borderRadius: '50%', background: getColor(msg.sender_name || ''), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#fff' }}>
                  {msg.sender_initials || '?'}
                </div>
              )}
            </div>
            <div style={{ flex: 1 }}>
              {showAvatar && (
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 2 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: isMe ? '#4ade80' : '#f1f5f9' }}>{msg.sender_name || 'Unknown'}</span>
                  <span style={{ fontSize: 11, color: '#475569' }}>{formatDate(msg.created_at)} {formatTime(msg.created_at)}</span>
                </div>
              )}
              {msg.body && <p style={{ margin: 0, fontSize: 14, color: '#cbd5e1', lineHeight: 1.5, wordBreak: 'break-word' }}>{msg.body}</p>}
              {msg.attachment_url && (
                <div style={{ marginTop: 4 }}>
                  {/\.(jpg|jpeg|png|gif|webp)/i.test(msg.attachment_name || '') ? (
                    <img src={msg.attachment_url} alt={msg.attachment_name} style={{ maxWidth: 320, maxHeight: 220, borderRadius: 8, cursor: 'pointer' }} onClick={() => window.open(msg.attachment_url)} />
                  ) : (
                    <a href={msg.attachment_url} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: '#1e293b', borderRadius: 8, color: '#60a5fa', fontSize: 13, textDecoration: 'none' }}>
                      📎 {msg.attachment_name}
                    </a>
                  )}
                </div>
              )}
              {/* Reactions */}
              {msg.reactions && Object.keys(msg.reactions).filter(e => msg.reactions![e]?.length > 0).length > 0 && (
                <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                  {Object.entries(msg.reactions).filter(([, users]) => users.length > 0).map(([emoji, users]) => (
                    <button key={emoji} onClick={() => toggleReaction(msg.id, emoji, msg.reactions)} style={{ padding: '2px 8px', background: users.includes(userId) ? 'rgba(74,222,128,0.15)' : '#1e293b', border: `1px solid ${users.includes(userId) ? '#4ade80' : '#334155'}`, borderRadius: 20, cursor: 'pointer', fontSize: 12, color: '#cbd5e1', fontFamily: 'inherit' }}>
                      {emoji} {users.length}
                    </button>
                  ))}
                </div>
              )}
              {/* Thread count */}
              {onThread && (msg.thread_count || 0) > 0 && (
                <button onClick={() => onThread(msg)} style={{ marginTop: 4, background: 'none', border: 'none', color: '#60a5fa', fontSize: 12, cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
                  💬 {msg.thread_count} {msg.thread_count === 1 ? 'reply' : 'replies'}
                </button>
              )}
            </div>
            {/* Hover actions */}
            <div className="msg-actions" style={{ opacity: 0, transition: 'opacity .1s', display: 'flex', gap: 4, alignItems: 'flex-start', paddingTop: 4, flexShrink: 0 }}>
              <div style={{ position: 'relative' }}>
                <button onClick={() => setShowEmoji(showEmoji === msg.id ? null : msg.id)} style={{ padding: '4px 8px', background: '#1e293b', border: '1px solid #334155', borderRadius: 6, cursor: 'pointer', fontSize: 14, color: '#94a3b8', fontFamily: 'inherit' }}>😊</button>
                {showEmoji === msg.id && (
                  <div style={{ position: 'absolute', right: 0, top: 32, background: '#1e293b', border: '1px solid #334155', borderRadius: 10, padding: 8, display: 'flex', gap: 6, zIndex: 100, flexWrap: 'wrap', width: 160 }}>
                    {EMOJIS.map(e => (
                      <button key={e} onClick={() => toggleReaction(msg.id, e, msg.reactions)} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', padding: 2, borderRadius: 4 }}>{e}</button>
                    ))}
                  </div>
                )}
              </div>
              {onThread && (
                <button onClick={() => onThread(msg)} style={{ padding: '4px 8px', background: '#1e293b', border: '1px solid #334155', borderRadius: 6, cursor: 'pointer', fontSize: 14, color: '#94a3b8', fontFamily: 'inherit' }}>💬</button>
              )}
              {isMe && (
                <button onClick={() => deleteMsg(msg.id)} style={{ padding: '4px 8px', background: '#1e293b', border: '1px solid #334155', borderRadius: 6, cursor: 'pointer', fontSize: 14, color: '#f87171', fontFamily: 'inherit' }}>🗑</button>
              )}
            </div>
          </div>
        )
      })}
      <div ref={bottomRef} />
    </div>
  )

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', background: '#0a0f1a', overflow: 'hidden' }}>
      {/* Sidebar */}
      <div style={{ width: 220, background: '#0d1526', borderRight: '1px solid #1e293b', display: 'flex', flexDirection: 'column', flexShrink: 0, overflowY: 'auto' }}>
        <div style={{ padding: '1rem', borderBottom: '1px solid #1e293b' }}>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#f1f5f9' }}>Team Chat</p>
          <p style={{ margin: 0, fontSize: 12, color: '#475569' }}>PHL Land Care Inc.</p>
        </div>
        <div style={{ padding: '8px 0', flex: 1 }}>
          <p style={{ margin: '8px 12px 4px', fontSize: 11, fontWeight: 600, color: '#475569', textTransform: 'uppercase' }}>Channels</p>
          {CHANNELS.map(ch => (
            <button key={ch.id} onClick={() => { setChannel(ch.id); setDmTarget(null) }} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 12px', border: 'none', background: !dmTarget && channel === ch.id ? 'rgba(74,222,128,0.1)' : 'transparent', color: !dmTarget && channel === ch.id ? '#4ade80' : '#64748b', cursor: 'pointer', fontSize: 14, textAlign: 'left', fontFamily: 'inherit', borderLeft: !dmTarget && channel === ch.id ? '2px solid #4ade80' : '2px solid transparent' }}>
              <span style={{ fontSize: 12 }}>{ch.icon}</span> {ch.label.replace('# ', '')}
            </button>
          ))}
          <p style={{ margin: '12px 12px 4px', fontSize: 11, fontWeight: 600, color: '#475569', textTransform: 'uppercase' }}>Direct Messages</p>
          {employees.filter(e => e.id !== userId).map(emp => {
            const initials = emp.full_name?.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase() || '?'
            const isActive = dmTarget?.id === emp.id
            return (
              <button key={emp.id} onClick={() => setDmTarget({ id: emp.id, name: emp.full_name })} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 12px', border: 'none', background: isActive ? 'rgba(74,222,128,0.1)' : 'transparent', color: isActive ? '#4ade80' : '#64748b', cursor: 'pointer', fontSize: 13, textAlign: 'left', fontFamily: 'inherit', borderLeft: isActive ? '2px solid #4ade80' : '2px solid transparent' }}>
                <div style={{ width: 22, height: 22, borderRadius: '50%', background: getColor(emp.full_name || ''), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff', flexShrink: 0 }}>{initials}</div>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{emp.full_name}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Main chat */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ padding: '12px 1.25rem', borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9' }}>
            {dmTarget ? `DM: ${dmTarget.name}` : `# ${channel}`}
          </span>
        </div>
        <MsgList msgs={messages} onThread={loadThread} />
        {/* Input */}
        <div style={{ padding: '12px 1.25rem', borderTop: '1px solid #1e293b' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]) }} />
            <button onClick={() => fileRef.current?.click()} style={{ padding: '10px 12px', background: '#1e293b', border: '1px solid #334155', borderRadius: 10, cursor: 'pointer', color: '#64748b', fontSize: 16, flexShrink: 0 }}>📎</button>
            <input value={newMsg} onChange={e => setNewMsg(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              placeholder={`Message ${dmTarget ? dmTarget.name : '#' + channel}...`}
              style={{ flex: 1, padding: '10px 14px', background: '#1e293b', border: '1px solid #334155', borderRadius: 10, color: '#f1f5f9', fontSize: 14, outline: 'none', fontFamily: 'inherit' }} />
            <button onClick={() => send()} disabled={!newMsg.trim()} style={{ padding: '10px 18px', background: newMsg.trim() ? '#16a34a' : '#1e293b', border: 'none', borderRadius: 10, color: newMsg.trim() ? '#fff' : '#475569', cursor: newMsg.trim() ? 'pointer' : 'default', fontWeight: 700, fontSize: 14, fontFamily: 'inherit' }}>Send</button>
          </div>
        </div>
      </div>

      {/* Thread panel */}
      {thread && (
        <div style={{ width: 340, borderLeft: '1px solid #1e293b', display: 'flex', flexDirection: 'column', background: '#0d1526' }}>
          <div style={{ padding: '12px 1rem', borderBottom: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>Thread</span>
            <button onClick={() => setThread(null)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 18, fontFamily: 'inherit' }}>×</button>
          </div>
          <div style={{ padding: '1rem', borderBottom: '1px solid #1e293b' }}>
            <p style={{ margin: '0 0 4px', fontSize: 13, color: '#94a3b8' }}>{thread.sender_name}</p>
            <p style={{ margin: 0, fontSize: 14, color: '#cbd5e1' }}>{thread.body}</p>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 1rem', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {threadReplies.map(r => (
              <div key={r.id} style={{ display: 'flex', gap: 8 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: getColor(r.sender_name || ''), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0 }}>{r.sender_initials || '?'}</div>
                <div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#f1f5f9' }}>{r.sender_name}</span>
                  <p style={{ margin: 0, fontSize: 13, color: '#cbd5e1' }}>{r.body}</p>
                </div>
              </div>
            ))}
          </div>
          <div style={{ padding: '12px 1rem', borderTop: '1px solid #1e293b' }}>
            <input value={threadMsg} onChange={e => setThreadMsg(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') sendThread() }}
              placeholder="Reply in thread..." style={{ width: '100%', padding: '9px 12px', background: '#1e293b', border: '1px solid #334155', borderRadius: 10, color: '#f1f5f9', fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
          </div>
        </div>
      )}
    </div>
  )
}

// end TeamChatPage
