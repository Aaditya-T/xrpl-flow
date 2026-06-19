export type FieldType = 'text' | 'number' | 'drops' | 'address' | 'hex' | 'boolean' | 'select' | 'textarea';

export interface FieldDef {
  name: string;
  label: string;
  type: FieldType;
  required: boolean;
  defaultValue?: any;
  options?: string[];
  description?: string;
}

export interface NodeTypeDef {
  id: string;
  label: string;
  category: string;
  color: string;
  networkGating: 'all' | 'devnet-only';
  description: string;
  fields: FieldDef[];
}

export const CATEGORIES: Record<string, { name: string; color: string }> = {
  TRIGGERS:            { name: 'Triggers',            color: '#6366f1' },
  ACCOUNT_MANAGEMENT:  { name: 'Account Management',  color: '#64748b' },
  PAYMENTS:            { name: 'Payments & Channels',  color: '#10b981' },
  DEX:                 { name: 'DEX / Offers',         color: '#f59e0b' },
  AMM:                 { name: 'AMM',                  color: '#f97316' },
  MPTS:                { name: 'MPTs',                 color: '#8b5cf6' },
  CREDENTIALS:         { name: 'Credentials',          color: '#06b6d4' },
  PERMISSIONED_DOMAINS:{ name: 'Permissioned Domains', color: '#14b8a6' },
  DIDS:                { name: 'DIDs',                 color: '#ec4899' },
  PRICE_ORACLES:       { name: 'Price Oracles',        color: '#eab308' },
  NFTS:                { name: 'NFTs',                 color: '#f43f5e' },
  CHECKS:              { name: 'Checks',               color: '#0ea5e9' },
  VAULTS:              { name: 'Vaults',               color: '#84cc16' },
  LENDING:             { name: 'Lending Protocol',     color: '#d946ef' },
  BATCH:               { name: 'Batch',                color: '#ef4444' },
  CONTROL_FLOW:        { name: 'Control Flow',         color: '#6b7280' },
  OUTPUT:              { name: 'Output',               color: '#374151' },
};

const addr = (name: string, label: string, req = true): FieldDef =>
  ({ name, label, type: 'address', required: req });
const txt = (name: string, label: string, req = false, desc?: string): FieldDef =>
  ({ name, label, type: 'text', required: req, description: desc });
const num = (name: string, label: string, req = false): FieldDef =>
  ({ name, label, type: 'number', required: req });
const hex = (name: string, label: string, req = false): FieldDef =>
  ({ name, label, type: 'hex', required: req });
const drops = (name: string, label: string, req = false): FieldDef =>
  ({ name, label, type: 'drops', required: req });
const bool = (name: string, label: string): FieldDef =>
  ({ name, label, type: 'boolean', required: false });
const flags = (): FieldDef => num('Flags', 'Flags');

