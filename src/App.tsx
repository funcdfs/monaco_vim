import { useState, useRef, useEffect } from 'react'
import Editor, { Monaco } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import { initVimMode, VimMode } from 'monaco-vim'
// Import built-in themes
import monokaiTheme from 'monaco-themes/themes/Monokai.json'
import githubTheme from 'monaco-themes/themes/GitHub Dark.json'
import solarizedDarkTheme from 'monaco-themes/themes/Solarized-dark.json'
import nordTheme from 'monaco-themes/themes/Nord.json'
import draculaTheme from 'monaco-themes/themes/Dracula.json'
import horizonTheme from './themes/horizon.json'
import konngTheme from './themes/konng.json'
import './App.css'

// Theme type definitions
type ThemeDefinition = {
  id: string;
  name: string;
  builtin: boolean;
  data?: any;
}

// Theme definitions with source information
const themes: ThemeDefinition[] = [
  { id: 'konng', name: 'KONNG', builtin: false, data: konngTheme },
  { id: 'horizon', name: 'Horizon', builtin: false, data: horizonTheme },
  { id: 'nord', name: 'Nord', builtin: false, data: nordTheme },
  { id: 'vs-dark', name: 'vs-dark', builtin: true },
  { id: 'monokai', name: 'Monokai', builtin: false, data: monokaiTheme },
  { id: 'github', name: 'GitHub', builtin: false, data: githubTheme },
  { id: 'solarized-dark', name: 'Solarized Dark', builtin: false, data: solarizedDarkTheme },
  { id: 'dracula', name: 'Dracula', builtin: false, data: draculaTheme },
];

// Add type declaration for VimMode
declare module 'monaco-vim' {
  export interface VimMode {
    dispose: () => void;
  }
  export const VimMode: {
    Vim: {
      map: (from: string, to: string, mode?: string) => void;
      noremap: (from: string, to: string, mode?: string) => void;
      defineEx: (name: string, shortName: string, callback: Function) => void;
      defineOption: (name: string, value: any) => void;
    }
  }
}

// Enhance EditorTab interface
interface EditorTab {
  id: number;
  content: string;
  language: string;
  cursorPosition?: { lineNumber: number; column: number };
  history: {
    type: 'copy' | 'reset' | 'clear';
    content: string;
    cursorPosition?: { lineNumber: number; column: number };
  }[];
  viewState?: monaco.editor.ICodeEditorViewState;
  selections?: monaco.Selection[];
}

const defaultCppCode = `#include <bits/stdc++.h>
using namespace std;
using int64 = long long;
#define endl '\\n'       
#define println(...)   std::cout << __VA_ARGS__ << '\\n'

int main() {
   xxx
   return 0; 
}`

