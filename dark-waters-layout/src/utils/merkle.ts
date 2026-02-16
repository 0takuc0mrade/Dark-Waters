import { hash } from "starknet"

export interface Ship {
  x: number
  y: number
  is_ship: boolean
}

export function randomFeltHex(bytes = 16): string {
  const data = new Uint8Array(bytes)
  crypto.getRandomValues(data)
  return `0x${Array.from(data)
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")}`
}

export function deriveCellNonce(masterSecret: bigint | string, x: number, y: number): bigint {
  const nonce = hash.computePoseidonHashOnElements([
    BigInt(masterSecret),
    BigInt(x),
    BigInt(y),
  ])
  return BigInt(nonce)
}

export function computeAttackCommitmentHash(
  x: number,
  y: number,
  revealNonce: bigint | string
): string {
  const commitment = hash.computePoseidonHashOnElements([
    BigInt(x),
    BigInt(y),
    BigInt(revealNonce),
  ])
  return `0x${BigInt(commitment).toString(16)}`
}

export class BoardMerkle {
  private readonly leaves: bigint[]
  private readonly tree: bigint[][]
  private readonly root: bigint
  private readonly masterSecret: bigint

  constructor(ships: Ship[], masterSecret: bigint | string) {
    this.masterSecret = BigInt(masterSecret)
    this.leaves = this.generateLeaves(ships)
    this.tree = this.buildTree(this.leaves)
    this.root = this.tree[this.tree.length - 1][0]
  }

  private generateLeaves(ships: Ship[]): bigint[] {
    const leaves: bigint[] = []
    const shipMap = new Map<string, boolean>()

    ships.forEach((ship) => {
      if (ship.is_ship) shipMap.set(`${ship.x},${ship.y}`, true)
    })

    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 10; x++) {
        const isShip = shipMap.get(`${x},${y}`) || false
        const nonce = deriveCellNonce(this.masterSecret, x, y)
        const leafHash = hash.computePoseidonHashOnElements([
          BigInt(x),
          BigInt(y),
          nonce,
          BigInt(isShip ? 1 : 0),
        ])
        leaves.push(BigInt(leafHash))
      }
    }

    return leaves
  }

  private buildTree(leaves: bigint[]): bigint[][] {
    let currentLayer = [...leaves]
    const nextPow2 = Math.pow(2, Math.ceil(Math.log2(currentLayer.length)))

    while (currentLayer.length < nextPow2) currentLayer.push(BigInt(0))

    const layers: bigint[][] = [currentLayer]

    while (currentLayer.length > 1) {
      const nextLayer: bigint[] = []
      for (let i = 0; i < currentLayer.length; i += 2) {
        const a = currentLayer[i]
        const b = currentLayer[i + 1]
        const pairHash = a < b ? hash.computePoseidonHash(a, b) : hash.computePoseidonHash(b, a)
        nextLayer.push(BigInt(pairHash))
      }
      layers.push(nextLayer)
      currentLayer = nextLayer
    }

    return layers
  }

  public getRoot(): bigint {
    return this.root
  }

  public getCellNonce(x: number, y: number): bigint {
    if (x < 0 || x >= 10 || y < 0 || y >= 10) {
      throw new Error("Coordinates out of bounds. Expected 0-9.")
    }
    return deriveCellNonce(this.masterSecret, x, y)
  }

  public getCellNonceHex(x: number, y: number): string {
    return `0x${this.getCellNonce(x, y).toString(16)}`
  }

  public getProof(x: number, y: number): bigint[] {
    if (x < 0 || x >= 10 || y < 0 || y >= 10) {
      throw new Error("Coordinates out of bounds. Expected 0-9.")
    }

    const index = y * 10 + x
    const proof: bigint[] = []
    let currentIndex = index

    for (let i = 0; i < this.tree.length - 1; i++) {
      const layer = this.tree[i]
      const isRightNode = currentIndex % 2 !== 0
      const siblingIndex = isRightNode ? currentIndex - 1 : currentIndex + 1
      proof.push(siblingIndex < layer.length ? layer[siblingIndex] : BigInt(0))
      currentIndex = Math.floor(currentIndex / 2)
    }

    return proof
  }
}
