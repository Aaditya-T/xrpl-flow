export type FieldType = 'text' | 'number' | 'drops' | 'address' | 'hex' | 'boolean' | 'select' | 'textarea' | 'amount' | 'issue';

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
  TRIGGERS:             { name: 'Triggers',             color: '#6366f1' },
  ACCOUNT_MANAGEMENT:   { name: 'Account Management',   color: '#64748b' },
  PAYMENTS:             { name: 'Payments & Channels',   color: '#10b981' },
  DEX:                  { name: 'DEX / Offers',          color: '#f59e0b' },
  AMM:                  { name: 'AMM',                   color: '#f97316' },
  MPTS:                 { name: 'MPTs',                  color: '#8b5cf6' },
  CREDENTIALS:          { name: 'Credentials',           color: '#06b6d4' },
  PERMISSIONED_DOMAINS: { name: 'Permissioned Domains',  color: '#14b8a6' },
  DIDS:                 { name: 'DIDs',                  color: '#ec4899' },
  PRICE_ORACLES:        { name: 'Price Oracles',         color: '#eab308' },
  NFTS:                 { name: 'NFTs',                  color: '#f43f5e' },
  CHECKS:               { name: 'Checks',                color: '#0ea5e9' },
  VAULTS:               { name: 'Vaults',                color: '#84cc16' },
  LENDING:              { name: 'Lending Protocol',      color: '#d946ef' },
  BATCH:                { name: 'Batch',                 color: '#ef4444' },
  CONTROL_FLOW:         { name: 'Control Flow',          color: '#6b7280' },
  OUTPUT:               { name: 'Output',                color: '#374151' },
};

// ─── Field constructors ────────────────────────────────────────────────────
const addr   = (name: string, label: string, req = true): FieldDef =>
  ({ name, label, type: 'address',  required: req });
const txt    = (name: string, label: string, req = false, desc?: string): FieldDef =>
  ({ name, label, type: 'text',     required: req, description: desc });
const num    = (name: string, label: string, req = false): FieldDef =>
  ({ name, label, type: 'number',   required: req });
const hex    = (name: string, label: string, req = false): FieldDef =>
  ({ name, label, type: 'hex',      required: req });
const drops  = (name: string, label: string, req = false): FieldDef =>
  ({ name, label, type: 'drops',    required: req });
const bool   = (name: string, label: string): FieldDef =>
  ({ name, label, type: 'boolean',  required: false });
const flags  = (): FieldDef => num('Flags', 'Flags (bitmask)');
const ta     = (name: string, label: string, req = false, desc?: string): FieldDef =>
  ({ name, label, type: 'textarea', required: req, description: desc });
/** XRP-or-token amount widget: renders as drops input OR currency+issuer+value inputs */
const amt    = (name: string, label: string, req = false, desc?: string): FieldDef =>
  ({ name, label, type: 'amount',   required: req, description: desc });
const issue  = (name: string, label: string, req = false, desc?: string): FieldDef =>
  ({ name, label, type: 'issue', required: req, description: desc });

/**
 * Fields present on EVERY XRPL transaction (BaseTransaction).
 * These are appended as optional fields on every tx-type node so that
 * power users can fill in any base-class field without needing a separate UI.
 */
const COMMON_FIELDS: FieldDef[] = [
  drops('Fee',                 'Fee (drops) — auto-filled if blank'),
  num  ('Sequence',            'Sequence — auto-filled if blank'),
  num  ('LastLedgerSequence',  'Last Ledger Sequence'),
  num  ('SourceTag',           'Source Tag'),
  num  ('TicketSequence',      'Ticket Sequence — use instead of Sequence'),
  hex  ('AccountTxnID',        'Account Txn ID (previous txn hash)'),
  num  ('NetworkID',           'Network ID'),
  ta   ('Memos',               'Memos (JSON)', false,
        '[{"Memo":{"MemoType":"hex","MemoData":"hex"}}]'),
];

/** Append COMMON_FIELDS after a node's required/optional fields. */
const withCommon = (fields: FieldDef[]): FieldDef[] => [...fields, ...COMMON_FIELDS];

