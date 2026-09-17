import { useEffect, useMemo, useRef, useState } from "react"

type Card = {
  id: number
  value: string
  flipped: boolean
  matched: boolean
}

type Props = {
  onClose: () => void
}

const SYMBOLS = [
  "\u2600\uFE0F",
  "\u{1F319}",
  "\u2B50",
  "\u{1F308}",
  "\u{1F525}",
  "\u2744\uFE0F",
  "\u{1F30A}",
  "\u{1F33F}",
  "\u{1F98A}",
  "\u{1F431}",
  "\u{1F436}",
  "\u{1F98B}",
  "\u{1F680}",
  "\u{1F3B5}",
  "\u{1F355}",
  "\u{1F369}",
  "\u{1F34E}",
  "\u{1F381}",
  "\u{1F3C0}",
  "\u{1F3AE}",
  "\u{1F4A1}",
  "\u{1F4DA}",
  "\u{1F4AB}",
  "\u{1F48E}",
  "\u{1F3A8}",
  "\u{1F3B8}",
  "\u{1F381}",
  "\u{1F9E9}",
  "\u{1F6F8}",
  "\u{1F9E1}",
  "\u{1F388}",
  "\u{1F3AF}",
]

const getGridSize = (level: number) => (level === 1 ? 4 : level === 2 ? 6 : 8)

const shuffle = <T,>(items: T[]) => {
  const next = [...items]
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[next[index], next[swapIndex]] = [next[swapIndex], next[index]]
  }
  return next
}

const createDeck = (level: number): Card[] => {
  const pairs = (getGridSize(level) ** 2) / 2
  return shuffle(
    SYMBOLS.slice(0, pairs).flatMap((value, pairIndex) => [
      { id: pairIndex * 2, value, flipped: false, matched: false },
      { id: pairIndex * 2 + 1, value, flipped: false, matched: false },
    ]),
  )
}

