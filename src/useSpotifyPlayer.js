// ─── useSpotifyPlayer ────────────────────────────────────────────────────────
// Web Playback SDK hook — creates a browser-based Spotify device
// Requires Premium account and HTTPS

import { useState, useEffect, useRef, useCallback } from 'react'
import { getAccessToken } from './spotify.js'

export function useSpotifyPlayer() {
  const [ready, setReady] = useState(false)
  const [deviceId, setDeviceId] = useState(null)
  const [state, setState] = useState(null) // Spotify player state
  const playerRef = useRef(null)

  useEffect(() => {
    // Inject SDK script
    if (window.Spotify) {
      initPlayer()
      return
    }

    window.onSpotifyWebPlaybackSDKReady = initPlayer

    const script = document.createElement('script')
    script.src = 'https://sdk.scdn.co/spotify-player.js'
    script.async = true
    document.body.appendChild(script)

    return () => {
      if (playerRef.current) {
        playerRef.current.disconnect()
      }
    }
  }, [])

  async function initPlayer() {
    const token = await getAccessToken()
    if (!token) return

    const player = new window.Spotify.Player({
      name: 'Vinyl',
      getOAuthToken: async cb => {
        const t = await getAccessToken()
        cb(t)
      },
      volume: 0.8,
    })

    player.addListener('ready', ({ device_id }) => {
      setDeviceId(device_id)
      setReady(true)
      // Transfer playback to this device
      transferPlayback(device_id, token)
    })

    player.addListener('not_ready', () => {
      setReady(false)
    })

    player.addListener('player_state_changed', (s) => {
      setState(s)
    })

    player.addListener('initialization_error', ({ message }) => {
      console.error('Init error:', message)
    })

    player.addListener('authentication_error', ({ message }) => {
      console.error('Auth error:', message)
    })

    player.addListener('account_error', ({ message }) => {
      console.error('Account error (Premium required):', message)
    })

    await player.connect()
    playerRef.current = player
  }

  async function transferPlayback(device_id, token) {
    await fetch('https://api.spotify.com/v1/me/player', {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ device_ids: [device_id], play: false }),
    })
  }

  const play = useCallback(async (trackUri, contextUri) => {
    const token = await getAccessToken()
    if (!token || !deviceId) return

    const body = contextUri
      ? { context_uri: contextUri, offset: { uri: trackUri } }
      : { uris: [trackUri] }

    await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
  }, [deviceId])

  const pause = useCallback(async () => {
    if (playerRef.current) {
      await playerRef.current.pause()
    }
  }, [])

  const resume = useCallback(async () => {
    if (playerRef.current) {
      await playerRef.current.resume()
    }
  }, [])

  const seek = useCallback(async (ms) => {
    if (playerRef.current) {
      await playerRef.current.seek(ms)
    }
  }, [])

  // Derived state
  const currentTrackUri = state?.track_window?.current_track?.uri ?? null
  const isPlaying = state ? !state.paused : false
  const positionMs = state?.position ?? 0
  const durationMs = state?.track_window?.current_track?.duration_ms ?? 0

  return {
    ready,
    deviceId,
    isPlaying,
    currentTrackUri,
    positionMs,
    durationMs,
    play,
    pause,
    resume,
  }
}
