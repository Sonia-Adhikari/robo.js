import { IS_BUN_RUNTIME } from '../utils/runtime-utils.js'
import { compilerLogger } from '../utils/loggers.js'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { CompilerOptions, Diagnostic } from 'typescript'
import type { default as Typescript } from 'typescript'
import type { transform as SwcTransform } from '@swc/core'

// Load Typescript compiler in a try/catch block
// This is to maintain compatibility with JS-only projects
export let ts: typeof Typescript
export let transform: typeof SwcTransform

await preloadTransformers()

export function buildDeclarationFiles(tsOptions?: CompilerOptions) {
	// Define the compiler options specifically for declaration files
	const options: CompilerOptions = {
		target: ts.ScriptTarget.Latest,
		rootDir: 'src',
		outDir: '.robo/build', // Don't worry, TS auto normalizes this
		declaration: true,
		emitDeclarationOnly: true,
		moduleResolution: ts.ModuleResolutionKind.NodeNext,
		noEmit: false,
		skipLibCheck: true,
		...(tsOptions ?? {}),
		incremental: false
	}

	// Emit the declaration files
	const fileNames = ts.sys.readDirectory('src', ['.ts', '.tsx'])
	const program = ts.createProgram(fileNames, options)
	const emitResult = program.emit()

	// Collect and display the diagnostics, if any
	const allDiagnostics = ts.getPreEmitDiagnostics(program).concat(emitResult.diagnostics)
	allDiagnostics.forEach((diagnostic) => {
		switch (diagnostic.category) {
			case ts.DiagnosticCategory.Error:
				compilerLogger.error(formatDiagnostic(diagnostic))
				break
			case ts.DiagnosticCategory.Warning:
				compilerLogger.warn(formatDiagnostic(diagnostic))
				break
			case ts.DiagnosticCategory.Message:
			case ts.DiagnosticCategory.Suggestion:
				compilerLogger.info(formatDiagnostic(diagnostic))
				break
		}
	})

	// Exit the process if there were any errors
	if (emitResult.emitSkipped) {
		process.exit(1)
	}
}

export async function getTypeScriptCompilerOptions(): Promise<CompilerOptions> {
	// Parse tsconfig.json and convert compiler options
	const configFileName = path.join(process.cwd(), 'tsconfig.json')
	const configFileContents = await readFile(configFileName, 'utf8')
	const { config: tsconfig, error } = ts.parseConfigFileTextToJson(configFileName, configFileContents)

	if (error) {
		compilerLogger.error('Error parsing tsconfig.json:', error)
		process.exit(1)
	}

	const { options: tsOptions } = ts.convertCompilerOptionsFromJson(
		tsconfig.compilerOptions,
		path.dirname(configFileName)
	)
	if (tsOptions.errors) {
		compilerLogger.error('Error parsing compiler options from tsconfig.json')
		process.exit(1)
	}

	return tsOptions
}

function formatDiagnostic(diagnostic: Diagnostic): string {
	if (diagnostic.file) {
		const { line, character } = ts.getLineAndCharacterOfPosition(diagnostic.file, diagnostic.start)
		const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
		return `${diagnostic.file.fileName} (${line + 1},${character + 1}): ${message}`
	} else {
		return ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
	}
}

/**
 * Checks if the current project is a TypeScript project.
 * This is determined by the presence of a tsconfig.json file and the availability of the TypeScript dependencies.
 *
 * @returns Outcome and what is missing
 */
export function isTypescriptProject() {
	const missing: string[] = []
	if (!existsSync(path.join(process.cwd(), 'tsconfig.json'))) {
		missing.push('tsconfig.json')
	}
	if (typeof ts === 'undefined') {
		missing.push('typescript')
	}
	if (typeof transform === 'undefined') {
		missing.push('@swc/core')
	}

	return {
		isTypeScript: missing.length === 0,
		missing
	}
}

export async function preloadTransformers() {
	try {
		// Disable Typescript compiler(s) if using Bun, unless for plugin builds
		// This is because plugins may be used in any runtime environment (not just Bun)
		if (!IS_BUN_RUNTIME) {
			compilerLogger.debug(`Preloading Typescript transformers...`)
			const [typescript, swc] = await Promise.all([import('typescript'), import('@swc/core')])
			ts = typescript.default
			transform = swc.transform
		}
	} catch {
		// Ignore
	}
}
