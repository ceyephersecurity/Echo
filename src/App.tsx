/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Code2,
  FolderOpen,
  Terminal,
  Settings,
  FileCode,
  Play,
  Cpu,
  X,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { motion } from 'motion/react';

const mockFileContents: Record<string, string[]> = {
  'main.tsx': [
    "<span className=\"text-orange-500\">import</span> {\"{ StrictMode }\"} <span className=\"text-orange-500\">from</span> <span className=\"text-orange-200\">'react'</span>;",
    "<span className=\"text-orange-500\">import</span> {\"{ createRoot }\"} <span className=\"text-orange-500\">from</span> <span className=\"text-orange-200\">'react-dom/client'</span>;",
    "<span className=\"text-orange-500\">import</span> App <span className=\"text-orange-500\">from</span> <span className=\"text-orange-200\">'./App.tsx'</span>;",
    "<span className=\"text-orange-500\">import</span> <span className=\"text-orange-200\">'./index.css'</span>;",
    "",
    "createRoot(<span className=\"text-orange-300\">document</span>.getElementById(<span className=\"text-orange-200\">'root'</span>)!).render(",
    "  &lt;<span className=\"text-orange-400\">StrictMode</span>&gt;",
    "    &lt;<span className=\"text-orange-400\">App</span> /&gt;",
    "  &lt;/<span className=\"text-orange-400\">StrictMode</span>&gt;,",
    ");"
  ],
  'App.tsx': [
    "<span className=\"text-gray-500\">// App.tsx content is currently being viewed or edited</span>",
    "<span className=\"text-orange-500\">export default function</span> <span className=\"text-orange-400\">App</span>() {",
    "  <span className=\"text-orange-500\">return</span> (",
    "    &lt;<span className=\"text-orange-400\">div</span>&gt;VibeCoder Active&lt;/<span className=\"text-orange-400\">div</span>&gt;",
    "  );",
    "}"
  ],
  'package.json': [
    "{",
    "  <span className=\"text-orange-200\">\"name\"</span>: <span className=\"text-orange-300\">\"vibecoder-project\"</span>,",
    "  <span className=\"text-orange-200\">\"version\"</span>: <span className=\"text-orange-300\">\"1.0.0\"</span>,",
    "  <span className=\"text-orange-200\">\"dependencies\"</span>: {",
    "    <span className=\"text-orange-200\">\"react\"</span>: <span className=\"text-orange-300\">\"^18.2.0\"</span>",
    "  }",
    "}"
  ]
};

