import { Connector } from "@starknet-react/core";
import {
  Account,
  RpcProvider,
  type AccountInterface,
  type ProviderInterface,
  type PaymasterInterface,
} from "starknet";
import type {
  RpcMessage,
  RequestFnCall,
  RpcTypeToMessageMap,
} from "@starknet-io/types-js";

// ── Constants ───────────────────────────────────────────────────────

// Katana predeployed accounts (from `katana --dev`)
const ACCOUNTS = [
  {
    // Account #0 (Player 1 — default)
    address: "0x127fd5f1fe78a71f8bcd1fec63e3fe2f0486b6ecd5c86a0466c3a21fa5cfcec",
    privateKey: "0xc5b2fcab997346f3ea1c00b002ecf6f382c5f9c9659a3894eb783c5320f912",
  },
  {
    // Account #1 (Player 2 — use ?player=2)
    address: "0x13d9ee239f33fea4f8785b9e3870ade909e20a9599ae7cd62c1c292b73af1b7",
    privateKey: "0x1c9053c053edf324aec366a34c6901b1095b07af69495bffec7d7fe21effb1b",
  },
];

const KATANA_RPC = "http://localhost:5050";
const KATANA_CHAIN_ID = BigInt("0x4b4154414e41");

const PLACEHOLDER_ICON =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyIj48Y2lyY2xlIGN4PSIxMiIgY3k9IjEyIiByPSIxMCIvPjwvc3ZnPg==";

// ── Helper ──────────────────────────────────────────────────────────

/** Read `?player=2` from the URL to select Account #1; defaults to Account #0 */
function getActiveAccount(): { address: string; privateKey: string } {
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    const player = params.get("player");
    if (player === "2") return ACCOUNTS[1];
  }
  return ACCOUNTS[0];
}

function createBurnerAccount(provider: RpcProvider): Account {
  const { address, privateKey } = getActiveAccount();
  return new Account({
    provider,
    address,
    signer: privateKey,
    // Use 'minTip' to skip tip statistics analysis.
    // Katana doesn't support the RPC methods that 'recommendedTip' (default) needs.
    defaultTipType: "minTip",
  });
}

// ── Connector ───────────────────────────────────────────────────────

export class BurnerConnector extends Connector {
  private _account: Account | null = null;
  private readonly _provider: RpcProvider;

  constructor() {
    super();
    this._provider = new RpcProvider({ nodeUrl: KATANA_RPC });
  }

  /* ── id / name / icon (abstract getters) ────────────────────────── */

  get id(): string {
    return "burner-wallet";
  }

  get name(): string {
    return "Burner Wallet";
  }

  get icon(): string | { dark: string; light: string } {
    return { dark: PLACEHOLDER_ICON, light: PLACEHOLDER_ICON };
  }

  /* ── available / ready ──────────────────────────────────────────── */

  available(): boolean {
    return true;
  }

  async ready(): Promise<boolean> {
    return true;
  }

  /* ── connect / disconnect ───────────────────────────────────────── */

  async connect(
    _args?: { chainIdHint?: bigint }
  ): Promise<{ account?: string; chainId?: bigint }> {
    this._account = createBurnerAccount(this._provider);
    return { account: getActiveAccount().address, chainId: KATANA_CHAIN_ID };
  }

  async disconnect(): Promise<void> {
    this._account = null;
  }

  /* ── account / chainId ──────────────────────────────────────────── */

  async account(
    _provider: ProviderInterface,
    _paymasterProvider?: PaymasterInterface
  ): Promise<AccountInterface> {
    if (!this._account) {
      this._account = createBurnerAccount(this._provider);
    }
    return this._account;
  }

  async chainId(): Promise<bigint> {
    return KATANA_CHAIN_ID;
  }

  /* ── request (wallet RPC – not needed for burner) ───────────────── */

  async request<T extends RpcMessage["type"]>(
    _call: RequestFnCall<T>
  ): Promise<RpcTypeToMessageMap[T]["result"]> {
    throw new Error("Burner wallet does not support wallet RPC requests");
  }
}
