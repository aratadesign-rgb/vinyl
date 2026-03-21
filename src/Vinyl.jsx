import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import {
  fetchSavedAlbums,
  fetchArtistAlbums,
  fetchAlbum,
  getAccessToken,
  normalizeAlbum,
  logout,
} from './spotify.js'
import { useSpotifyPlayer } from './useSpotifyPlayer.js'

const SORT_OPTIONS = [
  { key: 'track', label: '# order' },
  { key: 'dur',   label: '⏱ length' },
]

// ── Cover component ────────────────────────────────────────────────────────

function Cover({ album, size, onClick }) {
  const r = Math.round(size * 0.05)
  const hasImg = !!album.image

  return (
    <div onClick={onClick} style={{
      width: size, height: size, borderRadius: r,
      position: 'relative', overflow: 'hidden',
      cursor: 'pointer', flexShrink: 0,
      boxShadow: `0 ${size * 0.12}px ${size * 0.35}px rgba(0,0,0,0.75)`,
      background: hasImg ? '#111' : `linear-gradient(145deg, #1a0a2e 0%, #3a0a5e 100%)`,
    }}>
      {hasImg && (
        <img
          src={album.image}
          alt={album.title}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          loading="lazy"
        />
      )}
      {/* Gloss overlay */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(145deg, rgba(255,255,255,0.08) 0%, transparent 55%)',
        pointerEvents: 'none',
      }} />
      {/* Album title overlay (no image fallback) */}
      {!hasImg && (
        <div style={{
          position: 'absolute', bottom: size * 0.055, left: size * 0.08, right: size * 0.08,
          fontFamily: "'Syne', sans-serif",
          fontSize: Math.max(10, size * 0.075), fontWeight: 300,
          color: 'rgba(255,255,255,0.85)', lineHeight: 1.2,
          textShadow: '0 1px 8px rgba(0,0,0,0.9)', pointerEvents: 'none',
        }}>
          {album.title}
        </div>
      )}
    </div>
  )
}

