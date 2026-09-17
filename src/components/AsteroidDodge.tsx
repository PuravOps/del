import { useEffect, useRef, useState } from "react"

type Asteroid = {
  id: number
  lane: number
  y: number
  size: number
}

type Props = {
  onClose: () => void
}

const LANES = 3
const PLAYER_Y = 84

const AsteroidDodge = ({ onClose }: Props) => {
  const [playerLane, setPlayerLane] = useState(1)
  const [asteroids, setAsteroids] = useState<Asteroid[]>([])
  const [score, setScore] = useState(0)
  const [bestScore, setBestScore] = useState(0)
  const [isRunning, setIsRunning] = useState(true)
  const playerName = (typeof window !== "undefined" ? localStorage.getItem("userName") : null)?.trim() || "Player"
  const nextIdRef = useRef(1)
  const playerLaneRef = useRef(1)
  const asteroidsRef = useRef<Asteroid[]>([])
  const scoreRef = useRef(0)

  const startGame = () => {
    playerLaneRef.current = 1
    nextIdRef.current = 1
    asteroidsRef.current = []
    setPlayerLane(1)
    setAsteroids([])
    setScore(0)
    scoreRef.current = 0
    setIsRunning(true)
  }

  useEffect(() => {
    if (!isRunning) return

    let animationFrame = 0
    let lastTime = performance.now()
    let lastSpawn = lastTime

    const movePlayer = (direction: -1 | 1) => {
      const next = Math.max(0, Math.min(LANES - 1, playerLaneRef.current + direction))
      playerLaneRef.current = next
      setPlayerLane(next)
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") {
        event.preventDefault()
        movePlayer(-1)
      } else if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") {
        event.preventDefault()
        movePlayer(1)
      }
    }

    const tick = (now: number) => {
      const delta = Math.min(48, now - lastTime)
      lastTime = now

      let nextAsteroids = asteroidsRef.current.map((asteroid) => ({
        ...asteroid,
        y: asteroid.y + delta * 0.038,
      }))

      if (now - lastSpawn > 850) {
        nextAsteroids = [
          ...nextAsteroids,
          {
            id: nextIdRef.current++,
            lane: Math.floor(Math.random() * LANES),
            y: -10,
            size: 30 + Math.round(Math.random() * 12),
          },
        ]
        lastSpawn = now
      }

      const collision = nextAsteroids.some(
        (asteroid) => asteroid.lane === playerLaneRef.current && asteroid.y > PLAYER_Y - 4 && asteroid.y < PLAYER_Y + 5,
      )
      const passed = nextAsteroids.filter((asteroid) => asteroid.y > 105).length
      nextAsteroids = nextAsteroids.filter((asteroid) => asteroid.y <= 105)

      asteroidsRef.current = nextAsteroids
      setAsteroids(nextAsteroids)
      if (passed > 0) {
        scoreRef.current += passed
        setScore(scoreRef.current)
      }

      if (collision) {
        setBestScore((current) => Math.max(current, scoreRef.current))
        setIsRunning(false)
        return
      }

      animationFrame = window.requestAnimationFrame(tick)
    }

    window.addEventListener("keydown", onKeyDown)
    animationFrame = window.requestAnimationFrame(tick)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      window.cancelAnimationFrame(animationFrame)
    }
  }, [isRunning])

  return (
    <>
      <div
        className="sl-chat-game-backdrop"
        style={{ background: "rgba(0,0,0,0.5)", zIndex: 1570 }}
        role="presentation"
        onClick={onClose}
      />
      <section
        className="sl-chat-game-modal rounded-4 shadow-lg"
        style={{
          width: "min(420px, calc(100% - 24px))",
          zIndex: 1571,
          background: "#101827",
          color: "#e8f0ff",
          border: "1px solid rgba(120,170,255,0.4)",
          overflow: "hidden",
        }}
        role="dialog"
        aria-modal="true"
        aria-label="Asteroid Dodge game"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="d-flex align-items-center justify-content-between px-3 py-2 border-bottom border-secondary">
          <div>
            <div className="fw-semibold">Asteroid Dodge</div>
            <div className="small text-white-50">Type left/right or use Arrow keys to survive</div>
          </div>
          <button type="button" className="btn btn-sm btn-outline-light" onClick={onClose} aria-label="Close game">
            ×
          </button>
        </div>

        <div className="d-flex justify-content-between px-3 py-2 small">
          <span>Score: <strong>{score}</strong></span>
          <span>Best: <strong>{bestScore}</strong></span>
        </div>

        <div
          style={{
            position: "relative",
            height: 390,
            margin: "0 16px 16px",
            borderRadius: 16,
            overflow: "hidden",
            background: "linear-gradient(180deg, #17243b 0%, #09101d 100%)",
            border: "1px solid rgba(150,190,255,0.25)",
          }}
        >
          {[0, 1].map((line) => (
            <div
              key={line}
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: `${((line + 1) * 100) / LANES}%`,
                borderLeft: "1px dashed rgba(174,205,255,0.2)",
              }}
            />
          ))}
          <div className="position-absolute top-0 start-0 w-100 text-center pt-2 small text-white-50">
            Avoid the asteroids
          </div>

          {asteroids.map((asteroid) => (
            <div
              key={asteroid.id}
              aria-label="Asteroid"
              style={{
                position: "absolute",
                left: `${((asteroid.lane + 0.5) * 100) / LANES}%`,
                top: `${asteroid.y}%`,
                width: asteroid.size,
                height: asteroid.size,
                transform: "translateX(-50%) rotate(18deg)",
                borderRadius: "42% 58% 55% 45%",
                background: "linear-gradient(135deg, #f59e0b, #b45309)",
                boxShadow: "0 0 18px rgba(245,158,11,0.55)",
              }}
            />
          ))}

          <div
            aria-label="Your ship"
            style={{
              position: "absolute",
              left: `${((playerLane + 0.5) * 100) / LANES}%`,
              top: `${PLAYER_Y}%`,
              transform: "translate(-50%, -50%)",
              fontSize: 32,
              filter: "drop-shadow(0 0 8px rgba(96,165,250,0.9))",
              transition: "left 90ms ease-out",
            }}
          >
            🚀
          </div>

          {!isRunning && (
            <div className="position-absolute top-50 start-50 translate-middle text-center p-3" style={{ minWidth: 190 }}>
              <div className="fw-semibold mb-1">{playerName} finished Asteroid Dodge</div>
              <div className="small text-white-50 mb-3">Score: {score}</div>
              <button type="button" className="btn btn-sm btn-primary" onClick={startGame}>
                Play again
              </button>
            </div>
          )}
        </div>
      </section>
    </>
  )
}

export default AsteroidDodge