// ─── Registry ──────────────────────────────────────────────────────────────
export const NODE_REGISTRY: NodeTypeDef[] = [

  // ── Triggers ─────────────────────────────────────────────────────────────
  {
    id: 'ManualTrigger', label: 'Manual Trigger',
    category: 'Triggers', color: CATEGORIES.TRIGGERS.color,
    networkGating: 'all', description: 'Start a workflow manually.',
    fields: [],
  },
  {
    id: 'AccountEventTrigger', label: 'Account Event',
    category: 'Triggers', color: CATEGORIES.TRIGGERS.color,
    networkGating: 'all', description: 'Trigger on incoming transactions for an address.',
    fields: [
      addr('WatchAddress', 'Watch Address'),
      txt ('EventType', 'Filter: Transaction Type', false,
           'Leave blank for any. e.g. Payment, OfferCreate'),
      num ('TimeoutSeconds', 'Timeout (seconds)', false),
    ],
  },

  // ── Account Management ───────────────────────────────────────────────────
  {
    id: 'AccountSet', label: 'AccountSet',
    category: 'Account Management', color: CATEGORIES.ACCOUNT_MANAGEMENT.color,
    networkGating: 'all', description: 'Modify account flags and properties.',
    fields: withCommon([
      addr('Account',         'Account'),
      num ('ClearFlag',       'Clear Flag (ASF constant)'),
      num ('SetFlag',         'Set Flag (ASF constant)'),
      txt ('Domain',          'Domain (hex-encoded ASCII)'),
      hex ('EmailHash',       'Email Hash (MD5, hex)'),
      hex ('MessageKey',      'Message Key'),
      num ('TransferRate',    'Transfer Rate (1_000_000_000 = 0%)'),
      num ('TickSize',        'Tick Size (0 disables)'),
      addr('NFTokenMinter',   'NFToken Minter', false),
      bool('tfRequireDestTag','Require Dest Tag'),
      bool('tfOptionalDestTag','Optional Dest Tag'),
      bool('tfRequireAuth',   'Require Auth (trust lines)'),
      bool('tfOptionalAuth',  'Optional Auth'),
      bool('tfDisallowXRP',   'Disallow XRP'),
      bool('tfAllowXRP',      'Allow XRP'),
      flags(),
    ]),
  },
  {
    id: 'AccountDelete', label: 'AccountDelete',
    category: 'Account Management', color: CATEGORIES.ACCOUNT_MANAGEMENT.color,
    networkGating: 'all', description: 'Delete an account from the ledger.',
    fields: withCommon([
      addr('Account',        'Account'),
      addr('Destination',    'Destination'),
      num ('DestinationTag', 'Destination Tag'),
    ]),
  },
  {
    id: 'SetRegularKey', label: 'SetRegularKey',
    category: 'Account Management', color: CATEGORIES.ACCOUNT_MANAGEMENT.color,
    networkGating: 'all', description: 'Assign or remove a regular key pair.',
    fields: withCommon([
      addr('Account',    'Account'),
      addr('RegularKey', 'Regular Key (omit to remove)', false),
    ]),
  },
  {
    id: 'SignerListSet', label: 'SignerListSet',
    category: 'Account Management', color: CATEGORIES.ACCOUNT_MANAGEMENT.color,
    networkGating: 'all', description: 'Set up multi-signing signer list.',
    fields: withCommon([
      addr('Account',      'Account'),
      num ('SignerQuorum', 'Signer Quorum', true),
      ta  ('SignerEntries','Signer Entries (JSON)', false,
           '[{"SignerEntry":{"Account":"r...","SignerWeight":1}}]'),
    ]),
  },
  {
    id: 'DepositPreauth', label: 'DepositPreauth',
    category: 'Account Management', color: CATEGORIES.ACCOUNT_MANAGEMENT.color,
    networkGating: 'all', description: 'Pre-authorize or deauthorize an account.',
    fields: withCommon([
      addr('Account',       'Account'),
      addr('Authorize',     'Authorize',   false),
      addr('Unauthorize',   'Unauthorize', false),
      ta  ('AuthorizeCredentials',   'Authorize Credentials (JSON)',   false,
           '[{"Credential":{"Issuer":"r...","CredentialType":"hex"}}]'),
      ta  ('UnauthorizeCredentials', 'Unauthorize Credentials (JSON)', false,
           '[{"Credential":{"Issuer":"r...","CredentialType":"hex"}}]'),
    ]),
  },
  {
    id: 'TicketCreate', label: 'TicketCreate',
    category: 'Account Management', color: CATEGORIES.ACCOUNT_MANAGEMENT.color,
    networkGating: 'all', description: 'Reserve sequence numbers as tickets.',
    fields: withCommon([
      addr('Account',      'Account'),
      num ('TicketCount',  'Ticket Count (1–250)', true),
    ]),
  },
  {
    id: 'DelegateSet', label: 'DelegateSet',
    category: 'Account Management', color: CATEGORIES.ACCOUNT_MANAGEMENT.color,
    networkGating: 'all', description: 'Grant transaction permissions to another account.',
    fields: withCommon([
      addr('Account', 'Account'),
      addr('Authorize', 'Authorized Account'),
      ta('Permissions', 'Permissions (JSON)', true,
        '[{"Permission":{"PermissionValue":"Payment"}}]'),
    ]),
  },

  // ── Payments & Channels ──────────────────────────────────────────────────
  {
    id: 'Payment', label: 'Payment',
    category: 'Payments & Channels', color: CATEGORIES.PAYMENTS.color,
    networkGating: 'all', description: 'Send XRP, tokens, or MPTs.',
    fields: withCommon([
      addr('Account',        'Sender'),
      addr('Destination',    'Destination'),
      amt ('Amount',         'Amount',                        true),
      amt ('SendMax',        'Send Max (cross-currency)',     false),
      amt ('DeliverMin',     'Deliver Min (partial payment)', false),
      amt ('DeliverMax',     'Deliver Max',                   false),
      hex ('InvoiceID',      'Invoice ID'),
      hex ('DomainID',       'Permissioned Domain ID'),
      ta  ('CredentialIDs',  'Credential IDs (JSON array)', false,
           '["CREDENTIAL_ID"]'),
      num ('DestinationTag', 'Destination Tag'),
      ta  ('Paths',          'Paths (JSON)', false,
           '[[{"account":"r..."},{"currency":"USD","issuer":"r..."}]]'),
      bool('tfNoRippleDirect',    'No Ripple Direct'),
      bool('tfPartialPayment',    'Partial Payment'),
      bool('tfLimitQuality',      'Limit Quality'),
      flags(),
    ]),
  },
  {
    id: 'EscrowCreate', label: 'EscrowCreate',
    category: 'Payments & Channels', color: CATEGORIES.PAYMENTS.color,
    networkGating: 'all', description: 'Create an XRP escrow.',
    fields: withCommon([
      addr('Account',        'Account'),
      addr('Destination',    'Destination'),
      drops('Amount',        'Amount (drops)', true),
      num ('FinishAfter',    'Finish After (Ripple Epoch)'),
      num ('CancelAfter',    'Cancel After (Ripple Epoch)'),
      hex ('Condition',      'Crypto-condition (PREIMAGE-SHA-256 hex)'),
      num ('DestinationTag', 'Destination Tag'),
    ]),
  },
  {
    id: 'EscrowFinish', label: 'EscrowFinish',
    category: 'Payments & Channels', color: CATEGORIES.PAYMENTS.color,
    networkGating: 'all', description: 'Release escrowed XRP.',
    fields: withCommon([
      addr('Account',         'Account'),
      addr('Owner',           'Owner'),
      num ('OfferSequence',   'Offer Sequence', true),
      hex ('Condition',       'Condition'),
      hex ('Fulfillment',     'Fulfillment'),
    ]),
  },
  {
    id: 'EscrowCancel', label: 'EscrowCancel',
    category: 'Payments & Channels', color: CATEGORIES.PAYMENTS.color,
    networkGating: 'all', description: 'Cancel an expired escrow.',
    fields: withCommon([
      addr('Account',       'Account'),
      addr('Owner',         'Owner'),
      num ('OfferSequence', 'Offer Sequence', true),
    ]),
  },
  {
    id: 'PaymentChannelCreate', label: 'PaymentChannelCreate',
    category: 'Payments & Channels', color: CATEGORIES.PAYMENTS.color,
    networkGating: 'all', description: 'Open a payment channel.',
    fields: withCommon([
      addr('Account',        'Account'),
      addr('Destination',    'Destination'),
      drops('Amount',        'Amount (drops)', true),
      num ('SettleDelay',    'Settle Delay (seconds)', true),
      hex ('PublicKey',      'Public Key (signing key)', true),
      num ('CancelAfter',    'Cancel After (Ripple Epoch)'),
      num ('DestinationTag', 'Destination Tag'),
    ]),
  },
  {
    id: 'PaymentChannelFund', label: 'PaymentChannelFund',
    category: 'Payments & Channels', color: CATEGORIES.PAYMENTS.color,
    networkGating: 'all', description: 'Add XRP to a payment channel.',
    fields: withCommon([
      addr ('Account',    'Account'),
      hex  ('Channel',    'Channel ID (hex)', true),
      drops('Amount',     'Amount (drops)',   true),
      num  ('Expiration', 'New Expiration (Ripple Epoch)'),
    ]),
  },
  {
    id: 'PaymentChannelClaim', label: 'PaymentChannelClaim',
    category: 'Payments & Channels', color: CATEGORIES.PAYMENTS.color,
    networkGating: 'all', description: 'Claim XRP from a payment channel.',
    fields: withCommon([
      addr ('Account',   'Account'),
      hex  ('Channel',   'Channel ID (hex)',     true),
      drops('Balance',   'Balance (drops) — new channel balance'),
      drops('Amount',    'Amount (drops) — to claim'),
      hex  ('Signature', 'Signature (claim auth)'),
      hex  ('PublicKey', 'Public Key'),
      bool ('tfRenew',   'Renew Channel'),
      bool ('tfClose',   'Close Channel'),
      flags(),
    ]),
  },

  // ── DEX / Offers ─────────────────────────────────────────────────────────
  {
    id: 'TrustSet', label: 'TrustSet',
    category: 'DEX / Offers', color: CATEGORIES.DEX.color,
    networkGating: 'all', description: 'Create or modify a trust line.',
    fields: withCommon([
      addr('Account',               'Account'),
      txt ('LimitAmount_currency',  'Currency', true),
      addr('LimitAmount_issuer',    'Issuer',   true),
      txt ('LimitAmount_value',     'Value',    true),
      num ('QualityIn',             'Quality In  (0 = no change)'),
      num ('QualityOut',            'Quality Out (0 = no change)'),
      bool('tfSetfAuth',            'Authorize (lsfHighAuth / lsfLowAuth)'),
      bool('tfSetNoRipple',         'Set No-Ripple'),
      bool('tfClearNoRipple',       'Clear No-Ripple'),
      bool('tfSetFreeze',           'Set Freeze'),
      bool('tfClearFreeze',         'Clear Freeze'),
      flags(),
    ]),
  },
  {
    id: 'OfferCreate', label: 'OfferCreate',
    category: 'DEX / Offers', color: CATEGORIES.DEX.color,
    networkGating: 'all', description: 'Place a limit order on the DEX.',
    fields: withCommon([
      addr('Account',        'Account'),
      amt ('TakerPays',      'Taker Pays', true),
      amt ('TakerGets',      'Taker Gets', true),
      num ('Expiration',     'Expiration (Ripple Epoch)'),
      num ('OfferSequence',  'Offer Sequence (cancel before placing)'),
      bool('tfPassive',      'Passive'),
      bool('tfImmediateOrCancel', 'Immediate Or Cancel'),
      bool('tfFillOrKill',   'Fill Or Kill'),
      bool('tfSell',         'Sell'),
      flags(),
    ]),
  },
  {
    id: 'OfferCancel', label: 'OfferCancel',
    category: 'DEX / Offers', color: CATEGORIES.DEX.color,
    networkGating: 'all', description: 'Cancel an existing offer.',
    fields: withCommon([
      addr('Account',       'Account'),
      num ('OfferSequence', 'Offer Sequence', true),
    ]),
  },
  {
    id: 'Clawback', label: 'Clawback',
    category: 'DEX / Offers', color: CATEGORIES.DEX.color,
    networkGating: 'all', description: 'Issuer claws back tokens from a holder.',
    fields: withCommon([
      addr('Account', 'Account (Issuer)'),
      amt ('Amount',  'Amount (issuer field = holder address)', true),
      addr('Holder',  'MPT Holder', false),
    ]),
  },

  // ── AMM ──────────────────────────────────────────────────────────────────
  {
    id: 'AMMCreate', label: 'AMMCreate',
    category: 'AMM', color: CATEGORIES.AMM.color,
    networkGating: 'all', description: 'Create a new AMM pool.',
    fields: withCommon([
      addr('Account',     'Account'),
      amt ('Amount',      'Amount (asset 1)', true),
      amt ('Amount2',     'Amount 2 (asset 2)', true),
      num ('TradingFee',  'Trading Fee (0–1000, 1000 = 1%)', true),
    ]),
  },
  {
    id: 'AMMDeposit', label: 'AMMDeposit',
    category: 'AMM', color: CATEGORIES.AMM.color,
    networkGating: 'all', description: 'Deposit assets into an AMM.',
    fields: withCommon([
      addr('Account',     'Account'),
      issue('Asset',       'Asset',   true),
      issue('Asset2',      'Asset 2', true),
      amt ('Amount',      'Amount (asset 1)'),
      amt ('Amount2',     'Amount 2 (asset 2)'),
      amt ('LPTokenOut',  'LP Token Out'),
      amt ('EPrice',      'Effective Price'),
      bool('tfLPToken',   'Single-asset LP token deposit'),
      bool('tfSingleAsset','Single-asset deposit'),
      bool('tfTwoAsset',  'Two-asset deposit'),
      bool('tfOneAssetLPToken','One-asset LP token deposit'),
      bool('tfLimitLPToken','Limit LP token'),
      bool('tfTwoAssetIfEmpty','Two-asset if empty'),
      flags(),
    ]),
  },
  {
    id: 'AMMWithdraw', label: 'AMMWithdraw',
    category: 'AMM', color: CATEGORIES.AMM.color,
    networkGating: 'all', description: 'Withdraw assets from an AMM.',
    fields: withCommon([
      addr('Account',     'Account'),
      issue('Asset',       'Asset',   true),
      issue('Asset2',      'Asset 2', true),
      amt ('Amount',      'Amount (asset 1)'),
      amt ('Amount2',     'Amount 2 (asset 2)'),
      amt ('LPTokenIn',   'LP Token In'),
      amt ('EPrice',      'Effective Price'),
      bool('tfLPToken',   'LP token proportional withdrawal'),
      bool('tfWithdrawAll','Withdraw all'),
      bool('tfOneAssetWithdrawAll','One-asset withdraw all'),
      bool('tfSingleAsset','Single-asset withdrawal'),
      bool('tfTwoAsset',  'Two-asset withdrawal'),
      bool('tfOneAssetLPToken','One-asset LP token withdrawal'),
      bool('tfLimitLPToken','Limit LP token'),
      flags(),
    ]),
  },
  {
    id: 'AMMVote', label: 'AMMVote',
    category: 'AMM', color: CATEGORIES.AMM.color,
    networkGating: 'all', description: 'Vote on AMM trading fees.',
    fields: withCommon([
      addr('Account',    'Account'),
      issue('Asset',      'Asset',   true),
      issue('Asset2',     'Asset 2', true),
      num ('TradingFee', 'Trading Fee (0–1000)', true),
    ]),
  },
  {
    id: 'AMMBid', label: 'AMMBid',
    category: 'AMM', color: CATEGORIES.AMM.color,
    networkGating: 'all', description: 'Bid on the AMM auction slot.',
    fields: withCommon([
      addr('Account',      'Account'),
      issue('Asset',        'Asset',   true),
      issue('Asset2',       'Asset 2', true),
      amt ('BidMin',       'Bid Min'),
      amt ('BidMax',       'Bid Max'),
      ta  ('AuthAccounts', 'Auth Accounts (JSON array)', false,
           '[{"AuthAccount":{"Account":"r..."}}]'),
    ]),
  },
  {
    id: 'AMMDelete', label: 'AMMDelete',
    category: 'AMM', color: CATEGORIES.AMM.color,
    networkGating: 'all', description: 'Delete an empty AMM instance.',
    fields: withCommon([
      addr('Account', 'Account'),
      issue('Asset',   'Asset',   true),
      issue('Asset2',  'Asset 2', true),
    ]),
  },
  {
    id: 'AMMClawback', label: 'AMMClawback',
    category: 'AMM', color: CATEGORIES.AMM.color,
    networkGating: 'all', description: 'Claw back tokens from an AMM pool.',
    fields: withCommon([
      addr('Account', 'Account (Issuer)'),
      addr('Holder',  'Holder', true),
      issue('Asset',   'Asset',   true),
      issue('Asset2',  'Asset 2', true),
      amt ('Amount',  'Amount (optional cap)'),
      bool('tfClawTwoAssets', 'Claw Back Both Assets'),
      flags(),
    ]),
  },

  // ── MPTs ─────────────────────────────────────────────────────────────────
  {
    id: 'MPTokenIssuanceCreate', label: 'MPTokenIssuanceCreate',
    category: 'MPTs', color: CATEGORIES.MPTS.color,
    networkGating: 'all', description: 'Define a new Multi-Purpose Token.',
    fields: withCommon([
      addr('Account',          'Account'),
      num ('AssetScale',       'Asset Scale (decimal precision)'),
      num ('TransferFee',      'Transfer Fee (0–50000, 50000 = 50%)'),
      txt ('MaximumAmount',    'Maximum Amount (64-bit uint string)'),
      hex ('MPTokenMetadata',  'MPToken Metadata (hex)'),
      bool('tfMPTCanLock',     'Can Lock'),
      bool('tfMPTRequireAuth', 'Require Auth'),
      bool('tfMPTCanEscrow',   'Can Escrow'),
      bool('tfMPTCanTrade',    'Can Trade'),
      bool('tfMPTCanTransfer', 'Can Transfer'),
      bool('tfMPTCanClawback', 'Can Clawback'),
      flags(),
    ]),
  },
  {
    id: 'MPTokenIssuanceDestroy', label: 'MPTokenIssuanceDestroy',
    category: 'MPTs', color: CATEGORIES.MPTS.color,
    networkGating: 'all', description: 'Destroy an MPT issuance.',
    fields: withCommon([
      addr('Account',           'Account'),
      hex ('MPTokenIssuanceID', 'Issuance ID', true),
    ]),
  },
  {
    id: 'MPTokenIssuanceSet', label: 'MPTokenIssuanceSet',
    category: 'MPTs', color: CATEGORIES.MPTS.color,
    networkGating: 'all', description: 'Set mutable MPT issuance properties.',
    fields: withCommon([
      addr('Account',           'Account'),
      hex ('MPTokenIssuanceID', 'Issuance ID', true),
      addr('MPTokenHolder',     'MPToken Holder (issuer or authorized holder)', false),
      bool('tfMPTLock',         'Lock'),
      bool('tfMPTUnlock',       'Unlock'),
      flags(),
    ]),
  },
  {
    id: 'MPTokenAuthorize', label: 'MPTokenAuthorize',
    category: 'MPTs', color: CATEGORIES.MPTS.color,
    networkGating: 'all', description: 'Authorize an account to hold an MPT.',
    fields: withCommon([
      addr('Account',           'Account'),
      hex ('MPTokenIssuanceID', 'Issuance ID', true),
      addr('Holder',            'Holder (issuer revokes)', false),
      bool('tfMPTUnauthorize',  'Unauthorize (revoke)'),
      flags(),
    ]),
  },

  // ── Credentials ──────────────────────────────────────────────────────────
  {
    id: 'CredentialCreate', label: 'CredentialCreate',
    category: 'Credentials', color: CATEGORIES.CREDENTIALS.color,
    networkGating: 'all', description: 'Issue an on-chain credential.',
    fields: withCommon([
      addr('Account',        'Account (Issuer)'),
      addr('Subject',        'Subject'),
      hex ('CredentialType', 'Credential Type (hex)', true),
      num ('Expiration',     'Expiration (Ripple Epoch)'),
      hex ('URI',            'URI (hex, optional metadata)'),
    ]),
  },
  {
    id: 'CredentialAccept', label: 'CredentialAccept',
    category: 'Credentials', color: CATEGORIES.CREDENTIALS.color,
    networkGating: 'all', description: 'Accept a credential issued to you.',
    fields: withCommon([
      addr('Account',        'Account (Subject)'),
      addr('Issuer',         'Issuer'),
      hex ('CredentialType', 'Credential Type (hex)', true),
    ]),
  },
  {
    id: 'CredentialDelete', label: 'CredentialDelete',
    category: 'Credentials', color: CATEGORIES.CREDENTIALS.color,
    networkGating: 'all', description: 'Delete a credential.',
    fields: withCommon([
      addr('Account',        'Account (Issuer or Subject)'),
      addr('Issuer',         'Issuer',  false),
      addr('Subject',        'Subject', false),
      hex ('CredentialType', 'Credential Type (hex)', true),
    ]),
  },

  // ── Permissioned Domains ─────────────────────────────────────────────────
  {
    id: 'PermissionedDomainSet', label: 'PermissionedDomainSet',
    category: 'Permissioned Domains', color: CATEGORIES.PERMISSIONED_DOMAINS.color,
    networkGating: 'all', description: 'Create or update a permissioned domain.',
    fields: withCommon([
      addr('Account',              'Account'),
      hex ('DomainID',             'Domain ID (omit to create new)'),
      ta  ('AcceptedCredentials',  'Accepted Credentials (JSON)', false,
           '[{"Credential":{"Issuer":"r...","CredentialType":"hex"}}]'),
    ]),
  },
  {
    id: 'PermissionedDomainDelete', label: 'PermissionedDomainDelete',
    category: 'Permissioned Domains', color: CATEGORIES.PERMISSIONED_DOMAINS.color,
    networkGating: 'all', description: 'Delete a permissioned domain.',
    fields: withCommon([
      addr('Account',  'Account'),
      hex ('DomainID', 'Domain ID', true),
    ]),
  },

  // ── DIDs ─────────────────────────────────────────────────────────────────
  {
    id: 'DIDSet', label: 'DIDSet',
    category: 'DIDs', color: CATEGORIES.DIDS.color,
    networkGating: 'all', description: 'Create or update a DID document.',
    fields: withCommon([
      addr('Account',      'Account'),
      hex ('DIDDocument',  'DID Document (hex)'),
      hex ('Data',         'Data (hex — off-ledger pointer)'),
      hex ('URI',          'URI (hex)'),
    ]),
  },
  {
    id: 'DIDDelete', label: 'DIDDelete',
    category: 'DIDs', color: CATEGORIES.DIDS.color,
    networkGating: 'all', description: 'Delete a DID from the ledger.',
    fields: withCommon([
      addr('Account', 'Account'),
    ]),
  },

  // ── Price Oracles ────────────────────────────────────────────────────────
  {
    id: 'OracleSet', label: 'OracleSet',
    category: 'Price Oracles', color: CATEGORIES.PRICE_ORACLES.color,
    networkGating: 'all', description: 'Create or update an on-chain price oracle.',
    fields: withCommon([
      addr('Account',          'Account'),
      num ('OracleDocumentID', 'Oracle Document ID (uint32)', true),
      hex ('Provider',         'Provider (hex-encoded string)'),
      hex ('URI',              'URI (hex)'),
      num ('AssetClass',       'Asset Class (0=currency, 1=commodity, 2=index)'),
      num ('LastUpdateTime',   'Last Update Time (Unix timestamp)'),
      ta  ('PriceDataSeries',  'Price Data Series (JSON)', false,
           '[{"PriceData":{"BaseAsset":"XRP","QuoteAsset":"USD","AssetPrice":"<scaled-uint>","Scale":6}}]'),
    ]),
  },
  {
    id: 'OracleDelete', label: 'OracleDelete',
    category: 'Price Oracles', color: CATEGORIES.PRICE_ORACLES.color,
    networkGating: 'all', description: 'Delete an oracle.',
    fields: withCommon([
      addr('Account',          'Account'),
      num ('OracleDocumentID', 'Oracle Document ID', true),
    ]),
  },

  // ── NFTs ─────────────────────────────────────────────────────────────────
  {
    id: 'NFTokenMint', label: 'NFTokenMint',
    category: 'NFTs', color: CATEGORIES.NFTS.color,
    networkGating: 'all', description: 'Mint an NFT.',
    fields: withCommon([
      addr('Account',        'Account (Minter)'),
      num ('NFTokenTaxon',   'Taxon',            true),
      addr('Issuer',         'Issuer (if minting for another account)', false),
      num ('TransferFee',    'Transfer Fee (0–50000)'),
      hex ('URI',            'URI (hex, max 512 bytes)'),
      bool('tfBurnable',     'Burnable'),
      bool('tfOnlyXRP',      'Only XRP (no IOU payments)'),
      bool('tfTrustLine',    'Require Trust Line'),
      bool('tfTransferable', 'Transferable'),
      bool('tfMutable',      'Mutable URI (NFTokenModify allowed)'),
      flags(),
    ]),
  },
  {
    id: 'NFTokenBurn', label: 'NFTokenBurn',
    category: 'NFTs', color: CATEGORIES.NFTS.color,
    networkGating: 'all', description: 'Permanently destroy an NFT.',
    fields: withCommon([
      addr('Account',    'Account (burner)'),
      hex ('NFTokenID',  'NFToken ID', true),
      addr('Owner',      'Owner (if not Account)', false),
    ]),
  },
  {
    id: 'NFTokenCreateOffer', label: 'NFTokenCreateOffer',
    category: 'NFTs', color: CATEGORIES.NFTS.color,
    networkGating: 'all', description: 'Create a buy or sell offer for an NFT.',
    fields: withCommon([
      addr('Account',      'Account'),
      hex ('NFTokenID',    'NFToken ID', true),
      amt ('Amount',       'Price',      true),
      addr('Owner',        'Owner (for buy offer, owner of NFT)', false),
      addr('Destination',  'Destination (restricted offer)', false),
      num ('Expiration',   'Expiration (Ripple Epoch)'),
      bool('tfSellNFToken','Sell Offer (vs buy offer)'),
      flags(),
    ]),
  },
  {
    id: 'NFTokenCancelOffer', label: 'NFTokenCancelOffer',
    category: 'NFTs', color: CATEGORIES.NFTS.color,
    networkGating: 'all', description: 'Cancel NFT offers.',
    fields: withCommon([
      addr('Account',      'Account'),
      ta  ('NFTokenOffers','NFToken Offer IDs (JSON array of hex strings)', true,
           '["OFFER_ID_HEX_1","OFFER_ID_HEX_2"]'),
    ]),
  },
  {
    id: 'NFTokenAcceptOffer', label: 'NFTokenAcceptOffer',
    category: 'NFTs', color: CATEGORIES.NFTS.color,
    networkGating: 'all', description: 'Accept an NFT offer (direct or brokered).',
    fields: withCommon([
      addr('Account',           'Account'),
      hex ('NFTokenBuyOffer',   'Buy Offer ID'),
      hex ('NFTokenSellOffer',  'Sell Offer ID'),
      amt ('NFTokenBrokerFee',  'Broker Fee (brokered mode only)'),
    ]),
  },
  {
    id: 'NFTokenModify', label: 'NFTokenModify',
    category: 'NFTs', color: CATEGORIES.NFTS.color,
    networkGating: 'all', description: 'Modify the URI of a mutable NFT.',
    fields: withCommon([
      addr('Account',    'Account (minter or issuer)'),
      hex ('NFTokenID',  'NFToken ID', true),
      addr('Owner',      'Owner (if different from Account)', false),
      hex ('URI',        'URI (hex, new value)'),
    ]),
  },

  // ── Checks ───────────────────────────────────────────────────────────────
  {
    id: 'CheckCreate', label: 'CheckCreate',
    category: 'Checks', color: CATEGORIES.CHECKS.color,
    networkGating: 'all', description: 'Create a deferred payment check.',
    fields: withCommon([
      addr('Account',        'Account'),
      addr('Destination',    'Destination'),
      amt ('SendMax',        'Send Max', true),
      num ('DestinationTag', 'Destination Tag'),
      num ('Expiration',     'Expiration (Ripple Epoch)'),
      hex ('InvoiceID',      'Invoice ID'),
    ]),
  },
  {
    id: 'CheckCash', label: 'CheckCash',
    category: 'Checks', color: CATEGORIES.CHECKS.color,
    networkGating: 'all', description: 'Cash a check.',
    fields: withCommon([
      addr('Account',     'Account (check destination)'),
      hex ('CheckID',     'Check ID', true),
      amt ('Amount',      'Amount (exact — exclusive with Deliver Min)'),
      amt ('DeliverMin',  'Deliver Min (flexible — exclusive with Amount)'),
    ]),
  },
  {
    id: 'CheckCancel', label: 'CheckCancel',
    category: 'Checks', color: CATEGORIES.CHECKS.color,
    networkGating: 'all', description: 'Cancel a check.',
    fields: withCommon([
      addr('Account',  'Account'),
      hex ('CheckID', 'Check ID', true),
    ]),
  },

  // ── Vaults (devnet-only) ─────────────────────────────────────────────────
  {
    id: 'VaultCreate', label: 'VaultCreate',
    category: 'Vaults', color: CATEGORIES.VAULTS.color,
    networkGating: 'devnet-only', description: 'Create a Single Asset Vault.',
    fields: withCommon([
      addr('Account',         'Account'),
      issue('Asset',           'Asset', true),
      txt ('AssetsMaximum',   'Assets Maximum (leave blank for unlimited)'),
      hex ('Data',            'Metadata (hex)'),
      hex ('MPTokenMetadata', 'Metadata (hex)'),
      num ('WithdrawalPolicy','Withdrawal Policy'),
      hex ('DomainID',        'Permissioned Domain ID'),
      num ('Scale',           'Share Scale (IOU only, 0–18)'),
      bool('tfVaultPrivate',  'Private Vault'),
      bool('tfVaultShareNonTransferable', 'Non-transferable Shares'),
      flags(),
    ]),
  },
  {
    id: 'VaultSet', label: 'VaultSet',
    category: 'Vaults', color: CATEGORIES.VAULTS.color,
    networkGating: 'devnet-only', description: 'Update vault parameters.',
    fields: withCommon([
      addr('Account',       'Account'),
      hex ('VaultID',       'Vault ID', true),
      hex ('Data',          'Metadata (hex)'),
      txt ('AssetsMaximum', 'Assets Maximum'),
      hex ('DomainID',      'Permissioned Domain ID'),
    ]),
  },
  {
    id: 'VaultDeposit', label: 'VaultDeposit',
    category: 'Vaults', color: CATEGORIES.VAULTS.color,
    networkGating: 'devnet-only', description: 'Deposit assets into a vault.',
    fields: withCommon([
      addr('Account',     'Account'),
      hex ('VaultID',     'Vault ID', true),
      amt ('Amount',      'Amount (deposited asset)', true),
    ]),
  },
  {
    id: 'VaultWithdraw', label: 'VaultWithdraw',
    category: 'Vaults', color: CATEGORIES.VAULTS.color,
    networkGating: 'devnet-only', description: 'Withdraw assets from a vault.',
    fields: withCommon([
      addr('Account',    'Account'),
      hex ('VaultID',    'Vault ID', true),
      amt ('Amount',     'Amount (asset to withdraw)', true),
      addr('Destination','Destination', false),
      num ('DestinationTag', 'Destination Tag'),
    ]),
  },
  {
    id: 'VaultDelete', label: 'VaultDelete',
    category: 'Vaults', color: CATEGORIES.VAULTS.color,
    networkGating: 'devnet-only', description: 'Delete an empty vault.',
    fields: withCommon([
      addr('Account', 'Account'),
      hex ('VaultID', 'Vault ID', true),
    ]),
  },
  {
    id: 'VaultClawback', label: 'VaultClawback',
    category: 'Vaults', color: CATEGORIES.VAULTS.color,
    networkGating: 'devnet-only', description: 'Claw back funds from a vault.',
    fields: withCommon([
      addr('Account', 'Account (Issuer)'),
      hex ('VaultID', 'Vault ID', true),
      addr('Holder',  'Holder',   true),
      amt ('Amount',  'Amount (cap — omit for full clawback)'),
    ]),
  },

  // ── Lending Protocol (devnet-only) ────────────────────────────────────────
  {
    id: 'LoanBrokerSet', label: 'LoanBrokerSet',
    category: 'Lending Protocol', color: CATEGORIES.LENDING.color,
    networkGating: 'devnet-only', description: 'Create or update a loan broker.',
    fields: withCommon([
      addr('Account',        'Account'),
      hex ('VaultID',        'Vault ID', true),
      hex ('LoanBrokerID',   'Loan Broker ID (when updating)'),
      hex ('Data',           'Metadata (hex)'),
      txt ('DebtMaximum',    'Debt Maximum'),
      num ('ManagementFeeRate', 'Management Fee Rate'),
      num ('CoverRateMinimum', 'Minimum Cover Rate'),
      num ('CoverRateLiquidation', 'Liquidation Cover Rate'),
    ]),
  },
  {
    id: 'LoanBrokerDelete', label: 'LoanBrokerDelete',
    category: 'Lending Protocol', color: CATEGORIES.LENDING.color,
    networkGating: 'devnet-only', description: 'Delete a loan broker.',
    fields: withCommon([
      addr('Account',      'Account'),
      hex ('LoanBrokerID', 'Loan Broker ID', true),
    ]),
  },
  {
    id: 'LoanBrokerCoverDeposit', label: 'LoanBrokerCoverDeposit',
    category: 'Lending Protocol', color: CATEGORIES.LENDING.color,
    networkGating: 'devnet-only', description: 'Deposit first-loss capital.',
    fields: withCommon([
      addr('Account',      'Account'),
      hex ('LoanBrokerID', 'Loan Broker ID', true),
      amt ('Amount',       'Amount', true),
    ]),
  },
  {
    id: 'LoanBrokerCoverWithdraw', label: 'LoanBrokerCoverWithdraw',
    category: 'Lending Protocol', color: CATEGORIES.LENDING.color,
    networkGating: 'devnet-only', description: 'Withdraw first-loss capital.',
    fields: withCommon([
      addr('Account',      'Account'),
      hex ('LoanBrokerID', 'Loan Broker ID', true),
      amt ('Amount',       'Amount', true),
      addr('Destination',  'Destination', false),
      num ('DestinationTag','Destination Tag'),
    ]),
  },
  {
    id: 'LoanBrokerCoverClawback', label: 'LoanBrokerCoverClawback',
    category: 'Lending Protocol', color: CATEGORIES.LENDING.color,
    networkGating: 'devnet-only', description: 'Claw back first-loss capital.',
    fields: withCommon([
      addr('Account',      'Account'),
      hex ('LoanBrokerID', 'Loan Broker ID'),
      amt ('Amount',       'Amount'),
    ]),
  },
  {
    id: 'LoanSet', label: 'LoanSet',
    category: 'Lending Protocol', color: CATEGORIES.LENDING.color,
    networkGating: 'devnet-only', description: 'Create a loan agreement.',
    fields: withCommon([
      addr('Account',             'Account (Loan Broker)'),
      hex ('LoanBrokerID',        'Loan Broker ID', true),
      txt ('PrincipalRequested',  'Principal Requested', true),
      addr('Counterparty',        'Counterparty', true),
      hex ('Data',                'Metadata (hex)'),
      txt ('LoanOriginationFee',  'Origination Fee'),
      txt ('LoanServiceFee',      'Service Fee'),
      txt ('LatePaymentFee',      'Late Payment Fee'),
      txt ('ClosePaymentFee',     'Close Payment Fee'),
      num ('OverpaymentFee',      'Overpayment Fee Rate'),
      num ('InterestRate',        'Interest Rate'),
      num ('LateInterestRate',    'Late Interest Rate'),
      num ('CloseInterestRate',   'Close Interest Rate'),
      num ('OverpaymentInterestRate', 'Overpayment Interest Rate'),
      num ('PaymentTotal',        'Payment Count'),
      num ('PaymentInterval',     'Payment Interval (seconds)'),
      num ('GracePeriod',         'Grace Period (seconds)'),
      bool('tfLoanOverpayment',   'Allow Overpayment'),
      flags(),
    ]),
  },
  {
    id: 'LoanPay', label: 'LoanPay',
    category: 'Lending Protocol', color: CATEGORIES.LENDING.color,
    networkGating: 'devnet-only', description: 'Make a loan payment.',
    fields: withCommon([
      addr('Account', 'Account'),
      hex ('LoanID',  'Loan ID', true),
      amt ('Amount',  'Amount',  true),
      bool('tfLoanOverpayment', 'Overpayment'),
      bool('tfLoanFullPayment', 'Full Early Payment'),
      bool('tfLoanLatePayment', 'Late Payment'),
      flags(),
    ]),
  },
  {
    id: 'LoanManage', label: 'LoanManage',
    category: 'Lending Protocol', color: CATEGORIES.LENDING.color,
    networkGating: 'devnet-only', description: 'Manage loan state (default/impair).',
    fields: withCommon([
      addr('Account', 'Account'),
      hex ('LoanID',  'Loan ID', true),
      bool('tfLoanDefault', 'Mark as Default'),
      bool('tfLoanImpair',  'Impair Loan'),
      bool('tfLoanUnimpair','Unimpair Loan'),
      flags(),
    ]),
  },
  {
    id: 'LoanDelete', label: 'LoanDelete',
    category: 'Lending Protocol', color: CATEGORIES.LENDING.color,
    networkGating: 'devnet-only', description: 'Delete a fully-repaid loan.',
    fields: withCommon([
      addr('Account', 'Account'),
      hex ('LoanID',  'Loan ID', true),
    ]),
  },

  // ── Batch (devnet-only) ──────────────────────────────────────────────────
  {
    id: 'BatchContainer', label: 'Batch Container',
    category: 'Batch', color: CATEGORIES.BATCH.color,
    networkGating: 'devnet-only',
    description: 'Group up to 8 inner tx nodes atomically (drop them inside this container).',
    fields: [
      {
        name: 'ExecutionMode', label: 'Execution Mode', type: 'select', required: true,
        defaultValue: 'ALLORNOTHING',
        options: ['ALLORNOTHING', 'ONLYONE', 'UNTILFAILURE', 'INDEPENDENT'],
        description:
          'ALLORNOTHING — all succeed or all fail | ' +
          'ONLYONE — stop after first success | ' +
          'UNTILFAILURE — stop on first failure | ' +
          'INDEPENDENT — each succeeds or fails independently',
      },
    ],
  },

  // ── Control Flow ─────────────────────────────────────────────────────────
  {
    id: 'ConditionBranch', label: 'Condition Branch',
    category: 'Control Flow', color: CATEGORIES.CONTROL_FLOW.color,
    networkGating: 'all', description: 'Route flow using a safe expression.',
    fields: [
      txt('Expression', 'Safe Expression', true,
          'e.g. output.meta.TransactionResult == "tesSUCCESS"'),
      txt('TrueLabel',  'True Branch Label',  false),
      txt('FalseLabel', 'False Branch Label', false),
    ],
  },
  {
    id: 'ParallelSplit', label: 'Parallel Split',
    category: 'Control Flow', color: CATEGORIES.CONTROL_FLOW.color,
    networkGating: 'all', description: 'Fan out to multiple parallel branches.',
    fields: [],
  },
  {
    id: 'SyncJoin', label: 'Sync Join',
    category: 'Control Flow', color: CATEGORIES.CONTROL_FLOW.color,
    networkGating: 'all', description: 'Wait for all inbound branches to complete.',
    fields: [],
  },
  {
    id: 'LoopContainer', label: 'Loop Container',
    category: 'Control Flow', color: CATEGORIES.CONTROL_FLOW.color,
    networkGating: 'all', description: 'Repeat contained nodes, then continue downstream once.',
    fields: [
      {
        name: 'LoopMode', label: 'Loop Mode', type: 'select', required: true,
        defaultValue: 'count',
        options: ['count', 'until-condition'],
        description: '"count" repeats N times; "until-condition" uses the safe expression',
      },
      num('Iterations',    'Max Iterations (count mode)'),
      txt('Condition',     'Stop Condition (safe expression)', false,
          'Evaluated after each iteration. e.g. output.count >= 3'),
      num('DelayBetween',  'Delay Between Iterations (ms)'),
    ],
  },
  {
    id: 'Delay', label: 'Delay',
    category: 'Control Flow', color: CATEGORIES.CONTROL_FLOW.color,
    networkGating: 'all', description: 'Pause for a fixed time or until ledger closes.',
    fields: [
      {
        name: 'DelayMode', label: 'Delay Mode', type: 'select', required: true,
        defaultValue: 'ms',
        options: ['ms', 'ledger-close'],
        description: '"ms" waits a fixed duration; "ledger-close" waits for the next ledger close event',
      },
      num('Duration', 'Duration (ms) — used when mode is "ms"'),
    ],
  },

  // ── Output ───────────────────────────────────────────────────────────────
  {
    id: 'LogOutput', label: 'Log Output',
    category: 'Output', color: CATEGORIES.OUTPUT.color,
    networkGating: 'all', description: 'Log a message or the previous output.',
    fields: [
      txt('Message', 'Message (leave blank to log previous output as JSON)'),
    ],
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
