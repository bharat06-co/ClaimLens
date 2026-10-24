import type { NextConfig } from "next";
const config: NextConfig = { serverExternalPackages: ["@huggingface/transformers", "onnxruntime-node"] };
export default config;
