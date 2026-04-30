import { useEffect, useState, useRef } from 'react';

export const OutputPane = () => {
   const [logs, setLogs] = useState<string[]>([]);
   const bottomRef = useRef<HTMLDivElement>(null);
   
   useEffect(() => {
      const fetchLogs = async () => {
         try {
           const res = await fetch('/api/logs');
           if (res.ok) setLogs(await res.json());
         } catch(e) {}
      };
      fetchLogs();
      const int = setInterval(fetchLogs, 2000);
      return () => clearInterval(int);
   }, []);

   useEffect(() => {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
   }, [logs]);
   
   return (
      <div className="h-full w-full overflow-y-auto font-mono text-xs text-gray-300 p-4 space-y-1 bg-[#050505]">
         {logs.map((L, i) => (
             <div key={i} className="whitespace-pre-wrap font-mono leading-relaxed">{L}</div>
         ))}
         <div ref={bottomRef} className="h-px w-full" />
      </div>
   );
};
