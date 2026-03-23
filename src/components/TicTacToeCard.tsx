import React, { useMemo, useEffect, useState } from "react"

type Cell = "" | "X" | "O"

interface Player {
  id: string
  name: string
}

interface Props {
  gameId: string
  players: { sender: Player; receiver: Player }
  board?: Cell[] // length 9
  currentTurn?: "sender" | "receiver"
  // callbacks: host app should wire these to the shared backing (socket/API)
  onMove?: (gameId: string, index: number) => void
  onRematch?: (gameId: string) => void
  className?: string
}

const defaultBoard: Cell[] = ["", "", "", "", "", "", "", "", ""]

function getWinner(b: Cell[]) {
  const lines = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
  ]
  for (const [a, b2, c] of lines) {
    if (b[a] && b[a] === b[b2] && b[a] === b[c]) return b[a]
  }
  if (b.every((c) => c !== "")) return "draw"
  return null
}

const TicTacToeCard: React.FC<Props> = ({
  gameId,
  players,
  board = defaultBoard,
  currentTurn = "sender",
  onMove,
  onRematch,
  className,
}) => {
  const normalizedBoard = useMemo<Cell[]>(() => {
    const src = Array.isArray(board) ? board : defaultBoard
    return Array.from({ length: 9 }, (_, i) => {
      const v = src[i]
      return v === "X" || v === "O" ? v : ""
    })
  }, [board])

  // mapping: sender -> X, receiver -> O
  const myPhone = typeof window !== "undefined" ? localStorage.getItem("userPhone") : null
  const normalizeId = (v: string) => v.trim().replace(/[^\d+]/g, "")
  const toDigits = (v: string) => v.replace(/\D/g, "")
  const isSameUserId = (a: string, b: string) => {
    if (a === b) return true
    const an = normalizeId(a)
    const bn = normalizeId(b)
    if (an === bn) return true
    const ad = toDigits(an)
    const bd = toDigits(bn)
    if (ad && bd && ad === bd) return true
    // last-10 fallback (common for phone numbers with/without country code)
    if (ad.length >= 10 && bd.length >= 10 && ad.slice(-10) === bd.slice(-10)) return true
    return false
  }

  const senderMatch = myPhone ? isSameUserId(myPhone, players.sender.id) : false
  const receiverMatch = myPhone ? isSameUserId(myPhone, players.receiver.id) : false
  const myRole: "sender" | "receiver" | null =
    !myPhone ? null : senderMatch && !receiverMatch ? "sender" : receiverMatch && !senderMatch ? "receiver" : null

  const winner = useMemo(() => getWinner(normalizedBoard), [normalizedBoard])
  const [winFxNonce, setWinFxNonce] = useState(0)

  useEffect(() => {
    if (winner === "X" || winner === "O") {
      setWinFxNonce((n) => n + 1)
    }
  }, [winner])

  useEffect(() => {
    // small accessibility: announce turn changes (host app should do better i18n)
    if (typeof window !== "undefined") {
      const el = document.getElementById(`t3-${gameId}`)
      if (el) el.setAttribute("aria-live", "polite")
    }
  }, [currentTurn, gameId])

  const handleCell = (i: number) => {
    if (winner) return
    if (normalizedBoard[i] !== "") return
    // If we can't confidently determine the role (phone formats vary), don't block clicks;
    // the server remains authoritative and will accept only the correct turn.
    if (myRole && myRole !== currentTurn) return
    onMove?.(gameId, i)
  }

  const labelFor = (sym: Cell) => {
    if (sym === "X") return players.sender.name
    if (sym === "O") return players.receiver.name
    return ""
  }

  const statusText = (() => {
    if (winner === "draw") return "Game over · Tie"
    if (winner === "X") return `Winner is ${players.sender.name}`
    if (winner === "O") return `Winner is ${players.receiver.name}`
    if (!myRole) return currentTurn === "sender" ? `${players.sender.name}'s turn` : `${players.receiver.name}'s turn`
    return currentTurn === "sender" ? `${players.sender.name}'s turn` : `${players.receiver.name}'s turn`
  })()

  const winnerSide = winner === "X" ? "sender" : winner === "O" ? "receiver" : null
  const winnerName = winner === "X" ? players.sender.name : winner === "O" ? players.receiver.name : null

  return (
    <div
      id={`t3-${gameId}`}
      className={className}
      style={{
        display: "flex",
        justifyContent: "center",
        width: "100%",
        padding: "8px 0",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 360,
          background: "var(--bs-body-bg, #f8f9fa)",
          border: "1px solid rgba(0,0,0,0.06)",
          borderRadius: 12,
          boxShadow: "0 1px 6px rgba(0,0,0,0.06)",
          padding: 10,
          margin: "0 12px",
        }}
        role="group"
        aria-label="Tic-Tac-Toe game card"
      >
        <style>{`
          @keyframes t3-shake {
            0%, 100% { transform: translateX(0); }
            20% { transform: translateX(-2px) rotate(-1deg); }
            40% { transform: translateX(2px) rotate(1deg); }
            60% { transform: translateX(-2px) rotate(-1deg); }
            80% { transform: translateX(2px) rotate(1deg); }
          }
          @keyframes t3-star-pop {
            0% { transform: translateY(0) scale(0.4) rotate(0deg); opacity: 0; }
            20% { opacity: 1; }
            100% { transform: translateY(-14px) scale(1.2) rotate(30deg); opacity: 0; }
          }
        `}</style>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: "0.95rem", whiteSpace: "nowrap" }}>
              Tic-Tac-Toe
            </div>
            <div style={{ color: "#6c757d", fontSize: "0.82rem", whiteSpace: "nowrap" }}>
              {`\u00B7 Game`}
            </div>
          </div>

          <div
            style={{
              fontSize: 12,
              color: winner ? "#212529" : "#6c757d",
              fontWeight: 600,
              textAlign: "right",
              whiteSpace: "nowrap",
            }}
          >
            {statusText}
          </div>
        </div>

        {winnerSide && winnerName && (
          <div
            style={{
              marginTop: 8,
              padding: "8px 10px",
              borderRadius: 10,
              background: "#d1e7dd",
              border: "1px solid rgba(25,135,84,0.25)",
              color: "#0f5132",
              fontWeight: 700,
            }}
            role="status"
            aria-live="polite"
          >
            Winner is {winnerName}
          </div>
        )}

        {winner === "draw" && (
          <div
            style={{
              marginTop: 8,
              padding: "8px 10px",
              borderRadius: 10,
              background: "#e2e3e5",
              border: "1px solid rgba(108,117,125,0.25)",
              color: "#212529",
              fontWeight: 700,
            }}
            role="status"
            aria-live="polite"
          >
            Game over · Tie
          </div>
        )}


          <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              key={winnerSide === "sender" ? `sender-${winFxNonce}` : "sender"}
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                background: "#e9ecef",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 12,
                fontWeight: 600,
                position: "relative",
                animation: winnerSide === "sender" ? "t3-shake 0.6s ease-in-out 0s 2" : undefined,
              }}
              title={players.sender.name}
            >
              {players.sender.name.slice(0, 1).toUpperCase()}
              {winnerSide === "sender" && (
                <>
                  <span
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      top: -10,
                      left: -6,
                      color: "#ffc107",
                      fontSize: 12,
                      textShadow: "0 1px 0 rgba(0,0,0,0.15)",
                      animation: "t3-star-pop 700ms ease-out 0ms forwards",
                      opacity: 0,
                    }}
                  >
                    {"\u2605"}
                  </span>
                  <span
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      top: -12,
                      right: -8,
                      color: "#ffc107",
                      fontSize: 12,
                      textShadow: "0 1px 0 rgba(0,0,0,0.15)",
                      animation: "t3-star-pop 700ms ease-out 80ms forwards",
                      opacity: 0,
                    }}
                  >
                    {"\u2605"}
                  </span>
                  <span
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      bottom: -12,
                      left: -10,
                      color: "#ffc107",
                      fontSize: 12,
                      textShadow: "0 1px 0 rgba(0,0,0,0.15)",
                      animation: "t3-star-pop 700ms ease-out 120ms forwards",
                      opacity: 0,
                    }}
                  >
                    {"\u2605"}
                  </span>
                  <span
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      bottom: -10,
                      right: -6,
                      color: "#ffc107",
                      fontSize: 12,
                      textShadow: "0 1px 0 rgba(0,0,0,0.15)",
                      animation: "t3-star-pop 700ms ease-out 40ms forwards",
                      opacity: 0,
                    }}
                  >
                    {"\u2605"}
                  </span>
                </>
              )}
            </div>
            <div style={{ fontSize: 12 }}>{players.sender.name}</div>
            <div style={{ marginLeft: 6, color: "#6c757d", fontSize: 12 }}>X</div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              key={winnerSide === "receiver" ? `receiver-${winFxNonce}` : "receiver"}
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                background: "#e9ecef",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 12,
                fontWeight: 600,
                position: "relative",
                animation: winnerSide === "receiver" ? "t3-shake 0.6s ease-in-out 0s 2" : undefined,
              }}
              title={players.receiver.name}
            >
              {players.receiver.name.slice(0, 1).toUpperCase()}
              {winnerSide === "receiver" && (
                <>
                  <span
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      top: -10,
                      left: -6,
                      color: "#ffc107",
                      fontSize: 12,
                      textShadow: "0 1px 0 rgba(0,0,0,0.15)",
                      animation: "t3-star-pop 700ms ease-out 0ms forwards",
                      opacity: 0,
                    }}
                  >
                    {"\u2605"}
                  </span>
                  <span
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      top: -12,
                      right: -8,
                      color: "#ffc107",
                      fontSize: 12,
                      textShadow: "0 1px 0 rgba(0,0,0,0.15)",
                      animation: "t3-star-pop 700ms ease-out 80ms forwards",
                      opacity: 0,
                    }}
                  >
                    {"\u2605"}
                  </span>
                  <span
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      bottom: -12,
                      left: -10,
                      color: "#ffc107",
                      fontSize: 12,
                      textShadow: "0 1px 0 rgba(0,0,0,0.15)",
                      animation: "t3-star-pop 700ms ease-out 120ms forwards",
                      opacity: 0,
                    }}
                  >
                    {"\u2605"}
                  </span>
                  <span
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      bottom: -10,
                      right: -6,
                      color: "#ffc107",
                      fontSize: 12,
                      textShadow: "0 1px 0 rgba(0,0,0,0.15)",
                      animation: "t3-star-pop 700ms ease-out 40ms forwards",
                      opacity: 0,
                    }}
                  >
                    {"\u2605"}
                  </span>
                </>
              )}
            </div>
            <div style={{ fontSize: 12 }}>{players.receiver.name}</div>
            <div style={{ marginLeft: 6, color: "#6c757d", fontSize: 12 }}>O</div>
          </div>
        </div>

        <div style={{ marginTop: 8, display: "flex", justifyContent: "center" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 6,
              width: 200,
              touchAction: "manipulation",
            }}
          >
            {Array.from({ length: 9 }).map((_, i) => (
              <button
                key={i}
                onClick={() => handleCell(i)}
                aria-label={`Cell ${i + 1}`}
                disabled={
                  Boolean(winner) ||
                  normalizedBoard[i] !== "" ||
                  (Boolean(myRole) && myRole !== currentTurn)
                }
                style={{
                  aspectRatio: "1 / 1",
                  borderRadius: 7,
                  border: "1px solid rgba(0,0,0,0.06)",
                  background: normalizedBoard[i]
                    ? normalizedBoard[i] === "X"
                      ? "#0d6efd"
                      : "#6c757d"
                    : "#fff",
                  color: normalizedBoard[i] ? "#fff" : "#212529",
                  fontSize: 18,
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 0,
                  cursor:
                    Boolean(winner) ||
                    normalizedBoard[i] !== "" ||
                    (Boolean(myRole) && myRole !== currentTurn)
                      ? "not-allowed"
                      : "pointer",
                  opacity:
                    Boolean(winner) ||
                    normalizedBoard[i] !== "" ||
                    (Boolean(myRole) && myRole !== currentTurn)
                      ? 0.7
                      : 1,
                }}
              >
                {normalizedBoard[i]}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 8, display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => onRematch?.(gameId)}
              style={{
                border: "1px solid rgba(0,0,0,0.08)",
                background: "transparent",
                padding: "6px 10px",
                borderRadius: 8,
                fontSize: 13,
              }}
            >
              Rematch
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default TicTacToeCard
