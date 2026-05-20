export type PrivateNote = {
  id: string
  heading: string
  content: string
  createdAt: string
  updatedAt: string
  reminderAt?: string | null
  reminderSnoozedUntil?: string | null
  reminderLastNotifiedAt?: string | null
}

export type PrivateNotesVaultData = {
  notes: PrivateNote[]
}

export type PrivateNotesResponse = {
  ownerPhone?: string
  targetUserPhone?: string
  notes: PrivateNote[]
  createdAt?: string
  updatedAt?: string
}
