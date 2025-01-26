import React, { useState, useRef, useEffect, useCallback } from 'react'
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
  { id: 'vs-dark', name: 'Vscode', builtin: true },
  { id: 'monokai', name: 'Monokai', builtin: false, data: monokaiTheme },
  { id: 'github', name: 'GitHub', builtin: false, data: githubTheme },
  { id: 'solarized-dark', name: 'Solarized', builtin: false, data: solarizedDarkTheme },
  { id: 'dracula', name: 'Dracula', builtin: false, data: draculaTheme },
];

// 简化 VimMode 类型定义
declare module 'monaco-vim' {
  export interface VimMode {
    dispose: () => void;
    on: (event: string, callback: (mode: string) => void) => void;
  }
  export const VimMode: {
    Vim: {
      map: (from: string, to: string, mode?: string) => void;
      defineEx: (name: string, shortName: string, callback: Function) => void;
      defineOption: (name: string, value: any) => void;
    }
  }
}

// 简化 EditorTab 接口
interface EditorTab {
  id: number;
  content: string;
  language: string;
  cursorPosition?: { lineNumber: number; column: number };
  viewState?: monaco.editor.ICodeEditorViewState;
  selections?: monaco.Selection[];
  history: {
    type: 'copy' | 'reset' | 'clear';
    content: string;
    cursorPosition?: { lineNumber: number; column: number };
  }[];
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

// 添加防抖函数
const useDebounce = (func: Function, wait: number) => {
  const timeout = useRef<NodeJS.Timeout>()

  return useCallback((...args: any[]) => {
    const later = () => {
      clearTimeout(timeout.current)
      func(...args)
    }

    clearTimeout(timeout.current)
    timeout.current = setTimeout(later, wait)
  }, [func, wait])
}

// 添加错误边界组件
class EditorErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Editor error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="editor-error">
          <h3>编辑器出现错误</h3>
          <button onClick={() => this.setState({ hasError: false })}>
            重试
          </button>
        </div>
      )
    }

    return this.props.children
  }
}

