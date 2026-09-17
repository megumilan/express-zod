import './style.css'
import '@fontsource-variable/inter/wght.css'

import { applyTheme, type FileKind, openFile, saveEditor } from './editor'

const colorSchemeMedia = window.matchMedia('(prefers-color-scheme: dark)')

applyTheme(colorSchemeMedia.matches)
colorSchemeMedia.addEventListener('change', (e) => applyTheme(e.matches))

openFile('server.ts')

const fileTabs = document.querySelector('#file-tabs') as HTMLElement

fileTabs.addEventListener('click', (e) => {
    const button = (e.target as HTMLElement).closest<HTMLButtonElement>(
        '[data-file]',
    )
    if (button) {
        openFile(button.dataset.file as FileKind)
    }
})

document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        saveEditor()
    }
})
