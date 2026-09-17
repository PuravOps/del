import { useMemo, useState } from "react"

type Props = {
  onClose: () => void
}

const SOLUTION = [
  [5, 3, 4, 6, 7, 8, 9, 1, 2],
  [6, 7, 2, 1, 9, 5, 3, 4, 8],
  [1, 9, 8, 3, 4, 2, 5, 6, 7],
  [8, 5, 9, 7, 6, 1, 4, 2, 3],
  [4, 2, 6, 8, 5, 3, 7, 9, 1],
  [7, 1, 3, 9, 2, 4, 8, 5, 6],
  [9, 6, 1, 5, 3, 7, 2, 8, 4],
  [2, 8, 7, 4, 1, 9, 6, 3, 5],
  [3, 4, 5, 2, 8, 6, 1, 7, 9],
]

const PUZZLE = [
  [5, 3, 0, 0, 7, 0, 0, 0, 0],
  [6, 0, 0, 1, 9, 5, 0, 0, 0],
  [0, 9, 8, 0, 0, 0, 0, 6, 0],
  [8, 0, 0, 0, 6, 0, 0, 0, 3],
  [4, 0, 0, 8, 0, 3, 0, 0, 1],
  [7, 0, 0, 0, 2, 0, 0, 0, 6],
  [0, 6, 0, 0, 0, 0, 2, 8, 0],
  [0, 0, 0, 4, 1, 9, 0, 0, 5],
  [0, 0, 0, 0, 8, 0, 0, 7, 9],
]

const clonePuzzle = () => PUZZLE.map((row) => [...row])

const Sudoku = ({ onClose }: Props) => {
  const [board, setBoard] = useState<number[][]>(() => clonePuzzle())
  const [mistakes, setMistakes] = useState(0)
  const [complete, setComplete] = useState(false)
  const playerName = useMemo(
    () => (localStorage.getItem("userName") ?? "Player").trim() || "Player",
    [],
  )

  const reset = () => {
    setBoard(clonePuzzle())
    setMistakes(0)
    setComplete(false)
  }

  const setCell = (row: number, column: number, value: number) => {
    if (PUZZLE[row][column] !== 0 || complete) return
    const next = board.map((currentRow) => [...currentRow])
    next[row][column] = value
    setBoard(next)

    if (value !== SOLUTION[row][column]) {
      setMistakes((current) => current + 1)
      return
    }

    if (next.every((currentRow, rowIndex) => currentRow.every((cell, columnIndex) => cell === SOLUTION[rowIndex][columnIndex]))) {
      setComplete(true)
    }
  }

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
          width: "min(560px, calc(100% - 24px))",
          maxHeight: "calc(100% - 24px)",
          overflowY: "auto",
          zIndex: 1571,
          background: "#19232a",
          color: "#eaf7ef",
          border: "1px solid rgba(112,210,155,0.45)",
        }}
        role="dialog"
        aria-modal="true"
        aria-label="Sudoku game"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="d-flex align-items-center justify-content-between px-3 py-2 border-bottom border-secondary">
          <div>
            <div className="fw-semibold">Sudoku</div>
            <div className="small text-white-50">Fill every row, column, and 3x3 box</div>
          </div>
          <button type="button" className="btn btn-sm btn-outline-light" onClick={onClose} aria-label="Close game">
            {"\u00D7"}
          </button>
        </div>

        <div className="d-flex justify-content-between px-3 py-2 small">
          <span>Player: <strong>{playerName}</strong></span>
          <span>Mistakes: <strong>{mistakes}</strong></span>
        </div>

        <div className="d-grid mx-auto mb-3" style={{ gridTemplateColumns: "repeat(9, minmax(0, 1fr))", width: "min(430px, calc(100% - 32px))", border: "2px solid #70d29b" }}>
          {board.flatMap((row, rowIndex) =>
            row.map((value, columnIndex) => {
              const fixed = PUZZLE[rowIndex][columnIndex] !== 0
              const boxBorderRight = columnIndex === 2 || columnIndex === 5 ? "2px solid #70d29b" : "1px solid rgba(255,255,255,0.15)"
              const boxBorderBottom = rowIndex === 2 || rowIndex === 5 ? "2px solid #70d29b" : "1px solid rgba(255,255,255,0.15)"
              return (
                <select
                  key={`${rowIndex}-${columnIndex}`}
                  aria-label={`Row ${rowIndex + 1}, column ${columnIndex + 1}`}
                  value={value || ""}
                  disabled={fixed || complete}
                  onChange={(event) => setCell(rowIndex, columnIndex, Number(event.target.value))}
                  style={{
                    width: "100%",
                    aspectRatio: "1",
                    textAlign: "center",
                    textAlignLast: "center",
                    padding: 0,
                    color: fixed ? "#eaf7ef" : "#8ee8b2",
                    background: fixed ? "#26363e" : "#101a20",
                    border: 0,
                    borderRight: boxBorderRight,
                    borderBottom: boxBorderBottom,
                    fontWeight: fixed ? 700 : 600,
                    fontSize: "clamp(0.85rem, 3vw, 1.2rem)",
                  }}
                >
                  <option value=""> </option>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((number) => <option key={number} value={number}>{number}</option>)}
                </select>
              )
            }),
          )}
        </div>

        {complete && (
          <div className="text-center small fw-semibold text-success mb-2" role="status">
            {playerName} solved Sudoku with {mistakes} mistake{mistakes === 1 ? "" : "s"}.
          </div>
        )}
        <div className="d-flex justify-content-end px-3 pb-3">
          <button type="button" className="btn btn-sm btn-outline-light" onClick={reset}>Restart</button>
        </div>
      </section>
    </>
  )
}

export default Sudoku
