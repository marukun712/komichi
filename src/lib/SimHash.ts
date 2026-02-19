import { md5 } from "@noble/hashes/legacy.js";

export type Bit = 0 | 1;

export function getWeights(text: string, ngram: number) {
	const split: string[] = [];
	for (let i = 0; i <= text.length - ngram; i++) {
		split.push(text.slice(i, i + ngram));
	}

	const weights: number[][] = [];

	split.forEach((s) => {
		const bits: number[] = [];
		const buf = new TextEncoder().encode(s);
		const hash = md5(buf);
		hash.forEach((b) => {
			for (let i = 7; i >= 0; i--) {
				bits.push((b >> i) & 1);
			}
		});

		const w: number[] = [];
		bits.forEach((b, i) => {
			if (b === 1) {
				w[i] = 1;
			} else {
				w[i] = -1;
			}
		});

		weights.push(w);
	});

	return weights;
}

export function getHash(weights: number[][]) {
	const result = new Array(weights[0].length).fill(0);

	for (let i = 0; i < weights[0].length; i++) {
		weights.forEach((w) => {
			result[i] += w[i];
		});
	}

	const hashBits: Bit[] = result.map((v) => (v > 0 ? 1 : 0));
	return hashBits;
}

export function hammingDistance(a: Bit[], b: Bit[]) {
	let count = 0;
	if (a.length !== b.length) {
		throw new Error("Invalid length of hash");
	}
	for (let i = 0; i < a.length; i++) {
		const xor = a[i] ^ b[i];
		if (xor === 1) count++;
	}
	return count;
}
