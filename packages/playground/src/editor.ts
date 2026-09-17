import * as monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/language/json/json.worker?worker'
import tsWorker from 'monaco-editor/language/typescript/ts.worker?worker'

import { definitions, modulePaths } from './definitions'
import clientCode from './snippets/client?raw'
import serverCode from './snippets/server?raw'

self.MonacoEnvironment = {
    getWorker(_workerId: string, label: string) {
        if (label === 'json') {
            return new jsonWorker()
        }
        if (label === 'typescript' || label === 'javascript') {
            return new tsWorker()
        }
        return new editorWorker()
    },
}

function configureTypescript() {
    const defaults = monaco.typescript.typescriptDefaults

    for (const [filepath, content] of Object.entries(definitions)) {
        const uri = filepath.replace(/^..\/node_modules/, '/node_modules')
        defaults.addExtraLib(content, `file://${uri}`)
    }

    defaults.setCompilerOptions({
        target: monaco.typescript.ScriptTarget.ES2020,
        module: monaco.typescript.ModuleKind.ESNext,
        moduleResolution: monaco.typescript.ModuleResolutionKind.NodeJs,
        strict: true,
        noEmit: true,
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        skipLibCheck: true,
        allowNonTsExtensions: true,
        baseUrl: 'file:///',
        paths: modulePaths,
    })

    defaults.setEagerModelSync(true)
}
configureTypescript()

const editorOptions: monaco.editor.IStandaloneEditorConstructionOptions = {
    theme: 'vs-dark',
    automaticLayout: true,
    minimap: { enabled: false },
    fontFamily: 'Hack Nerd Font',
    codeLensFontFamily: 'Hack Nerd Font',
    fontSize: 15,
    lineHeight: 22,
    smoothScrolling: true,
    padding: { top: 12 },
    scrollBeyondLastLine: false,
    tabSize: 4,
    renderWhitespace: 'selection',
    quickSuggestions: { other: true, comments: false, strings: true },
    scrollbar: { vertical: 'auto', horizontal: 'auto' },
}

export const serverModel = monaco.editor.createModel(
    serverCode,
    'typescript',
    monaco.Uri.parse('file:///server.ts'),
)

export const clientModel = monaco.editor.createModel(
    clientCode,
    'typescript',
    monaco.Uri.parse('file:///client.ts'),
)

export const editor = monaco.editor.create(
    document.querySelector('#editor') as HTMLElement,
    {
        model: serverModel,
        ...editorOptions,
    },
)

export type FileKind = 'server.ts' | 'client.ts'

export const defaultSources: Record<FileKind, string> = {
    'server.ts': serverCode,
    'client.ts': clientCode,
}

export const models: Record<FileKind, monaco.editor.ITextModel> = {
    'server.ts': serverModel,
    'client.ts': clientModel,
}

const savedSources: Record<FileKind, string> = { ...defaultSources }

let activeFile: FileKind = 'server.ts'

function reflectModified(file: FileKind) {
    const button = document.querySelector<HTMLButtonElement>(
        `#file-tabs [data-file="${file}"]`,
    )
    if (!button) return
    const dot = button.querySelector<HTMLElement>('[data-modified-dot]')
    if (!dot) return
    const modified = models[file].getValue() !== savedSources[file]
    dot.classList.toggle('opacity-100', modified)
    dot.classList.toggle('opacity-0', !modified)
}

serverModel.onDidChangeContent(() => reflectModified('server.ts'))
clientModel.onDidChangeContent(() => reflectModified('client.ts'))

export function openFile(file: FileKind) {
    activeFile = file
    editor.setModel(models[file])

    for (const button of document.querySelectorAll<HTMLButtonElement>(
        '#file-tabs [role="tab"]',
    )) {
        const active = button.dataset.file === file
        button.classList.toggle('tab-active', active)
        button.setAttribute('aria-selected', String(active))
    }
    reflectModified(file)
}

export function getSource(file: FileKind) {
    return models[file].getValue()
}

export function saveEditor() {
    savedSources[activeFile] = models[activeFile].getValue()
    reflectModified(activeFile)
}

export function applyTheme(isDark: boolean) {
    monaco.editor.setTheme(isDark ? 'vs-dark' : 'vs-light')
}
