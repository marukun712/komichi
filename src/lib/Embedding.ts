import { pipeline } from "@huggingface/transformers";

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
