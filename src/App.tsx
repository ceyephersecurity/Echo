/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Code2,
  FolderOpen,
  Settings,
  FileCode,
  Play,
  Cpu,
  X,
  ChevronRight,
  ChevronDown,
  Square,
  Send,
  Trash2
} from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { TerminalPane } from './TerminalPane';
import { OutputPane } from './OutputPane';

// TreeNode interface for file explorer
interface TreeNode {
  name: string;
  type: 'file' | 'directory';
  path: string;
  children?: TreeNode[];
}

interface FileTreeProps {
  nodes: TreeNode[];
  onSelect: (path: string, name: string) => void;
  onContextMenu: (e: React.MouseEvent, node?: TreeNode) => void;
  depth?: number;
  currentPath?: string;
  creatingNode?: { path: string, type: 'file' | 'directory' } | null;
  createInputValue?: string;
  setCreateInputValue?: (v: string) => void;
  handleCreateSubmit?: () => void;
  setCreatingNode?: (v: null) => void;
}

const FileTree = ({ nodes, onSelect, onContextMenu, depth = 0, currentPath = '', creatingNode, createInputValue, setCreateInputValue, handleCreateSubmit, setCreatingNode }: FileTreeProps) => {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggleDir = (path: string) => setExpanded(prev => ({ ...prev, [path]: !prev[path] }));

  const sortedNodes = [...nodes].sort((a, b) => {
    if (a.type === b.type) return a.name.localeCompare(b.name);
    return a.type === 'directory' ? -1 : 1;
  });

  return (
    <div className="flex flex-col">
      {creatingNode && creatingNode.path === currentPath && (
         <div 
           className="flex items-center space-x-1 py-1 px-2 text-sm text-gray-400 group"
           style={{ paddingLeft: `${depth * 12 + 12}px` }}
         >
           {creatingNode.type === 'directory' ? <FolderOpen size={14} className="text-orange-500" /> : <FileCode size={14} className="text-gray-500 ml-3 group-hover:text-orange-400" />}
           <input 
             type="text"
             autoFocus
             value={createInputValue}
             onChange={(e) => setCreateInputValue?.(e.target.value)}
             onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateSubmit?.();
                if (e.key === 'Escape') setCreatingNode?.(null);
             }}
             onBlur={() => handleCreateSubmit?.()}
             className="bg-transparent border border-orange-500 outline-none text-gray-200 px-1 py-0.5 w-32 text-xs"
           />
         </div>
      )}
      {sortedNodes.map(node => (
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
          {node.type === 'directory' && expanded[node.path] && (
             <FileTree 
               nodes={node.children || []} 
               onSelect={onSelect} 
               onContextMenu={onContextMenu} 
               depth={depth + 1} 
               currentPath={node.path}
               creatingNode={creatingNode}
               createInputValue={createInputValue}
               setCreateInputValue={setCreateInputValue}
               handleCreateSubmit={handleCreateSubmit}
               setCreatingNode={setCreatingNode}
             />
          )}
        </div>
      ))}
    </div>
  );
};