const MemoryMatch = ({ onClose }: Props) => {
  const [level, setLevel] = useState(1)
  const [cards, setCards] = useState<Card[]>(() => createDeck(1))
  const [selected, setSelected] = useState<number[]>([])
  const [moves, setMoves] = useState(0)
  const [matchedPairs, setMatchedPairs] = useState(0)
  const [levelComplete, setLevelComplete] = useState(false)
  const [gameComplete, setGameComplete] = useState(false)
  const [bestLevel, setBestLevel] = useState(1)
  const resolveTimerRef = useRef<number | null>(null)
  const playerName = (typeof window !== "undefined" ? localStorage.getItem("userName") : null)?.trim() || "Player"

  const gridSize = getGridSize(level)
  const totalPairs = cards.length / 2
  const progress = useMemo(() => Math.round((matchedPairs / totalPairs) * 100), [matchedPairs, totalPairs])

  const startLevel = (nextLevel: number) => {
    if (resolveTimerRef.current !== null) window.clearTimeout(resolveTimerRef.current)
    setLevel(nextLevel)
    setCards(createDeck(nextLevel))
    setSelected([])
    setMoves(0)
    setMatchedPairs(0)
    setLevelComplete(false)
    setGameComplete(false)
    setBestLevel((current) => Math.max(current, nextLevel))
  }

  const handleCardClick = (index: number) => {
    if (selected.length >= 2 || cards[index].flipped || cards[index].matched) return

    const nextCards = cards.map((card, cardIndex) => (cardIndex === index ? { ...card, flipped: true } : card))
    const nextSelected = [...selected, index]
    setCards(nextCards)
    setSelected(nextSelected)

    if (nextSelected.length !== 2) return

    setMoves((current) => current + 1)
    const [firstIndex, secondIndex] = nextSelected
    const isMatch = nextCards[firstIndex].value === nextCards[secondIndex].value
    resolveTimerRef.current = window.setTimeout(() => {
      if (isMatch) {
        const matchedCards = nextCards.map((card, cardIndex) =>
          cardIndex === firstIndex || cardIndex === secondIndex ? { ...card, matched: true } : card,
        )
        const nextPairs = matchedPairs + 1
        setCards(matchedCards)
        setMatchedPairs(nextPairs)
        if (nextPairs === totalPairs) {
          setLevelComplete(true)
          if (level < 3) {
            resolveTimerRef.current = window.setTimeout(() => startLevel(level + 1), 1000)
          } else {
            setGameComplete(true)
          }
        }
      } else {
        setCards(nextCards.map((card, cardIndex) => (nextSelected.includes(cardIndex) ? { ...card, flipped: false } : card)))
      }
      setSelected([])
    }, 650)
  }

  useEffect(() => () => {
    if (resolveTimerRef.current !== null) window.clearTimeout(resolveTimerRef.current)
  }, [])

  return (
    <>
      <div
        className="sl-chat-game-backdrop"
        style={{ background: "rgba(0,0,0,0.5)", zIndex: 1570 }}
        role="presentation"
        onClick={onClose}
      />
      <section
        className="sl-chat-game-modal sl-memory-match-modal rounded-4 shadow-lg"
        style={{
          width: "min(360px, calc(100% - 16px))",
          maxHeight: "calc(100% - 24px)",
          overflowY: "auto",
          zIndex: 1571,
          background: "#171b2b",
          color: "#f2f4ff",
          border: "1px solid rgba(187,168,255,0.45)",
        }}
        role="dialog"
        aria-modal="true"
        aria-label="Memory Match game"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="d-flex align-items-center justify-content-between px-3 py-2 border-bottom border-secondary">
          <div>
            <div className="fw-semibold">Memory Match</div>
            <div className="small text-white-50">Reveal two blocks and find the matching pair</div>
          </div>
          <button type="button" className="btn btn-sm btn-outline-light" onClick={onClose} aria-label="Close game">
            {"\u00D7"}
          </button>
        </div>

        <div className="d-flex justify-content-between align-items-center px-3 py-2 small">
          <span>Level <strong>{level}</strong> · {gridSize}x{gridSize}</span>
          <span>Moves: <strong>{moves}</strong> · Best: <strong>{bestLevel}</strong></span>
        </div>
        <div className="progress mx-3 mb-3" style={{ height: 6 }} aria-label="Level progress">
          <div className="progress-bar" style={{ width: `${progress}%` }} />
        </div>

        <div
          className="d-grid mx-3 mb-3"
          style={{
            gridTemplateColumns: `repeat(${gridSize}, minmax(0, 1fr))`,
            gap: gridSize >= 8 ? 2 : 4,
          }}
        >
          {cards.map((card, index) => {
            const visible = card.flipped || card.matched
            return (
              <button
                key={card.id}
                type="button"
                aria-label={visible ? `Card ${index + 1}: ${card.value}` : `Hidden card ${index + 1}`}
                onClick={() => handleCardClick(index)}
                disabled={card.matched || selected.length >= 2}
                style={{
                  aspectRatio: "1",
                  minWidth: 0,
                  borderRadius: 9,
                  border: card.matched ? "1px solid rgba(77,220,174,0.8)" : "1px solid rgba(255,255,255,0.16)",
                  background: card.matched ? "rgba(42,181,141,0.22)" : visible ? "#31375a" : "#242a45",
                  color: visible ? "#fff" : "#9098c7",
                  fontSize: gridSize >= 8 ? "0.7rem" : "1rem",
                  cursor: card.matched || selected.length >= 2 ? "default" : "pointer",
                  transition: "transform 120ms ease, background 160ms ease",
                }}
              >
                {visible ? card.value : "?"}
              </button>
            )
          })}
        </div>

        {levelComplete && !gameComplete && (
          <div className="text-center small text-success fw-semibold mb-2" role="status">
            Level complete. Loading a harder board...
          </div>
        )}
        {gameComplete && (
          <div className="text-center small fw-semibold text-success mb-2" role="status">
            {playerName} completed Memory Match · Level {level} · {moves} moves
          </div>
        )}
        <div className="d-flex justify-content-end px-3 pb-3">
          <button type="button" className="btn btn-sm btn-outline-light" onClick={() => startLevel(1)}>
            Restart
          </button>
        </div>
      </section>
    </>
  )
}

export default MemoryMatch
