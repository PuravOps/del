declare module "twemoji-parser" {
  export type TwemojiEntity = {
    url: string
    text: string
    indices: [number, number]
  }

  export type ParseOptions = {
    assetType?: "png" | "svg"
  }

  export function parse(text: string, options?: ParseOptions): TwemojiEntity[]
}

