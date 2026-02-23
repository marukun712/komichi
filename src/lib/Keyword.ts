import { getVec } from "./Embedding";

type DataArray = number[] | Float32Array;

function cosineSimilarity(a: DataArray, b: DataArray) {
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

const segmenter = new Intl.Segmenter("ja-JP", { granularity: "word" });

function tokenize(text: string): string[] {
	return Array.from(segmenter.segment(text))
		.filter((s) => s.isWordLike && s.segment.length >= 2)
		.map((s) => s.segment);
}

export async function extractKeywords(
	text: string,
	docVec: number[],
	topK = 3,
): Promise<string> {
	const tokens = tokenize(text);
	if (tokens.length === 0) return text.slice(0, 50);

	const scored = await Promise.all(
		tokens.map(async (token) => ({
			token,
			score: cosineSimilarity(docVec, Array.from(await getVec(token))),
		})),
	);

	return scored
		.sort((a, b) => b.score - a.score)
		.slice(0, topK)
		.map((s) => s.token)
		.join(" ");
}
