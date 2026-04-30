import { Terminal } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import 'xterm/css/xterm.css';
import { useEffect, useRef } from 'react';

export const TerminalPane = () => {
   const terminalRef = useRef<HTMLDivElement>(null);
   const wsRef = useRef<WebSocket | null>(null);
   
   useEffect(() => {
      if (!terminalRef.current) return;
      
      const term = new Terminal({ 
         theme: { background: '#050505', foreground: '#c9d1d9' },
         fontFamily: 'monospace',
         fontSize: 13,
         cursorBlink: true
      });
      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.open(terminalRef.current);
      fitAddon.fit();
      
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws/terminal`);
      wsRef.current = ws;
      
      ws.onmessage = (e) => {
          term.write(e.data);
      };
      
      term.onData((data) => {
         if (ws.readyState === WebSocket.OPEN) {
             ws.send(data);
         }
      });
      
      const handleResize = () => {
         try { fitAddon.fit(); } catch(e) {}
      };
      
      window.addEventListener('resize', handleResize);
      setTimeout(handleResize, 100);
      
      return () => {
         ws.close();
         term.dispose();
         window.removeEventListener('resize', handleResize);
      }
   }, []);
   
   return (
      <div className="h-full w-full overflow-hidden p-2 bg-[#050505]">
         <div ref={terminalRef} className="h-full w-full" />
      </div>
   );
};
