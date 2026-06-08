import React, { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { Settings, Send, CheckCircle2, AlertCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { ChatMessage, ReactorState, ChatResponse } from './types';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceDot,
} from 'recharts';
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

// -------------------------------------------------------------
// Reactor Visualization Components
// -------------------------------------------------------------

function ReactorSchematic({ state }: { state: ReactorState }) {
  if (!state || !state.type) {
    return (
      <div className="flex items-center justify-center h-48 bg-gray-50 border border-gray-100 rounded-xl text-gray-400 text-sm">
        Start a conversation to see the reactor schematic.
      </div>
    );
  }

  const { type, volume, conversion } = state;

  return (
    <div className="relative w-full h-48 bg-white border border-gray-100 rounded-xl flex items-center justify-center p-4 overflow-hidden">
      {type === 'PFR' && (
        <div className="w-full max-w-md h-32 flex items-center justify-center">
          <svg viewBox="0 0 400 100" width="100%" height="100%" className="overflow-visible">
            <defs>
              <clipPath id="pfr-clip">
                <rect x="0" y="20" width="400" height="60" rx="30" />
              </clipPath>
            </defs>
            <rect x="0" y="20" width="400" height="60" rx="30" fill="none" stroke="#e5e7eb" strokeWidth="4" />
            <g clipPath="url(#pfr-clip)">
              <rect x="0" width="67" y="0" height="100" fill="#9FE1CB" />
              <rect x="66" width="67" y="0" height="100" fill="#7EC8B0" />
              <rect x="133" width="67" y="0" height="100" fill="#5DB095" />
              <rect x="200" width="67" y="0" height="100" fill="#3A967A" />
              <rect x="266" width="67" y="0" height="100" fill="#1D9E75" />
              <rect x="333" width="68" y="0" height="100" fill="#04342C" />

              <circle cx="0" cy="50" r="5" fill="#E2603A">
                <animate attributeName="cx" from="0" to="400" dur="2s" repeatCount="indefinite" />
              </circle>
              <circle cx="0" cy="50" r="5" fill="#E2603A">
                <animate attributeName="cx" from="0" to="400" dur="2s" begin="0.5s" repeatCount="indefinite" />
              </circle>
              <circle cx="0" cy="50" r="5" fill="#E2603A">
                <animate attributeName="cx" from="0" to="400" dur="2s" begin="1s" repeatCount="indefinite" />
              </circle>
              <circle cx="0" cy="50" r="5" fill="#E2603A">
                <animate attributeName="cx" from="0" to="400" dur="2s" begin="1.5s" repeatCount="indefinite" />
              </circle>
            </g>
          </svg>
        </div>
      )}

      {type === 'CSTR' && (
        <div className="w-32 h-32 flex items-center justify-center">
          <svg viewBox="0 0 100 100" width="100%" height="100%" className="overflow-visible">
            <rect x="10" y="10" width="80" height="80" rx="20" fill="#1D9E75" stroke="#04342C" strokeWidth="3" />
            <rect x="47" y="10" width="6" height="55" fill="#5C6B66" />
            <g transform="translate(50, 70)">
              <rect x="-25" y="-4" width="50" height="8" rx="4" fill="#e5e7eb">
                <animateTransform 
                  attributeName="transform" 
                  type="rotate" 
                  from="0 0 0" 
                  to="360 0 0" 
                  dur="1s" 
                  repeatCount="indefinite" 
                />
              </rect>
            </g>
          </svg>
        </div>
      )}

      {/* Conversion Callout */}
      <div className="absolute top-4 right-4 bg-[#E0F4EE] px-3 py-2 rounded-lg border border-[#A6DCD0] flex flex-col items-center">
        <span className="text-[10px] font-semibold text-[#0E7C66] uppercase tracking-wider mb-0.5">
          Conversion
        </span>
        <span className="text-xl font-bold text-[#16302D] leading-none">
          {conversion !== undefined ? conversion.toFixed(3) : '-'}
        </span>
      </div>

      {/* Volume Label */}
      <div className="absolute bottom-4 pb-1 text-sm font-medium text-[#5C6B66] bg-white/80 px-2 rounded backdrop-blur">
        {type} &middot; {volume !== undefined ? volume.toFixed(3) : '-'} m³
      </div>
    </div>
  );
}

function ReactorPlot({ state }: { state: ReactorState }) {
  if (!state || !state.type) {
    return (
       <div className="flex flex-col items-center justify-center h-64 bg-gray-50 border border-gray-100 rounded-xl text-gray-400 text-sm mt-4">
        Plot will appear here.
      </div>
    );
  }

  const { type, volume, conversion, profile } = state;
  let data = profile || [];

  // For CSTR, we might just have a single point or no profile, but we need some width on X axis.
  if (type === 'CSTR' && profile == null && volume != null && conversion != null) {
      data = [
        { volume: 0, conversion: null },
        { volume: volume * 1.5, conversion: null } // Establish axis range, no line
      ];
  }

  const operatingPoint = { volume, conversion };

  return (
    <div className="w-full h-64 mt-4 bg-white border border-gray-100 rounded-xl p-4 flex flex-col">
      <h3 className="text-xs font-semibold text-[#5C6B66] uppercase tracking-wider mb-4">
        Conversion vs Volume
      </h3>
      <div className="flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
            <XAxis
              dataKey="volume"
              type="number"
              domain={[0, 'dataMax']}
              tick={{ fontSize: 12, fill: '#5C6B66' }}
              tickFormatter={(v) => v.toFixed(1)}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              dataKey="conversion"
              type="number"
              domain={[0, 1]}
              tick={{ fontSize: 12, fill: '#5C6B66' }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              contentStyle={{ borderRadius: '8px', border: '1px solid #E5E7EB', boxShadow: 'none' }}
              labelFormatter={(v) => `Volume: ${Number(v).toFixed(2)} m³`}
              formatter={(v: number) => [v.toFixed(3), 'Conversion']}
            />
            <Line
              type="monotone"
              dataKey="conversion"
              stroke="#0E7C66"
              strokeWidth={3}
              dot={false}
              activeDot={{ r: 6, fill: '#0E7C66', stroke: '#fff', strokeWidth: 2 }}
            />
            {type === 'CSTR' && volume != null && conversion != null && (
               <ReferenceDot
                 x={volume}
                 y={conversion}
                 r={6}
                 fill="#E2603A"
                 stroke="#fff"
                 strokeWidth={2}
               />
            )}
            {type === 'PFR' && volume != null && conversion != null && (
               <ReferenceDot
                 x={volume}
                 y={conversion}
                 r={6}
                 fill="#E2603A"
                 stroke="#fff"
                 strokeWidth={2}
               />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function VerifiedBadge({ state }: { state: ReactorState }) {
  if (!state || !state.checks || !state.type) return null;

  const { ok, checks } = state;
  const isOk = ok && checks.positiveVolume && checks.validConversion;

  return (
    <div
      className={cn(
        "mt-4 flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium",
        isOk ? "bg-[#F0FAF7] text-[#0E7C66]" : "bg-amber-50 text-amber-800"
      )}
    >
      {isOk ? (
        <CheckCircle2 className="w-5 h-5 text-[#0E7C66]" />
      ) : (
        <AlertCircle className="w-5 h-5 text-amber-600" />
      )}
      <span>
        {isOk
          ? "verified · 0 ≤ X ≤ 1 · volume positive"
          : "warning · physically invalid parameters"}
      </span>
    </div>
  );
}

// -------------------------------------------------------------
// Layout & Main App
// -------------------------------------------------------------

export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [reactorState, setReactorState] = useState<ReactorState | null>(null);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId] = useState(() => Math.random().toString(36).substring(7));
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as any);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMsg: ChatMessage = { id: Math.random().toString(), role: "user", content: input };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, message: userMsg.content }),
      });

      if (!response.ok) throw new Error("API error");

      const data: ChatResponse = await response.json();
      
      // Map API history to local chat messages
      // Backend returns client-friendly history
      const newMessages = data.history.map((m) => ({
        id: m.id || Math.random().toString(),
        role: m.role as 'user'|'model',
        content: m.content,
      }));
      
      setMessages(newMessages);
      
      if (data.reactorState) {
        setReactorState(data.reactorState);
      }
    } catch (error) {
      console.error(error);
      setMessages((prev) => [
        ...prev,
        { id: Math.random().toString(), role: "model", content: "Sorry, an error occurred while calculating." },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-screen bg-white text-[#16302D] font-sans flex flex-col overflow-hidden">
      {/* Top Bar */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-none">
        <h1 className="text-[14px] font-bold tracking-tight text-[#16302D]">Reactor copilot</h1>
        <button className="p-2 hover:bg-gray-50 rounded-full transition-colors">
          <Settings className="w-5 h-5 text-[#5C6B66]" />
        </button>
      </header>

      {/* Main Grid */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 grid grid-cols-1 md:grid-cols-[65%_1fr] gap-6 min-h-0">
        
        {/* Left Column: Visualization */}
        <section className="flex flex-col min-h-0">
          <div className="bg-white rounded-xl border border-gray-100 p-6 flex flex-col h-full overflow-y-auto">
            <h2 className="text-[#5C6B66] text-xs font-semibold uppercase tracking-wider mb-6">
              Reactor Configuration
            </h2>
            
            {reactorState ? (
               <ReactorSchematic state={reactorState} />
            ) : (
               <div className="flex-1 flex items-center justify-center border-2 border-dashed border-gray-100 rounded-xl min-h-[200px]">
                 <p className="text-[#5C6B66] text-sm text-center max-w-sm">
                   Describe a reaction problem in the conversation panel to generate a reactor design and performance plot.
                 </p>
               </div>
            )}
            
            {reactorState && <ReactorPlot state={reactorState} />}
            {reactorState && <VerifiedBadge state={reactorState} />}
            
          </div>
        </section>

        {/* Right Column: Conversation */}
        <section className="flex flex-col bg-white rounded-xl border border-gray-100 overflow-hidden h-full">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50">
            <h2 className="text-[#5C6B66] text-xs font-semibold uppercase tracking-wider">
              Conversation
            </h2>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 && (
              <div className="text-center mt-10">
                <p className="text-[#5C6B66] text-sm">
                   Ask me to size a PFR or CSTR. <br/>
                   e.g. "size a PFR to convert 90% of A to B at k=0.5/s, feed of 1 mol/s and C_A0 = 2000 mol/m³"
                </p>
              </div>
            )}
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "flex",
                  msg.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                <div
                  className={cn(
                    "max-w-[85%] px-4 py-3 rounded-[8px] text-[14px] leading-relaxed",
                    msg.role === "user"
                      ? "bg-[#E6F1FB] text-[#0A2540] rounded-br-[4px]" // User: Light blue
                      : "bg-[#F2F1EC] text-[#16302D] rounded-bl-[4px]" // Agent: Light grey
                  )}
                >
                  {msg.role === 'model' ? (
                    <div className="prose prose-sm !text-[#16302D] max-w-none prose-p:leading-relaxed prose-headings:text-[#16302D] prose-strong:text-[#16302D] prose-a:text-[#0E7C66]">
                      <ReactMarkdown 
                        remarkPlugins={[remarkGfm, remarkMath]}
                        rehypePlugins={[rehypeKatex]}
                      >
                        {msg.content}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <span className="whitespace-pre-wrap">{msg.content}</span>
                  )}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="max-w-[85%] px-4 py-3 bg-[#F2F1EC] text-[#5C6B66] rounded-[8px] rounded-bl-[4px] flex space-x-1 items-center h-10">
                  <div className="w-1.5 h-1.5 bg-[#5C6B66]/60 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                  <div className="w-1.5 h-1.5 bg-[#5C6B66]/60 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                  <div className="w-1.5 h-1.5 bg-[#5C6B66]/60 rounded-full animate-bounce"></div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={handleSubmit} className="p-4 border-t border-gray-100 bg-white">
            <div className="relative flex items-end">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Describe your reactor problem…"
                className="w-full bg-[#F2F1EC] text-[#16302D] placeholder-[#5C6B66]/70 rounded-2xl pl-5 pr-12 py-3 text-[14px] focus:outline-none focus:ring-2 focus:ring-[#0E7C66]/30 transition-all border border-transparent focus:border-[#0E7C66]/20 resize-none min-h-[46px] max-h-[200px]"
                disabled={isLoading}
                rows={1}
              />
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="absolute right-1.5 bottom-1.5 p-2 bg-[#0E7C66] text-white rounded-full hover:bg-[#0A6351] transition-colors disabled:opacity-50 disabled:hover:bg-[#0E7C66]"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </form>
        </section>
      </main>
    </div>
  );
}
