// ─── Spotify API helper ────────────────────────────────────────────────────
// PKCE OAuth 2.0 — no backend required

export const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID || ''
export const REDIRECT_URI = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? `${window.location.origin}/`
  : 'https://spotifydesignerver.vercel.app/'

const SCOPES = [
  'user-library-read',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'streaming',
  'user-read-email',
  'user-read-private',
].join(' ')

// ── PKCE helpers ──────────────────────────────────────────────────────────

function generateRandomString(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  const values = crypto.getRandomValues(new Uint8Array(length))
  return Array.from(values).map(v => chars[v % chars.length]).join('')
}

async function sha256(plain) {
  const encoder = new TextEncoder()
  const data = encoder.encode(plain)
  return crypto.subtle.digest('SHA-256', data)
}

function base64urlEncode(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

// ── Auth ──────────────────────────────────────────────────────────────────

export async function redirectToSpotifyLogin() {
  const verifier = generateRandomString(64)
  const hashed = await sha256(verifier)
  const challenge = base64urlEncode(hashed)

  sessionStorage.setItem('pkce_verifier', verifier)

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    code_challenge_method: 'S256',
    code_challenge: challenge,
  })

  window.location.href = `https://accounts.spotify.com/authorize?${params}`
}

export async function exchangeCodeForToken(code) {
  const verifier = sessionStorage.getItem('pkce_verifier')
  if (!verifier) throw new Error('No code verifier found')

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
    }),
  })

  if (!res.ok) throw new Error('Token exchange failed')
  const data = await res.json()

  // Save tokens
  const expiresAt = Date.now() + data.expires_in * 1000
  sessionStorage.setItem('access_token', data.access_token)
  sessionStorage.setItem('refresh_token', data.refresh_token)
  sessionStorage.setItem('expires_at', expiresAt)
  sessionStorage.removeItem('pkce_verifier')

  // Clean URL
  window.history.replaceState({}, '', window.location.pathname)

  return data.access_token
}

export async function getAccessToken() {
  const token = sessionStorage.getItem('access_token')
  const expiresAt = Number(sessionStorage.getItem('expires_at'))
  const refreshToken = sessionStorage.getItem('refresh_token')

  if (!token) return null

  // Refresh if expiring within 5 minutes
  if (Date.now() > expiresAt - 5 * 60 * 1000 && refreshToken) {
    return await refreshAccessToken(refreshToken)
  }

  return token
}

async function refreshAccessToken(refreshToken) {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  })

  if (!res.ok) {
    sessionStorage.clear()
    return null
  }

  const data = await res.json()
  const expiresAt = Date.now() + data.expires_in * 1000
  sessionStorage.setItem('access_token', data.access_token)
  sessionStorage.setItem('expires_at', expiresAt)
  if (data.refresh_token) {
    sessionStorage.setItem('refresh_token', data.refresh_token)
  }

  return data.access_token
}

export function logout() {
  sessionStorage.clear()
  window.location.reload()
}

// ── API calls ─────────────────────────────────────────────────────────────

async function apiFetch(path, token) {
  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Spotify API error: ${res.status}`)
  return res.json()
}

export async function fetchMe(token) {
  return apiFetch('/me', token)
}

// Fetch saved albums (paginated, up to 50)
export async function fetchSavedAlbums(token, limit = 50, offset = 0) {
  return apiFetch(`/me/albums?limit=${limit}&offset=${offset}&market=JP`, token)
}

// Fetch artist's albums
export async function fetchArtistAlbums(token, artistId, limit = 50) {
  return apiFetch(
    `/artists/${artistId}/albums?include_groups=album,single&limit=${limit}&market=JP`,
    token
  )
}

// Fetch single album with tracks
export async function fetchAlbum(token, albumId) {
  return apiFetch(`/albums/${albumId}?market=JP`, token)
}

// Start playback on active device (Premium)
export async function playTrack(token, uri, contextUri = null) {
  const token_ = await getAccessToken()
  const body = contextUri
    ? { context_uri: contextUri, offset: { uri } }
    : { uris: [uri] }

  await fetch('https://api.spotify.com/v1/me/player/play', {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token_}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

export async function pausePlayback(token) {
  await fetch('https://api.spotify.com/v1/me/player/pause', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
  })
}

export async function getCurrentPlayback(token) {
  const res = await fetch('https://api.spotify.com/v1/me/player', {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (res.status === 204) return null
  return res.json()
}

// Normalize Spotify album object → our internal shape
export function normalizeAlbum(item) {
  const album = item.album || item
  return {
    id: album.id,
    title: album.name,
    year: album.release_date?.slice(0, 4) || '—',
    artist: album.artists?.map(a => a.name).join(', ') || '',
    artistId: album.artists?.[0]?.id,
    uri: album.uri,
    image: album.images?.[0]?.url || null,
    imageMd: album.images?.[1]?.url || null,
    tracks: (album.tracks?.items || []).map((t, i) => ({
      n: i + 1,
      title: t.name,
      uri: t.uri,
      dur: msToTime(t.duration_ms),
      durMs: t.duration_ms,
      bpm: null,
      energy: null,
      pop: null,
    })),
  }
}

function msToTime(ms) {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