function App() {
  const [theme, setTheme] = useState<string>('konng')
  const [activeTab, setActiveTab] = useState(1)
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const vimModeRef = useRef<any>(null)
  const [vimMode, setVimMode] = useState<string>('normal')
  
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
    if (!editorRef.current) return
    
    const editor = editorRef.current
    setTabs(prev => prev.map(tab => 
      tab.id === tabId 
        ? {
            ...tab,
            content: editor.getValue(),
            cursorPosition: editor.getPosition() || undefined,
            viewState: editor.saveViewState() || undefined,
            selections: editor.getSelections() || []
          }
        : tab
    ))
  }

  const restoreTabState = (tabId: number) => {
    const tab = tabs.find(t => t.id === tabId)
    if (!tab || !editorRef.current) return
    
    const editor = editorRef.current
    editor.setValue(tab.content)
    tab.cursorPosition && editor.setPosition(tab.cursorPosition)
    tab.viewState && editor.restoreViewState(tab.viewState)
    tab.selections?.length && editor.setSelections(tab.selections)
    editor.focus()
  }

  const handleTabChange = (tabId: number) => {
    if (editorRef.current) {
      // 使用函数式更新确保状态一致性
      setTabs(prevTabs => {
        const currentTab = prevTabs.find(t => t.id === activeTab)
        if (!currentTab) return prevTabs

        const editor = editorRef.current!
        const content = editor.getValue()
        const cursorPosition = editor.getPosition()
        const viewState = editor.saveViewState()
        const selections = editor.getSelections() || []

        return prevTabs.map(tab => 
          tab.id === activeTab
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
        )
      })

      setActiveTab(tabId)
      
      // 使用 requestAnimationFrame 确保状态更新后再恢复
      requestAnimationFrame(() => {
        restoreTabState(tabId)
      })
    }
  }

  const handleAddTab = () => {
    if (editorRef.current) {
      // Save current tab state before adding new tab
      saveTabState(activeTab)
      
      const newTabId = Math.max(...tabs.map(t => t.id)) + 1
      setTabs(prev => [...prev, {
        id: newTabId,
        content: defaultCppCode,
        language: 'cpp',
        history: [],
        cursorPosition: { lineNumber: 7, column: 4 }, // Position at 'xxx'
        selections: []
      }])
      
      setActiveTab(newTabId)
    }
  }

  const initVimModeWithConfig = async (editor: monaco.editor.IStandaloneCodeEditor) => {
    try {
      const statusNode = document.getElementById('vim-status')!
      const vim = initVimMode(editor, statusNode)
      vimModeRef.current = vim

      // 修改模式变化监听的实现
      const updateVimMode = (mode: any) => {
        const currentMode = typeof mode === 'object' && mode.mode 
          ? mode.mode.toLowerCase() 
          : 'normal'
        
        // 设置更具描述性的模式名称
        let displayMode = currentMode
        switch (currentMode) {
          case 'visual':
            displayMode = 'VISUAL'
            break
          case 'visualline':
            displayMode = 'VISUAL LINE'
            break
          case 'visualblock':
            displayMode = 'VISUAL BLOCK'
            break
          case 'insert':
            displayMode = 'INSERT'
            break
          case 'replace':
            displayMode = 'REPLACE'
            break
          case 'normal':
          default:
            displayMode = 'NORMAL'
            break
        }
        
        setVimMode(displayMode.toLowerCase())

        // 更新编辑器光标样式
        editor.updateOptions({
          cursorStyle: currentMode === 'insert' ? 'line' : 'block',
          cursorWidth: currentMode === 'insert' ? 1 : 2
        })
      }

      // 设置初始模式
      updateVimMode({ mode: 'normal' })

      // 添加模式变化监听
      vim.on('vim-mode-change', updateVimMode)

      // 其他 vim 配置保持不变
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
      
      return vim
    } catch (error) {
      console.error('Error initializing vim mode:', error)
      return null
    }
  }

  // Add editor configuration options
  const editorOptions: monaco.editor.IStandaloneEditorConstructionOptions = {
    tabSize: 3,
    insertSpaces: true,
    fontSize: 14,
    fontFamily: "'Source Code Pro', Monaco, Menlo, Consolas, 'Courier New', monospace",
    minimap: { 
      enabled: true,
      side: 'left',
    },
    cursorStyle: 'block',
    cursorWidth: 2,
    cursorBlinking: 'solid',
    wordWrap: 'on',
    lineNumbers: 'on',
    bracketPairColorization: { enabled: true },
    padding: { top: 10, bottom: 10 },
    scrollBeyondLastLine: false,
    automaticLayout: true,
    guides: {
      bracketPairs: true,
      indentation: true,
    }
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

  // 添加自动保存功能
  useEffect(() => {
    let lastContent = editorRef.current?.getValue()
    
    const saveInterval = setInterval(() => {
      if (editorRef.current) {
        const currentContent = editorRef.current.getValue()
        if (currentContent !== lastContent) {
          saveTabState(activeTab)
          lastContent = currentContent
        }
      }
    }, 1000)

    return () => clearInterval(saveInterval)
  }, [activeTab])

  // 添加防抖函数
  const debouncedSaveState = useDebounce((tabId: number) => {
    saveTabState(tabId)
  }, 300)

  // 修改编辑器内容变化的监听
  useEffect(() => {
    if (editorRef.current) {
      const disposable = editorRef.current.onDidChangeModelContent(() => {
        const content = editorRef.current?.getValue()
        if (content !== undefined) {
          setTabs(prev => prev.map(tab => 
            tab.id === activeTab 
              ? { ...tab, content }
              : tab
          ))
          debouncedSaveState(activeTab)
        }
      })

      return () => {
        disposable.dispose()
      }
    }
  }, [activeTab, debouncedSaveState])

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
        <button className="tab" onClick={handleAddTab}>+</button>
      </div>
      
      <div className="editor-container">
        <EditorErrorBoundary>
          <Editor
            height="100%"
            defaultLanguage="cpp"
            theme={theme}
            onMount={handleEditorDidMount}
            value={tabs.find(t => t.id === activeTab)?.content}
            onChange={(value) => value && saveTabState(activeTab)}
            options={editorOptions}
          />
        </EditorErrorBoundary>
        <div id="vim-status" className="vim-status"></div>
        <div className={`vim-mode-status ${vimMode}`}>
          -- {vimMode.toUpperCase()} --
        </div>
      </div>

      <div className="controls">
        <button id="copy-btn" title="复制到剪贴板" onClick={handleCopy}>复制</button>
        <button id="reset-btn" title="重置为初始代码" onClick={handleReset}>初始</button>
        <button id="clear-btn" title="清空编辑器" onClick={handleClear}>清空</button>
        <button id="undo-btn" title="撤销上一步" onClick={handleUndo}>撤销</button>
        <select 
          id="theme-select"
          className="theme-select"
          value={theme} 
          onChange={(e) => handleThemeChange(e.target.value)}
        >
          {themes.map(theme => (
            <option key={theme.id} value={theme.id}>{theme.name}</option>
          ))}
        </select>
      </div>
    </div>
  )
}

export default App
