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
  AlertCircle,
  ChevronRight,
  ChevronDown,
  File
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { motion } from 'motion/react';

// TreeNode interface for file explorer
interface TreeNode {
  name: string;
  type: 'file' | 'directory';
  path: string;
  children?: TreeNode[];
}

// Recursive Tree Component
const FileTree = ({ nodes, onSelect, onContextMenu, depth = 0 }: { nodes: TreeNode[], onSelect: (path: string, name: string) => void, onContextMenu: (e: React.MouseEvent, node: TreeNode) => void, depth?: number }) => {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggleDir = (path: string) => setExpanded(prev => ({ ...prev, [path]: !prev[path] }));

  return (
    <div className="flex flex-col">
      {nodes.sort((a, b) => {
        if (a.type === b.type) return a.name.localeCompare(b.name);
        return a.type === 'directory' ? -1 : 1;
      }).map(node => (
        <div key={node.path}>
          <div 
            onClick={() => node.type === 'directory' ? toggleDir(node.path) : onSelect(node.path, node.name)}
            onContextMenu={(e) => onContextMenu(e, node)}
            className="flex items-center space-x-1 py-1 px-2 cursor-pointer hover:bg-[#111111] hover:text-orange-100 transition-colors text-sm text-gray-400 group"
            style={{ paddingLeft: `${depth * 12 + 12}px` }}
          >
            {node.type === 'directory' ? (
              <>
                {expanded[node.path] ? <ChevronDown size={14} className="text-gray-500" /> : <ChevronRight size={14} className="text-gray-500" />}
                <FolderOpen size={14} className="text-orange-500" />
              </>
            ) : (
              <>
                <FileCode size={14} className="text-gray-500 ml-3 group-hover:text-orange-400" />
              </>
            )}
            <span className="truncate">{node.name}</span>
          </div>
          {node.type === 'directory' && expanded[node.path] && node.children && (
             <FileTree nodes={node.children} onSelect={onSelect} onContextMenu={onContextMenu} depth={depth + 1} />
          )}
        </div>
      ))}
    </div>
  );
};

