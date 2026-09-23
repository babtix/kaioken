export { buildIndex } from "./build.js";
export type { BuildOptions, BuildOutcome, BuildStats } from "./build.js";
export { extractFile, docOf, isExported, signatureOf } from "./extract.js";
export type { ExtractInput } from "./extract.js";
export { initParser, isSupportedLanguage, loadGrammar, supportedLanguages } from "./grammars.js";
export { SymbolOracle } from "./oracle.js";
export type { SymbolLocation } from "./oracle.js";
export { enclosingSymbol, resolveExcerpt, resolveRange } from "./anchors.js";
export type { Anchor, AnchorResolution } from "./anchors.js";
export {
	INDEX_ARTIFACT,
	indexArtifactPath,
	readIndexArtifact,
	writeIndexArtifact,
} from "./artifact.js";
export type { FileMap, IndexResult, SymbolKind, SymbolRecord } from "./types.js";