export const NODE_REGISTRY: NodeTypeDef[] = [
  // ── Triggers ────────────────────────────────────────────────────────────
  {
    id: 'ManualTrigger', label: 'Manual Trigger',
    category: 'Triggers', color: CATEGORIES.TRIGGERS.color,
    networkGating: 'all', description: 'Start a workflow manually.',
    fields: []
  },
  {
    id: 'AccountEventTrigger', label: 'Account Event',
    category: 'Triggers', color: CATEGORIES.TRIGGERS.color,
    networkGating: 'all', description: 'Trigger on incoming txns for an address.',
    fields: [addr('WatchAddress', 'Watch Address')]
  },

  // ── Account Management ──────────────────────────────────────────────────
  {
    id: 'AccountSet', label: 'AccountSet',
    category: 'Account Management', color: CATEGORIES.ACCOUNT_MANAGEMENT.color,
    networkGating: 'all', description: 'Modify account properties.',
    fields: [
      addr('Account', 'Account'),
      txt('Domain', 'Domain (hex-encoded)'), txt('EmailHash', 'Email Hash (hex)'),
      txt('MessageKey', 'Message Key'), num('TransferRate', 'Transfer Rate'),
      num('TickSize', 'Tick Size'), flags(),
    ]
  },
  {
    id: 'AccountDelete', label: 'AccountDelete',
    category: 'Account Management', color: CATEGORIES.ACCOUNT_MANAGEMENT.color,
    networkGating: 'all', description: 'Delete an account from the ledger.',
    fields: [
      addr('Account', 'Account'), addr('Destination', 'Destination'),
      num('DestinationTag', 'Destination Tag'),
    ]
  },
  {
    id: 'SetRegularKey', label: 'SetRegularKey',
    category: 'Account Management', color: CATEGORIES.ACCOUNT_MANAGEMENT.color,
    networkGating: 'all', description: 'Assign or remove a regular key pair.',
    fields: [addr('Account', 'Account'), addr('RegularKey', 'Regular Key', false)]
  },
  {
    id: 'SignerListSet', label: 'SignerListSet',
    category: 'Account Management', color: CATEGORIES.ACCOUNT_MANAGEMENT.color,
    networkGating: 'all', description: 'Set up multi-signing signer list.',
    fields: [
      addr('Account', 'Account'),
      num('SignerQuorum', 'Signer Quorum', true),
      { name: 'SignerEntries', label: 'Signer Entries (JSON)', type: 'textarea', required: false,
        description: '[{"SignerEntry":{"Account":"r...","SignerWeight":1}}]' },
    ]
  },
  {
    id: 'DepositPreauth', label: 'DepositPreauth',
    category: 'Account Management', color: CATEGORIES.ACCOUNT_MANAGEMENT.color,
    networkGating: 'all', description: 'Pre-authorize an account to send payments.',
    fields: [
      addr('Account', 'Account'),
      addr('Authorize', 'Authorize', false),
      addr('Unauthorize', 'Unauthorize', false),
    ]
  },
  {
    id: 'TicketCreate', label: 'TicketCreate',
    category: 'Account Management', color: CATEGORIES.ACCOUNT_MANAGEMENT.color,
    networkGating: 'all', description: 'Reserve sequence numbers for later.',
    fields: [addr('Account', 'Account'), num('TicketCount', 'Ticket Count', true)]
  },

  // ── Payments & Channels ─────────────────────────────────────────────────
  {
    id: 'Payment', label: 'Payment',
    category: 'Payments & Channels', color: CATEGORIES.PAYMENTS.color,
    networkGating: 'all', description: 'Send XRP, tokens, or MPTs.',
    fields: [
      addr('Account', 'Sender'), addr('Destination', 'Destination'),
      txt('Amount', 'Amount', true, 'drops or token object'),
      num('DestinationTag', 'Destination Tag'),
      { name: 'Memos', label: 'Memos', type: 'textarea', required: false },
      drops('Fee', 'Fee (drops)'),
    ]
  },
  {
    id: 'EscrowCreate', label: 'EscrowCreate',
    category: 'Payments & Channels', color: CATEGORIES.PAYMENTS.color,
    networkGating: 'all', description: 'Create an escrow lock on XRP.',
    fields: [
      addr('Account', 'Account'), addr('Destination', 'Destination'),
      drops('Amount', 'Amount (drops)', true),
      num('FinishAfter', 'Finish After (Ripple Epoch)'),
      num('CancelAfter', 'Cancel After (Ripple Epoch)'),
      hex('Condition', 'Condition'),
    ]
  },
  {
    id: 'EscrowFinish', label: 'EscrowFinish',
    category: 'Payments & Channels', color: CATEGORIES.PAYMENTS.color,
    networkGating: 'all', description: 'Release escrowed XRP.',
    fields: [
      addr('Account', 'Account'), addr('Owner', 'Owner'),
      num('OfferSequence', 'Offer Sequence', true),
      hex('Condition', 'Condition'), hex('Fulfillment', 'Fulfillment'),
    ]
  },
  {
    id: 'EscrowCancel', label: 'EscrowCancel',
    category: 'Payments & Channels', color: CATEGORIES.PAYMENTS.color,
    networkGating: 'all', description: 'Cancel an expired escrow.',
    fields: [
      addr('Account', 'Account'), addr('Owner', 'Owner'),
      num('OfferSequence', 'Offer Sequence', true),
    ]
  },
  {
    id: 'PaymentChannelCreate', label: 'PaymentChannelCreate',
    category: 'Payments & Channels', color: CATEGORIES.PAYMENTS.color,
    networkGating: 'all', description: 'Open a payment channel.',
    fields: [
      addr('Account', 'Account'), addr('Destination', 'Destination'),
      drops('Amount', 'Amount (drops)', true),
      num('SettleDelay', 'Settle Delay (seconds)', true),
      hex('PublicKey', 'Public Key', true),
      num('CancelAfter', 'Cancel After (Ripple Epoch)'),
      num('DestinationTag', 'Destination Tag'),
    ]
  },
  {
    id: 'PaymentChannelFund', label: 'PaymentChannelFund',
    category: 'Payments & Channels', color: CATEGORIES.PAYMENTS.color,
    networkGating: 'all', description: 'Add XRP to a payment channel.',
    fields: [
      addr('Account', 'Account'),
      hex('Channel', 'Channel (hex)', true),
      drops('Amount', 'Amount (drops)', true),
      num('Expiration', 'Expiration'),
    ]
  },
  {
    id: 'PaymentChannelClaim', label: 'PaymentChannelClaim',
    category: 'Payments & Channels', color: CATEGORIES.PAYMENTS.color,
    networkGating: 'all', description: 'Claim XRP from a payment channel.',
    fields: [
      addr('Account', 'Account'),
      hex('Channel', 'Channel (hex)', true),
      drops('Balance', 'Balance (drops)'),
      drops('Amount', 'Amount (drops)'),
      hex('Signature', 'Signature'), hex('PublicKey', 'Public Key'),
      flags(),
    ]
  },

  // ── DEX / Offers ────────────────────────────────────────────────────────
  {
    id: 'TrustSet', label: 'TrustSet',
    category: 'DEX / Offers', color: CATEGORIES.DEX.color,
    networkGating: 'all', description: 'Create or modify a trust line.',
    fields: [
      addr('Account', 'Account'),
      txt('LimitAmount_currency', 'Currency', true),
      addr('LimitAmount_issuer', 'Issuer', true),
      txt('LimitAmount_value', 'Value', true),
      num('QualityIn', 'Quality In'), num('QualityOut', 'Quality Out'),
    ]
  },
  {
    id: 'OfferCreate', label: 'OfferCreate',
    category: 'DEX / Offers', color: CATEGORIES.DEX.color,
    networkGating: 'all', description: 'Place a limit order on the DEX.',
    fields: [
      addr('Account', 'Account'),
      txt('TakerPays', 'Taker Pays', true, 'drops or amount/currency/issuer'),
      txt('TakerGets', 'Taker Gets', true),
      num('Expiration', 'Expiration'), num('OfferSequence', 'Offer Sequence'),
    ]
  },
  {
    id: 'OfferCancel', label: 'OfferCancel',
    category: 'DEX / Offers', color: CATEGORIES.DEX.color,
    networkGating: 'all', description: 'Cancel an existing offer.',
    fields: [addr('Account', 'Account'), num('OfferSequence', 'Offer Sequence', true)]
  },
  {
    id: 'Clawback', label: 'Clawback',
    category: 'DEX / Offers', color: CATEGORIES.DEX.color,
    networkGating: 'all', description: 'Issuer claws back tokens from a holder.',
    fields: [
      addr('Account', 'Account (Issuer)'),
      txt('Amount', 'Amount', true, 'token amount object (currency/issuer/value)'),
    ]
  },

  // ── AMM ─────────────────────────────────────────────────────────────────
  {
    id: 'AMMCreate', label: 'AMMCreate',
    category: 'AMM', color: CATEGORIES.AMM.color,
    networkGating: 'all', description: 'Create a new AMM pool.',
    fields: [
      addr('Account', 'Account'),
      txt('Amount', 'Amount', true), txt('Amount2', 'Amount 2', true),
      num('TradingFee', 'Trading Fee', true),
    ]
  },
  {
    id: 'AMMDeposit', label: 'AMMDeposit',
    category: 'AMM', color: CATEGORIES.AMM.color,
    networkGating: 'all', description: 'Deposit assets into an AMM.',
    fields: [
      addr('Account', 'Account'),
      txt('Asset', 'Asset', true, 'currency/issuer or XRP'),
      txt('Asset2', 'Asset 2', true),
      txt('Amount', 'Amount'), txt('Amount2', 'Amount 2'),
      txt('LPTokenOut', 'LP Token Out'), txt('EPrice', 'EPrice'), flags(),
    ]
  },
  {
    id: 'AMMWithdraw', label: 'AMMWithdraw',
    category: 'AMM', color: CATEGORIES.AMM.color,
    networkGating: 'all', description: 'Withdraw assets from an AMM.',
    fields: [
      addr('Account', 'Account'),
      txt('Asset', 'Asset', true), txt('Asset2', 'Asset 2', true),
      txt('Amount', 'Amount'), txt('Amount2', 'Amount 2'),
      txt('LPTokenIn', 'LP Token In'), txt('EPrice', 'EPrice'), flags(),
    ]
  },
  {
    id: 'AMMVote', label: 'AMMVote',
    category: 'AMM', color: CATEGORIES.AMM.color,
    networkGating: 'all', description: 'Vote on AMM trading fees.',
    fields: [
      addr('Account', 'Account'),
      txt('Asset', 'Asset', true), txt('Asset2', 'Asset 2', true),
      num('TradingFee', 'Trading Fee', true),
    ]
  },
  {
    id: 'AMMBid', label: 'AMMBid',
    category: 'AMM', color: CATEGORIES.AMM.color,
    networkGating: 'all', description: 'Bid on the AMM auction slot.',
    fields: [
      addr('Account', 'Account'),
      txt('Asset', 'Asset', true), txt('Asset2', 'Asset 2', true),
      txt('BidMin', 'Bid Min'), txt('BidMax', 'Bid Max'),
      { name: 'AuthAccounts', label: 'Auth Accounts (JSON array)', type: 'textarea', required: false },
    ]
  },
  {
    id: 'AMMDelete', label: 'AMMDelete',
    category: 'AMM', color: CATEGORIES.AMM.color,
    networkGating: 'all', description: 'Delete an empty AMM instance.',
    fields: [addr('Account', 'Account'), txt('Asset', 'Asset', true), txt('Asset2', 'Asset 2', true)]
  },
  {
    id: 'AMMClawback', label: 'AMMClawback',
    category: 'AMM', color: CATEGORIES.AMM.color,
    networkGating: 'all', description: 'Claw back tokens from an AMM pool.',
    fields: [
      addr('Account', 'Account (Issuer)'),
      addr('Holder', 'Holder', true),
      txt('Asset', 'Asset', true), txt('Asset2', 'Asset 2', true),
      txt('Amount', 'Amount'),
    ]
  },

  // ── MPTs ────────────────────────────────────────────────────────────────
  {
    id: 'MPTokenIssuanceCreate', label: 'MPTokenIssuanceCreate',
    category: 'MPTs', color: CATEGORIES.MPTS.color,
    networkGating: 'all', description: 'Define a new Multi-Purpose Token.',
    fields: [
      addr('Account', 'Account'),
      num('AssetScale', 'Asset Scale'), num('TransferFee', 'Transfer Fee'),
      txt('MaximumAmount', 'Maximum Amount'),
      hex('MPTokenMetadata', 'MPToken Metadata'), flags(),
    ]
  },
  {
    id: 'MPTokenIssuanceDestroy', label: 'MPTokenIssuanceDestroy',
    category: 'MPTs', color: CATEGORIES.MPTS.color,
    networkGating: 'all', description: 'Delete an MPT definition.',
    fields: [addr('Account', 'Account'), hex('MPTokenIssuanceID', 'Issuance ID', true)]
  },
  {
    id: 'MPTokenIssuanceSet', label: 'MPTokenIssuanceSet',
    category: 'MPTs', color: CATEGORIES.MPTS.color,
    networkGating: 'all', description: 'Set mutable MPT properties.',
    fields: [
      addr('Account', 'Account'),
      hex('MPTokenIssuanceID', 'Issuance ID', true),
      addr('MPTokenHolder', 'MPToken Holder', false), flags(),
    ]
  },
  {
    id: 'MPTokenAuthorize', label: 'MPTokenAuthorize',
    category: 'MPTs', color: CATEGORIES.MPTS.color,
    networkGating: 'all', description: 'Authorize to hold an MPT.',
    fields: [
      addr('Account', 'Account'),
      hex('MPTokenIssuanceID', 'Issuance ID', true),
      addr('Holder', 'Holder', false), flags(),
    ]
  },

  // ── Credentials ─────────────────────────────────────────────────────────
  {
    id: 'CredentialCreate', label: 'CredentialCreate',
    category: 'Credentials', color: CATEGORIES.CREDENTIALS.color,
    networkGating: 'all', description: 'Issue a credential.',
    fields: [
      addr('Account', 'Account (Issuer)'), addr('Subject', 'Subject'),
      hex('CredentialType', 'Credential Type', true),
      num('Expiration', 'Expiration'), txt('URI', 'URI'),
    ]
  },
  {
    id: 'CredentialAccept', label: 'CredentialAccept',
    category: 'Credentials', color: CATEGORIES.CREDENTIALS.color,
    networkGating: 'all', description: 'Accept a credential.',
    fields: [
      addr('Account', 'Account (Subject)'), addr('Issuer', 'Issuer'),
      hex('CredentialType', 'Credential Type', true),
    ]
  },
  {
    id: 'CredentialDelete', label: 'CredentialDelete',
    category: 'Credentials', color: CATEGORIES.CREDENTIALS.color,
    networkGating: 'all', description: 'Delete a credential.',
    fields: [
      addr('Account', 'Account'), addr('Issuer', 'Issuer', false),
      addr('Subject', 'Subject', false),
      hex('CredentialType', 'Credential Type', true),
    ]
  },

  // ── Permissioned Domains ────────────────────────────────────────────────
  {
    id: 'PermissionedDomainSet', label: 'PermissionedDomainSet',
    category: 'Permissioned Domains', color: CATEGORIES.PERMISSIONED_DOMAINS.color,
    networkGating: 'all', description: 'Create or update a permissioned domain.',
    fields: [
      addr('Account', 'Account'),
      { name: 'AcceptedCredentials', label: 'Accepted Credentials (JSON)', type: 'textarea', required: false },
      hex('DomainID', 'Domain ID (update only)'),
    ]
  },
  {
    id: 'PermissionedDomainDelete', label: 'PermissionedDomainDelete',
    category: 'Permissioned Domains', color: CATEGORIES.PERMISSIONED_DOMAINS.color,
    networkGating: 'all', description: 'Delete a permissioned domain.',
    fields: [addr('Account', 'Account'), hex('DomainID', 'Domain ID', true)]
  },

  // ── DIDs ─────────────────────────────────────────────────────────────────
  {
    id: 'DIDSet', label: 'DIDSet',
    category: 'DIDs', color: CATEGORIES.DIDS.color,
    networkGating: 'all', description: 'Create or update a DID document.',
    fields: [
      addr('Account', 'Account'),
      hex('DIDDocument', 'DID Document (hex)'),
      hex('Data', 'Data (hex)'), txt('URI', 'URI'),
    ]
  },
  {
    id: 'DIDDelete', label: 'DIDDelete',
    category: 'DIDs', color: CATEGORIES.DIDS.color,
    networkGating: 'all', description: 'Delete a DID from the ledger.',
    fields: [addr('Account', 'Account')]
  },

  // ── Price Oracles ────────────────────────────────────────────────────────
  {
    id: 'OracleSet', label: 'OracleSet',
    category: 'Price Oracles', color: CATEGORIES.PRICE_ORACLES.color,
    networkGating: 'all', description: 'Create or update an on-chain price oracle.',
    fields: [
      addr('Account', 'Account'),
      num('OracleDocumentID', 'Oracle Document ID', true),
      txt('Provider', 'Provider (hex)'), txt('URI', 'URI (hex)'),
      num('AssetClass', 'Asset Class'), num('LastUpdateTime', 'Last Update Time'),
      { name: 'PriceDataSeries', label: 'Price Data Series (JSON)', type: 'textarea', required: false },
    ]
  },
  {
    id: 'OracleDelete', label: 'OracleDelete',
    category: 'Price Oracles', color: CATEGORIES.PRICE_ORACLES.color,
    networkGating: 'all', description: 'Delete an oracle.',
    fields: [addr('Account', 'Account'), num('OracleDocumentID', 'Oracle Document ID', true)]
  },

  // ── NFTs ─────────────────────────────────────────────────────────────────
  {
    id: 'NFTokenMint', label: 'NFTokenMint',
    category: 'NFTs', color: CATEGORIES.NFTS.color,
    networkGating: 'all', description: 'Mint an NFT.',
    fields: [
      addr('Account', 'Account'), num('NFTokenTaxon', 'Taxon', true),
      num('TransferFee', 'Transfer Fee'), addr('Issuer', 'Issuer', false),
      hex('URI', 'URI (hex)'), flags(),
    ]
  },
  {
    id: 'NFTokenBurn', label: 'NFTokenBurn',
    category: 'NFTs', color: CATEGORIES.NFTS.color,
    networkGating: 'all', description: 'Permanently destroy an NFT.',
    fields: [addr('Account', 'Account'), hex('NFTokenID', 'NFTokenID', true), addr('Owner', 'Owner', false)]
  },
  {
    id: 'NFTokenCreateOffer', label: 'NFTokenCreateOffer',
    category: 'NFTs', color: CATEGORIES.NFTS.color,
    networkGating: 'all', description: 'Create offer to buy/sell an NFT.',
    fields: [
      addr('Account', 'Account'), hex('NFTokenID', 'NFTokenID', true),
      txt('Amount', 'Amount', true), addr('Owner', 'Owner', false),
      addr('Destination', 'Destination', false), num('Expiration', 'Expiration'), flags(),
    ]
  },
  {
    id: 'NFTokenCancelOffer', label: 'NFTokenCancelOffer',
    category: 'NFTs', color: CATEGORIES.NFTS.color,
    networkGating: 'all', description: 'Cancel NFT offers.',
    fields: [
      addr('Account', 'Account'),
      { name: 'NFTokenOffers', label: 'NFToken Offers (JSON array of hex IDs)', type: 'textarea', required: true },
    ]
  },
  {
    id: 'NFTokenAcceptOffer', label: 'NFTokenAcceptOffer',
    category: 'NFTs', color: CATEGORIES.NFTS.color,
    networkGating: 'all', description: 'Accept an NFT offer.',
    fields: [
      addr('Account', 'Account'),
      hex('NFTokenBuyOffer', 'Buy Offer (hex)'),
      hex('NFTokenSellOffer', 'Sell Offer (hex)'),
      txt('NFTokenBrokerFee', 'Broker Fee'),
    ]
  },
  {
    id: 'NFTokenModify', label: 'NFTokenModify',
    category: 'NFTs', color: CATEGORIES.NFTS.color,
    networkGating: 'all', description: 'Modify mutable NFT fields.',
    fields: [
      addr('Account', 'Account'), hex('NFTokenID', 'NFTokenID', true),
      addr('Owner', 'Owner', false), hex('URI', 'URI (hex)'),
    ]
  },

  // ── Checks ───────────────────────────────────────────────────────────────
  {
    id: 'CheckCreate', label: 'CheckCreate',
    category: 'Checks', color: CATEGORIES.CHECKS.color,
    networkGating: 'all', description: 'Create a deferred payment check.',
    fields: [
      addr('Account', 'Account'), addr('Destination', 'Destination'),
      txt('SendMax', 'Send Max', true), num('DestinationTag', 'Destination Tag'),
      num('Expiration', 'Expiration'), hex('InvoiceID', 'Invoice ID'),
    ]
  },
  {
    id: 'CheckCash', label: 'CheckCash',
    category: 'Checks', color: CATEGORIES.CHECKS.color,
    networkGating: 'all', description: 'Cash a check.',
    fields: [
      addr('Account', 'Account'), hex('CheckID', 'Check ID', true),
      txt('Amount', 'Amount'), txt('DeliverMin', 'Deliver Min'),
    ]
  },
  {
    id: 'CheckCancel', label: 'CheckCancel',
    category: 'Checks', color: CATEGORIES.CHECKS.color,
    networkGating: 'all', description: 'Cancel a check.',
    fields: [addr('Account', 'Account'), hex('CheckID', 'Check ID', true)]
  },

  // ── Vaults (devnet-only) ─────────────────────────────────────────────────
  {
    id: 'VaultCreate', label: 'VaultCreate',
    category: 'Vaults', color: CATEGORIES.VAULTS.color,
    networkGating: 'devnet-only', description: 'Create a Single Asset Vault.',
    fields: [
      addr('Account', 'Account'), txt('Asset', 'Asset', true),
      txt('AssetsMaximum', 'Assets Maximum'), hex('MPTokenMetadata', 'Metadata (hex)'), flags(),
    ]
  },
  {
    id: 'VaultUpdate', label: 'VaultUpdate',
    category: 'Vaults', color: CATEGORIES.VAULTS.color,
    networkGating: 'devnet-only', description: 'Update vault parameters.',
    fields: [
      addr('Account', 'Account'), hex('VaultID', 'Vault ID', true),
      txt('AssetsMaximum', 'Assets Maximum'), flags(),
    ]
  },
  {
    id: 'VaultDeposit', label: 'VaultDeposit',
    category: 'Vaults', color: CATEGORIES.VAULTS.color,
    networkGating: 'devnet-only', description: 'Deposit assets into a vault.',
    fields: [
      addr('Account', 'Account'), hex('VaultID', 'Vault ID', true),
      txt('Amount', 'Amount', true), txt('MPTokenOut', 'LP Token Out'),
    ]
  },
  {
    id: 'VaultWithdraw', label: 'VaultWithdraw',
    category: 'Vaults', color: CATEGORIES.VAULTS.color,
    networkGating: 'devnet-only', description: 'Withdraw assets from a vault.',
    fields: [
      addr('Account', 'Account'), hex('VaultID', 'Vault ID', true),
      txt('Amount', 'Amount'), txt('MPTokenIn', 'LP Token In'),
    ]
  },
  {
    id: 'VaultDelete', label: 'VaultDelete',
    category: 'Vaults', color: CATEGORIES.VAULTS.color,
    networkGating: 'devnet-only', description: 'Delete an empty vault.',
    fields: [addr('Account', 'Account'), hex('VaultID', 'Vault ID', true)]
  },
  {
    id: 'VaultClawback', label: 'VaultClawback',
    category: 'Vaults', color: CATEGORIES.VAULTS.color,
    networkGating: 'devnet-only', description: 'Claw back funds from a vault.',
    fields: [
      addr('Account', 'Account (Issuer)'), hex('VaultID', 'Vault ID', true),
      addr('Holder', 'Holder', true), txt('Amount', 'Amount'),
    ]
  },

  // ── Lending Protocol (devnet-only) ────────────────────────────────────────
  {
    id: 'LoanBrokerSet', label: 'LoanBrokerSet',
    category: 'Lending Protocol', color: CATEGORIES.LENDING.color,
    networkGating: 'devnet-only', description: 'Create or update a loan broker.',
    fields: [
      addr('Account', 'Account'), txt('Asset', 'Asset', true),
      hex('VaultID', 'Vault ID', true), txt('MaximumAmount', 'Max Amount'), flags(),
    ]
  },
  {
    id: 'LoanBrokerDelete', label: 'LoanBrokerDelete',
    category: 'Lending Protocol', color: CATEGORIES.LENDING.color,
    networkGating: 'devnet-only', description: 'Delete a loan broker.',
    fields: [addr('Account', 'Account'), hex('LoanBrokerID', 'Loan Broker ID', true)]
  },
  {
    id: 'LoanBrokerDeposit', label: 'LoanBrokerDeposit',
    category: 'Lending Protocol', color: CATEGORIES.LENDING.color,
    networkGating: 'devnet-only', description: 'Deposit first-loss capital.',
    fields: [
      addr('Account', 'Account'), hex('LoanBrokerID', 'Loan Broker ID', true),
      txt('Amount', 'Amount', true),
    ]
  },
  {
    id: 'LoanBrokerWithdraw', label: 'LoanBrokerWithdraw',
    category: 'Lending Protocol', color: CATEGORIES.LENDING.color,
    networkGating: 'devnet-only', description: 'Withdraw first-loss capital.',
    fields: [
      addr('Account', 'Account'), hex('LoanBrokerID', 'Loan Broker ID', true),
      txt('Amount', 'Amount', true),
    ]
  },
  {
    id: 'LoanBrokerClawback', label: 'LoanBrokerClawback',
    category: 'Lending Protocol', color: CATEGORIES.LENDING.color,
    networkGating: 'devnet-only', description: 'Claw back first-loss capital.',
    fields: [
      addr('Account', 'Account'), hex('LoanBrokerID', 'Loan Broker ID', true),
      addr('Holder', 'Holder', true), txt('Amount', 'Amount'),
    ]
  },
  {
    id: 'LoanSet', label: 'LoanSet',
    category: 'Lending Protocol', color: CATEGORIES.LENDING.color,
    networkGating: 'devnet-only', description: 'Create a loan agreement.',
    fields: [
      addr('Account', 'Account (Broker Submitter)'),
      hex('LoanBrokerID', 'Loan Broker ID', true),
      addr('Borrower', 'Borrower', true),
      txt('Principal', 'Principal', true),
      num('AnnualInterestRate', 'Annual Interest Rate (bps)', true),
      num('Term', 'Term (seconds)', true),
      hex('CounterpartySignature_SigningPubKey', 'Counterparty Pub Key', true),
      hex('CounterpartySignature_TxnSignature', 'Counterparty Signature', true),
    ]
  },
  {
    id: 'LoanPay', label: 'LoanPay',
    category: 'Lending Protocol', color: CATEGORIES.LENDING.color,
    networkGating: 'devnet-only', description: 'Make a loan payment.',
    fields: [
      addr('Account', 'Account'), hex('LoanID', 'Loan ID', true),
      txt('Amount', 'Amount', true), flags(),
    ]
  },
  {
    id: 'LoanManage', label: 'LoanManage',
    category: 'Lending Protocol', color: CATEGORIES.LENDING.color,
    networkGating: 'devnet-only', description: 'Manage loan state (default/impair).',
    fields: [
      addr('Account', 'Account'), hex('LoanID', 'Loan ID', true), flags(),
    ]
  },
  {
    id: 'LoanDelete', label: 'LoanDelete',
    category: 'Lending Protocol', color: CATEGORIES.LENDING.color,
    networkGating: 'devnet-only', description: 'Delete a loan.',
    fields: [addr('Account', 'Account'), hex('LoanID', 'Loan ID', true)]
  },

  // ── Batch (devnet-only) ──────────────────────────────────────────────────
  {
    id: 'BatchContainer', label: 'Batch Container',
    category: 'Batch', color: CATEGORIES.BATCH.color,
    networkGating: 'devnet-only', description: 'Bundle up to 8 txns atomically.',
    fields: [
      { name: 'ExecutionMode', label: 'Execution Mode', type: 'select', required: true,
        options: ['ALLORNOTHING', 'ONLYONE', 'UNTILFAILURE', 'INDEPENDENT'] },
      { name: 'note', label: 'Note', type: 'textarea', required: false,
        defaultValue: 'Wrap up to 8 inner tx nodes. BatchV1_1 pending activation.' },
    ]
  },

  // ── Control Flow ─────────────────────────────────────────────────────────
  {
    id: 'ConditionBranch', label: 'Condition Branch',
    category: 'Control Flow', color: CATEGORIES.CONTROL_FLOW.color,
    networkGating: 'all', description: 'Route flow based on a condition.',
    fields: [
      txt('Expression', 'Expression', true, 'e.g. output.result.meta.TransactionResult === "tesSUCCESS"'),
      txt('TrueLabel', 'True Label', false), txt('FalseLabel', 'False Label', false),
    ]
  },
  {
    id: 'ParallelSplit', label: 'Parallel Split',
    category: 'Control Flow', color: CATEGORIES.CONTROL_FLOW.color,
    networkGating: 'all', description: 'Fan out to multiple parallel branches.',
    fields: []
  },
  {
    id: 'SyncJoin', label: 'Sync Join',
    category: 'Control Flow', color: CATEGORIES.CONTROL_FLOW.color,
    networkGating: 'all', description: 'Wait for all inbound branches.',
    fields: []
  },
  {
    id: 'Loop', label: 'Loop',
    category: 'Control Flow', color: CATEGORIES.CONTROL_FLOW.color,
    networkGating: 'all', description: 'Repeat downstream N times.',
    fields: [
      num('Iterations', 'Iterations', true),
      num('DelayBetween', 'Delay Between (ms)'),
    ]
  },
  {
    id: 'Delay', label: 'Delay',
    category: 'Control Flow', color: CATEGORIES.CONTROL_FLOW.color,
    networkGating: 'all', description: 'Pause execution.',
    fields: [num('Duration', 'Duration (ms)', true), bool('WaitForLedger', 'Wait For Ledger Close')]
  },

  // ── Output ───────────────────────────────────────────────────────────────
  {
    id: 'LogOutput', label: 'Log Output',
    category: 'Output', color: CATEGORIES.OUTPUT.color,
    networkGating: 'all', description: 'Log a message or value.',
    fields: [txt('Message', 'Message')]
  },
];

export const getNodeDef = (type: string): NodeTypeDef | undefined =>
  NODE_REGISTRY.find(n => n.id === type);

export const getCategoryNodes = (category: string): NodeTypeDef[] =>
  NODE_REGISTRY.filter(n => n.category === category);

export const CATEGORY_ORDER = [
  'Triggers', 'Account Management', 'Payments & Channels', 'DEX / Offers',
  'AMM', 'MPTs', 'Credentials', 'Permissioned Domains', 'DIDs', 'Price Oracles',
  'NFTs', 'Checks', 'Vaults', 'Lending Protocol', 'Batch', 'Control Flow', 'Output',
];
