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
import greenTheme from './themes/Green.json'  // 更新导入
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
  { id: 'green', name: 'Green', builtin: false, data: greenTheme },
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

// 添加成功图标 SVG 组件
const SuccessIcon = () => (
  <svg className="success-icon" viewBox="0 0 16 16">
    <path d="M3 8l3.5 3.5L13 4.5" />
  </svg>
);

// 修改按钮组件，添加成功状态
const ControlButton = ({ 
  id, 
  onClick, 
  children 
}: { 
  id: string; 
  onClick: () => Promise<void>; 
  children: React.ReactNode; 
}) => {
  const [isSuccess, setIsSuccess] = useState(false);

  const handleClick = async () => {
    try {
      await onClick();
      setIsSuccess(true);
      setTimeout(() => setIsSuccess(false), 1000);
    } catch (error) {
      console.error('Operation failed:', error);
    }
  };

  return (
    <button 
      id={id}
      className={`control-btn ${isSuccess ? 'success' : ''}`}
      onClick={handleClick}
    >
      <span>{children}</span>
      <SuccessIcon />
    </button>
  );
};

function App() {
  const [theme, setTheme] = useState<string>('konng')
  const [activeTab, setActiveTab] = useState(1)
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const vimModeRef = useRef<any>(null)
  const [vimMode, setVimMode] = useState<string>('normal')
  const [isVimMode, setIsVimMode] = useState(true);
  
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
      // 使用已有的状态栏元素，而不是创建新的
      const statusNode = document.getElementById('vim-status')!
      const vim = initVimMode(editor, statusNode)
      vimModeRef.current = vim

      // 修改模式变化监听的实现
      const updateVimMode = (mode: any) => {
        const currentMode = typeof mode === 'object' && mode.mode 
          ? mode.mode.toLowerCase() 
          : 'normal'
        
        setVimMode(currentMode)

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

      // 使用固定的 tabSize 值
      VimMode.Vim.defineOption('tabstop', 4)
      VimMode.Vim.defineOption('shiftwidth', 4)
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
      VimMode.Vim.map('kj', '<Esc>', 'insert')  // Add back the kj mapping
      
      // 取消绑定 Ctrl 组合键
      VimMode.Vim.map('<C-a>', '<Nop>', 'normal')
      VimMode.Vim.map('<C-c>', '<Nop>', 'normal')
      VimMode.Vim.map('<C-v>', '<Nop>', 'normal')
      VimMode.Vim.map('<C-z>', '<Nop>', 'normal')
      
      VimMode.Vim.map('<C-a>', '<Nop>', 'insert')
      VimMode.Vim.map('<C-c>', '<Nop>', 'insert')
      VimMode.Vim.map('<C-v>', '<Nop>', 'insert')
      VimMode.Vim.map('<C-z>', '<Nop>', 'insert')
      
      VimMode.Vim.map('<C-a>', '<Nop>', 'visual')
      VimMode.Vim.map('<C-c>', '<Nop>', 'visual')
      VimMode.Vim.map('<C-v>', '<Nop>', 'visual')
      VimMode.Vim.map('<C-z>', '<Nop>', 'visual')

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
      VimMode.Vim.map('\\h', ':nohls<CR>', 'normal')
      VimMode.Vim.map('\\q', ':q<CR>', 'normal')
      VimMode.Vim.map('\\w', ':w<CR>', 'normal')
      VimMode.Vim.map('\\d', 'ggdG', 'normal')
      VimMode.Vim.map('\\c', 'ggVG"+y', 'normal')  // 复制全部内容到系统剪贴板
      VimMode.Vim.map('\\y', '"+y', 'visual')      // 复制选中内容到系统剪贴板
      VimMode.Vim.map('\\p', '"+p', 'normal')      // 从系统剪贴板粘贴
      
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

      return vim
    } catch (error) {
      console.error('Error initializing vim mode:', error)
      return null
    }
  }

  // 修改 editorOptions，使用固定的 tabSize
  const editorOptions: monaco.editor.IStandaloneEditorConstructionOptions = {
    tabSize: 4,  // 改为固定值
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
    },
    folding: true,
    foldingStrategy: 'indentation',
    showFoldingControls: 'always',
    scrollbar: {
      vertical: 'visible',
      horizontal: 'visible',
      verticalScrollbarSize: 12,
      horizontalScrollbarSize: 12,
      useShadows: false,
    },
    smoothScrolling: true,
    mouseWheelScrollSensitivity: 1.5,
    fastScrollSensitivity: 7,
  }

  const handleEditorDidMount = async (editor: monaco.editor.IStandaloneCodeEditor, monacoInstance: Monaco) => {
    editorRef.current = editor
    
    // 定义编辑器命令
    const commands = [
      {
        id: 'copy',
        keybinding: monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyC,
        handler: () => {
          const selection = editor.getSelection()
          const content = selection && !selection.isEmpty()
            ? editor.getModel()?.getValueInRange(selection)
            : editor.getValue()
          
          if (content) {
            navigator.clipboard.writeText(content)
              .then(() => {
                // 可以添加视觉反馈
                const statusEl = document.createElement('div')
                statusEl.className = 'editor-status-message'
                statusEl.textContent = '已复制'
                document.body.appendChild(statusEl)
                setTimeout(() => statusEl.remove(), 1000)
              })
              .catch(err => console.error('复制失败:', err))
          }
        }
      },
      {
        id: 'paste',
        keybinding: monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyV,
        handler: () => {
          navigator.clipboard.readText()
            .then(text => {
              if (!text) return
              
              const selection = editor.getSelection()
              const position = editor.getPosition()
              
              if (!position) return
              
              // 如果有选中的文本，替换它
              if (selection && !selection.isEmpty()) {
                editor.executeEdits('paste', [{
                  range: selection,
                  text: text
                }])
              } else {
                // 在当前光标位置插入
                editor.executeEdits('paste', [{
                  range: new monaco.Range(
                    position.lineNumber,
                    position.column,
                    position.lineNumber,
                    position.column
                  ),
                  text: text
                }])
              }
              
              // 移动光标到粘贴内容的末尾
              const lines = text.split('\n')
              const lastLineLength = lines[lines.length - 1].length
              const newPosition = {
                lineNumber: position.lineNumber + lines.length - 1,
                column: lines.length === 1 
                  ? position.column + text.length 
                  : lastLineLength + 1
              }
              editor.setPosition(newPosition)
              editor.focus()
            })
            .catch(err => console.error('粘贴失败:', err))
        }
      },
      {
        id: 'cut',
        keybinding: monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyX,
        handler: () => {
          const selection = editor.getSelection()
          if (selection && !selection.isEmpty()) {
            const content = editor.getModel()?.getValueInRange(selection)
            if (content) {
              navigator.clipboard.writeText(content)
                .then(() => {
                  editor.executeEdits('cut', [{
                    range: selection,
                    text: ''
                  }])
                })
                .catch(err => console.error('剪切失败:', err))
            }
          }
        }
      },
      {
        id: 'selectAll',
        keybinding: monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyA,
        handler: () => {
          const lineCount = editor.getModel()?.getLineCount() || 0
          const lastLineLength = editor.getModel()?.getLineLength(lineCount) || 0
          editor.setSelection(new monaco.Range(1, 1, lineCount, lastLineLength + 1))
        }
      },
      {
        id: 'undo',
        keybinding: monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyZ,
        handler: () => {
          editor.trigger('keyboard', 'undo', null)
          // 保存撤销后的状态
          saveTabState(activeTab)
        }
      },
      {
        id: 'redo',
        keybinding: monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyZ,
        handler: () => {
          editor.trigger('keyboard', 'redo', null)
          // 保存重做后的状态
          saveTabState(activeTab)
        }
      }
    ]

    // 注册所有命令
    commands.forEach(command => {
      editor.addCommand(command.keybinding, command.handler)
    })

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

  // 修改 handleCopy 函数
  const handleCopy = async () => {
    const content = editorRef.current?.getValue()
    if (!content) return

    await navigator.clipboard.writeText(content)
    saveToHistory('copy')
  }

  const handleReset = async () => {
    if (editorRef.current) {
      saveToHistory('reset')
      editorRef.current.setValue(defaultCppCode)
      
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
      
      saveTabState(activeTab)
    }
  }

  const handleClear = async () => {
    if (editorRef.current) {
      saveToHistory('clear')
      editorRef.current.setValue('')
      saveTabState(activeTab)
    }
  }

  const handleUndo = async () => {
    const currentTab = tabs.find(t => t.id === activeTab)
    if (currentTab && currentTab.history.length > 0 && editorRef.current) {
      const lastAction = currentTab.history[currentTab.history.length - 1]
      
      editorRef.current.setValue(lastAction.content)
      if (lastAction.cursorPosition) {
        editorRef.current.setPosition(lastAction.cursorPosition)
        editorRef.current.focus()
      }
      
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

  // 修改 handleModeToggle 函数
  const handleModeToggle = () => {
    if (isVimMode) {
      // 切换到文本模式
      if (vimModeRef.current) {
        vimModeRef.current.dispose();
        vimModeRef.current = null;
      }
      setIsVimMode(false);
      setVimMode('text');
      
      // 更新文本模式的光标样式
      if (editorRef.current) {
        editorRef.current.updateOptions({
          cursorStyle: 'line',
          cursorWidth: 1,
          // 启用默认的编辑器快捷键
          readOnly: false,
          lineNumbers: 'on',
        });
      }
    } else {
      // 切换到 Vim 模式
      if (editorRef.current) {
        initVimModeWithConfig(editorRef.current);
      }
      setIsVimMode(true);
    }
  };

  return (
    <div className="app-container">
      {/* 左侧标签页 */}
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

      {/* 编辑器容器 */}
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
        <div id="vim-status" className={`vim-status ${vimMode}`}></div>
        
        {/* GitHub 链接 */}
        <a 
          href="https://github.com/funcdfs" 
          className="github-link" 
          target="_blank" 
          rel="noopener noreferrer"
          style={{
            position: 'absolute',
            bottom: '4px',
            right: '12px',
            zIndex: 10,
          }}
        >
          <span className="github-icon"></span>
          @funcdfs
        </a>

        {/* 主题选择器 */}
        <select 
          id="theme-select"
          className="theme-select-top"
          value={theme} 
          onChange={(e) => handleThemeChange(e.target.value)}
        >
          {themes.map(theme => (
            <option key={theme.id} value={theme.id}>{theme.name}</option>
          ))}
        </select>
      </div>

      {/* 右侧控制栏 */}
      <div className="right-controls">
        <div className="right-controls-top">
          <button 
            className={`control-btn mode-btn ${isVimMode ? 'active' : ''}`}
            onClick={handleModeToggle}
          >
            {isVimMode ? 'Vim' : 'Text'}
          </button>
        </div>
        <div className="right-controls-bottom">
          <ControlButton 
            id="copy-btn" 
            onClick={handleCopy}
          >
            COPY
          </ControlButton>
          <ControlButton 
            id="clear-btn" 
            onClick={handleClear}
          >
            CLEAR
          </ControlButton>
          <ControlButton 
            id="reset-btn" 
            onClick={handleReset}
          >
            RESET
          </ControlButton>
          <ControlButton 
            id="undo-btn" 
            onClick={handleUndo}
          >
            UNDO
          </ControlButton>
        </div>
      </div>
    </div>
  )
}

export default App