export default function App() {
  const getInitialMessages = () => [
      { role: 'system', content: `VibeCoder initialized. Connected to local Ollama.

SYSTEM INSTRUCTIONS (For Model):
CRITICAL: You are an autonomous coding agent. Do NOT output conversational code examples. You MUST ONLY write complete files using the EXACT format below. The file block format is your ONLY way to create files.

You are working inside a project workspace. You must place all files at the root of the workspace or inside subdirectories as appropriate (e.g., src/index.js, package.json). Do NOT use absolute paths.

To create or edit a file, use EXACTLY this markdown format:
\`\`\`file:filename.ext
<file contents here>
\`\`\`
The application will automatically parse these code blocks and write the files to disk.` }
  ];

  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      const saved = localStorage.getItem('vibecoder_messages');
      if (saved) return JSON.parse(saved);
    } catch(e) {}
    return getInitialMessages();
  });
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  
  const activeControllerRef = useRef<AbortController | null>(null);
  const messagesRef = useRef(messages);
  
  useEffect(() => {
    messagesRef.current = messages;
    localStorage.setItem('vibecoder_messages', JSON.stringify(messages));
  }, [messages]);
  
  // New States
  const [ollamaStatus, setOllamaStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking');
  const [ollamaUrl, setOllamaUrl] = useState('http://127.0.0.1:11434');
  const [ollamaModel, setOllamaModel] = useState('deepseek-coder:6.7b');
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  
  const [activeLeftTab, setActiveLeftTab] = useState<'explorer' | 'search'>('explorer');
  const [fileTree, setFileTree] = useState<TreeNode[]>([]);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, node?: TreeNode } | null>(null);
  
  const [creatingNode, setCreatingNode] = useState<{ path: string, type: 'file' | 'directory' } | null>(null);
  const [createInputValue, setCreateInputValue] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{path: string, line: number, content: string}[]>([]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}${activeWorkspace ? '&dir=' + encodeURIComponent(activeWorkspace) : ''}`);
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

  const [activeWorkspace, setActiveWorkspace] = useState<string>('');
  
  const [showProjectModal, setShowProjectModal] = useState<'create' | 'open' | null>(null);
  const [availableProjects, setAvailableProjects] = useState<string[]>([]);
  const [newProjectName, setNewProjectName] = useState('');

  // Load File Tree initially
  const loadFileTree = () => {
    fetch(`/api/files${activeWorkspace ? '?dir=' + encodeURIComponent(activeWorkspace) : ''}`)
       .then(r => r.json())
       .then(val => {
          if (Array.isArray(val)) setFileTree(val);
       })
       .catch(e => console.error("Could not load file tree", e));
  };

  useEffect(() => {
    loadFileTree();
  }, [activeWorkspace]);

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

  const fetchChatResponse = async (messagesToPass: Message[], targetModel: string, isSteer: boolean, existingAgentContent: string = '') => {
    setIsTyping(true);
    const controller = new AbortController();
    activeControllerRef.current = controller;

    let finalAgentMessage = existingAgentContent;

    const fileContexts = openFiles.map(f => `--- ${f.path} ---\n${fileContents[f.path] || ''}`).join('\n\n');
    const systemMemoryAddon = fileContexts ? `\n\nCURRENT OPEN FILES CONTEXT:\n${fileContexts}` : '';

    const payloadMessages = messagesToPass.slice(0, -1).map(m => {
       if (m.role === 'system') {
           return { role: 'system', content: m.content + systemMemoryAddon };
       }
       return { role: m.role === 'agent' ? 'assistant' : m.role, content: m.content };
    });

    try {
      console.log('Sending payload:', {
        baseUrl: ollamaUrl,
        model: targetModel,
        messagesCount: payloadMessages.length
      });

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          baseUrl: ollamaUrl,
          payload: {
            model: targetModel,
            messages: payloadMessages,
            stream: true,
          }
        }),
        signal: controller.signal
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
        let buffer = '';
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            
            for (const line of lines) {
              if (!line.trim()) continue;
              console.log('Received chunk line:', line);
              try {
                const parsed = JSON.parse(line);
                if (parsed.message?.content) {
                  finalAgentMessage += parsed.message.content;
                  setMessages(prev => {
                    if (activeControllerRef.current !== controller) return prev;
                    const currentMessages = [...prev];
                    currentMessages[currentMessages.length - 1] = { role: 'agent', content: finalAgentMessage };
                    return currentMessages;
                  });

                  // Live file parsing
                  if (activeControllerRef.current === controller) {
                    const liveRegex = /```(?:file:)?([^\n]+)\n([\s\S]*?)(?:```|$)/g;
                    let liveMatch;
                    let currentLiveFile = '';
                    let currentLiveContent = '';
                    const newFileContents: Record<string, string> = {};
                    while ((liveMatch = liveRegex.exec(finalAgentMessage)) !== null) {
                        let pathMatch = liveMatch[1].trim();
                        if (pathMatch.includes('/') || pathMatch.includes('.')) {
                            if (pathMatch.startsWith('file:')) pathMatch = pathMatch.replace('file:', '').trim();
                            if (activeWorkspace) {
                                if (pathMatch.startsWith('/')) pathMatch = pathMatch.substring(1);
                                if (!pathMatch.startsWith(activeWorkspace)) {
                                   pathMatch = activeWorkspace + '/' + pathMatch;
                                }
                            }
                            currentLiveFile = pathMatch;
                            currentLiveContent = liveMatch[2];
                            newFileContents[currentLiveFile] = currentLiveContent;
                        }
                    }
                    
                    if (currentLiveFile) {
                        setActiveFile(currentLiveFile);
                        setOpenFiles(prev => {
                            if (!prev.find(f => f.path === currentLiveFile)) {
                                return [...prev, { name: currentLiveFile.split('/').pop() || currentLiveFile, path: currentLiveFile }];
                            }
                            return prev;
                        });
                    }
                    if (Object.keys(newFileContents).length > 0) {
                        setFileContents(prev => ({...prev, ...newFileContents}));
                    }
                  }
                }
              } catch (e) {
                console.error('JSON parsing error for line:', line, e);
              }
            }
          }
        } catch (streamErr: any) {
           console.error('Stream read error:', streamErr);
           throw streamErr;
        }
      }
      
      if (activeControllerRef.current === controller && finalAgentMessage) {
        const regex = /```(?:file:)?([^\n]+)\n([\s\S]*?)```/g;
        let match;
        const promises = [];
        let autoRunScript = '';
        while ((match = regex.exec(finalAgentMessage)) !== null) {
            const filePath = match[1].trim();
            const content = match[2];
            if (filePath.includes('/') || filePath.includes('.')) {
                let actualPath = filePath;
                if (actualPath.startsWith('file:')) {
                    actualPath = actualPath.replace('file:', '').trim();
                }
                if (activeWorkspace) {
                    if (actualPath.startsWith('/')) actualPath = actualPath.substring(1);
                    if (!actualPath.startsWith(activeWorkspace)) {
                       actualPath = activeWorkspace + '/' + actualPath;
                    }
                }
                promises.push(
                    fetch('/api/file', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ path: actualPath, content })
                    })
                );
                if (actualPath.endsWith('.py') || actualPath.endsWith('.js') || actualPath.endsWith('.sh')) {
                    autoRunScript = actualPath;
                }
            }
        }
        if (promises.length > 0) {
            await Promise.all(promises);
            loadFileTree();
            if (autoRunScript) {
                setBottomTab('output');
                fetch('/api/run', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path: autoRunScript })
                }).catch(e => console.error('Failed to run script:', e));
            }
        }
      }
      
    } catch (error: any) {
      console.error('[App] Complete error fetching chat:', error);
      if (error.name === 'AbortError') {
         if (!isSteer && activeControllerRef.current === controller) {
             setMessages(prev => {
                const copy = [...prev];
                copy[copy.length - 1] = { role: 'system', content: '-- Stopped --' };
                return copy;
             });
         }
      } else {
        if (activeControllerRef.current === controller) {
            setMessages(prev => {
              const currentMessages = [...prev];
              currentMessages[currentMessages.length - 1] = { 
                role: 'system', 
                content: `Error: ${error.message}\n\nPlease ensure your local Ollama is running and accessible.` 
              };
              return currentMessages;
            });
        }
      }
    } finally {
      if (activeControllerRef.current === controller) {
        setIsTyping(false);
        activeControllerRef.current = null;
      }
    }
  };

  const handleProcessInput = async () => {
    const text = input.trim();
    if (!text) return;
    setInput('');

    const isSteer = isTyping;

    if (isTyping && activeControllerRef.current) {
        const oldCont = activeControllerRef.current;
        activeControllerRef.current = null;
        oldCont.abort();
        await new Promise(r => setTimeout(r, 50));
    }

    const newMessages = [...messagesRef.current];

    if (isSteer) {
        newMessages.push({ role: 'user', content: `[STEER]: ${text}` });
    } else {
        newMessages.push({ role: 'user', content: text });
    }
    
    newMessages.push({ role: 'agent', content: '' });
    setMessages(newMessages);

    fetchChatResponse(newMessages, ollamaModel, isSteer);
  };

  const handleStopMode = () => {
      if (activeControllerRef.current) {
          activeControllerRef.current.abort();
          activeControllerRef.current = null;
          setIsTyping(false);
          setMessages(prev => {
             const copy = [...prev];
             copy.push({ role: 'system', content: '-- Stopped by user --' });
             return copy;
          });
      }
  };

  const handleContextMenu = (e: React.MouseEvent, node?: TreeNode) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, node });
  };

  const handleCreateFileContext = () => {
    if (!contextMenu) return;
    const basePath = contextMenu.node?.type === 'directory' ? contextMenu.node.path : (contextMenu.node ? contextMenu.node.path.split('/').slice(0, -1).join('/') : '');
    setCreatingNode({ path: basePath, type: 'file' });
    setCreateInputValue('');
    setContextMenu(null);
  };

  const handleCreateDirContext = () => {
    if (!contextMenu) return;
    const basePath = contextMenu.node?.type === 'directory' ? contextMenu.node.path : (contextMenu.node ? contextMenu.node.path.split('/').slice(0, -1).join('/') : '');
    setCreatingNode({ path: basePath, type: 'directory' });
    setCreateInputValue('');
    setContextMenu(null);
  };

  const handleCreateSubmit = async () => {
     if (!createInputValue.trim() || !creatingNode) {
         setCreatingNode(null);
         return;
     }
     
     const fullPath = creatingNode.path ? `${creatingNode.path}/${createInputValue}` : createInputValue;
     
     try {
         await fetch(creatingNode.type === 'file' ? '/api/file' : '/api/dir', {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify(creatingNode.type === 'file' ? { path: fullPath, content: '' } : { path: fullPath })
         });
         loadFileTree();
     } catch (e) {
         console.error(e);
     }
     setCreatingNode(null);
     setCreateInputValue('');
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

  const handleSaveActiveFile = async () => {
    if (!activeFile) return;
    try {
      await fetch('/api/file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: activeFile, content: fileContents[activeFile] || '' })
      });
      // Optional: Maybe a nice little 'Saved!' state here instead of an alert, but alert works for MVP.
    } catch (err) {
      console.error('Failed to save file:', err);
    }
  };

  const handleClearChat = () => {
    setMessages(getInitialMessages());
  };

  const handleModelChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newModel = e.target.value;
    setOllamaModel(newModel);
    
    if (isTyping && activeControllerRef.current) {
        const oldCont = activeControllerRef.current;
        activeControllerRef.current = null;
        oldCont.abort();
        await new Promise(r => setTimeout(r, 50));
        
        const currentMsgs = [...messagesRef.current];
        const lastMsg = currentMsgs[currentMsgs.length - 1];
        const existingText = lastMsg.role === 'agent' ? lastMsg.content : '';
        
        let fetchMsgs = [...currentMsgs];
        if (fetchMsgs[fetchMsgs.length - 1]?.role === 'agent') {
            fetchMsgs[fetchMsgs.length - 1] = { role: 'assistant', content: existingText };
        }
        fetchMsgs.push({ role: 'user', content: '[SYSTEM]: The model was switched mid-generation. Please continue exactly from the last character you outputted without acknowledging this instruction.' });
        fetchMsgs.push({ role: 'agent', content: existingText });
        
        fetchChatResponse(fetchMsgs, newModel, true, existingText);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#050505] text-gray-300 font-sans overflow-hidden">
      {/* Top Menu Bar */}
      <div className="flex items-center px-4 py-1.5 bg-[#111] border-b border-[#222]">
        <div className="relative group">
           <button className="text-sm px-2 py-1 hover:bg-[#333] rounded">File</button>
           <div className="absolute left-0 top-full mt-1 w-48 bg-[#111] border border-[#333] rounded shadow-xl hidden group-hover:block z-50 py-1">
               <button 
                  onClick={() => setShowProjectModal('create')} 
                  className="w-full text-left px-4 py-1.5 hover:bg-orange-600 hover:text-white text-gray-300 text-sm"
               >
                  New Project...
               </button>
               <button 
                  onClick={() => {
                     fetch('/api/projects').then(res => res.json()).then(data => {
                        setAvailableProjects(data || []);
                        setShowProjectModal('open');
                     });
                  }} 
                  className="w-full text-left px-4 py-1.5 hover:bg-orange-600 hover:text-white text-gray-300 text-sm"
               >
                  Open Project...
               </button>
           </div>
        </div>
        <div className="ml-auto text-xs text-gray-500 flex items-center space-x-2">
            {activeWorkspace ? (
                <>
                    <FolderOpen size={14} className="text-orange-500" />
                    <span>{activeWorkspace}</span>
                    <button 
                        onClick={() => setActiveWorkspace('')} 
                        className="ml-2 px-1 border border-[#333] hover:border-gray-500 rounded text-gray-400"
                        title="Close Project"
                    >
                        ×
                    </button>
                </>
            ) : (
                <span>No Project Workspace Open</span>
            )}
        </div>
      </div>

      {showProjectModal && (
          <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center">
              <div className="bg-[#111] border border-[#333] p-6 rounded-lg shadow-xl w-96">
                  <h2 className="text-lg text-white mb-4">
                      {showProjectModal === 'create' ? 'Create New Project' : 'Open Project'}
                  </h2>
                  
                  {showProjectModal === 'create' ? (
                      <div>
                          <label className="block text-xs text-gray-500 mb-1">Project Name (no spaces)</label>
                          <input 
                              type="text" 
                              value={newProjectName}
                              onChange={(e) => setNewProjectName(e.target.value.replace(/\s+/g, '-'))}
                              className="w-full bg-[#050505] border border-[#333] rounded px-3 py-2 text-white outline-none focus:border-orange-500 mb-4"
                              placeholder="my-awesome-app"
                              autoFocus
                              onKeyDown={(e) => {
                                  if (e.key === 'Enter' && newProjectName.trim()) {
                                      fetch('/api/projects', {
                                          method: 'POST',
                                          headers: { 'Content-Type': 'application/json' },
                                          body: JSON.stringify({ name: newProjectName.trim() })
                                      }).then(() => {
                                          setActiveWorkspace('projects/' + newProjectName.trim());
                                          setShowProjectModal(null);
                                          setNewProjectName('');
                                      });
                                  }
                              }}
                          />
                      </div>
                  ) : (
                      <div className="mb-4 max-h-60 overflow-y-auto border border-[#333] rounded bg-[#050505]">
                          {availableProjects.length === 0 ? (
                              <div className="p-4 text-center text-sm text-gray-500">No projects found. Create one first.</div>
                          ) : (
                              availableProjects.map(p => (
                                  <button 
                                      key={p} 
                                      onClick={() => {
                                          setActiveWorkspace('projects/' + p);
                                          setShowProjectModal(null);
                                      }}
                                      className="block w-full text-left px-4 py-2 hover:bg-[#222] border-b border-[#222] last:border-0"
                                  >
                                      <div className="flex items-center space-x-2">
                                          <FolderOpen size={14} className="text-gray-400" />
                                          <span>{p}</span>
                                      </div>
                                  </button>
                              ))
                          )}
                      </div>
                  )}

                  <div className="flex justify-end space-x-2">
                      <button 
                          onClick={() => {
                              setShowProjectModal(null);
                              setNewProjectName('');
                          }}
                          className="px-4 py-1.5 rounded text-sm text-gray-400 hover:bg-[#222]"
                      >
                          Cancel
                      </button>
                      {showProjectModal === 'create' && (
                          <button 
                              onClick={() => {
                                  if (newProjectName.trim()) {
                                      fetch('/api/projects', {
                                          method: 'POST',
                                          headers: { 'Content-Type': 'application/json' },
                                          body: JSON.stringify({ name: newProjectName.trim() })
                                      }).then(() => {
                                          setActiveWorkspace('projects/' + newProjectName.trim());
                                          setShowProjectModal(null);
                                          setNewProjectName('');
                                      });
                                  }
                              }}
                              className="px-4 py-1.5 rounded text-sm bg-orange-600 hover:bg-orange-500 text-white disabled:opacity-50"
                              disabled={!newProjectName.trim()}
                          >
                              Create
                          </button>
                      )}
                  </div>
              </div>
          </div>
      )}

      <div className="flex h-full overflow-hidden">
      {/* Context Menu */}
      {contextMenu && (
        <div 
          className="fixed z-50 bg-[#111] border border-[#333] py-1 rounded shadow-xl text-sm min-w-[150px]"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <button onClick={handleCreateFileContext} className="w-full text-left px-4 py-1.5 hover:bg-orange-600 hover:text-white text-gray-300">New File</button>
          <button onClick={handleCreateDirContext} className="w-full text-left px-4 py-1.5 hover:bg-orange-600 hover:text-white text-gray-300">New Directory</button>
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
              <FileTree 
                nodes={fileTree} 
                onSelect={openFile} 
                onContextMenu={handleContextMenu} 
                creatingNode={creatingNode}
                createInputValue={createInputValue}
                setCreateInputValue={setCreateInputValue}
                handleCreateSubmit={handleCreateSubmit}
                setCreatingNode={setCreatingNode}
              />
            </div>
          </div>
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
             {activeFile && (
               <button 
                 onClick={handleSaveActiveFile}
                 className="flex items-center space-x-1 border-r border-[#333] pr-3 text-gray-400 hover:text-orange-400 transition-colors"
               >
                 <span>Save (Ctrl+S)</span>
               </button>
             )}
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
              <textarea
                className="w-full h-full bg-transparent text-[#c9d1d9] p-4 pt-16 font-mono text-sm leading-relaxed resize-none outline-none"
                value={fileContents[activeFile] || ''}
                onChange={(e) => setFileContents(prev => ({ ...prev, [activeFile]: e.target.value }))}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                    e.preventDefault();
                    handleSaveActiveFile();
                  }
                }}
                spellCheck={false}
              />
            ) : (
              <div className="h-full flex items-center justify-center text-gray-600">
                <span>No file selected. Open a file from the explorer.</span>
              </div>
            )}
           </div>
        </div>

        {/* Chat / Terminal Panel */}
        <div className="h-2/5 min-h-[250px] border-t border-[#222222] bg-[#0a0a0a] flex flex-col">
          <div className="flex px-4 items-center justify-between border-b border-[#222222] shrink-0">
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
              {bottomTab === 'chat' && (
                 <button onClick={handleClearChat} className="text-gray-500 hover:text-red-400 p-1" title="Clear Chat History">
                    <Trash2 size={14} />
                 </button>
              )}
              <select 
                value={ollamaModel}
                onChange={handleModelChange}
                className="bg-[#111] text-orange-200 border border-[#333] rounded px-2 py-0.5 text-xs outline-none focus:border-orange-500 max-w-[150px] truncate"
              >
                  {ollamaModels.length > 0 ? (
                      ollamaModels.map(m => <option key={m} value={m}>{m}</option>)
                  ) : (
                      <option value={ollamaModel}>{ollamaModel}</option>
                  )}
              </select>
              <span className="text-xs text-orange-500 border border-orange-500/50 px-2 py-0.5 rounded shadow-[0_0_8px_rgba(249,115,22,0.2)] flex-shrink-0">Ollama Node</span>
            </div>
          </div>
          
          <div className="flex-1 overflow-hidden w-full relative">
            {bottomTab === 'chat' && (
              <div className="flex flex-col h-full bg-[#050505]">
                <div className="flex-1 overflow-y-auto p-4 space-y-4 font-mono text-sm">
                  {messages.map((msg, idx) => {
                    if (msg.role === 'system' && msg.content.includes('SYSTEM INSTRUCTIONS')) return null;
                    return (
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
                    );
                  })}
                </div>
      
                {/* Input Area */}
                <div className="p-3 bg-[#050505] border-t border-[#222222]">
                  <div className="flex items-center space-x-2">
                    <span className="text-orange-500 font-mono pl-1">&gt;</span>
                    <input 
                      type="text" 
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                              if (isTyping) {
                                  if (e.ctrlKey && e.shiftKey) {
                                      e.preventDefault();
                                      handleProcessInput();
                                  }
                              } else {
                                  e.preventDefault();
                                  handleProcessInput();
                              }
                          }
                      }}
                      placeholder={isTyping ? "Model generating... (Ctrl+Shift+Enter to steer)" : "Ask VibeCoder to generate, edit, or explain... (Press Enter)"}
                      className="flex-1 bg-transparent border-none outline-none text-gray-200 font-mono text-sm placeholder-gray-600 ml-1"
                    />
                    {isTyping ? (
                      <>
                        <button 
                          onClick={handleStopMode}
                          className="p-1 text-red-500 hover:text-red-400 transition-colors cursor-pointer"
                          title="Stop Generation"
                        >
                          <Square size={16} fill="currentColor" />
                        </button>
                      </>
                    ) : (
                      <button 
                        onClick={handleProcessInput}
                        className="p-1 text-orange-500 hover:text-orange-400 transition-colors"
                      >
                        <Play size={16} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {bottomTab === 'terminal' && (
              <TerminalPane />
            )}
            
            {bottomTab === 'output' && (
               <OutputPane />
            )}
          </div>
        </div>
      </div>
    </div>
    </div>
  );
}
