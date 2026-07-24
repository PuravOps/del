export type DailyQuoteMessageV1 = {
  v: 1
  type: "daily-quote"
  quote: string
  author?: string
  category: "love" | "couple" | "work" | "success" | "achievement" | "positivity" | "life" | "happy" | "inside"
  dateKey: string
}

export type DailyQuoteApiResponse = Pick<DailyQuoteMessageV1, "quote" | "author" | "category" | "dateKey"> & {
  source?: "gemini" | "fallback"
}

const PREFIX = "__SLQUOTE__:"
const IST_OFFSET_MINUTES = 330
const DAILY_QUOTE_HOUR_IST = 9

export const DAILY_QUOTES: Array<Pick<DailyQuoteMessageV1, "quote" | "author" | "category">> = [
  {
    quote: "Love grows in the small moments we choose each other.\n\u0AAA\u0ACD\u0AB0\u0AC7\u0AAE \u0AA8\u0ABE\u0AA8\u0AC0 \u0AAA\u0AB3\u0ACB\u0AAE\u0ABE\u0A82 \u0AB5\u0AA7\u0AC7 \u0A9B\u0AC7.",
    author: "Mira Vale",
    category: "love",
  },
  {
    quote: "Together feels special when the heart chooses the same path.\n\u0AB8\u0ABE\u0AA5\u0AC7 \u0A9A\u0ABE\u0AB2\u0AB5\u0ABE\u0AA8\u0AC0 \u0AAE\u0A9C\u0ABE \u0AA4\u0ACD\u0AAF\u0ABE\u0AB0\u0AC7, \u0A9C\u0ACD\u0AAF\u0ABE\u0AB0\u0AC7 \u0AB8\u0ABE\u0AA5 \u0A96\u0ABE\u0AB8 \u0AB9\u0ACB\u0AAF.",
    author: "Kavya Mehta",
    category: "couple",
  },
  {
    quote: "Good work becomes success when the heart stays steady.\n\u0AAE\u0AA8\u0AA5\u0AC0 \u0A95\u0AB0\u0AC7\u0AB2\u0AC1\u0A82 \u0A95\u0ABE\u0AAE \u0A9C \u0AB8\u0AAB\u0AB3\u0AA4\u0ABE \u0AAC\u0AA8\u0ABE\u0AB5\u0AC7 \u0A9B\u0AC7.",
    author: "Dhruv Shah",
    category: "work",
  },
  {
    quote: "Success is the answer to small courage repeated daily.\n\u0AB8\u0AAB\u0AB3\u0AA4\u0ABE \u0AB0\u0ACB\u0A9C\u0AA8\u0AC0 \u0AA8\u0ABE\u0AA8\u0AC0 \u0AB9\u0ABF\u0A82\u0AAE\u0AA4\u0AA8\u0ACB \u0A9C\u0AB5\u0ABE\u0AAC \u0A9B\u0AC7.",
    author: "Riya Desai",
    category: "success",
  },
  {
    quote: "Dreams come true when effort becomes bigger than excuses.\n\u0AB8\u0AAA\u0AA8\u0ABE \u0AA4\u0ACD\u0AAF\u0ABE\u0AB0\u0AC7 \u0AB8\u0ABE\u0A9A\u0ABE \u0AA5\u0ABE\u0AAF, \u0A9C\u0ACD\u0AAF\u0ABE\u0AB0\u0AC7 \u0AAA\u0ACD\u0AB0\u0AAF\u0AA4\u0ACD\u0AA8 \u0AAE\u0ACB\u0A9F\u0ABE \u0AAC\u0AA8\u0AC7.",
    author: "Aarav Trivedi",
    category: "achievement",
  },
  {
    quote: "Smile a little today; tomorrow may feel lighter.\n\u0A86\u0A9C\u0AC7 \u0AA5\u0ACB\u0AA1\u0AC1\u0A82 \u0AB9\u0AB8\u0ACB, \u0A95\u0ABE\u0AB2\u0AC7 \u0AB0\u0AB8\u0ACD\u0AA4\u0ACB \u0AB9\u0AB3\u0AB5\u0ACB \u0AB2\u0ABE\u0A97\u0AB6\u0AC7.",
    author: "Nisha Vyas",
    category: "positivity",
  },
  {
    quote: "A soft heart can still carry a strong life.\n\u0AA8\u0AB0\u0AAE \u0AA6\u0ABF\u0AB2 \u0AAA\u0AA3 \u0AAE\u0A9C\u0AAC\u0AC2\u0AA4 \u0A9C\u0AC0\u0AB5\u0AA8 \u0AB2\u0A88 \u0AB6\u0A95\u0AC7 \u0A9B\u0AC7.",
    author: "Elias Rowan",
    category: "life",
  },
  {
    quote: "A little joy today can change the shape of the whole day.\n\u0A86\u0A9C\u0AA8\u0AC0 \u0AA8\u0ABE\u0AA8\u0AC0 \u0A96\u0AC1\u0AB6\u0AC0 \u0A86\u0A96\u0ABE \u0AA6\u0ABF\u0AB5\u0AB8\u0AA8\u0AC7 \u0AAC\u0AA6\u0AB2\u0AC0 \u0AB6\u0A95\u0AC7 \u0A9B\u0AC7.",
    author: "Lena Hart",
    category: "happy",
  },
  {
    quote: "What is meant for your peace will not keep breaking you.\n\u0A9C\u0AC7 \u0AA4\u0AAE\u0ABE\u0AB0\u0AC0 \u0AB6\u0ABE\u0A82\u0AA4\u0ABF \u0AAE\u0ABE\u0A9F\u0AC7 \u0A9B\u0AC7, \u0AA4\u0AC7 \u0AA4\u0AAE\u0AA8\u0AC7 \u0AA4\u0ACB\u0AA1\u0AB6\u0AC7 \u0AA8\u0AB9\u0ABF\u0A82.",
    author: "Iris Wren",
    category: "inside",
  },
]

