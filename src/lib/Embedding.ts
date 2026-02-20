import { type DataArray, pipeline } from "@huggingface/transformers";

const extractor = await pipeline(
	"feature-extraction",
	"Xenova/multilingual-e5-small",
);

export async function getVec(text: string) {
	const output = await extractor(`passage: ${text}`, {
		pooling: "mean",
		normalize: true,
	});
	return output.data;
}

export function cosineSimilarity(a: DataArray, b: DataArray) {
	if (a.length !== b.length) {
		throw new Error("Vector size mismatch");
	}

	let dot = 0;
	let normA = 0;
	let normB = 0;

	for (let i = 0; i < a.length; i++) {
		dot += a[i] * b[i];
		normA += a[i] * a[i];
		normB += b[i] * b[i];
	}

	return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
