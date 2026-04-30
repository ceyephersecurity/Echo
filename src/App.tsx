/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Code2,
  FolderOpen,
  Terminal,
  Settings,
  Menu,
  FileCode,
  Layout,
  Play,
  cpu, // Note: lowercase icon name or use Cpu, let's stick to standard naming
  Cpu,
} from 'lucide-react';
import { useState } from 'react';
import { motion } from 'motion/react';

export default function App() {
  const [activeTab, setActiveTab] = useState('editor');
  const [messages, setMessages] = useState([
    { role: 'system', content: 'VibeCoder initialized. Connected to local Ollama. Ready for execution.\n\nNote: If you have connection issues, ensure Ollama is running with:\nOLLAMA_ORIGINS="*" ollama run deepseek-coder:6.7b' }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);

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
          model: 'deepseek-coder:6.7b', // Ensure this matches your local model
          messages: currentMessages.map(m => ({
             role: m.role === 'agent' ? 'assistant' : m.role,
             content: m.content
          })),
          stream: true,
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
      <div className="w-14 bg-[#0a0a0a] border-r border-[#222222] flex flex-col items-center py-4 space-y-6">
        <div className="p-2 bg-orange-600 rounded-lg text-white mb-4 shadow-[0_0_15px_rgba(234,88,12,0.4)]">
          <Cpu size={24} />
        </div>
        <button tabIndex={0} className="text-gray-500 hover:text-orange-500 transition-colors"><FolderOpen size={24} /></button>
        <button tabIndex={0} className="text-gray-500 hover:text-orange-500 transition-colors"><Code2 size={24} /></button>
        <button tabIndex={0} className="text-orange-500 hover:text-white transition-colors"><Terminal size={24} /></button>
        <div className="mt-auto flex flex-col space-y-6">
          <button tabIndex={0} className="text-gray-500 hover:text-orange-500 transition-colors"><Settings size={24} /></button>
        </div>
      </div>

      {/* Sidebar - File Explorer */}
      <div className="w-64 bg-[#050505] border-r border-[#222222] flex flex-col">
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
          <div className="px-3 pl-12 py-1 flex items-center space-x-2 text-sm text-orange-400 hover:bg-[#111111] cursor-pointer bg-[#111111] border-l-2 border-orange-500">
            <FileCode size={16} />
            <span>main.tsx</span>
          </div>
          <div className="px-3 pl-8 py-1 flex items-center space-x-2 text-sm text-gray-400 hover:bg-[#111111] hover:text-orange-100 cursor-pointer transition-colors">
            <FileCode size={16} className="text-gray-500" />
            <span>App.tsx</span>
          </div>
          <div className="px-3 py-1 flex items-center space-x-2 text-sm text-gray-400 hover:bg-[#111111] hover:text-orange-100 cursor-pointer transition-colors">
            <FileCode size={16} className="text-gray-500" />
            <span>package.json</span>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        
        {/* Editor Tabs */}
        <div className="flex bg-[#050505] border-b border-[#222222] overflow-x-auto scbar-none">
          <div className="px-4 py-2 border-r border-[#222222] border-b-2 border-b-orange-500 text-sm text-orange-200 flex items-center space-x-2 bg-[#0a0a0a]">
            <FileCode size={14} className="text-orange-500" />
            <span>main.tsx</span>
          </div>
          <div className="px-4 py-2 border-r border-[#222222] text-sm text-gray-500 flex items-center space-x-2 hover:bg-[#0a0a0a] cursor-pointer transition-colors">
            <FileCode size={14} className="text-gray-500" />
            <span>App.tsx</span>
          </div>
        </div>

        {/* Code Editor Mockup */}
        <div className="flex-1 bg-[#050505] p-4 overflow-auto font-mono text-sm leading-relaxed text-[#c9d1d9] relative">
          <div className="absolute top-4 right-4 text-xs text-orange-500 flex items-center space-x-2 border border-orange-500/30 px-2 py-1 rounded-md bg-[#0a0a0a]">
            <span className="w-2 h-2 bg-orange-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(249,115,22,0.8)]"></span>
            <span>VibeCoder Attached</span>
          </div>
          
          <pre className="!bg-transparent m-0 whitespace-pre-wrap">
            <span className="text-orange-500">import</span> {"{"} StrictMode {"}"} <span className="text-orange-500">from</span> <span className="text-orange-200">'react'</span>;<br/>
            <span className="text-orange-500">import</span> {"{"} createRoot {"}"} <span className="text-orange-500">from</span> <span className="text-orange-200">'react-dom/client'</span>;<br/>
            <span className="text-orange-500">import</span> App <span className="text-orange-500">from</span> <span className="text-orange-200">'./App.tsx'</span>;<br/>
            <span className="text-orange-500">import</span> <span className="text-orange-200">'./index.css'</span>;<br/>
            <br/>
            <span className="text-gray-500">{"// Generated by VibeCoder-Coder Phase 3"}</span><br/>
            createRoot(<span className="text-orange-300">document</span>.getElementById(<span className="text-orange-200">'root'</span>)!).render(<br/>
            {"  "}&lt;<span className="text-orange-400">StrictMode</span>&gt;<br/>
            {"    "}&lt;<span className="text-orange-400">App</span> /&gt;<br/>
            {"  "}&lt;/<span className="text-orange-400">StrictMode</span>&gt;,<br/>
            );<br/>
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
              <span className="text-xs text-orange-500 border border-orange-500/50 px-2 py-0.5 rounded shadow-[0_0_8px_rgba(249,115,22,0.2)]">Ollama (deepseek-coder:6.7b)</span>
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
