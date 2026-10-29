/**
 * Monaco bootstrap: worker wiring, NodeZen themes and TypeScript language
 * service configuration (including the sandbox's ambient type library).
 * Imported lazily so Monaco only loads inside rooms.
 *
 * NOTE: monaco-editor 0.57+ uses an exports map where `monaco-editor/*`
 * resolves under `esm/vs/*`, and the language services live in the
 * `monaco.typescript` / `monaco.json` / ... namespaces.
 */
import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/editor/editor.worker?worker";
import tsWorker from "monaco-editor/language/typescript/ts.worker?worker";
import jsonWorker from "monaco-editor/language/json/json.worker?worker";
import cssWorker from "monaco-editor/language/css/css.worker?worker";
import htmlWorker from "monaco-editor/language/html/html.worker?worker";
import nodezenTypes from "../assets/nodezen.d.ts?raw";

let configured = false;

export function setupMonaco(): typeof monaco {
	if (configured) return monaco;
	configured = true;

	self.MonacoEnvironment = {
		getWorker(_workerId: string, label: string) {
			switch (label) {
				case "json":
					return new jsonWorker();
				case "css":
				case "scss":
				case "less":
					return new cssWorker();
				case "html":
				case "handlebars":
				case "razor":
					return new htmlWorker();
				case "typescript":
				case "javascript":
					return new tsWorker();
				default:
					return new editorWorker();
			}
		},
	};

	monaco.editor.defineTheme("nodezen-dark", {
		base: "vs-dark",
		inherit: true,
		rules: [
			{ token: "comment", foreground: "5f6f66", fontStyle: "italic" },
			{ token: "keyword", foreground: "6fdcc6" },
			{ token: "keyword.control", foreground: "6fdcc6" },
			{ token: "string", foreground: "e8b46a" },
			{ token: "string.escape", foreground: "f0c98d" },
			{ token: "number", foreground: "e58fb4" },
			{ token: "constant", foreground: "e58fb4" },
			{ token: "type", foreground: "8ab8ff" },
			{ token: "type.identifier", foreground: "8ab8ff" },
			{ token: "identifier", foreground: "dfe7e0" },
			{ token: "function", foreground: "a9d984" },
			{ token: "operator", foreground: "7fb8a8" },
			{ token: "delimiter", foreground: "9aa8a0" },
			{ token: "regexp", foreground: "d7a1e0" },
			{ token: "tag", foreground: "6fdcc6" },
			{ token: "attribute.name", foreground: "8ab8ff" },
			{ token: "attribute.value", foreground: "e8b46a" },
		],
		colors: {
			"editor.background": "#0f1412",
			"editor.foreground": "#dfe7e0",
			"editor.lineHighlightBackground": "#151c19",
			"editor.selectionBackground": "#1d3a33",
			"editor.inactiveSelectionBackground": "#182825",
			"editorCursor.foreground": "#2dd4bf",
			"editorWhitespace.foreground": "#223029",
			"editorIndentGuide.background1": "#1c2521",
			"editorLineNumber.foreground": "#3d4b44",
			"editorLineNumber.activeForeground": "#8aa396",
			"editorGutter.background": "#0f1412",
			"editorWidget.background": "#131a17",
			"editorWidget.border": "#232b27",
			"editorSuggestWidget.background": "#131a17",
			"editorSuggestWidget.border": "#232b27",
			"editorSuggestWidget.selectedBackground": "#1d3a33",
			"editorHoverWidget.background": "#131a17",
			"editorHoverWidget.border": "#232b27",
			"editorError.foreground": "#e06c60",
			"editorWarning.foreground": "#d9a15c",
			"minimap.background": "#0d1210",
			"scrollbarSlider.background": "#2a352f66",
			"scrollbarSlider.hoverBackground": "#39463f88",
		},
	});

	monaco.editor.defineTheme("nodezen-light", {
		base: "vs",
		inherit: true,
		rules: [
			{ token: "comment", foreground: "8a948b", fontStyle: "italic" },
			{ token: "keyword", foreground: "0e7a6d" },
			{ token: "keyword.control", foreground: "0e7a6d" },
			{ token: "string", foreground: "a3541e" },
			{ token: "string.escape", foreground: "8a4a1c" },
			{ token: "number", foreground: "b0387f" },
			{ token: "constant", foreground: "b0387f" },
			{ token: "type", foreground: "2b6cb0" },
			{ token: "type.identifier", foreground: "2b6cb0" },
			{ token: "identifier", foreground: "2c3a30" },
			{ token: "function", foreground: "4c7a1f" },
			{ token: "operator", foreground: "3d6f63" },
			{ token: "delimiter", foreground: "5d6b60" },
			{ token: "regexp", foreground: "8a3fa0" },
			{ token: "tag", foreground: "0e7a6d" },
			{ token: "attribute.name", foreground: "2b6cb0" },
			{ token: "attribute.value", foreground: "a3541e" },
		],
		colors: {
			"editor.background": "#ffffff",
			"editor.foreground": "#243028",
			"editor.lineHighlightBackground": "#f2f5f0",
			"editor.selectionBackground": "#cdeae2",
			"editor.inactiveSelectionBackground": "#e4efe9",
			"editorCursor.foreground": "#0d9488",
			"editorWhitespace.foreground": "#d7ded4",
			"editorIndentGuide.background1": "#e6ebe2",
			"editorLineNumber.foreground": "#b3bda9",
			"editorLineNumber.activeForeground": "#5f6f5a",
			"editorGutter.background": "#ffffff",
			"editorWidget.background": "#ffffff",
			"editorWidget.border": "#dfe5da",
			"editorSuggestWidget.background": "#ffffff",
			"editorSuggestWidget.border": "#dfe5da",
			"editorSuggestWidget.selectedBackground": "#e0f2ee",
			"editorHoverWidget.background": "#ffffff",
			"editorHoverWidget.border": "#dfe5da",
			"editorError.foreground": "#c0392b",
			"editorWarning.foreground": "#b07d2a",
			"minimap.background": "#fbfcfa",
			"scrollbarSlider.background": "#9aa89533",
			"scrollbarSlider.hoverBackground": "#8a988544",
		},
	});

	const ts = monaco.typescript;
	const compilerOptions = {
		target: ts.ScriptTarget.ES2022,
		module: ts.ModuleKind.CommonJS,
		moduleResolution: ts.ModuleResolutionKind.NodeJs,
		allowJs: true,
		allowNonTsExtensions: true,
		esModuleInterop: true,
		strict: false,
		noEmit: true,
		lib: ["es2022", "dom"],
	};

	for (const defaults of [ts.typescriptDefaults, ts.javascriptDefaults]) {
		defaults.setCompilerOptions(compilerOptions);
		defaults.setDiagnosticsOptions({
			noSemanticValidation: false,
			noSyntaxValidation: false,
			onlyVisible: true,
		});
		defaults.addExtraLib(nodezenTypes, "file:///node_modules/@types/nodezen-sandbox/index.d.ts");
	}

	return monaco;
}

export const EDITOR_OPTIONS: monaco.editor.IStandaloneEditorConstructionOptions = {
	fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, 'Cascadia Code', monospace",
	fontSize: 13.5,
	fontLigatures: true,
	lineHeight: 1.65,
	smoothScrolling: true,
	cursorBlinking: "phase",
	cursorSmoothCaretAnimation: "on",
	renderLineHighlight: "all",
	roundedSelection: true,
	scrollBeyondLastLine: false,
	automaticLayout: true,
	tabSize: 2,
	insertSpaces: true,
	minimap: { enabled: true, renderCharacters: false, maxColumn: 80, scale: 1 },
	padding: { top: 14, bottom: 14 },
	bracketPairColorization: { enabled: true },
	guides: { bracketPairs: "active", indentation: true },
	links: true,
	renderWhitespace: "selection",
	quickSuggestions: { other: "on", comments: "off", strings: "on" },
	scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
	overviewRulerBorder: false,
	hideCursorInOverviewRuler: true,
	fixedOverflowWidgets: true,
};

export type Monaco = typeof monaco;
