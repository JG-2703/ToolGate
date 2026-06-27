import { useEffect, useRef, useState, useCallback } from 'react'

export function useWebSocket(path) {
  const [status, setStatus] = useState('disconnected')
  const [lastMessage, setLastMessage] = useState(null)
  const ws = useRef(null)
  const reconnectTimer = useRef(null)
  const mountedRef = useRef(true)

  const connect = useCallback(() => {
    if (!mountedRef.current) return
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const url = `${proto}//${window.location.host}${path}`
    const sock = new WebSocket(url)
    ws.current = sock
    setStatus('connecting')

    sock.onopen = () => {
      if (!mountedRef.current) return
      setStatus('connected')
    }
    sock.onmessage = (evt) => {
      if (!mountedRef.current) return
      try {
        setLastMessage(JSON.parse(evt.data))
      } catch {}
    }
    sock.onclose = () => {
      if (!mountedRef.current) return
      setStatus('disconnected')
      reconnectTimer.current = setTimeout(connect, 3000)
    }
    sock.onerror = () => {
      sock.close()
    }
  }, [path])

  useEffect(() => {
    mountedRef.current = true
    connect()
    return () => {
      mountedRef.current = false
      clearTimeout(reconnectTimer.current)
      ws.current?.close()
    }
  }, [connect])

  const send = useCallback((data) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(typeof data === 'string' ? data : JSON.stringify(data))
    }
  }, [])

  return { status, lastMessage, send }
}