export const getLocalDateKey = (date = new Date()) => {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export const getIstDateParts = (date = new Date()) => {
  const shifted = new Date(date.getTime() + IST_OFFSET_MINUTES * 60 * 1000)
  return {
    dateKey: shifted.toISOString().slice(0, 10),
    hour: shifted.getUTCHours(),
  }
}

export const isDailyQuoteSendWindowIst = (date = new Date()) =>
  getIstDateParts(date).hour >= DAILY_QUOTE_HOUR_IST

export const getQuoteForDate = (dateKey = getLocalDateKey()) => {
  const seed = [...dateKey].reduce((sum, char) => sum + char.charCodeAt(0), 0)
  return DAILY_QUOTES[seed % DAILY_QUOTES.length]
}

export const encodeDailyQuoteMessage = (message: DailyQuoteMessageV1) =>
  `${PREFIX}${JSON.stringify(message)}`

export const createDailyQuoteMessage = (dateKey = getLocalDateKey()) => {
  const quote = getQuoteForDate(dateKey)
  return encodeDailyQuoteMessage({
    v: 1,
    type: "daily-quote",
    quote: quote.quote,
    author: quote.author,
    category: quote.category,
    dateKey,
  })
}

export const createDailyQuoteMessageFromQuote = (quote: DailyQuoteApiResponse) =>
  encodeDailyQuoteMessage({
    v: 1,
    type: "daily-quote",
    quote: quote.quote,
    author: quote.author,
    category: quote.category,
    dateKey: quote.dateKey,
  })

export const decodeDailyQuoteMessage = (
  raw: string,
): { kind: "quote"; value: DailyQuoteMessageV1 } | { kind: "plain" } => {
  if (!raw.startsWith(PREFIX)) return { kind: "plain" }

  try {
    const parsed = JSON.parse(raw.slice(PREFIX.length)) as DailyQuoteMessageV1
    if (
      parsed?.v !== 1 ||
      parsed.type !== "daily-quote" ||
      typeof parsed.quote !== "string" ||
      !parsed.quote.trim()
    ) {
      return { kind: "plain" }
    }
    return { kind: "quote", value: parsed }
  } catch {
    return { kind: "plain" }
  }
}