export default function App() {
  const [messages, setMessages] = useState([
    { role: 'system', content: 'VibeCoder initialized. Connected to local Ollama. Ready for execution.\n\nNote: If you have connection issues, ensure Ollama is running with `ollama run deepseek-coder:6.7b`. (The proxy server automatically handles CORS!)\n\nIf PM2 `npm run dev` fails, use `pm2 start "npm run dev" --name echo` or `pm2 start server.ts --interpreter tsx`.' }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  
  // New States
  const [ollamaStatus, setOllamaStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking');
  const [ollamaUrl, setOllamaUrl] = useState('http://127.0.0.1:11434');
  const [ollamaModel, setOllamaModel] = useState('deepseek-coder:6.7b');
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  
  const [activeLeftTab, setActiveLeftTab] = useState<'explorer' | 'search' | 'terminal' | 'settings'>('explorer');
  const [fileTree, setFileTree] = useState<TreeNode[]>([]);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, node?: TreeNode } | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{path: string, line: number, content: string}[]>([]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}`);
      const data = await res.json();
      setSearchResults(data);
    } catch(e) {
      console.error(e);
    }
  };

  // Array of { path, name }
  const [openFiles, setOpenFiles] = useState<{path: string, name: string}[]>([]);
  const [activeFile, setActiveFile] = useState<string>('');
  
  // Cache of file contents: { path: content }
  const [fileContents, setFileContents] = useState<Record<string, string>>({});
  
  const [bottomTab, setBottomTab] = useState<'chat'|'terminal'|'output'>('chat');

  // Load File Tree initially
  const loadFileTree = () => {
    fetch('/api/files')
       .then(r => r.json())
       .then(val => {
          if (Array.isArray(val)) setFileTree(val);
       })
       .catch(e => console.error("Could not load file tree", e));
  };

  useEffect(() => {
    loadFileTree();
  }, []);

  // Close context menu on click outside
  useEffect(() => {
    const closeMenu = () => setContextMenu(null);
    window.addEventListener('click', closeMenu);
    return () => window.removeEventListener('click', closeMenu);
  }, []);

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
          const body = await res.json();
          if (body.models && Array.isArray(body.models)) {
              setOllamaModels(body.models.map((m: any) => m.name));
              if (ollamaModel === '' && body.models.length > 0) {
                 setOllamaModel(body.models[0].name);
              }
          }
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

  const openFile = async (path: string, name: string) => {
    if (!openFiles.find(f => f.path === path)) {
      setOpenFiles([...openFiles, { path, name }]);
    }
    setActiveFile(path);
    
    // Fetch content if not in cache
    if (!fileContents[path]) {
       try {
         const res = await fetch(`/api/file?path=${encodeURIComponent(path)}`);
         if (res.ok) {
            const data = await res.json();
            setFileContents(prev => ({...prev, [path]: data.content}));
         } else {
            setFileContents(prev => ({...prev, [path]: '// Failed to load file content'}));
         }
       } catch (e) {
         setFileContents(prev => ({...prev, [path]: '// Error loading file'}));
       }
    }
  };

  const closeFile = (e: React.MouseEvent, path: string) => {
    e.stopPropagation();
    const newFiles = openFiles.filter(f => f.path !== path);
    setOpenFiles(newFiles);
    if (activeFile === path) {
      setActiveFile(newFiles[newFiles.length - 1]?.path || '');
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
          content: `Error: ${error.message}\n\nPlease ensure your local Ollama is running and accessible.` 
        };
        return newMessages;
      });
    } finally {
      setIsTyping(false);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, node?: TreeNode) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, node });
  };

  const handleCreateFile = async () => {
    if (!contextMenu) return;
    const name = prompt('File name:');
    if (!name) return;
    const basePath = contextMenu.node?.type === 'directory' ? contextMenu.node.path : (contextMenu.node ? contextMenu.node.path.split('/').slice(0, -1).join('/') : '');
    const fullPath = basePath ? `${basePath}/${name}` : name;
    
    try {
      await fetch('/api/file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: fullPath, content: '' })
      });
      loadFileTree();
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateDir = async () => {
    if (!contextMenu) return;
    const name = prompt('Directory name:');
    if (!name) return;
    const basePath = contextMenu.node?.type === 'directory' ? contextMenu.node.path : (contextMenu.node ? contextMenu.node.path.split('/').slice(0, -1).join('/') : '');
    const fullPath = basePath ? `${basePath}/${name}` : name;
    
    try {
      await fetch('/api/dir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: fullPath })
      });
      loadFileTree();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async () => {
    if (!contextMenu?.node) return;
    if (!confirm(`Are you sure you want to delete ${contextMenu.node.name}?`)) return;
    
    try {
      await fetch(`/api/file?path=${encodeURIComponent(contextMenu.node.path)}`, {
        method: 'DELETE'
      });
      loadFileTree();
      
      // Close if open
      const newFiles = openFiles.filter(f => f.path !== contextMenu.node?.path);
      setOpenFiles(newFiles);
      if (activeFile === contextMenu.node.path) {
        setActiveFile(newFiles[newFiles.length - 1]?.path || '');
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="flex h-screen bg-[#050505] text-gray-300 font-sans overflow-hidden">
      {/* Context Menu */}
      {contextMenu && (
        <div 
          className="fixed z-50 bg-[#111] border border-[#333] py-1 rounded shadow-xl text-sm min-w-[150px]"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <button onClick={handleCreateFile} className="w-full text-left px-4 py-1.5 hover:bg-orange-600 hover:text-white text-gray-300">New File</button>
          <button onClick={handleCreateDir} className="w-full text-left px-4 py-1.5 hover:bg-orange-600 hover:text-white text-gray-300">New Directory</button>
          {contextMenu.node && (
            <>
              <div className="h-px bg-[#333] my-1"></div>
              <button onClick={handleDelete} className="w-full text-left px-4 py-1.5 hover:bg-red-600 hover:text-white text-gray-300">Delete</button>
            </>
          )}
        </div>
      )}
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
          <div className="flex-1 flex flex-col overflow-hidden" onContextMenu={(e) => {
            if (e.target === e.currentTarget) handleContextMenu(e);
          }}>
            <div className="p-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              PROJECT (VibeCoder Workspace)
            </div>
            <div className="flex-1 overflow-y-auto py-2 min-h-0" onContextMenu={(e) => {
              if (e.target === e.currentTarget) handleContextMenu(e);
            }}>
              <FileTree nodes={fileTree} onSelect={openFile} onContextMenu={handleContextMenu} />
            </div>
          </div>
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
                {ollamaModels.length > 0 ? (
                  <select 
                    value={ollamaModel}
                    onChange={(e) => setOllamaModel(e.target.value)}
                    className="w-full bg-[#111111] border border-[#333] rounded px-2 py-1.5 text-sm text-gray-200 outline-none focus:border-orange-500 transition-colors"
                  >
                    {ollamaModels.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                ) : (
                  <input 
                    type="text" 
                    value={ollamaModel}
                    onChange={(e) => setOllamaModel(e.target.value)}
                    className="w-full bg-[#111111] border border-[#333] rounded px-2 py-1 text-sm text-gray-200 outline-none focus:border-orange-500 transition-colors"
                    placeholder="Enter model name..."
                  />
                )}
              </div>
            </div>
          </>
        )}
        {activeLeftTab === 'search' && (
          <div className="flex-1 flex flex-col h-full overflow-hidden">
            <div className="p-3 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-[#222222]">
              Search
            </div>
            <div className="p-3 border-b border-[#222222]">
               <input 
                 type="text"
                 value={searchQuery}
                 onChange={(e) => setSearchQuery(e.target.value)}
                 onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                 placeholder="Search files (Enter)"
                 className="w-full bg-[#111111] border border-[#333] rounded px-2 py-1 text-sm text-gray-200 outline-none focus:border-orange-500 transition-colors"
               />
            </div>
            <div className="flex-1 overflow-y-auto min-h-0">
               {searchResults.length === 0 && searchQuery && (
                 <div className="p-4 text-xs text-gray-500 text-center">No results found or press Enter to search</div>
               )}
               {searchResults.map((res, i) => (
                 <div 
                   key={i} 
                   className="p-2 border-b border-[#111] hover:bg-[#111] cursor-pointer"
                   onClick={() => openFile(res.path, res.path.split('/').pop() || res.path)}
                 >
                    <div className="text-orange-400 text-xs font-mono mb-1 truncate">{res.path}:{res.line}</div>
                    <div className="text-gray-400 text-xs font-mono truncate">{res.content}</div>
                 </div>
               ))}
            </div>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        
        {/* Editor Tabs */}
        <div className="flex bg-[#050505] border-b border-[#222222] overflow-x-auto scbar-none min-h-[37px]">
          {openFiles.map(file => (
            <div 
              key={file.path}
              onClick={() => setActiveFile(file.path)}
              className={`px-3 py-2 border-r border-[#222222] text-sm flex items-center space-x-2 cursor-pointer transition-colors group
                ${activeFile === file.path 
                  ? 'border-b-2 border-b-orange-500 text-orange-200 bg-[#0a0a0a]' 
                  : 'text-gray-500 hover:bg-[#0a0a0a] border-b-2 border-b-transparent'}`}
            >
              <FileCode size={14} className={activeFile === file.path ? 'text-orange-500' : 'text-gray-500'} />
              <span>{file.name}</span>
              <button 
                onClick={(e) => closeFile(e, file.path)}
                className={`ml-2 p-0.5 rounded-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-[#222222] ${activeFile === file.path ? 'opacity-100' : ''}`}
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>

        {/* Code Editor Mockup */}
        <div className="flex-1 bg-[#050505] p-0 overflow-auto font-mono text-sm leading-relaxed text-[#c9d1d9] relative">
          <div className="absolute top-4 right-4 text-xs flex flex-row items-center space-x-3 bg-[#0a0a0a] border border-[#222222] rounded-md px-2 py-1 shadow-sm z-10">
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
          
          <div className="h-full w-full">
            {activeFile ? (
              <pre className="!bg-transparent m-0 p-4 pt-16 h-full overflow-auto whitespace-pre">
                {fileContents[activeFile] || 'Loading...'}
              </pre>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-600">
                <span>No file selected. Open a file from the explorer.</span>
              </div>
            )}
           </div>
        </div>

        {/* Chat / Terminal Panel */}
        <div className="h-2/5 min-h-[250px] border-t border-[#222222] bg-[#0a0a0a] flex flex-col">
          <div className="flex px-4 items-center justify-between border-b border-[#222222]">
            <div className="flex space-x-6">
              <button 
                onClick={() => setBottomTab('chat')}
                className={`px-1 py-2 text-sm transition-colors ${bottomTab === 'chat' ? 'text-orange-200 border-b-2 border-orange-500' : 'text-gray-500 hover:text-orange-300'}`}
              >
                VibeCoder Chat
              </button>
              <button 
                onClick={() => setBottomTab('terminal')}
                className={`px-1 py-2 text-sm transition-colors ${bottomTab === 'terminal' ? 'text-orange-200 border-b-2 border-orange-500' : 'text-gray-500 hover:text-orange-300'}`}
              >
                Terminal
              </button>
              <button 
                onClick={() => setBottomTab('output')}
                className={`px-1 py-2 text-sm transition-colors ${bottomTab === 'output' ? 'text-orange-200 border-b-2 border-orange-500' : 'text-gray-500 hover:text-orange-300'}`}
              >
                Output
              </button>
            </div>
            <div className="flex space-x-2 items-center">
              <span className="text-xs text-orange-500 border border-orange-500/50 px-2 py-0.5 rounded shadow-[0_0_8px_rgba(249,115,22,0.2)]">Ollama Node</span>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto w-full">
            {bottomTab === 'chat' && (
              <div className="flex flex-col h-full">
                <div className="flex-1 overflow-y-auto p-4 space-y-4 font-mono text-sm">
                  {messages.map((msg, idx) => (
                    <motion.div 
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
            )}

            {bottomTab === 'terminal' && (
              <div className="p-4 font-mono text-xs text-gray-300">
                <div className="text-orange-500 mb-2">vibe-coder@local:~$ </div>
                <div className="text-gray-500">Terminal interface attached. Note: for pm2 to correctly run npm scripts with typescript locally, try `pm2 start server.ts --interpreter tsx`</div>
              </div>
            )}
            
            {bottomTab === 'output' && (
              <div className="p-4 font-mono text-xs text-gray-300">
                <div className="text-gray-500">[Info] Output channel initialized.</div>
              </div>
            )}
          </div>

        </div>

      </div>
    </div>
  );
}
