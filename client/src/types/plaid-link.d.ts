interface PlaidMetadata {
  institution?: { institution_id: string; name: string } | null
}

interface PlaidHandler {
  open: () => void
  destroy: () => void
}

declare const Plaid: {
  create(config: {
    token: string
    onSuccess: (publicToken: string, metadata: PlaidMetadata) => void
    onExit: () => void
  }): PlaidHandler
}
