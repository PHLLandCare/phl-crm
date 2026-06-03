import { useEffect, useRef, useState, useCallback } from 'react'
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

interface HuddleSignal {
  type: 'offer' | 'answer' | 'ice' | 'join' | 'leave'
  from: string
  from_name: string
  to?: string
  channel: string
  payload?: any
}

const CHANNELS = [
  { id: 'general',       label: 'general',       icon: '#' },
  { id: 'lawn-tree',     label: 'lawn-tree',      icon: '🌿' },
  { id: 'irrigation',    label: 'irrigation',     icon: '💧' },
  { id: 'extermination', label: 'extermination',  icon: '🐛' },
  { id: 'nursery',       label: 'nursery',        icon: '🌱' },
  { id: 'farm',          label: 'farm',           icon: '🚜' },
]

const EMOJIS = ['👍','❤️','😂','🔥','✅','💪','👏','🌿']
const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }]

export default function TeamChatPage() {
  const [channel, setChannel]           = useState('general')
  const [messages, setMessages]         = useState<Message[]>([])
  const [newMsg, setNewMsg]             = useState('')
  const [userId, setUserId]             = useState('')
  const [userName, setUserName]         = useState('')
  const [userInitials, setUserInitials] = useState('')
  const [dmTarget, setDmTarget]         = useState<{id:string;name:string}|null>(null)
  const [employees, setEmployees]       = useState<any[]>([])
  const [showEmoji, setShowEmoji]       = useState<string|null>(null)
  const [uploading, setUploading]       = useState(false)
  const [thread, setThread]             = useState<Message|null>(null)
  const [threadReplies, setThreadReplies] = useState<Message[]>([])
  const [threadMsg, setThreadMsg]       = useState('')
  const [onlineUsers, setOnlineUsers]   = useState<Set<string>>(new Set())

  // Huddle state
  const [huddle, setHuddle]             = useState<'idle'|'calling'|'in-call'|'incoming'>('idle')
  const [huddleChannel, setHuddleChannel] = useState('')
  const [huddleParticipants, setHuddleParticipants] = useState<{id:string;name:string}[]>([])
  const [incomingCaller, setIncomingCaller] = useState<{id:string;name:string}|null>(null)
  const [muted, setMuted]               = useState(false)

  const bottomRef     = useRef<HTMLDivElement>(null)
  const fileRef       = useRef<HTMLInputElement>(null)
  const localStream   = useRef<MediaStream|null>(null)
  const peers         = useRef<Record<string, RTCPeerConnection>>({})
  const audioRefs     = useRef<Record<string, HTMLAudioElement>>({})
  const huddleSignalRef = useRef<any>(null)

  const channelKey = dmTarget ? `dm_${[userId, dmTarget.id].sort().join('_')}` : channel

  // ── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setUserId(user.id)
        const { data: p } = await supabase.from('user_profiles').select('full_name').eq('id', user.id).single()
        if (p?.full_name) {
          setUserName(p.full_name)
          setUserInitials(p.full_name.split(' ').map((n:string)=>n[0]).slice(0,2).join('').toUpperCase())
        }
      }
      const { data: emps } = await supabase.from('user_profiles').select('id,full_name').order('full_name')
      setEmployees(emps ?? [])
    }
    init()
  }, [])

  // ── Presence ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!userId) return
    const presence = supabase.channel('online-users', { config: { presence: { key: userId } } })
    presence
      .on('presence', { event: 'sync' }, () => {
        const state = presence.presenceState()
        setOnlineUsers(new Set(Object.keys(state)))
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await presence.track({ user_id: userId, name: userName, online_at: new Date().toISOString() })
        }
      })
    return () => { supabase.removeChannel(presence) }
  }, [userId, userName])

  // ── Messages ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!channelKey) return
    loadMessages()
    const sub = supabase.channel(`chat_${channelKey}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_messages' }, () => loadMessages())
      .subscribe()
    return () => { supabase.removeChannel(sub) }
  }, [channelKey])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

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

  // ── Huddle WebRTC ─────────────────────────────────────────────────────────
  const getLocalStream = async () => {
    if (localStream.current) return localStream.current
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
    localStream.current = stream
    return stream
  }

  const createPeer = useCallback((peerId: string, initiator: boolean, hChannel: string) => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    peers.current[peerId] = pc

    localStream.current?.getTracks().forEach(t => pc.addTrack(t, localStream.current!))

    pc.ontrack = (e) => {
      if (!audioRefs.current[peerId]) {
        const audio = new Audio()
        audio.autoplay = true
        audioRefs.current[peerId] = audio
      }
      audioRefs.current[peerId].srcObject = e.streams[0]
    }

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        huddleSignalRef.current?.send({
          type: 'broadcast',
          event: 'huddle',
          payload: { type: 'ice', from: userId, from_name: userName, to: peerId, channel: hChannel, payload: e.candidate }
        })
      }
    }

    if (initiator) {
      pc.onnegotiationneeded = async () => {
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        huddleSignalRef.current?.send({
          type: 'broadcast',
          event: 'huddle',
          payload: { type: 'offer', from: userId, from_name: userName, to: peerId, channel: hChannel, payload: offer }
        })
      }
    }

    return pc
  }, [userId, userName])

  const startHuddle = async () => {
    try {
      const hChannel = `huddle_${channelKey}`
      await getLocalStream()
      setHuddleChannel(hChannel)
      setHuddle('in-call')
      setHuddleParticipants([{ id: userId, name: userName }])

      huddleSignalRef.current = supabase.channel(hChannel)
        .on('broadcast', { event: 'huddle' }, ({ payload }: { payload: HuddleSignal }) => {
          handleSignal(payload, hChannel)
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            await huddleSignalRef.current.send({
              type: 'broadcast', event: 'huddle',
              payload: { type: 'join', from: userId, from_name: userName, channel: hChannel }
            })
          }
        })
    } catch (err) {
      console.error('Huddle start failed:', err)
      alert('Could not access microphone. Please allow microphone access and try again.')
    }
  }

  const handleSignal = async (signal: HuddleSignal, hChannel: string) => {
    if (signal.from === userId) return

    if (signal.type === 'join') {
      setHuddleParticipants(prev => {
        if (prev.find(p => p.id === signal.from)) return prev
        return [...prev, { id: signal.from, name: signal.from_name }]
      })
      if (huddle === 'in-call') {
        // Create peer for new joiner
        await getLocalStream()
        createPeer(signal.from, true, hChannel)
      } else {
        // Incoming huddle notification
        setIncomingCaller({ id: signal.from, name: signal.from_name })
        setHuddle('incoming')
        setHuddleChannel(hChannel)
      }
    }

    if (signal.type === 'offer' && signal.to === userId) {
      await getLocalStream()
      const pc = createPeer(signal.from, false, hChannel)
      await pc.setRemoteDescription(new RTCSessionDescription(signal.payload))
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      huddleSignalRef.current?.send({
        type: 'broadcast', event: 'huddle',
        payload: { type: 'answer', from: userId, from_name: userName, to: signal.from, channel: hChannel, payload: answer }
      })
    }

    if (signal.type === 'answer' && signal.to === userId) {
      await peers.current[signal.from]?.setRemoteDescription(new RTCSessionDescription(signal.payload))
    }

    if (signal.type === 'ice' && signal.to === userId) {
      await peers.current[signal.from]?.addIceCandidate(new RTCIceCandidate(signal.payload))
    }

    if (signal.type === 'leave') {
      peers.current[signal.from]?.close()
      delete peers.current[signal.from]
      delete audioRefs.current[signal.from]
      setHuddleParticipants(prev => prev.filter(p => p.id !== signal.from))
    }
  }

  const joinHuddle = async () => {
    try {
      await getLocalStream()
      setHuddle('in-call')
      setHuddleParticipants(prev => {
        if (prev.find(p => p.id === userId)) return prev
        return [...prev, { id: userId, name: userName }]
      })
      huddleSignalRef.current = supabase.channel(huddleChannel)
        .on('broadcast', { event: 'huddle' }, ({ payload }: { payload: HuddleSignal }) => {
          handleSignal(payload, huddleChannel)
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            await huddleSignalRef.current.send({
              type: 'broadcast', event: 'huddle',
              payload: { type: 'join', from: userId, from_name: userName, channel: huddleChannel }
            })
          }
        })
    } catch (err) {
      alert('Could not access microphone.')
    }
  }

  const leaveHuddle = async () => {
    await huddleSignalRef.current?.send({
      type: 'broadcast', event: 'huddle',
      payload: { type: 'leave', from: userId, from_name: userName, channel: huddleChannel }
    })
    localStream.current?.getTracks().forEach(t => t.stop())
    localStream.current = null
    Object.values(peers.current).forEach(pc => pc.close())
    peers.current = {}
    audioRefs.current = {}
    if (huddleSignalRef.current) supabase.removeChannel(huddleSignalRef.current)
    setHuddle('idle')
    setHuddleParticipants([])
    setIncomingCaller(null)
  }

  const toggleMute = () => {
    localStream.current?.getAudioTracks().forEach(t => { t.enabled = muted })
    setMuted(!muted)
  }

  // ── Send ─────────────────────────────────────────────────────────────────
  const send = async () => {
    if (!newMsg.trim()) return
    await supabase.from('team_messages').insert({
      channel: channelKey, sender_id: userId, sender_name: userName,
      sender_initials: userInitials, body: newMsg.trim(),
    })
    setNewMsg('')
  }

  const sendThread = async () => {
    if (!threadMsg.trim() || !thread) return
    await supabase.from('team_messages').insert({
      channel: `thread_${thread.id}`, sender_id: userId,
      sender_name: userName, sender_initials: userInitials, body: threadMsg.trim(),
    })
    await supabase.from('team_messages').update({ thread_count: (thread.thread_count||0)+1 }).eq('id', thread.id)
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
      channel: channelKey, sender_id: userId, sender_name: userName,
      sender_initials: userInitials, body: '', attachment_url: publicUrl, attachment_name: file.name,
    })
    setUploading(false)
  }

  const toggleReaction = async (msgId: string, emoji: string, current: Record<string,string[]> = {}) => {
    const users = current[emoji] || []
    const updated = users.includes(userId)
      ? { ...current, [emoji]: users.filter(u => u !== userId) }
      : { ...current, [emoji]: [...users, userId] }
    await supabase.from('team_messages').update({ reactions: updated }).eq('id', msgId)
    setShowEmoji(null)
    loadMessages()
  }

  const deleteMsg = async (id: string) => {
    await supabase.from('team_messages').delete().eq('id', id)
    loadMessages()
  }

  const fmt = (ts: string) => new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  const fmtDate = (ts: string) => new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const avatarColors = ['#16a34a','#2563eb','#9333ea','#dc2626','#d97706','#0891b2']
  const getColor = (name: string) => avatarColors[name?.charCodeAt(0) % avatarColors.length] || '#475569'

  // ── Message list component ────────────────────────────────────────────────
  const MsgBubble = ({ msg, i, msgs, onThread }: { msg: Message; i: number; msgs: Message[]; onThread?: (m:Message)=>void }) => {
    const isMe = msg.sender_id === userId
    const showAvatar = i === 0 || msgs[i-1].sender_id !== msg.sender_id
    return (
      <div style={{ display:'flex', gap:10, padding:'3px 0', position:'relative' }}
        onMouseEnter={e => { const el = e.currentTarget.querySelector('.msg-actions') as HTMLElement; if(el) el.style.opacity='1' }}
        onMouseLeave={e => { const el = e.currentTarget.querySelector('.msg-actions') as HTMLElement; if(el) el.style.opacity='0'; setShowEmoji(null) }}>
        <div style={{ width:36, flexShrink:0, paddingTop: showAvatar?2:0 }}>
          {showAvatar && (
            <div style={{ width:36, height:36, borderRadius:'50%', background:getColor(msg.sender_name||''), display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:700, color:'#fff' }}>
              {msg.sender_initials||'?'}
            </div>
          )}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          {showAvatar && (
            <div style={{ display:'flex', alignItems:'baseline', gap:8, marginBottom:3 }}>
              <span style={{ fontSize:14, fontWeight:700, color: isMe?'#4ade80':'#f1f5f9' }}>{msg.sender_name||'Unknown'}</span>
              <span style={{ fontSize:11, color:'#475569' }}>{fmtDate(msg.created_at)} {fmt(msg.created_at)}</span>
            </div>
          )}
          {msg.body && <p style={{ margin:0, fontSize:14, color:'#cbd5e1', lineHeight:1.55, wordBreak:'break-word' }}>{msg.body}</p>}
          {msg.attachment_url && (
            <div style={{ marginTop:4 }}>
              {/\.(jpg|jpeg|png|gif|webp)/i.test(msg.attachment_name||'') ? (
                <img src={msg.attachment_url} alt={msg.attachment_name} style={{ maxWidth:320, maxHeight:220, borderRadius:8, cursor:'pointer' }} onClick={()=>window.open(msg.attachment_url)} />
              ) : (
                <a href={msg.attachment_url} target="_blank" rel="noreferrer" style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'6px 12px', background:'#1e293b', borderRadius:8, color:'#60a5fa', fontSize:13, textDecoration:'none' }}>
                  📎 {msg.attachment_name}
                </a>
              )}
            </div>
          )}
          {msg.reactions && Object.keys(msg.reactions).filter(e=>msg.reactions![e]?.length>0).length>0 && (
            <div style={{ display:'flex', gap:4, marginTop:5, flexWrap:'wrap' }}>
              {Object.entries(msg.reactions).filter(([,u])=>u.length>0).map(([emoji,users])=>(
                <button key={emoji} onClick={()=>toggleReaction(msg.id, emoji, msg.reactions)}
                  style={{ padding:'2px 8px', background:users.includes(userId)?'rgba(74,222,128,0.15)':'#1e293b', border:`1px solid ${users.includes(userId)?'#4ade80':'#334155'}`, borderRadius:20, cursor:'pointer', fontSize:12, color:'#cbd5e1', fontFamily:'inherit' }}>
                  {emoji} {users.length}
                </button>
              ))}
            </div>
          )}
          {onThread && (msg.thread_count||0)>0 && (
            <button onClick={()=>onThread(msg)} style={{ marginTop:4, background:'none', border:'none', color:'#60a5fa', fontSize:12, cursor:'pointer', padding:0, fontFamily:'inherit' }}>
              💬 {msg.thread_count} {msg.thread_count===1?'reply':'replies'}
            </button>
          )}
        </div>
        <div className="msg-actions" style={{ opacity:0, transition:'opacity .1s', display:'flex', gap:4, alignItems:'flex-start', paddingTop:4, flexShrink:0 }}>
          <div style={{ position:'relative' }}>
            <button onClick={()=>setShowEmoji(showEmoji===msg.id?null:msg.id)}
              style={{ padding:'4px 8px', background:'#1e293b', border:'1px solid #334155', borderRadius:6, cursor:'pointer', fontSize:14, color:'#94a3b8', fontFamily:'inherit' }}>😊</button>
            {showEmoji===msg.id && (
              <div style={{ position:'absolute', right:0, top:34, background:'#1e293b', border:'1px solid #334155', borderRadius:10, padding:8, display:'flex', gap:6, zIndex:100, flexWrap:'wrap', width:164 }}>
                {EMOJIS.map(e=>(
                  <button key={e} onClick={()=>toggleReaction(msg.id,e,msg.reactions)} style={{ background:'none', border:'none', fontSize:18, cursor:'pointer', padding:2, borderRadius:4 }}>{e}</button>
                ))}
              </div>
            )}
          </div>
          {onThread && (
            <button onClick={()=>onThread(msg)} style={{ padding:'4px 8px', background:'#1e293b', border:'1px solid #334155', borderRadius:6, cursor:'pointer', fontSize:14, color:'#94a3b8', fontFamily:'inherit' }}>💬</button>
          )}
          {isMe && (
            <button onClick={()=>deleteMsg(msg.id)} style={{ padding:'4px 8px', background:'#1e293b', border:'1px solid #334155', borderRadius:6, cursor:'pointer', fontSize:14, color:'#f87171', fontFamily:'inherit' }}>🗑</button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={{ display:'flex', height:'100vh', fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', background:'#0a0f1a', overflow:'hidden' }}>

      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <div style={{ width:220, background:'#0d1526', borderRight:'1px solid #1e293b', display:'flex', flexDirection:'column', flexShrink:0, overflowY:'auto' }}>
        <div style={{ padding:'1rem', borderBottom:'1px solid #1e293b' }}>
          <p style={{ margin:0, fontSize:15, fontWeight:700, color:'#f1f5f9' }}>Team Chat</p>
          <p style={{ margin:0, fontSize:12, color:'#475569' }}>PHL Land Care Inc.</p>
        </div>

        {/* Huddle button */}
        <div style={{ padding:'8px 10px', borderBottom:'1px solid #1e293b' }}>
          {huddle === 'idle' && (
            <button onClick={startHuddle}
              style={{ width:'100%', padding:'8px 10px', background:'#052e16', border:'1px solid #16a34a', borderRadius:8, color:'#4ade80', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', gap:6 }}>
              🎙️ Start Huddle
            </button>
          )}
          {huddle === 'in-call' && (
            <div style={{ background:'#052e16', border:'1px solid #16a34a', borderRadius:8, padding:'8px 10px' }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
                <span style={{ fontSize:12, fontWeight:700, color:'#4ade80', display:'flex', alignItems:'center', gap:5 }}>
                  <span style={{ width:8, height:8, borderRadius:'50%', background:'#4ade80', display:'inline-block', animation:'pulse 1.5s infinite' }} />
                  Huddle • Live
                </span>
                <button onClick={leaveHuddle} style={{ background:'#ef4444', border:'none', borderRadius:6, color:'#fff', fontSize:11, fontWeight:700, cursor:'pointer', padding:'2px 8px', fontFamily:'inherit' }}>Leave</button>
              </div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginBottom:6 }}>
                {huddleParticipants.map(p=>(
                  <div key={p.id} style={{ display:'flex', alignItems:'center', gap:4 }}>
                    <div style={{ width:22, height:22, borderRadius:'50%', background:getColor(p.name), display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, fontWeight:700, color:'#fff' }}>
                      {p.name.split(' ').map(n=>n[0]).join('').slice(0,2)}
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={toggleMute}
                style={{ width:'100%', padding:'5px 8px', background: muted?'#7f1d1d':'#1e293b', border:`1px solid ${muted?'#ef4444':'#334155'}`, borderRadius:6, color: muted?'#fca5a5':'#94a3b8', fontSize:12, cursor:'pointer', fontFamily:'inherit' }}>
                {muted ? '🔇 Unmute' : '🎙️ Mute'}
              </button>
            </div>
          )}
          {huddle === 'incoming' && incomingCaller && (
            <div style={{ background:'#1a0533', border:'1px solid #9333ea', borderRadius:8, padding:'8px 10px' }}>
              <p style={{ margin:'0 0 6px', fontSize:12, color:'#d8b4fe', fontWeight:600 }}>📞 {incomingCaller.name} started a huddle</p>
              <div style={{ display:'flex', gap:6 }}>
                <button onClick={joinHuddle} style={{ flex:1, padding:'5px 0', background:'#16a34a', border:'none', borderRadius:6, color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>Join</button>
                <button onClick={()=>setHuddle('idle')} style={{ flex:1, padding:'5px 0', background:'#1e293b', border:'1px solid #334155', borderRadius:6, color:'#94a3b8', fontSize:12, cursor:'pointer', fontFamily:'inherit' }}>Dismiss</button>
              </div>
            </div>
          )}
        </div>

        <div style={{ padding:'8px 0', flex:1 }}>
          <p style={{ margin:'8px 12px 4px', fontSize:11, fontWeight:600, color:'#475569', textTransform:'uppercase', letterSpacing:'0.05em' }}>Channels</p>
          {CHANNELS.map(ch => (
            <button key={ch.id} onClick={()=>{ setChannel(ch.id); setDmTarget(null) }}
              style={{ display:'flex', alignItems:'center', justifyContent:'space-between', width:'100%', padding:'7px 12px', border:'none', background:!dmTarget&&channel===ch.id?'rgba(74,222,128,0.1)':'transparent', color:!dmTarget&&channel===ch.id?'#4ade80':'#64748b', cursor:'pointer', fontSize:14, textAlign:'left', fontFamily:'inherit', borderLeft:!dmTarget&&channel===ch.id?'2px solid #4ade80':'2px solid transparent' }}>
              <span><span style={{ fontSize:12, marginRight:6 }}>{ch.icon}</span>{ch.label}</span>
            </button>
          ))}

          <p style={{ margin:'12px 12px 4px', fontSize:11, fontWeight:600, color:'#475569', textTransform:'uppercase', letterSpacing:'0.05em' }}>Direct Messages</p>
          {employees.filter(e=>e.id!==userId).map(emp => {
            const initials = emp.full_name?.split(' ').map((n:string)=>n[0]).slice(0,2).join('').toUpperCase()||'?'
            const isActive = dmTarget?.id===emp.id
            const isOnline = onlineUsers.has(emp.id)
            return (
              <button key={emp.id} onClick={()=>setDmTarget({id:emp.id, name:emp.full_name})}
                style={{ display:'flex', alignItems:'center', gap:8, width:'100%', padding:'7px 12px', border:'none', background:isActive?'rgba(74,222,128,0.1)':'transparent', color:isActive?'#4ade80':'#64748b', cursor:'pointer', fontSize:13, textAlign:'left', fontFamily:'inherit', borderLeft:isActive?'2px solid #4ade80':'2px solid transparent' }}>
                <div style={{ position:'relative', flexShrink:0 }}>
                  <div style={{ width:24, height:24, borderRadius:'50%', background:getColor(emp.full_name||''), display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:700, color:'#fff' }}>{initials}</div>
                  <div style={{ position:'absolute', bottom:-1, right:-1, width:8, height:8, borderRadius:'50%', background:isOnline?'#4ade80':'#475569', border:'1.5px solid #0d1526' }} />
                </div>
                <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{emp.full_name}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Main chat ────────────────────────────────────────────────────── */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
        <div style={{ padding:'12px 1.25rem', borderBottom:'1px solid #1e293b', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <span style={{ fontSize:16, fontWeight:700, color:'#f1f5f9' }}>
            {dmTarget ? `💬 ${dmTarget.name}` : `# ${channel}`}
          </span>
          {dmTarget && (
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <div style={{ width:8, height:8, borderRadius:'50%', background:onlineUsers.has(dmTarget.id)?'#4ade80':'#475569' }} />
              <span style={{ fontSize:12, color:onlineUsers.has(dmTarget.id)?'#4ade80':'#64748b' }}>
                {onlineUsers.has(dmTarget.id)?'Online':'Offline'}
              </span>
            </div>
          )}
        </div>

        {/* Messages */}
        <div style={{ flex:1, overflowY:'auto', padding:'1rem 1.25rem', display:'flex', flexDirection:'column', gap:2 }}>
          {messages.length===0 && (
            <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'#475569', fontSize:14 }}>
              No messages yet — say hello! 👋
            </div>
          )}
          {messages.map((msg,i)=>(
            <MsgBubble key={msg.id} msg={msg} i={i} msgs={messages} onThread={loadThread} />
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div style={{ padding:'12px 1.25rem', borderTop:'1px solid #1e293b' }}>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <input ref={fileRef} type="file" style={{ display:'none' }} onChange={e=>{ if(e.target.files?.[0]) handleFile(e.target.files[0]) }} />
            <button onClick={()=>fileRef.current?.click()}
              style={{ padding:'9px 12px', background:'#1e293b', border:'1px solid #334155', borderRadius:10, cursor:'pointer', color:'#64748b', fontSize:16, flexShrink:0 }}>📎</button>
            <input value={newMsg} onChange={e=>setNewMsg(e.target.value)}
              onKeyDown={e=>{ if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); send() } }}
              placeholder={`Message ${dmTarget?dmTarget.name:'#'+channel}...`}
              style={{ flex:1, padding:'10px 14px', background:'#1e293b', border:'1px solid #334155', borderRadius:10, color:'#f1f5f9', fontSize:14, outline:'none', fontFamily:'inherit' }} />
            <button onClick={send} disabled={!newMsg.trim()}
              style={{ padding:'10px 18px', background:newMsg.trim()?'#16a34a':'#1e293b', border:'none', borderRadius:10, color:newMsg.trim()?'#fff':'#475569', cursor:newMsg.trim()?'pointer':'default', fontWeight:700, fontSize:14, fontFamily:'inherit' }}>
              Send
            </button>
          </div>
          {uploading && <p style={{ margin:'6px 0 0', fontSize:12, color:'#64748b' }}>Uploading...</p>}
        </div>
      </div>

      {/* ── Thread panel ─────────────────────────────────────────────────── */}
      {thread && (
        <div style={{ width:340, borderLeft:'1px solid #1e293b', display:'flex', flexDirection:'column', background:'#0d1526' }}>
          <div style={{ padding:'12px 1rem', borderBottom:'1px solid #1e293b', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ fontSize:14, fontWeight:700, color:'#f1f5f9' }}>Thread</span>
            <button onClick={()=>setThread(null)} style={{ background:'none', border:'none', color:'#64748b', cursor:'pointer', fontSize:20, fontFamily:'inherit', lineHeight:1 }}>×</button>
          </div>
          <div style={{ padding:'1rem', borderBottom:'1px solid #1e293b' }}>
            <p style={{ margin:'0 0 4px', fontSize:12, color:'#94a3b8' }}>{thread.sender_name}</p>
            <p style={{ margin:0, fontSize:14, color:'#cbd5e1', lineHeight:1.5 }}>{thread.body}</p>
          </div>
          <div style={{ flex:1, overflowY:'auto', padding:'12px 1rem', display:'flex', flexDirection:'column', gap:8 }}>
            {threadReplies.length===0 && <p style={{ fontSize:13, color:'#475569', textAlign:'center', marginTop:'1rem' }}>No replies yet</p>}
            {threadReplies.map(r=>(
              <div key={r.id} style={{ display:'flex', gap:8 }}>
                <div style={{ width:28, height:28, borderRadius:'50%', background:getColor(r.sender_name||''), display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, color:'#fff', flexShrink:0 }}>{r.sender_initials||'?'}</div>
                <div>
                  <div style={{ display:'flex', gap:6, alignItems:'baseline', marginBottom:2 }}>
                    <span style={{ fontSize:13, fontWeight:700, color:'#f1f5f9' }}>{r.sender_name}</span>
                    <span style={{ fontSize:11, color:'#475569' }}>{fmt(r.created_at)}</span>
                  </div>
                  <p style={{ margin:0, fontSize:13, color:'#cbd5e1', lineHeight:1.5 }}>{r.body}</p>
                </div>
              </div>
            ))}
          </div>
          <div style={{ padding:'12px 1rem', borderTop:'1px solid #1e293b' }}>
            <input value={threadMsg} onChange={e=>setThreadMsg(e.target.value)}
              onKeyDown={e=>{ if(e.key==='Enter') sendThread() }}
              placeholder="Reply in thread..."
              style={{ width:'100%', padding:'9px 12px', background:'#1e293b', border:'1px solid #334155', borderRadius:10, color:'#f1f5f9', fontSize:13, outline:'none', fontFamily:'inherit', boxSizing:'border-box' }} />
          </div>
        </div>
      )}

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }`}</style>
    </div>
  )
}
