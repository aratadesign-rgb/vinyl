import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import {
  fetchSavedAlbums,
  fetchFollowedArtists,
  fetchArtist,
  fetchArtistAlbums,
  searchArtistsByGenre,
  searchArtists,
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
  const [gridSelecting, setGridSelecting] = useState(false)
  const [gridSelected, setGridSelected] = useState(new Set())
  const [saving, setSaving] = useState(false)
  const [lightbox, setLightbox] = useState(false)
  const [lbScale, setLbScale] = useState(1)
  const [lbOffset, setLbOffset] = useState({ x: 0, y: 0 })
  const [isPinching, setIsPinching] = useState(false)

  // view mode
  const [viewMode, setViewMode] = useState('library')
  const [libraryTab, setLibraryTab] = useState('albums') // 'albums' | 'artists'
  const [libraryAlbums, setLibraryAlbums] = useState([])
  const [currentArtist, setCurrentArtist] = useState(null)
  const [followedArtists, setFollowedArtists] = useState([])
  const [loadingFollowed, setLoadingFollowed] = useState(false)

  // search
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)

  // related artists
  const [relatedArtists, setRelatedArtists] = useState([])

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
    if (!artistId) return
    setLoading(true)
    setGridMode(false)
    setRelatedArtists([])
    try {
      const t = await getAccessToken()
      // アルバムとアーティスト情報を並列取得
      const [albumData, artistData] = await Promise.all([
        fetchArtistAlbums(t, artistId),
        fetchArtist(t, artistId).catch(() => null),
      ])
      const normalized = albumData.items.map(normalizeAlbum)
      setAlbums(normalized)
      setIdx(0)
      setSort('track')
      setCurrentArtist({ id: artistId, name: artistName, genres: artistData?.genres || [] })
      setViewMode('artist')
      // ジャンルがあれば同ジャンルのアーティストを非同期で検索
      const genre = artistData?.genres?.[0]
      if (genre) {
        searchArtistsByGenre(t, genre, artistName)
          .then(data => setRelatedArtists(data.artists?.items || []))
          .catch(() => {})
      }
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
    setRelatedArtists([])
    setGridMode(false)
  }, [libraryAlbums])

  const loadFollowedArtists = useCallback(async () => {
    if (followedArtists.length > 0) return // キャッシュ済み
    setLoadingFollowed(true)
    try {
      const t = await getAccessToken()
      const data = await fetchFollowedArtists(t)
      setFollowedArtists(data.artists?.items || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoadingFollowed(false)
    }
  }, [followedArtists.length])

  const [gridSaveModal, setGridSaveModal] = useState(false)

  // ── Save helpers ──────────────────────────────────────────────────────

  const saveImage = useCallback(async (url, filename) => {
    try {
      const res = await fetch(url)
      const blob = await res.blob()
      const file = new File([blob], filename, { type: 'image/jpeg' })
      // Web Share API (iOS/Android → 写真アプリに保存できる)
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: filename })
        return
      }
      // フォールバック：<a download>
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(blobUrl)
    } catch (e) {
      if (e?.name !== 'AbortError') window.open(url, '_blank')
    }
  }, [])

  const saveSingle = useCallback((album) => {
    if (!album.image) return
    const filename = `${album.artist} - ${album.title}.jpg`.replace(/[/\\?%*:|"<>]/g, '-')
    saveImage(album.image, filename)
  }, [saveImage])

  // グリッド一括保存：モーダルで一覧表示 → ユーザーが長押しで個別保存
  const openGridSaveModal = useCallback(() => {
    setGridSaveModal(true)
  }, [])

  // ── Search ────────────────────────────────────────────────────────────

  const searchTimeoutRef = useRef(null)

  const handleSearchInput = useCallback((val) => {
    setSearchQuery(val)
    if (!val.trim()) { setSearchResults([]); return }
    clearTimeout(searchTimeoutRef.current)
    searchTimeoutRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const t = await getAccessToken()
        const data = await searchArtists(t, val)
        setSearchResults(data.artists?.items || [])
      } catch (e) {
        console.error(e)
      } finally {
        setSearching(false)
      }
    }, 400)
  }, [])

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
          {viewMode === 'library' ? (
            <div>
              <div style={{ fontSize: 10, letterSpacing: 3, textTransform: 'uppercase', opacity: 0.35, marginBottom: 8 }}>
                {me?.display_name || 'Library'}
              </div>
              {/* Albums / Artists タブ */}
              <div style={{ display: 'flex', gap: 6 }}>
                {[['albums', 'Albums'], ['artists', 'Artists']].map(([key, label]) => (
                  <button key={key} onClick={() => {
                    setLibraryTab(key)
                    if (key === 'artists') loadFollowedArtists()
                  }} style={{
                    background: libraryTab === key ? 'rgba(192,132,252,0.15)' : 'none',
                    border: `1px solid ${libraryTab === key ? '#c084fc' : 'rgba(255,255,255,0.15)'}`,
                    color: libraryTab === key ? '#c084fc' : 'rgba(255,255,255,0.45)',
                    fontSize: 12, fontWeight: libraryTab === key ? 600 : 400,
                    padding: '5px 14px', borderRadius: 100,
                    fontFamily: "'Syne', sans-serif", cursor: 'pointer',
                  }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 10, letterSpacing: 3, textTransform: 'uppercase', opacity: 0.35, marginBottom: 5 }}>
                Discography
              </div>
              <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 27, fontWeight: 600, lineHeight: 1 }}>
                {currentArtist?.name}
              </div>
            </div>
          )}
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

      {/* ── Search button ── */}
      <div style={{ padding: '12px 22px 0', display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={() => { setSearchOpen(true); setSearchQuery(''); setSearchResults([]) }}
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.12)',
            color: 'rgba(255,255,255,0.5)',
            fontSize: 11, letterSpacing: 0.8, padding: '7px 16px',
            borderRadius: 100, fontFamily: "'DM Sans', sans-serif", cursor: 'pointer',
          }}
        >
          🔍 Search artists
        </button>
      </div>

      {/* ── Artists tab: フォロー中アーティスト一覧 ── */}
      {viewMode === 'library' && libraryTab === 'artists' && (
        <div style={{ paddingBottom: 48 }}>
          {loadingFollowed && <Spinner />}
          {!loadingFollowed && followedArtists.length === 0 && (
            <div style={{ textAlign: 'center', padding: 48, opacity: 0.3, fontSize: 12 }}>
              No followed artists found
            </div>
          )}
          {followedArtists.map(artist => (
            <div
              key={artist.id}
              onClick={() => goToArtist(artist.id, artist.name)}
              style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '12px 22px',
                borderBottom: '1px solid rgba(255,255,255,0.04)',
                cursor: 'pointer',
              }}
            >
              <div style={{
                width: 52, height: 52, borderRadius: '50%', flexShrink: 0,
                background: 'rgba(255,255,255,0.06)', overflow: 'hidden',
              }}>
                {artist.images?.[2]?.url && (
                  <img src={artist.images[2].url} alt={artist.name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontFamily: "'Syne', sans-serif", fontSize: 16, fontWeight: 500,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {artist.name}
                </div>
                {artist.genres?.[0] && (
                  <div style={{ fontSize: 11, opacity: 0.35, marginTop: 2, letterSpacing: 0.5 }}>
                    {artist.genres[0]}
                  </div>
                )}
              </div>
              <div style={{ fontSize: 16, opacity: 0.2 }}>›</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Albums tab (通常のカルーセル以降) ── */}
      {(viewMode === 'artist' || libraryTab === 'albums') && (<>

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

      {/* ── Nav counter ── */}
      {!gridMode && (
      <div style={{ marginTop: 14, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16 }}>
        <button
          onClick={() => idx > 0 && navigate(idx - 1)}
          style={{
            background: 'none', border: 'none',
            color: idx > 0 ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.1)',
            fontSize: 18, padding: '4px 10px', cursor: idx > 0 ? 'pointer' : 'default',
          }}
        >‹</button>
        <div style={{ fontSize: 11, opacity: 0.35, letterSpacing: 2, fontVariantNumeric: 'tabular-nums' }}>
          {idx + 1} / {albums.length}
        </div>
        <button
          onClick={() => idx < albums.length - 1 && navigate(idx + 1)}
          style={{
            background: 'none', border: 'none',
            color: idx < albums.length - 1 ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.1)',
            fontSize: 18, padding: '4px 10px', cursor: idx < albums.length - 1 ? 'pointer' : 'default',
          }}
        >›</button>
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
          overflowY: 'auto', padding: '56px 4px 80px',
        }}>
          {/* ヘッダー */}
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '14px 16px', background: 'rgba(6,6,6,0.95)',
            backdropFilter: 'blur(12px)', zIndex: 160,
          }}>
            <button onClick={() => {
              setGridMode(false)
              setGridSelecting(false)
              setGridSelected(new Set())
            }} style={{
              background: 'none', border: 'none',
              color: 'rgba(255,255,255,0.6)', fontSize: 13, letterSpacing: 0.5,
              fontFamily: "'DM Sans', sans-serif", cursor: 'pointer',
            }}>✕ Close</button>

            <div style={{ fontSize: 10, letterSpacing: 3, textTransform: 'uppercase', opacity: 0.3 }}>
              {gridSelecting ? `${gridSelected.size} selected` : `${albums.length} albums`}
            </div>

            <button onClick={() => {
              setGridSelecting(s => !s)
              setGridSelected(new Set())
            }} style={{
              background: gridSelecting ? 'rgba(192,132,252,0.15)' : 'none',
              border: `1px solid ${gridSelecting ? '#c084fc' : 'rgba(255,255,255,0.15)'}`,
              color: gridSelecting ? '#c084fc' : 'rgba(255,255,255,0.5)',
              fontSize: 11, letterSpacing: 0.5, padding: '5px 12px', borderRadius: 100,
              fontFamily: "'DM Sans', sans-serif", cursor: 'pointer',
            }}>
              {gridSelecting ? 'Cancel' : 'Select'}
            </button>
          </div>

          {/* グリッド */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 3 }}>
            {albums.map((a, i) => {
              const selected = gridSelected.has(i)
              return (
                <div
                  key={a.id}
                  onClick={() => {
                    if (gridSelecting) {
                      setGridSelected(prev => {
                        const next = new Set(prev)
                        next.has(i) ? next.delete(i) : next.add(i)
                        return next
                      })
                    } else {
                      setIdx(i); setGridMode(false)
                      if (a.tracks.length === 0) loadTracksFor(a.id)
                    }
                  }}
                  style={{
                    aspectRatio: '1', position: 'relative', overflow: 'hidden',
                    cursor: 'pointer',
                    outline: !gridSelecting && i === idx ? '2px solid #c084fc' : 'none',
                    outlineOffset: -2,
                  }}
                >
                  {a.image
                    ? <img src={a.imageMd || a.image} alt={a.title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} loading="lazy" />
                    : <div style={{ width: '100%', height: '100%', background: 'linear-gradient(145deg,#1a0a2e,#3a0a5e)', display: 'flex', alignItems: 'flex-end', padding: 6 }}>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', lineHeight: 1.2, fontFamily: "'Syne',sans-serif" }}>{a.title}</div>
                      </div>
                  }
                  {/* 選択オーバーレイ */}
                  {gridSelecting && (
                    <div style={{
                      position: 'absolute', inset: 0,
                      background: selected ? 'rgba(192,132,252,0.35)' : 'rgba(0,0,0,0.25)',
                      display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end',
                      padding: 6,
                    }}>
                      <div style={{
                        width: 20, height: 20, borderRadius: '50%',
                        background: selected ? '#c084fc' : 'rgba(255,255,255,0.25)',
                        border: `2px solid ${selected ? '#c084fc' : 'rgba(255,255,255,0.5)'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, color: '#fff',
                      }}>
                        {selected ? '✓' : ''}
                      </div>
                    </div>
                  )}
                  {!gridSelecting && i === idx && (
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(192,132,252,0.15)' }} />
                  )}
                </div>
              )
            })}
          </div>

          {/* 一括保存ボタン */}
          {gridSelecting && gridSelected.size > 0 && (
            <div style={{
              position: 'fixed', bottom: 0, left: 0, right: 0,
              padding: '12px 20px 32px',
              background: 'rgba(6,6,6,0.97)', backdropFilter: 'blur(16px)',
              borderTop: '1px solid rgba(192,132,252,0.2)',
              zIndex: 170,
            }}>
              <button
                onClick={openGridSaveModal}
                style={{
                  width: '100%', padding: '14px',
                  background: '#c084fc',
                  border: 'none', borderRadius: 12,
                  color: '#000', fontSize: 14, fontWeight: 600,
                  fontFamily: "'DM Sans', sans-serif", cursor: 'pointer',
                }}
              >
                ⬇ Save {gridSelected.size} covers
              </button>
            </div>
          )}
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

      {/* ── Related Artists ── */}
      {viewMode === 'artist' && relatedArtists.length > 0 && (
        <div style={{ padding: '0 0 48px' }}>
          <div style={{
            fontSize: 10, letterSpacing: 3, textTransform: 'uppercase',
            opacity: 0.3, padding: '0 22px 14px',
          }}>
            {currentArtist?.genres?.[0]
              ? `More ${currentArtist.genres[0]}`
              : 'Similar Artists'}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {relatedArtists.map(artist => (
              <div
                key={artist.id}
                onClick={() => goToArtist(artist.id, artist.name)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '10px 22px',
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                  cursor: 'pointer',
                }}
              >
                {/* アーティスト画像 */}
                <div style={{
                  width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
                  background: 'rgba(255,255,255,0.06)', overflow: 'hidden',
                }}>
                  {artist.images?.[2]?.url && (
                    <img src={artist.images[2].url} alt={artist.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontFamily: "'Syne', sans-serif", fontSize: 15, fontWeight: 500,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {artist.name}
                  </div>
                  {artist.genres?.[0] && (
                    <div style={{ fontSize: 10, opacity: 0.38, marginTop: 2, letterSpacing: 0.5 }}>
                      {artist.genres[0]}
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 14, opacity: 0.2 }}>›</div>
              </div>
            ))}
          </div>
        </div>
      )}

      </>) /* end albums tab */}

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

      {/* ── Grid save modal ── */}
      {gridSaveModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(6,6,6,0.98)',
          zIndex: 500, display: 'flex', flexDirection: 'column',
        }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '52px 20px 16px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}>
            <div>
              <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 17, fontWeight: 600 }}>
                Save Covers
              </div>
              <div style={{ fontSize: 11, opacity: 0.35, marginTop: 4 }}>
                iOSは長押し → 写真に保存 / Androidはタップしてシェア
              </div>
            </div>
            <button onClick={() => {
              setGridSaveModal(false)
              setGridSelected(new Set())
              setGridSelecting(false)
            }} style={{
              background: 'none', border: 'none',
              color: 'rgba(255,255,255,0.5)', fontSize: 13,
              fontFamily: "'DM Sans', sans-serif", cursor: 'pointer',
            }}>
              Done
            </button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 12px 48px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
              {albums
                .filter((_, i) => gridSelected.has(i))
                .map(a => a.image ? (
                  <div key={a.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {/* 長押し保存用：img直接表示 */}
                    <img
                      src={a.image}
                      alt={a.title}
                      style={{
                        width: '100%', aspectRatio: '1', objectFit: 'cover',
                        borderRadius: 8,
                      }}
                      onTouchStart={() => {}} // タッチ有効化
                    />
                    {/* Androidはタップでシェア */}
                    <button
                      onClick={() => saveSingle(a)}
                      style={{
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 8, padding: '8px',
                        color: 'rgba(255,255,255,0.6)', fontSize: 11,
                        fontFamily: "'DM Sans', sans-serif", cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      }}
                    >
                      <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                        <line x1="8" y1="1" x2="8" y2="11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                        <polyline points="4,8 8,12 12,8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                        <line x1="2" y1="15" x2="14" y2="15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                      </svg>
                      {a.artist.split(',')[0]} — {a.title}
                    </button>
                  </div>
                ) : null)
              }
            </div>
          </div>
        </div>
      )}

      {/* ── Search modal ── */}
      {searchOpen && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(6,6,6,0.98)',
          zIndex: 400, display: 'flex', flexDirection: 'column',
          padding: '0 0 32px',
        }}>
          {/* 検索バー */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '52px 16px 16px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}>
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', gap: 10,
              background: 'rgba(255,255,255,0.07)', borderRadius: 12,
              padding: '10px 16px',
            }}>
              <span style={{ opacity: 0.4, fontSize: 15 }}>🔍</span>
              <input
                autoFocus
                value={searchQuery}
                onChange={e => handleSearchInput(e.target.value)}
                placeholder="Artist name..."
                style={{
                  flex: 1, background: 'none', border: 'none', outline: 'none',
                  color: '#ede8de', fontSize: 16,
                  fontFamily: "'DM Sans', sans-serif",
                }}
              />
              {searchQuery && (
                <button onClick={() => { setSearchQuery(''); setSearchResults([]) }}
                  style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', fontSize: 16, cursor: 'pointer' }}>
                  ✕
                </button>
              )}
            </div>
            <button onClick={() => setSearchOpen(false)} style={{
              background: 'none', border: 'none',
              color: 'rgba(255,255,255,0.5)', fontSize: 13,
              fontFamily: "'DM Sans', sans-serif", cursor: 'pointer', padding: '0 4px',
            }}>
              Cancel
            </button>
          </div>

          {/* 結果一覧 */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {searching && (
              <div style={{ padding: 32, textAlign: 'center', opacity: 0.3, fontSize: 12 }}>Searching...</div>
            )}
            {!searching && searchResults.map(artist => (
              <div
                key={artist.id}
                onClick={() => {
                  setSearchOpen(false)
                  goToArtist(artist.id, artist.name)
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '12px 20px',
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                  cursor: 'pointer',
                }}
              >
                <div style={{
                  width: 52, height: 52, borderRadius: '50%', flexShrink: 0,
                  background: 'rgba(255,255,255,0.06)', overflow: 'hidden',
                }}>
                  {artist.images?.[2]?.url && (
                    <img src={artist.images[2].url} alt={artist.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontFamily: "'Syne', sans-serif", fontSize: 17, fontWeight: 500,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {artist.name}
                  </div>
                  {artist.genres?.[0] && (
                    <div style={{ fontSize: 11, opacity: 0.35, marginTop: 3, letterSpacing: 0.5 }}>
                      {artist.genres[0]}
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 16, opacity: 0.2 }}>›</div>
              </div>
            ))}
            {!searching && searchQuery && searchResults.length === 0 && (
              <div style={{ padding: 32, textAlign: 'center', opacity: 0.3, fontSize: 12 }}>No results</div>
            )}
          </div>
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

          <div style={{ position: 'relative', display: 'inline-block' }}>
            <div style={{
              transform: `scale(${lbScale}) translate(${lbOffset.x / lbScale}px, ${lbOffset.y / lbScale}px)`,
              transition: isPinching ? 'none' : 'transform 0.3s ease',
              willChange: 'transform',
            }}>
              <Cover album={album} size={300} onClick={() => {}} />
            </div>

            {/* 保存ボタン — ジャケット右下 */}
            {album.image && lbScale < 1.1 && (
              <button
                onClick={() => saveSingle(album)}
                style={{
                  position: 'absolute', bottom: 10, right: 10,
                  width: 36, height: 36, borderRadius: 8,
                  background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  color: 'rgba(255,255,255,0.85)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  zIndex: 10, cursor: 'pointer', flexShrink: 0,
                }}
              >
                {/* ダウンロードアイコン：線+矢印 */}
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <line x1="8" y1="1" x2="8" y2="11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                  <polyline points="4,8 8,12 12,8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  <line x1="2" y1="15" x2="14" y2="15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                </svg>
              </button>
            )}
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
