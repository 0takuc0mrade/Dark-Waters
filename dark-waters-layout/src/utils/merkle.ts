
import { hash } from 'starknet';

export interface Ship {
  x: number;
  y: number;
  is_ship: boolean;
}

export class BoardMerkle {
  private leaves: bigint[];
  private tree: bigint[][];
  private root: bigint;

  constructor(ships: Ship[], salt: bigint | string) {
    this.leaves = this.generateLeaves(ships, BigInt(salt));
    this.tree = this.buildTree(this.leaves);
    this.root = this.tree[this.tree.length - 1][0];
  }

  private generateLeaves(ships: Ship[], salt: bigint): bigint[] {
    const leaves: bigint[] = [];
    // Create a map for quick lookup
    const shipMap = new Map<string, boolean>();
    ships.forEach(s => {
        if (s.is_ship) {
            shipMap.set(`${s.x},${s.y}`, true);
        }
    });

    // 10x10 Grid (0-9) - Row-major order y then x
    for (let y = 0; y < 10; y++) {
        for (let x = 0; x < 10; x++) {
            const isShip = shipMap.get(`${x},${y}`) || false;
            // Hash: [x, y, salt, is_ship]
            // Note: computePoseidonHashOnElements expects array of BigNumberish
            // Backend uses poseidon_hash_span which includes length mixing.
            // Client side 'computePoseidonHashOnElements' matches this.
            const inputs = [
                BigInt(x),
                BigInt(y),
                salt,
                BigInt(isShip ? 1 : 0)
            ];
            const leafHash = hash.computePoseidonHashOnElements(inputs);
            leaves.push(BigInt(leafHash));
        }
    }
    return leaves;
  }

  private buildTree(leaves: bigint[]): bigint[][] {
    let currentLayer = [...leaves];

    // Pad to next power of 2 using BigInt(0) (standard padding for Merkle Proof loop compatibility)
    // 100 leaves -> 128 leaves
    const nextPow2 = Math.pow(2, Math.ceil(Math.log2(currentLayer.length)));
    while (currentLayer.length < nextPow2) {
       currentLayer.push(BigInt(0));
    }

    const layers: bigint[][] = [currentLayer];

    while (currentLayer.length > 1) {
        const nextLayer: bigint[] = [];
        for (let i = 0; i < currentLayer.length; i += 2) {
            const a = currentLayer[i];
            const b = currentLayer[i + 1];

            // Lexicographical sorting before hashing pairs (Alexander Merkle Tree / Starknet standard)
            // Backend uses poseidon_hash(a, b) for internal nodes (no length mixing)
            if (a < b) {
                const pairHash = hash.computePoseidonHash(a, b);
                nextLayer.push(BigInt(pairHash));
            } else {
                const pairHash = hash.computePoseidonHash(b, a);
                nextLayer.push(BigInt(pairHash));
            }
        }
        layers.push(nextLayer);
        currentLayer = nextLayer;
    }
    return layers;
  }

  public getRoot(): bigint {
    return this.root;
  }

  public getProof(x: number, y: number): bigint[] {
     // Ensure x, y in bounds
     if (x < 0 || x >= 10 || y < 0 || y >= 10) throw new Error("Coordinates out of bounds. Expected 0-9.");

     // Calculate index based on generation order (Row-major: y * 10 + x)
     // This maps (0,0) -> 0, (9,0) -> 9, (0,1) -> 10, (9,9) -> 99
     const index = y * 10 + x;

     const proof: bigint[] = [];
     let currentIndex = index;

     // Traverse up to root (exclusive)
     for (let i = 0; i < this.tree.length - 1; i++) {
         const layer = this.tree[i];
         const isRightNode = currentIndex % 2 !== 0;
         const siblingIndex = isRightNode ? currentIndex - 1 : currentIndex + 1;

         if (siblingIndex < layer.length) {
             proof.push(layer[siblingIndex]);
         } else {
             // Fallback for odd nodes if not padded (should not be reached with padding logic above)
             proof.push(BigInt(0));
         }

         currentIndex = Math.floor(currentIndex / 2);
     }
     return proof;
  }
}
