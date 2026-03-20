import { useState, useEffect } from 'react'
import {
  CLIENT_ID,
  exchangeCodeForToken,
  getAccessToken,
  fetchMe,
  redirectToSpotifyLogin,
} from './spotify.js'
import Vinyl from './Vinyl.jsx'

// ─── CSS ──────────────────────────────────────────────────────────────────

const css = `
  *, *::before, *::after { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #060606; color: #ede8de;
    font-family: 'DM Sans', sans-serif; -webkit-tap-highlight-color: transparent;
    overscroll-behavior: none; }
  ::-webkit-scrollbar { display: none; }
  button { cursor: pointer; -webkit-tap-highlight-color: transparent; border: none; }
`

// ─── Login screen ────────────────────────────────────────────────────────

function LoginScreen({ onLogin, noClientId }) {
  return (
    <div style={{
      minHeight: '100dvh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: 'radial-gradient(ellipse at 50% 30%, #1a0a2e 0%, #060606 70%)',
      padding: '0 32px',
    }}>
      {/* Logo mark */}
      <div style={{ marginBottom: 40, position: 'relative' }}>
        <div style={{
          width: 80, height: 80, borderRadius: '50%',
          background: 'linear-gradient(145deg, #2a0a4e, #6a0a9e)',
          boxShadow: '0 0 60px rgba(140,40,255,0.35)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%',
            background: '#060606',
          }} />
        </div>
        {[52, 68, 84].map((s, i) => (
          <div key={i} style={{
            position: 'absolute', top: '50%', left: '50%',
            width: s, height: s, borderRadius: '50%',
            border: '1px solid rgba(180,80,255,0.18)',
            transform: 'translate(-50%,-50%)',
            pointerEvents: 'none',
          }} />
        ))}
      </div>

      <div style={{
        fontFamily: "'Syne', sans-serif",
        fontSize: 38, fontWeight: 700, letterSpacing: 10,
        textTransform: 'uppercase', marginBottom: 10,
      }}>
        Vinyl
      </div>

      <div style={{ fontSize: 11, opacity: 0.35, letterSpacing: 2, marginBottom: 56, textAlign: 'center' }}>
        a better way to browse your music
      </div>

      {noClientId ? (
        <div style={{
          background: 'rgba(255,80,80,0.08)', border: '1px solid rgba(255,80,80,0.25)',
          borderRadius: 12, padding: '18px 24px', fontSize: 12,
          color: 'rgba(255,150,150,0.9)', lineHeight: 1.7, maxWidth: 320,
          textAlign: 'center',
        }}>
          <div style={{ marginBottom: 8, opacity: 0.6 }}>SETUP REQUIRED</div>
          .env ファイルに<br />
          <code style={{ color: '#e040fb' }}>VITE_SPOTIFY_CLIENT_ID</code><br />
          を設定してください。<br />
          <div style={{ marginTop: 10, opacity: 0.55, fontSize: 11 }}>
            → README.md を確認
          </div>
        </div>
      ) : (
        <button
          onClick={onLogin}
          style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '16px 36px', borderRadius: 100,
            background: '#1DB954', color: '#000',
            fontSize: 13, fontFamily: "'DM Mono', monospace",
            letterSpacing: 1, fontWeight: 400,
            boxShadow: '0 8px 32px rgba(29,185,84,0.35)',
            transition: 'transform 0.15s, box-shadow 0.15s',
          }}
          onTouchStart={e => e.currentTarget.style.transform = 'scale(0.97)'}
          onTouchEnd={e => e.currentTarget.style.transform = 'scale(1)'}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
          </svg>
          Spotifyでログイン
        </button>
      )}

      <div style={{ marginTop: 40, fontSize: 10, opacity: 0.2, letterSpacing: 1, textAlign: 'center' }}>
        Premium required · 5 users max
      </div>
    </div>
  )
}

// ─── Loading screen ───────────────────────────────────────────────────────

function LoadingScreen() {
  return (
    <div style={{
      minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#060606',
    }}>
      <div style={{
        fontFamily: "'Syne', sans-serif",
        fontSize: 26, fontWeight: 700, letterSpacing: 8,
        opacity: 0.4, animation: 'pulse 1.5s ease-in-out infinite',
      }}>
        Vinyl
      </div>
      <style>{`@keyframes pulse { 0%,100%{opacity:0.2} 50%{opacity:0.6} }`}</style>
    </div>
  )
}

// ─── App root ─────────────────────────────────────────────────────────────

export default function App() {
  const [state, setState] = useState('loading') // loading | login | ready
  const [token, setToken] = useState(null)
  const [me, setMe] = useState(null)

  useEffect(() => {
    async function init() {
      // Handle OAuth callback
      const params = new URLSearchParams(window.location.search)
      const code = params.get('code')
      const error = params.get('error')

      if (error) {
        setState('login')
        return
      }

      if (code) {
        try {
          const t = await exchangeCodeForToken(code)
          const user = await fetchMe(t)
          setToken(t)
          setMe(user)
          setState('ready')
        } catch (e) {
          console.error(e)
          setState('login')
        }
        return
      }

      // Check existing session
      const existing = await getAccessToken()
      if (existing) {
        try {
          const user = await fetchMe(existing)
          setToken(existing)
          setMe(user)
          setState('ready')
        } catch {
          setState('login')
        }
      } else {
        setState('login')
      }
    }

    init()
  }, [])

  if (state === 'loading') return (
    <>
      <style>{css}</style>
      <LoadingScreen />
    </>
  )

  if (state === 'login') return (
    <>
      <style>{css}</style>
      <LoginScreen
        noClientId={!CLIENT_ID}
        onLogin={redirectToSpotifyLogin}
      />
    </>
  )

  return (
    <>
      <style>{css}</style>
      <Vinyl token={token} me={me} />
    </>
  )
}
