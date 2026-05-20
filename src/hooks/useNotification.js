import { useState, useEffect, useCallback } from 'react'
import { sendBrowserNotification, playAlert } from '../engine/notifier'

export function useNotification() {
  const [permission, setPermission] = useState('default')

  useEffect(() => {
    if ('Notification' in window) {
      setPermission(Notification.permission)
    }
  }, [])

  const requestPermission = useCallback(async () => {
    if (!('Notification' in window)) return 'denied'
    const result = await Notification.requestPermission()
    setPermission(result)
    return result
  }, [])

  const notify = useCallback((title, body) => {
    sendBrowserNotification(title, body)
  }, [])

  const alert = useCallback((type = 'success') => {
    playAlert(type)
  }, [])

  return { permission, requestPermission, notify, alert }
}