// ── Mini spinner ──────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
      <div style={{
        width: 28, height: 28, borderRadius: '50%',
        border: '2px solid rgba(255,255,255,0.08)',
        borderTop: '2px solid rgba(255,255,255,0.5)',
        animation: 'spin 0.8s linear infinite',
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

// ── Main Vinyl component ──────────────────────────────────────────────────

export default function Vinyl({ token, me }) {
  const [albums, setAlbums] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingTracks, setLoadingTracks] = useState(false)
  const [idx, setIdx] = useState(0)
  const [sort, setSort] = useState('track')
  const [gridMode, setGridMode] = useState(false)
  const [lightbox, setLightbox] = useState(false)
  const [lbScale, setLbScale] = useState(1)
  const [lbOffset, setLbOffset] = useState({ x: 0, y: 0 })
  const [isPinching, setIsPinching] = useState(false)

  // library | artist view
  const [viewMode, setViewMode] = useState('library') // 'library' | 'artist'
  const [libraryAlbums, setLibraryAlbums] = useState([]) // ライブラリを保持
  const [currentArtist, setCurrentArtist] = useState(null) // { name, id }

  const { ready: playerReady, isPlaying, currentTrackUri, play, pause, resume } = useSpotifyPlayer()

  const swipeRef = useRef({ startX: null, startY: null, startTime: null, lastX: null, velocity: 0 })
  const pinchRef = useRef({ dist: null, scale: 1, panX: null, panY: null })
  const carouselRef = useRef(null)
  const lbRef = useRef(null)

  // ── Load saved albums ─────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const t = await getAccessToken()
        const data = await fetchSavedAlbums(t, 50, 0)
        const normalized = data.items.map(normalizeAlbum)
        setAlbums(normalized)
        setLibraryAlbums(normalized)
        // Load tracks for first album if missing
        if (normalized.length > 0 && normalized[0].tracks.length === 0) {
          loadTracksFor(normalized[0].id, t, normalized)
        }
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [token])

  async function loadTracksFor(albumId, t, currentAlbums) {
    setLoadingTracks(true)
    try {
      const data = await fetchAlbum(t || await getAccessToken(), albumId)
      const full = normalizeAlbum(data)
      setAlbums(prev => prev.map(a => a.id === albumId ? { ...a, tracks: full.tracks } : a))
    } catch (e) {
      console.error(e)
    } finally {
      setLoadingTracks(false)
    }
  }

  // ── Navigate ──────────────────────────────────────────────────────────

  const navigate = useCallback(async (newIdx) => {
    setIdx(newIdx)
    setSort('track')
    setAlbums(prev => {
      const album = prev[newIdx]
      if (album && album.tracks.length === 0) {
        loadTracksFor(album.id)
      }
      return prev
    })
  }, [])

  const goToArtist = useCallback(async (artistId, artistName) => {
    console.log('[Vinyl] goToArtist called:', { artistId, artistName })
    if (!artistId) {
      console.warn('[Vinyl] No artistId available')
      return
    }
    setLoading(true)
    setGridMode(false)
    try {
      const t = await getAccessToken()
      console.log('[Vinyl] fetching artist albums for', artistId)
      const data = await fetchArtistAlbums(t, artistId, 50)
      console.log('[Vinyl] artist albums:', data?.items?.length)
      const normalized = data.items.map(normalizeAlbum)
      setAlbums(normalized)
      setIdx(0)
      setSort('track')
      setCurrentArtist({ id: artistId, name: artistName })
      setViewMode('artist')
      if (normalized.length > 0 && normalized[0].tracks.length === 0) {
        loadTracksFor(normalized[0].id)
      }
    } catch (e) {
      console.error('[Vinyl] goToArtist error:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  const backToLibrary = useCallback(() => {
    setAlbums(libraryAlbums)
    setIdx(0)
    setSort('track')
    setViewMode('library')
    setCurrentArtist(null)
    setGridMode(false)
  }, [libraryAlbums])

  // ── Carousel touch ────────────────────────────────────────────────────

  useEffect(() => {
    const el = carouselRef.current
    if (!el) return
    const onMove = (e) => {
      if (!e.touches[0]) return
      const dx = Math.abs(e.touches[0].clientX - (swipeRef.current.startX || 0))
      const dy = Math.abs(e.touches[0].clientY - (swipeRef.current.startY || 0))
      if (dx > dy && dx > 8) {
        e.preventDefault()
        // velocity tracking here (passive:false なのでここで取れる)
        swipeRef.current.velocity = e.touches[0].clientX - swipeRef.current.lastX
        swipeRef.current.lastX = e.touches[0].clientX
      }
    }
    el.addEventListener('touchmove', onMove, { passive: false })
    return () => el.removeEventListener('touchmove', onMove)
  }, [])

  const onCarouselTouchStart = useCallback((e) => {
    const x = e.touches[0].clientX
    swipeRef.current.startX = x
    swipeRef.current.startY = e.touches[0].clientY
    swipeRef.current.startTime = Date.now()
    swipeRef.current.lastX = x
    swipeRef.current.velocity = 0
  }, [])

  const onCarouselTouchEnd = useCallback((e) => {
    if (swipeRef.current.startX === null) return
    const dx = e.changedTouches[0].clientX - swipeRef.current.startX
    const elapsed = Date.now() - swipeRef.current.startTime
    const velocity = swipeRef.current.velocity

    // フリック（速い）かスワイプ（距離）で判定
    const isFlick = Math.abs(velocity) > 6 && elapsed < 300
    const isSwipe = Math.abs(dx) > 44

    if (isFlick || isSwipe) {
      const dir = (isFlick ? velocity : dx) < 0 ? 1 : -1
      // 速いフリックなら2枚飛ばす
      const step = isFlick && Math.abs(velocity) > 14 ? 2 : 1
      const next = Math.max(0, Math.min(albums.length - 1, idx + dir * step))
      if (next !== idx) navigate(next)
    }
    swipeRef.current.startX = null
  }, [idx, albums.length, navigate])

  // ── Lightbox pinch ────────────────────────────────────────────────────

  useEffect(() => {
    const el = lbRef.current
    if (!el || !lightbox) return
    const onMove = (e) => {
      e.preventDefault()
      if (e.touches.length === 2 && pinchRef.current.dist) {
        const dx = e.touches[0].clientX - e.touches[1].clientX
        const dy = e.touches[0].clientY - e.touches[1].clientY
        const dist = Math.sqrt(dx * dx + dy * dy)
        const newScale = Math.min(5, Math.max(1, pinchRef.current.scale * dist / pinchRef.current.dist))
        setLbScale(newScale)
      } else if (e.touches.length === 1 && pinchRef.current.panX !== null) {
        setLbOffset({
          x: e.touches[0].clientX - pinchRef.current.panX,
          y: e.touches[0].clientY - pinchRef.current.panY,
        })
      }
    }
    el.addEventListener('touchmove', onMove, { passive: false })
    return () => el.removeEventListener('touchmove', onMove)
  }, [lightbox])

  const onLbTouchStart = useCallback((e) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      pinchRef.current = { dist: Math.sqrt(dx * dx + dy * dy), scale: lbScale, panX: null, panY: null }
      setIsPinching(true)
    } else {
      pinchRef.current.dist = null
      pinchRef.current.panX = e.touches[0].clientX - lbOffset.x
      pinchRef.current.panY = e.touches[0].clientY - lbOffset.y
    }
  }, [lbScale, lbOffset])

  const onLbTouchEnd = useCallback(() => {
    setIsPinching(false)
    pinchRef.current.dist = null
    setLbScale(s => {
      if (s < 1.05) { setLbOffset({ x: 0, y: 0 }); return 1 }
      return s
    })
  }, [])

  // ── Playback ──────────────────────────────────────────────────────────

  const handlePlayTrack = useCallback(async (trackUri) => {
    const album = albums[idx]
    if (currentTrackUri === trackUri && isPlaying) {
      await pause()
    } else if (currentTrackUri === trackUri && !isPlaying) {
      await resume()
    } else {
      await play(trackUri, album.uri)
    }
  }, [albums, idx, currentTrackUri, isPlaying, play, pause, resume])

  // ── Sorted tracks ─────────────────────────────────────────────────────

  const album = albums[idx]
  const sortedTracks = useMemo(() => {
    if (!album) return []
    const t = [...album.tracks]
    switch (sort) {
      case 'dur': return t.sort((a, b) => (b.durMs || 0) - (a.durMs || 0))
      case 'pop': return t.sort((a, b) => (b.pop || 0) - (a.pop || 0))
      default: return t.sort((a, b) => a.n - b.n)
    }
  }, [album, sort])

  // ── Cover carousel style ──────────────────────────────────────────────

  const cardStyle = (i) => {
    const off = i - idx
    const abs = Math.abs(off)
    if (abs > 2) return { display: 'none' }
    const scale = [1, 0.76, 0.58][abs]
    const opacity = [1, 0.68, 0.35][abs]
    const tx = off * 148
    const rotY = off * 44
    const tz = -abs * 55
    return {
      position: 'absolute', left: '50%', top: '50%',
      transform: `translate(-50%, -50%) translateX(${tx}px) perspective(700px) rotateY(${rotY}deg) translateZ(${tz}px) scale(${scale})`,
      opacity, zIndex: 10 - abs,
      transition: 'transform 0.42s cubic-bezier(0.25,0.46,0.45,0.94), opacity 0.42s ease',
    }
  }

  const playingTrack = album?.tracks.find(t => t.uri === currentTrackUri)

  // ── Render ────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ minHeight: '100dvh', background: '#060606', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spinner />
      </div>
    )
  }

  if (!albums.length) {
    return (
      <div style={{ minHeight: '100dvh', background: '#060606', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32 }}>
        <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 24, opacity: 0.5 }}>No saved albums</div>
        <div style={{ fontSize: 11, opacity: 0.3 }}>Spotifyでアルバムを保存してください</div>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100dvh',
      background: '#060606',
      color: '#ede8de',
      fontFamily: "'DM Sans', sans-serif",
      overflowX: 'hidden',
    }}>

      {/* ── Header ── */}
      <div style={{ padding: '24px 22px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          {viewMode === 'artist' && (
            <button onClick={backToLibrary} style={{
              background: 'none', border: 'none', color: 'rgba(255,255,255,0.45)',
              fontSize: 11, letterSpacing: 1, padding: '0 0 7px 0',
              fontFamily: "'DM Sans', sans-serif", cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 5,
            }}>
              ← Library
            </button>
          )}
          <div style={{ fontSize: 10, letterSpacing: 3, textTransform: 'uppercase', opacity: 0.35, marginBottom: 5 }}>
            {viewMode === 'artist' ? 'Discography' : (me?.display_name || 'Library')}
          </div>
          <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 27, fontWeight: 600, lineHeight: 1 }}>
            {viewMode === 'artist' ? currentArtist?.name : 'Saved Albums'}
          </div>
        </div>
        <button onClick={logout} style={{
          background: 'rgba(255,255,255,0.92)',
          border: '1px solid rgba(255,255,255,0.8)',
          color: '#1a1a1a',
          fontSize: 11, letterSpacing: 1, padding: '6px 14px',
          borderRadius: 100,
          fontFamily: "'DM Sans', sans-serif",
        }}>
          logout
        </button>
      </div>

      {/* ── CoverFlow ── */}
      <div
        ref={carouselRef}
        style={{ position: 'relative', height: 296, overflow: 'hidden', marginTop: 26 }}
        onTouchStart={onCarouselTouchStart}
        onTouchEnd={onCarouselTouchEnd}
      >
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: 60,
          background: 'linear-gradient(transparent, #060606)', zIndex: 20, pointerEvents: 'none',
        }} />
        {albums.map((a, i) => (
          <div key={a.id} style={cardStyle(i)}>
            <Cover
              album={a}
              size={220}
              onClick={i === idx
                ? () => { setLbScale(1); setLbOffset({ x: 0, y: 0 }); setLightbox(true) }
                : () => navigate(i)
              }
            />
          </div>
        ))}
      </div>

      {/* ── Dot nav ── */}
      {!gridMode && (
      <div style={{ marginTop: 14, display: 'flex', justifyContent: 'center', gap: 7, alignItems: 'center' }}>
        {albums.slice(0, Math.min(albums.length, 12)).map((_, i) => (
          <div key={i} onClick={() => navigate(i)} style={{
            width: i === idx ? 22 : 6, height: 6, borderRadius: 3,
            background: i === idx ? '#c084fc' : 'rgba(255,255,255,0.18)',
            transition: 'all 0.32s ease', cursor: 'pointer',
          }} />
        ))}
        {albums.length > 12 && (
          <div style={{ fontSize: 9, opacity: 0.3, letterSpacing: 1 }}>
            +{albums.length - 12}
          </div>
        )}
      </div>
      )}

      {/* ── Grid button — ドットナビの下、右寄せ ── */}
      {!gridMode && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '10px 18px 0' }}>
          <button
            onClick={() => setGridMode(true)}
            style={{
              width: 30, height: 30, borderRadius: 7,
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.15)',
              color: 'rgba(255,255,255,0.4)', fontSize: 13,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            ⊞
          </button>
        </div>
      )}

      {/* ── Grid mode ── */}
      {gridMode && (
        <div style={{
          position: 'fixed', inset: 0, top: 0,
          background: '#060606', zIndex: 150,
          overflowY: 'auto', padding: '56px 4px 32px',
        }}>
          {/* 閉じるボタン */}
          <button onClick={() => setGridMode(false)} style={{
            position: 'fixed', top: 16, right: 16,
            width: 36, height: 36, borderRadius: '50%',
            background: 'rgba(255,255,255,0.1)', border: 'none',
            color: 'rgba(255,255,255,0.7)', fontSize: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 160,
          }}>✕</button>
          <div style={{ fontSize: 10, letterSpacing: 3, textTransform: 'uppercase', opacity: 0.3, textAlign: 'center', marginBottom: 16 }}>
            {albums.length} albums
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 3,
          }}>
            {albums.map((a, i) => (
              <div
                key={a.id}
                onClick={() => { setIdx(i); setGridMode(false); if (a.tracks.length === 0) loadTracksFor(a.id) }}
                style={{
                  aspectRatio: '1', position: 'relative', overflow: 'hidden',
                  cursor: 'pointer',
                  outline: i === idx ? '2px solid #c084fc' : 'none',
                  outlineOffset: -2,
                }}
              >
                {a.image
                  ? <img src={a.imageMd || a.image} alt={a.title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} loading="lazy" />
                  : <div style={{ width: '100%', height: '100%', background: 'linear-gradient(145deg,#1a0a2e,#3a0a5e)', display: 'flex', alignItems: 'flex-end', padding: 6 }}>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', lineHeight: 1.2, fontFamily: "'Syne',sans-serif" }}>{a.title}</div>
                    </div>
                }
                {i === idx && (
                  <div style={{ position: 'absolute', inset: 0, background: 'rgba(192,132,252,0.15)' }} />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Album info ── */}
      {album && (
        <div style={{ textAlign: 'center', padding: '14px 24px 2px' }}>
          <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 28, fontWeight: 600, letterSpacing: -0.5, lineHeight: 1.2 }}>
            {album.title}
          </div>
          {/* アーティスト名 / More by リンク */}
          <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <div style={{ fontSize: 12, opacity: 0.5 }}>{album.artist}</div>
            {viewMode === 'library' && (
              <button
                onClick={() => album.artistId
                  ? goToArtist(album.artistId, album.artist)
                  : alert('Artist info not available')
                }
                style={{
                  background: 'none', border: '1px solid rgba(255,255,255,0.18)',
                  color: 'rgba(255,255,255,0.55)', fontSize: 10, letterSpacing: 0.8,
                  padding: '3px 10px', borderRadius: 100,
                  fontFamily: "'DM Sans', sans-serif", cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                More by {album.artist.split(',')[0]}
              </button>
            )}
          </div>
          <div style={{ fontSize: 11, opacity: 0.3, letterSpacing: 2, textTransform: 'uppercase', marginTop: 6 }}>
            {album.year} · {album.tracks.length} tracks
          </div>
          <div style={{ fontSize: 10, opacity: 0.18, marginTop: 10, letterSpacing: 0.3 }}>
            ← swipe · tap cover to zoom →
          </div>
        </div>
      )}

      {/* ── Sort bar ── */}
      <div style={{
        display: 'flex', gap: 7, padding: '14px 18px',
        overflowX: 'auto', scrollbarWidth: 'none',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
      }}>
        {SORT_OPTIONS.map(o => {
          const active = sort === o.key
          return (
            <button key={o.key} onClick={() => setSort(o.key)} style={{
              flexShrink: 0, padding: '6px 14px', borderRadius: 100,
              border: `1px solid ${active ? '#c084fc' : 'rgba(255,255,255,0.1)'}`,
              background: active ? 'rgba(192,132,252,0.1)' : 'transparent',
              color: active ? '#c084fc' : 'rgba(255,255,255,0.42)',
              fontSize: 11, fontFamily: "'DM Sans', sans-serif",
              letterSpacing: 0.3, transition: 'all 0.2s', outline: 'none',
            }}>
              {o.label}
            </button>
          )
        })}
      </div>

      {/* ── Track list ── */}
      <div style={{ paddingBottom: currentTrackUri ? 100 : 48 }}>
        {loadingTracks ? (
          <Spinner />
        ) : sortedTracks.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px', fontSize: 12, opacity: 0.3 }}>
            Loading tracks...
          </div>
        ) : (
          sortedTracks.map((t, i) => {
            const active = currentTrackUri === t.uri
            return (
              <div
                key={t.uri}
                onClick={() => handlePlayTrack(t.uri)}
                style={{
                  display: 'flex', alignItems: 'center',
                  padding: '12px 22px', gap: 14,
                  background: active ? 'rgba(192,132,252,0.06)' : 'transparent',
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                  transition: 'background 0.2s', cursor: 'pointer',
                }}
              >
                <div style={{
                  width: 22, textAlign: 'center', fontSize: 11,
                  fontWeight: 300, flexShrink: 0,
                  color: active ? '#c084fc' : 'rgba(255,255,255,0.28)',
                }}>
                  {active ? '▶' : String(i + 1).padStart(2, '0')}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontFamily: "'Syne', sans-serif", fontSize: 16, fontWeight: 500,
                    color: active ? '#c084fc' : '#ede8de',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {t.title}
                  </div>
                </div>

                <div style={{
                  fontSize: 11, opacity: 0.3, letterSpacing: 0.5,
                  flexShrink: 0, fontVariantNumeric: 'tabular-nums',
                }}>
                  {t.dur}
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* ── Bottom actions ── */}
      <div style={{ padding: '8px 22px 52px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        {/* More by — libraryモードのみ */}
        {viewMode === 'library' && album && (
          <button
            onClick={() => album.artistId
              ? goToArtist(album.artistId, album.artist)
              : alert('Artist info not available')
            }
            style={{
              background: 'none',
              border: '1px solid rgba(255,255,255,0.15)',
              color: 'rgba(255,255,255,0.45)',
              fontSize: 11, letterSpacing: 0.8,
              padding: '10px 28px', borderRadius: 100,
              fontFamily: "'DM Sans', sans-serif", cursor: 'pointer',
            }}
          >
            More by {album?.artist.split(',')[0]}
          </button>
        )}
        {/* Back to Library — artistモードのみ */}
        {viewMode === 'artist' && (
          <button onClick={backToLibrary} style={{
            background: 'none',
            border: '1px solid rgba(255,255,255,0.12)',
            color: 'rgba(255,255,255,0.4)',
            fontSize: 11, letterSpacing: 1,
            padding: '10px 28px', borderRadius: 100,
            fontFamily: "'DM Sans', sans-serif", cursor: 'pointer',
          }}>
            ← Back to Library
          </button>
        )}
      </div>
      {currentTrackUri && playingTrack && album && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          background: 'rgba(6,6,6,0.97)', backdropFilter: 'blur(24px)',
          borderTop: '1px solid rgba(192,132,252,0.2)',
          padding: '12px 20px 28px',
          display: 'flex', alignItems: 'center', gap: 14, zIndex: 200,
        }}>
          <Cover album={album} size={42} onClick={() => {}} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: "'Syne', sans-serif", fontSize: 16, fontWeight: 500,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {playingTrack.title}
            </div>
            <div style={{ fontSize: 10, opacity: 0.38, marginTop: 2 }}>{album.title}</div>
          </div>
          <button
            onClick={() => handlePlayTrack(currentTrackUri)}
            style={{
              background: 'none', color: '#c084fc', fontSize: 22, padding: '4px 8px',
              fontFamily: 'system-ui',
            }}
          >
            {isPlaying ? '⏸' : '▶'}
          </button>
        </div>
      )}

      {/* ── Lightbox ── */}
      {lightbox && album && (
        <div
          ref={lbRef}
          onClick={(e) => {
            // 背景タップで閉じる（ジャケット自体のタップは除外）
            if (e.target === lbRef.current) setLightbox(false)
          }}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.97)', zIndex: 300,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            touchAction: 'none',
          }}
          onTouchStart={onLbTouchStart}
          onTouchEnd={onLbTouchEnd}
        >
          <button onClick={() => setLightbox(false)} style={{
            position: 'absolute', top: 52, right: 22,
            width: 38, height: 38, borderRadius: '50%',
            background: 'rgba(255,255,255,0.08)',
            color: 'rgba(255,255,255,0.75)', fontSize: 15,
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10,
          }}>✕</button>

          <div style={{
            transform: `scale(${lbScale}) translate(${lbOffset.x / lbScale}px, ${lbOffset.y / lbScale}px)`,
            transition: isPinching ? 'none' : 'transform 0.3s ease',
            willChange: 'transform',
          }}>
            <Cover album={album} size={300} onClick={() => {}} />
          </div>

          <div style={{
            marginTop: 36, textAlign: 'center',
            opacity: lbScale > 1.1 ? 0 : 1,
            transition: 'opacity 0.25s', pointerEvents: 'none',
          }}>
            <div style={{
              fontFamily: "'Syne', sans-serif",
              fontSize: 24, fontWeight: 600,
            }}>
              {album.title}
            </div>
            <div style={{ fontSize: 12, opacity: 0.45, marginTop: 6 }}>{album.artist}</div>
            <div style={{ fontSize: 11, opacity: 0.3, letterSpacing: 2, marginTop: 4 }}>{album.year}</div>
            <div style={{ fontSize: 10, opacity: 0.2, marginTop: 16, letterSpacing: 0.8 }}>
              pinch to zoom · drag when zoomed
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