export default function App() {
  const [messages, setMessages] = useState([
    { role: 'system', content: 'VibeCoder initialized. Connected to local Ollama. Ready for execution.\n\nNote: If you have connection issues, ensure Ollama is running with:\nOLLAMA_ORIGINS="*" ollama run deepseek-coder:6.7b' }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  
  // New States
  const [ollamaStatus, setOllamaStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking');
  const [ollamaUrl, setOllamaUrl] = useState('http://127.0.0.1:11434');
  const [ollamaModel, setOllamaModel] = useState('deepseek-coder:6.7b');
  
  const [activeLeftTab, setActiveLeftTab] = useState<'explorer' | 'search' | 'terminal' | 'settings'>('explorer');
  const [openFiles, setOpenFiles] = useState<string[]>(['main.tsx', 'App.tsx']);
  const [activeFile, setActiveFile] = useState<string>('main.tsx');

  // Check Ollama connection periodically
  useEffect(() => {
    let mounted = true;
    const checkOllama = async () => {
      if (!mounted) return;
      try {
        const res = await fetch('/api/tags', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ baseUrl: ollamaUrl })
        });
        if (res.ok && mounted) {
          setOllamaStatus('connected');
        } else if (mounted) {
          setOllamaStatus('disconnected');
        }
      } catch (e) {
        if (mounted) setOllamaStatus('disconnected');
      }
    };
    
    checkOllama();
    const interval = setInterval(checkOllama, 5000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [ollamaUrl]);

  const openFile = (filename: string) => {
    if (!openFiles.includes(filename)) {
      setOpenFiles([...openFiles, filename]);
    }
    setActiveFile(filename);
  };

  const closeFile = (e: React.MouseEvent, filename: string) => {
    e.stopPropagation();
    const newFiles = openFiles.filter(f => f !== filename);
    setOpenFiles(newFiles);
    if (activeFile === filename) {
      setActiveFile(newFiles[newFiles.length - 1] || '');
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isTyping) return;
    
    const userMessage = { role: 'user', content: input };
    const currentMessages = [...messages, userMessage];
    
    setMessages(currentMessages);
    setInput('');
    setIsTyping(true);
    
    try {
      setMessages(prev => [...prev, { role: 'agent', content: '' }]);

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          baseUrl: ollamaUrl,
          payload: {
            model: ollamaModel,
            messages: currentMessages.map(m => ({
               role: m.role === 'agent' ? 'assistant' : m.role,
               content: m.content
            })),
            stream: true,
          }
        }),
      });

      if (!response.ok) {
        let errStr = response.statusText;
        try {
          const errBody = await response.json();
          if (errBody.error) errStr = errBody.error + " - " + (errBody.message || errBody.details);
        } catch(e) {}
        throw new Error(`Failed to connect via proxy: ${errStr}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        let agentMessage = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n').filter(Boolean);
          
          for (const line of lines) {
            try {
              const parsed = JSON.parse(line);
              if (parsed.message?.content) {
                agentMessage += parsed.message.content;
                setMessages(prev => {
                  const newMessages = [...prev];
                  newMessages[newMessages.length - 1] = { role: 'agent', content: agentMessage };
                  return newMessages;
                });
              }
            } catch (e) {
              console.error('Error parsing JSON chunk', e);
            }
          }
        }
      }
    } catch (error: any) {
      setMessages(prev => {
        const newMessages = [...prev];
        newMessages[newMessages.length - 1] = { 
          role: 'system', 
          content: `Error: ${error.message}\n\nPlease ensure your local Ollama is running and accessible at http://localhost:11434 with OLLAMA_ORIGINS="*" set.` 
        };
        return newMessages;
      });
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="flex h-screen bg-[#050505] text-gray-300 font-sans overflow-hidden">
      {/* Activity Bar */}
      <div className="w-14 bg-[#0a0a0a] border-r border-[#222222] flex flex-col items-center py-4 space-y-6 z-10">
        <div className="p-2 bg-orange-600 rounded-lg text-white mb-4 shadow-[0_0_15px_rgba(234,88,12,0.4)]">
          <Cpu size={24} />
        </div>
        <button 
          onClick={() => setActiveLeftTab('explorer')}
          className={`transition-colors ${activeLeftTab === 'explorer' ? 'text-orange-500' : 'text-gray-500 hover:text-orange-400'}`}
        >
          <FolderOpen size={24} />
        </button>
        <button 
          onClick={() => setActiveLeftTab('search')}
          className={`transition-colors ${activeLeftTab === 'search' ? 'text-orange-500' : 'text-gray-500 hover:text-orange-400'}`}
        >
          <Code2 size={24} />
        </button>
        <button 
          onClick={() => setActiveLeftTab('terminal')}
          className={`transition-colors ${activeLeftTab === 'terminal' ? 'text-orange-500' : 'text-gray-500 hover:text-orange-400'}`}
        >
          <Terminal size={24} />
        </button>
        <div className="mt-auto flex flex-col space-y-6">
          <button 
            onClick={() => setActiveLeftTab('settings')}
            className={`transition-colors ${activeLeftTab === 'settings' ? 'text-orange-500' : 'text-gray-500 hover:text-orange-400'}`}
          >
            <Settings size={24} />
          </button>
        </div>
      </div>

      {/* Sidebar - Dynamically rendered based on activeLeftTab */}
      <div className="w-64 bg-[#050505] border-r border-[#222222] flex flex-col">
        {activeLeftTab === 'explorer' && (
          <>
            <div className="p-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              PROJECT (VibeCoder Workspace)
            </div>
            <div className="flex-1 overflow-y-auto py-2">
              <div className="px-3 py-1 flex items-center space-x-2 text-sm text-gray-400 hover:bg-[#111111] hover:text-orange-100 cursor-pointer transition-colors">
                <FolderOpen size={16} className="text-orange-500" />
                <span>src</span>
              </div>
              <div className="px-3 pl-8 py-1 flex items-center space-x-2 text-sm text-gray-400 hover:bg-[#111111] hover:text-orange-100 cursor-pointer transition-colors">
                <FolderOpen size={16} className="text-orange-500" />
                <span>components</span>
              </div>
              <div 
                onClick={() => openFile('main.tsx')}
                className={`px-3 pl-12 py-1 flex items-center space-x-2 text-sm cursor-pointer transition-colors ${activeFile === 'main.tsx' ? 'text-orange-400 bg-[#111111] border-l-2 border-orange-500' : 'text-gray-400 hover:bg-[#111111] hover:text-orange-100'}`}
              >
                <FileCode size={16} className={activeFile === 'main.tsx' ? 'text-orange-500' : 'text-gray-500'} />
                <span>main.tsx</span>
              </div>
              <div 
                onClick={() => openFile('App.tsx')}
                className={`px-3 pl-8 py-1 flex items-center space-x-2 text-sm cursor-pointer transition-colors ${activeFile === 'App.tsx' ? 'text-orange-400 bg-[#111111] border-l-2 border-orange-500' : 'text-gray-400 hover:bg-[#111111] hover:text-orange-100'}`}
              >
                <FileCode size={16} className={activeFile === 'App.tsx' ? 'text-orange-500' : 'text-gray-500'} />
                <span>App.tsx</span>
              </div>
              <div 
                onClick={() => openFile('package.json')}
                className={`px-3 py-1 flex items-center space-x-2 text-sm cursor-pointer transition-colors ${activeFile === 'package.json' ? 'text-orange-400 bg-[#111111] border-l-2 border-orange-500' : 'text-gray-400 hover:bg-[#111111] hover:text-orange-100'}`}
              >
                <FileCode size={16} className={activeFile === 'package.json' ? 'text-orange-500' : 'text-gray-500'} />
                <span>package.json</span>
              </div>
            </div>
          </>
        )}
        {activeLeftTab === 'settings' && (
          <>
            <div className="p-3 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-[#222222]">
              Settings
            </div>
            <div className="p-4 flex flex-col space-y-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Ollama URL</label>
                <input 
                  type="text" 
                  value={ollamaUrl}
                  onChange={(e) => setOllamaUrl(e.target.value)}
                  className="w-full bg-[#111111] border border-[#333] rounded px-2 py-1 text-sm text-gray-200 outline-none focus:border-orange-500 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Model Name</label>
                <input 
                  type="text" 
                  value={ollamaModel}
                  onChange={(e) => setOllamaModel(e.target.value)}
                  className="w-full bg-[#111111] border border-[#333] rounded px-2 py-1 text-sm text-gray-200 outline-none focus:border-orange-500 transition-colors"
                />
              </div>
            </div>
          </>
        )}
        {(activeLeftTab === 'search' || activeLeftTab === 'terminal') && (
           <div className="p-4 text-xs text-gray-500">
             {activeLeftTab} pane not implemented in this mock.
           </div>
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        
        {/* Editor Tabs */}
        <div className="flex bg-[#050505] border-b border-[#222222] overflow-x-auto scbar-none min-h-[37px]">
          {openFiles.map(filename => (
            <div 
              key={filename}
              onClick={() => setActiveFile(filename)}
              className={`px-3 py-2 border-r border-[#222222] text-sm flex items-center space-x-2 cursor-pointer transition-colors group
                ${activeFile === filename 
                  ? 'border-b-2 border-b-orange-500 text-orange-200 bg-[#0a0a0a]' 
                  : 'text-gray-500 hover:bg-[#0a0a0a] border-b-2 border-b-transparent'}`}
            >
              <FileCode size={14} className={activeFile === filename ? 'text-orange-500' : 'text-gray-500'} />
              <span>{filename}</span>
              <button 
                onClick={(e) => closeFile(e, filename)}
                className={`ml-2 p-0.5 rounded-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-[#222222] ${activeFile === filename ? 'opacity-100' : ''}`}
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>

        {/* Code Editor Mockup */}
        <div className="flex-1 bg-[#050505] p-4 overflow-auto font-mono text-sm leading-relaxed text-[#c9d1d9] relative">
          <div className="absolute top-4 right-4 text-xs flex flex-row items-center space-x-3 bg-[#0a0a0a] border border-[#222222] rounded-md px-2 py-1 shadow-sm">
             <div className="flex items-center space-x-1.5 border-r border-[#333] pr-3">
              {ollamaStatus === 'checking' && <span className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse shadow-[0_0_5px_rgba(234,179,8,0.8)]"></span>}
              {ollamaStatus === 'connected' && <span className="w-2 h-2 bg-orange-500 rounded-full shadow-[0_0_8px_rgba(249,115,22,0.8)]"></span>}
              {ollamaStatus === 'disconnected' && <span className="w-2 h-2 bg-red-600 rounded-full"></span>}
              <span className={ollamaStatus === 'connected' ? 'text-orange-500' : 'text-gray-400'}>
                {ollamaStatus === 'checking' ? 'Connecting...' : ollamaStatus === 'connected' ? 'VibeCoder Attached' : 'Disconnected'}
              </span>
             </div>
             <div className="text-gray-500">
               {ollamaModel}
             </div>
          </div>
          
          <pre className="!bg-transparent m-0 whitespace-pre-wrap mt-8">
            {activeFile && mockFileContents[activeFile] ? (
              mockFileContents[activeFile].map((line, i) => (
                <div key={i} dangerouslySetInnerHTML={{ __html: line || ' ' }} />
              ))
            ) : (
              <span className="text-gray-600">No file selected. Open a file from the explorer.</span>
            )}
          </pre>
        </div>

        {/* Chat / Terminal Panel */}
        <div className="h-2/5 min-h-[250px] border-t border-[#222222] bg-[#0a0a0a] flex flex-col">
          <div className="flex px-4 items-center justify-between border-b border-[#222222]">
            <div className="flex space-x-6">
              <button className="px-1 py-2 text-sm text-orange-200 border-b-2 border-orange-500">VibeCoder Chat</button>
              <button className="px-1 py-2 text-sm text-gray-500 hover:text-orange-300 transition-colors">Terminal</button>
              <button className="px-1 py-2 text-sm text-gray-500 hover:text-orange-300 transition-colors">Output</button>
            </div>
            <div className="flex space-x-2 items-center">
              <span className="text-xs text-orange-500 border border-orange-500/50 px-2 py-0.5 rounded shadow-[0_0_8px_rgba(249,115,22,0.2)]">Ollama Node</span>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-4 font-mono text-sm">
            {messages.map((msg, idx) => (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                key={idx} 
                className={`flex flex-col space-y-1 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div className={`px-3 py-2 rounded-lg max-w-[80%] whitespace-pre-wrap ${
                  msg.role === 'system' ? 'bg-[#111111] text-gray-500 text-xs border border-[#222222]' :
                  msg.role === 'user' ? 'bg-orange-600 text-white shadow-[0_0_10px_rgba(234,88,12,0.3)]' :
                  msg.role === 'agent' ? 'bg-[#111111] text-gray-300 border border-orange-500/30' : ''
                }`}>
                  {msg.content}
                </div>
              </motion.div>
            ))}
          </div>

          {/* Input Area */}
          <div className="p-3 bg-[#050505] border-t border-[#222222]">
            <div className="flex items-center space-x-2">
              <span className="text-orange-500 font-mono">&gt;</span>
              <input 
                type="text" 
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder="Ask VibeCoder to generate, edit, or explain code... (Press Enter)"
                className="flex-1 bg-transparent border-none outline-none text-gray-200 font-mono text-sm placeholder-gray-600"
              />
              <button 
                onClick={handleSend}
                className="p-1 text-orange-500 hover:text-orange-400 transition-colors"
              >
                <Play size={16} />
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
