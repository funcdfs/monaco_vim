declare module 'monaco-vim' {
  import * as monaco from 'monaco-editor';
  
  interface VimMode {
    dispose: () => void;
    map: (from: string, to: string, mode?: string) => void;
    execCommand: (command: string) => void;
  }
  
  export function initVimMode(
    editor: monaco.editor.IStandaloneCodeEditor,
    statusEl: HTMLElement
  ): VimMode;
} 