function App() {
  const [theme, setTheme] = useState<string>('konng')
  const [activeTab, setActiveTab] = useState(1)
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const vimModeRef = useRef<any>(null)
  
  // Initialize tabs with enhanced state
  const [tabs, setTabs] = useState<EditorTab[]>([
    { id: 1, content: defaultCppCode, language: 'cpp', history: [] },
    { id: 2, content: defaultCppCode, language: 'cpp', history: [] },
    { id: 3, content: defaultCppCode, language: 'cpp', history: [] },
    { id: 4, content: defaultCppCode, language: 'cpp', history: [] },
  ])

  const handleThemeChange = (newTheme: string) => {
    try {
      // First set the theme in Monaco editor
      monaco.editor.setTheme(newTheme)
      // Then update the state
      setTheme(newTheme)
    } catch (error) {
      console.error('Error changing theme:', error)
    }
  }

  const saveToHistory = (type: 'copy' | 'reset' | 'clear') => {
    if (editorRef.current) {
      const content = editorRef.current.getValue()
      const cursorPosition = editorRef.current.getPosition()
      
      setTabs(prev => prev.map(tab => 
        tab.id === activeTab
          ? {
              ...tab,
              history: [...tab.history, {
                type,
                content,
                cursorPosition: cursorPosition ? {
                  lineNumber: cursorPosition.lineNumber,
                  column: cursorPosition.column
                } : undefined
              }]
            }
          : tab
      ))
    }
  }

  const saveTabState = (tabId: number) => {
    if (editorRef.current) {
      const editor = editorRef.current
      const content = editor.getValue()
      const cursorPosition = editor.getPosition()
      const viewState = editor.saveViewState()
      const selections = editor.getSelections() || []

      setTabs(prev => prev.map(tab => 
        tab.id === tabId 
          ? {
              ...tab,
              content,
              cursorPosition: cursorPosition ? {
                lineNumber: cursorPosition.lineNumber,
                column: cursorPosition.column
              } : undefined,
              viewState: viewState || undefined,
              selections
            }
          : tab
      ))
    }
  }

  const restoreTabState = (tabId: number) => {
    const tab = tabs.find(t => t.id === tabId)
    if (tab && editorRef.current) {
      const editor = editorRef.current
      
      // Restore content
      editor.setValue(tab.content)
      
      // Restore cursor position
      if (tab.cursorPosition) {
        editor.setPosition(tab.cursorPosition)
      }
      
      // Restore view state
      if (tab.viewState) {
        editor.restoreViewState(tab.viewState)
      }
      
      // Restore selections
      if (tab.selections && tab.selections.length > 0) {
        editor.setSelections(tab.selections)
      }
      
      editor.focus()
    }
  }

  const handleTabChange = (tabId: number) => {
    if (editorRef.current) {
      // Save current tab state before switching
      saveTabState(activeTab)
      
      // Switch to new tab
      setActiveTab(tabId)
      
      // Restore the tab state when changing tabs
      restoreTabState(tabId)
    }
  }

  const handleAddTab = () => {
    const newTabId = Math.max(...tabs.map(t => t.id)) + 1
    setTabs(prev => [...prev, {
      id: newTabId,
      content: defaultCppCode,
      language: 'cpp',
      history: [],
      scrollPosition: { scrollTop: 0, scrollLeft: 0 },
      selections: []
    }])
    setActiveTab(newTabId)
  }

  const initVimModeWithConfig = async (editor: monaco.editor.IStandaloneCodeEditor) => {
    try {
      const statusNode = document.getElementById('vim-status')!
      const vim = initVimMode(editor, statusNode)
      vimModeRef.current = vim

      // Basic vim settings
      VimMode.Vim.defineOption('tabstop', 2)
      VimMode.Vim.defineOption('shiftwidth', 2)
      VimMode.Vim.defineOption('expandtab', true)
      VimMode.Vim.defineOption('number', true)
      VimMode.Vim.defineOption('relativenumber', true)
      VimMode.Vim.defineOption('hlsearch', true)
      VimMode.Vim.defineOption('incsearch', true)
      VimMode.Vim.defineOption('ignorecase', true)
      VimMode.Vim.defineOption('smartcase', true)
      VimMode.Vim.defineOption('timeout', true)
      VimMode.Vim.defineOption('ttimeout', true)
      VimMode.Vim.defineOption('timeoutlen', 500)
      VimMode.Vim.defineOption('ttimeoutlen', 10)

      // Basic key mappings
      VimMode.Vim.map('kj', '<Esc>', 'insert')
      VimMode.Vim.map('<C-c>', '<Esc>', 'insert')
      
      // Bracket jump
      VimMode.Vim.map('<TAB>', '%', 'normal')
      
      // Redo mapping
      VimMode.Vim.map('U', '<C-r>', 'normal')
      
      // Line navigation
      VimMode.Vim.map('H', '^', 'normal')
      VimMode.Vim.map('L', '$', 'normal')
      VimMode.Vim.map('H', '^', 'visual')
      VimMode.Vim.map('L', '$', 'visual')
      VimMode.Vim.map('h', '^', 'operatorPending')
      VimMode.Vim.map('L', '$', 'operatorPending')
      VimMode.Vim.map('H', '^', 'visual')
      VimMode.Vim.map('L', '$', 'visual')
      
      // Leader key mappings
      VimMode.Vim.map('\\/', ':nohls<CR>', 'normal')
      VimMode.Vim.map('\\q', ':q<CR>', 'normal')
      VimMode.Vim.map('\\w', ':w<CR>', 'normal')
      VimMode.Vim.map('\\d', 'ggdG', 'normal')
      VimMode.Vim.map('\\c', 'ggVG"+y', 'normal')  // Copy all in normal mode
      VimMode.Vim.map('\\c', '"+y', 'visual')      // Copy selection in visual mode
      
      // Search center screen
      VimMode.Vim.map('n', 'nzz', 'normal')
      VimMode.Vim.map('N', 'Nzz', 'normal')
      VimMode.Vim.map('*', '*zz', 'normal')
      VimMode.Vim.map('#', '#zz', 'normal')
      VimMode.Vim.map('g*', 'g*zz', 'normal')
      
      // Indent/Outdent keep selection
      VimMode.Vim.map('<', '<gv', 'visual')
      VimMode.Vim.map('>', '>gv', 'visual')
      
      // Y behave like other capitals
      VimMode.Vim.map('Y', 'y$', 'normal')

      // Define Ex commands
      VimMode.Vim.defineEx('write', 'w', () => {
        const content = editor.getValue()
        localStorage.setItem('editorContent', content)
      })

      VimMode.Vim.defineEx('quit', 'q', () => {
        editor.setValue('')
      })

    } catch (error) {
      console.error('Error initializing vim mode:', error)
    }
  }

  // Add editor configuration options
  const editorOptions: monaco.editor.IStandaloneEditorConstructionOptions = {
    tabSize: 3,
    insertSpaces: true,
    detectIndentation: false,
    fontSize: 14,
    fontFamily: "'SF Mono', Monaco, Menlo, 'Courier New', monospace",
    fontLigatures: true,
    minimap: { 
      enabled: true,
      maxColumn: 80,
      renderCharacters: false,
      scale: 0.75,
      side: 'left',
      showSlider: 'mouseover',
      size: 'proportional'
    },
    scrollBeyondLastLine: false,
    renderWhitespace: 'boundary',
    lineNumbers: 'on',
    cursorStyle: 'line',
    cursorBlinking: 'smooth',
    cursorSmoothCaretAnimation: 'on', // Changed from true to 'on'
    smoothScrolling: true,
    wordWrap: 'on',
    wordWrapColumn: 120,
    formatOnPaste: true,
    formatOnType: true,
    renderLineHighlight: 'all',
    colorDecorators: true,
    bracketPairColorization: {
      enabled: true,
    },
    guides: {
      bracketPairs: true,
      indentation: true,
      highlightActiveIndentation: true,
      bracketPairsHorizontal: true,
    },
    padding: {
      top: 10,
      bottom: 10,
    },
    mouseWheelZoom: true,
    suggest: {
      showKeywords: true,
      showSnippets: true,
      showClasses: true,
      showFunctions: true,
      showVariables: true,
      showConstants: true,
    },
    quickSuggestions: {
      other: true,
      comments: true,
      strings: true,
    },
    acceptSuggestionOnEnter: 'smart',
    suggestOnTriggerCharacters: true, // Changed from 'on' to true
    folding: true,
    foldingStrategy: 'auto',
    showFoldingControls: 'always',
    matchBrackets: 'always',
    occurrencesHighlight: 'singleFile',
    find: {
      addExtraSpaceOnTop: false,
      autoFindInSelection: 'multiline',
      seedSearchStringFromSelection: 'selection',
    },
    suggestSelection: 'first',
  }

  const handleEditorDidMount = async (editor: monaco.editor.IStandaloneCodeEditor, monacoInstance: Monaco) => {
    editorRef.current = editor
    
    // Define custom themes
    themes.forEach(theme => {
      if (!theme.builtin && theme.data) {
        try {
          monacoInstance.editor.defineTheme(theme.id, theme.data)
        } catch (error) {
          console.error(`Error defining theme ${theme.id}:`, error)
        }
      }
    })

    // Set initial theme
    try {
      monacoInstance.editor.setTheme('konng')
    } catch (error) {
      console.error('Error setting initial theme:', error)
    }

    // Update editor options
    editor.updateOptions(editorOptions)

    // Initialize vim mode
    await initVimModeWithConfig(editor)

    // Add cursor position change listener
    editor.onDidChangeCursorPosition(() => {
      const position = editor.getPosition()
      if (position) {
        setTabs(prev => prev.map(tab => 
          tab.id === activeTab 
            ? { 
                ...tab, 
                cursorPosition: {
                  lineNumber: position.lineNumber,
                  column: position.column
                }
              }
            : tab
        ))
      }
    })

    // Add scroll position change listener
    editor.onDidScrollChange(() => {
      const viewState = editor.saveViewState()
      setTabs(prev => prev.map(tab => 
        tab.id === activeTab 
          ? { ...tab, viewState: viewState || undefined }
          : tab
      ))
    })

    // Add focus listener
    editor.onDidFocusEditorText(() => {
      const container = document.querySelector('.editor-container')
      if (container) {
        container.classList.add('focused')
      }
    })

    editor.onDidBlurEditorText(() => {
      const container = document.querySelector('.editor-container')
      if (container) {
        container.classList.remove('focused')
      }
    })
  }

  useEffect(() => {
    return () => {
      if (vimModeRef.current) {
        vimModeRef.current.dispose()
      }
    }
  }, [])

  // Add back the control button handlers
  const handleCopy = () => {
    const content = editorRef.current?.getValue()
    if (content) {
      // Save to current tab's history
      saveToHistory('copy')
      navigator.clipboard.writeText(content)
    }
  }

  const handleReset = () => {
    if (editorRef.current) {
      // Save current content to history before reset
      saveToHistory('reset')
      
      // Reset content
      editorRef.current.setValue(defaultCppCode)
      
      // Set cursor position after reset
      const lines = defaultCppCode.split('\n')
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('xxx')) {
          const column = lines[i].indexOf('xxx')
          const lineNumber = i + 1
          editorRef.current.setPosition({ lineNumber, column: column + 1 })
          editorRef.current.focus()
          break
        }
      }
      
      // Save the new state
      saveTabState(activeTab)
    }
  }

  const handleClear = () => {
    if (editorRef.current) {
      // Save current content to history before clearing
      saveToHistory('clear')
      
      // Clear content
      editorRef.current.setValue('')
      
      // Save the new state
      saveTabState(activeTab)
    }
  }

  const handleUndo = () => {
    const currentTab = tabs.find(t => t.id === activeTab)
    if (currentTab && currentTab.history.length > 0 && editorRef.current) {
      const lastAction = currentTab.history[currentTab.history.length - 1]
      
      // Restore the content and cursor position
      editorRef.current.setValue(lastAction.content)
      if (lastAction.cursorPosition) {
        editorRef.current.setPosition(lastAction.cursorPosition)
        editorRef.current.focus()
      }
      
      // Update tab state
      setTabs(prev => prev.map(tab => 
        tab.id === activeTab
          ? {
              ...tab,
              content: lastAction.content,
              history: tab.history.slice(0, -1),
              cursorPosition: lastAction.cursorPosition
            }
          : tab
      ))
    }
  }

  return (
    <div className="app-container">
      <div className="tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => handleTabChange(tab.id)}
          >
            {tab.id}
          </button>
        ))}
        <button className="tab" onClick={handleAddTab} title="添加新代码框">+</button>
      </div>
      
      <div className="editor-container">
        <Editor
          height="100%"
          defaultLanguage="cpp"
          theme={theme}
          onMount={handleEditorDidMount}
          key={activeTab}
          defaultValue={tabs.find(t => t.id === activeTab)?.content}
          onChange={(value) => {
            if (value !== undefined) {
              setTabs(prev => prev.map(tab => 
                tab.id === activeTab 
                  ? { ...tab, content: value }
                  : tab
              ))
            }
          }}
          options={{
            tabSize: 3,
            insertSpaces: true,
            fontSize: 14,
            minimap: { enabled: true },
            scrollBeyondLastLine: false,
          }}
        />
        <div id="vim-status" className="vim-status"></div>
      </div>

      <div className="controls">
        <button onClick={handleCopy} title="复制到剪贴板">复制</button>
        <button onClick={handleReset} title="重置为初始代码">初始</button>
        <button onClick={handleClear} title="清空编辑器">清空</button>
        <button onClick={handleUndo} title="撤销上一步">撤销</button>
        <select 
          value={theme} 
          onChange={(e) => handleThemeChange(e.target.value)}
          className="theme-select"
        >
          {themes.map(theme => (
            <option key={theme.id} value={theme.id}>
              {theme.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}

export default App
