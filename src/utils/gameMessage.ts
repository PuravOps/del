export type GameCell = "" | "X" | "O"

export type TicTacToePayloadV1 = {
  v: 1
  type: "tictactoe"
  gameId: string
  board: GameCell[]
  currentTurn: "sender" | "receiver"
  players: { sender: { id: string; name: string }; receiver: { id: string; name: string } }
}

const PREFIX = "__SLGAME__:"

export const encodeGameMessage = (msg: TicTacToePayloadV1) => `${PREFIX}${JSON.stringify(msg)}`

export const decodeGameMessage = (
  raw: string,
): { kind: "game"; value: TicTacToePayloadV1 } | { kind: "plain"; value: string } => {
  if (!raw.startsWith(PREFIX)) return { kind: "plain", value: raw }
  try {
    const json = raw.slice(PREFIX.length)
    const parsed = JSON.parse(json) as TicTacToePayloadV1
    if (!parsed || parsed.v !== 1 || parsed.type !== "tictactoe") return { kind: "plain", value: raw }
    return { kind: "game", value: parsed }
  } catch {
    return { kind: "plain", value: raw }
  }
}
