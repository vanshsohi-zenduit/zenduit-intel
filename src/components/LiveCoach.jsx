import { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, StopCircle, ChevronDown, ChevronUp, Activity, Wifi, MicOff, Clock, MessageSquare, Send } from 'lucide-react';
import { useAudioPipeline } from '../hooks/useAudioPipeline.js';
import { useCoachingStream } from '../hooks/useCoachingStream.js';
import { useChatStream } from '../hooks/useChatStream.js';

function renderSuggestion(text) {
  if (!text) return '';
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const withBold = escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  const lines = withBold.split('\n').filter(l => l.trim());
  return lines.map(line => {
    const t = line.trim();
    if (t.startsWith('•') || t.startsWith('-') || t.match(/^\d+\./)) {
      const content = t.replace(/^[•\-]\s*/, '').replace(/^\d+\.\s*/, '');
      return `<div class="coach-bullet">• ${content}</div>`;
    }
    return `<div class="coach-line">${t}</div>`;
  }).join('');
}

const LiveCoach = ({ prospectContext = '', companyName, backendUrl = '/coach' }) => {
  const [activeTab,     setActiveTab]     = useState('coach');
  const [transcript,    setTranscript]    = useState('');
  const [isContextOpen, setContextOpen]   = useState(false);
  const [displayText,   setDisplayText]   = useState('');
  const [fadeOut,       setFadeOut]       = useState(false);
  const [chatInput,     setChatInput]     = useState('');

  const tokenBufferRef      = useRef('');
  const prevSuggestionRef   = useRef('');
  const displayTextRef      = useRef('');
  const chatScrollRef       = useRef(null);

  const { requestSuggestion, suggestion, isStreaming, history } = useCoachingStream({
    coachUrl: `${backendUrl}/v1/coach/suggest`,
    agentId: 'agent_default',
    prospectContext,
  });

  const { messages: chatMessages, isStreaming: isChatStreaming, sendMessage } = useChatStream({
    chatUrl: `${backendUrl}/v1/coach/chat`,
    prospectContext,
  });

  const handleTranscript = useCallback((msg) => {
    if (msg.text) {
      setTranscript(msg.text);
      if (msg.isFinal) requestSuggestion(msg.text);
    }
  }, [requestSuggestion]);

  const { startCapture, stopCapture, status: audioStatus, error: audioError } = useAudioPipeline({
    onTranscript: handleTranscript,
    wsUrl: `${backendUrl}/audio`,
  });

  // Word-boundary buffering
  useEffect(() => {
    if (!suggestion) {
      tokenBufferRef.current = '';
      prevSuggestionRef.current = '';
      if (displayTextRef.current) {
        setFadeOut(true);
        setTimeout(() => { setDisplayText(''); setFadeOut(false); displayTextRef.current = ''; }, 180);
      }
      return;
    }

    if (suggestion === '__REP__') return;

    const newTokens = suggestion.slice(prevSuggestionRef.current.length);
    prevSuggestionRef.current = suggestion;

    tokenBufferRef.current += newTokens;
    const lastSpace = tokenBufferRef.current.lastIndexOf(' ');
    if (lastSpace > 0) {
      const flush = tokenBufferRef.current.slice(0, lastSpace + 1);
      tokenBufferRef.current = tokenBufferRef.current.slice(lastSpace + 1);
      displayTextRef.current += flush;
      setDisplayText(displayTextRef.current);
    }
  }, [suggestion]);

  // Flush remaining buffer on stream end
  useEffect(() => {
    if (!isStreaming && tokenBufferRef.current && suggestion && suggestion !== '__REP__') {
      displayTextRef.current += tokenBufferRef.current;
      setDisplayText(displayTextRef.current);
      tokenBufferRef.current = '';
    }
  }, [isStreaming, suggestion]);

  // Auto-scroll chat to bottom on new messages
  useEffect(() => {
    chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [chatMessages]);

  const isActive     = audioStatus === 'capturing';
  const isRepSpeaking = suggestion === '__REP__';

  const handleToggle = () => {
    if (isActive) {
      stopCapture();
    } else {
      setDisplayText('');
      setFadeOut(false);
      displayTextRef.current = '';
      prevSuggestionRef.current = '';
      tokenBufferRef.current = '';
      setTranscript('');
      startCapture();
    }
  };

  const contextLines = (prospectContext || '').split('\n').filter(Boolean);

  return (
    <div className="w-full max-w-2xl flex flex-col gap-4">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: '#0F172A' }}>Live Coach</h1>
          <p className="text-[13px] mt-0.5" style={{ color: '#64748B' }}>
            Real-time AI coaching{companyName ? ` · ${companyName}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isActive && (
            <span className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full"
              style={{ background: 'rgba(22,163,74,0.10)', border: '1px solid rgba(22,163,74,0.20)', color: '#16a34a' }}>
              <span className="w-1.5 h-1.5 rounded-full"
                style={{ background: '#16a34a', animation: 'pulse-subtle 2s ease-in-out infinite' }} />
              Live
            </span>
          )}
          {isStreaming && !isRepSpeaking && (
            <span className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full"
              style={{ background: 'rgba(37,99,235,0.08)', border: '1px solid rgba(37,99,235,0.16)', color: '#2563eb' }}>
              <Activity className="w-3 h-3" /> Coaching…
            </span>
          )}
        </div>
      </div>

      {/* Prospect context bar */}
      {contextLines.length > 0 && (
        <div className="card overflow-hidden">
          <button
            onClick={() => setContextOpen(o => !o)}
            className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors"
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.02)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <Wifi className="w-4 h-4 shrink-0" style={{ color: '#2563eb' }} />
            <span className="text-[13px] font-medium flex-1" style={{ color: '#0F172A' }}>
              Prospect Context
              {companyName && <span className="font-normal ml-1.5" style={{ color: '#64748B' }}>— {companyName}</span>}
            </span>
            {isContextOpen
              ? <ChevronUp className="w-4 h-4" style={{ color: '#94A3B8' }} />
              : <ChevronDown className="w-4 h-4" style={{ color: '#94A3B8' }} />}
          </button>
          {isContextOpen && (
            <div className="px-4 pb-4" style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}>
              <div className="flex flex-col gap-0.5 mt-3">
                {contextLines.map((line, i) => (
                  <p key={i} className="text-[12px]"
                    style={{ color: '#64748B', fontFamily: 'Inconsolata, monospace' }}>{line}</p>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {!contextLines.length && (
        <div className="card px-4 py-3 flex items-center gap-3">
          <Wifi className="w-4 h-4 shrink-0" style={{ color: '#94A3B8' }} />
          <p className="text-[12px]" style={{ color: '#94A3B8' }}>
            No intel loaded. Run the Intelligence pipeline first for prospect-aware coaching.
          </p>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-1 p-1 rounded-lg"
        style={{ background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.07)' }}>
        {[['coach', Mic, 'Live Coaching'], ['chat', MessageSquare, 'Ask AI']].map(([key, Icon, label]) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[12px] font-medium transition-all"
            style={{
              background:  activeTab === key ? '#fff' : 'transparent',
              color:       activeTab === key ? '#0F172A' : '#94A3B8',
              boxShadow:   activeTab === key ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              cursor: 'pointer',
            }}>
            <Icon className="w-3.5 h-3.5" />{label}
          </button>
        ))}
      </div>

      {/* Coaching panel */}
      {activeTab === 'coach' && <div className="card p-5 flex flex-col gap-4">
        {/* Mic control */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleToggle}
            className="flex items-center gap-2 rounded-lg text-[13px] font-medium transition-all"
            style={{
              height: '40px', padding: '0 20px',
              background: isActive ? 'rgba(220,38,38,0.10)' : '#2563eb',
              color:      isActive ? '#dc2626' : '#fff',
              border:     isActive ? '1px solid rgba(220,38,38,0.22)' : 'none',
              cursor: 'pointer',
            }}
          >
            {isActive
              ? <><StopCircle className="w-4 h-4" /> Stop</>
              : <><Mic className="w-4 h-4" /> Start Coaching</>}
          </button>
          <p className="text-[12px]" style={{ color: '#94A3B8' }}>
            {audioStatus === 'idle'      && 'Click Start to enable mic'}
            {audioStatus === 'capturing' && 'Listening — speak to activate coaching'}
            {audioStatus === 'error'     && <span style={{ color: '#dc2626' }}>Mic error — check browser permissions</span>}
          </p>
        </div>

        {/* Suggestion area */}
        <div className="rounded-lg min-h-[140px] p-4 relative"
          style={{ background: 'rgba(37,99,235,0.04)', border: '1px solid rgba(37,99,235,0.12)', transition: 'opacity 0.18s', opacity: fadeOut ? 0 : 1 }}>
          {isRepSpeaking ? (
            <div className="flex items-center gap-2.5" style={{ color: '#94A3B8' }}>
              <MicOff className="w-4 h-4 shrink-0" />
              <span className="text-[13px]">You're speaking — coaching paused</span>
            </div>
          ) : displayText ? (
            <div
              className="text-[13px] leading-relaxed"
              style={{ color: '#0F172A' }}
              dangerouslySetInnerHTML={{ __html: renderSuggestion(displayText) }}
            />
          ) : (
            <p className="text-[13px]" style={{ color: '#94A3B8' }}>
              {isActive ? 'Waiting for speech…' : 'Start coaching to see AI suggestions here.'}
            </p>
          )}

          {isStreaming && !isRepSpeaking && (
            <div className="absolute bottom-2 right-3 flex gap-1">
              {[0, 1, 2].map(i => (
                <div key={i} className="w-1 h-1 rounded-full"
                  style={{
                    background: '#2563eb',
                    animation: `pulse-subtle ${0.6 + i * 0.15}s ease-in-out infinite alternate`,
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Live transcript */}
        {transcript && (
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider mb-1.5" style={{ color: '#94A3B8' }}>
              Live Transcript
            </p>
            <p className="text-[12px] italic px-3 py-2 rounded"
              style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.07)', color: '#64748B' }}>
              "{transcript}"
            </p>
          </div>
        )}

        {audioError && (
          <p className="text-[12px]" style={{ color: '#dc2626' }}>
            Audio error: {audioError}
          </p>
        )}
      </div>}

      {/* Coaching history */}
      {activeTab === 'coach' && history.length > 0 && (
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4" style={{ color: '#64748B' }} />
            <p className="text-[12px] font-medium uppercase tracking-wider" style={{ color: '#64748B' }}>
              Session History
            </p>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full"
              style={{ background: 'rgba(0,0,0,0.05)', color: '#94A3B8' }}>
              {history.length}
            </span>
          </div>
          <div className="flex flex-col gap-3 max-h-80 overflow-y-auto"
            style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(0,0,0,0.1) transparent' }}>
            {history.map(h => (
              <div key={h.id} className="px-3 py-2.5 rounded-lg"
                style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.06)' }}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[10px]" style={{ color: '#94A3B8' }}>{h.timestamp}</span>
                  <span className="text-[10px] italic truncate flex-1" style={{ color: '#94A3B8' }}>
                    "{h.transcript.slice(0, 60)}{h.transcript.length > 60 ? '…' : ''}"
                  </span>
                </div>
                <div
                  className="text-[12px] leading-relaxed"
                  style={{ color: '#374151' }}
                  dangerouslySetInnerHTML={{ __html: renderSuggestion(h.suggestion) }}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Chat panel */}
      {activeTab === 'chat' && (
        <div className="card p-5 flex flex-col gap-3">
          <div className="flex flex-col gap-2 min-h-[160px] max-h-80 overflow-y-auto"
            ref={chatScrollRef}
            style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(0,0,0,0.1) transparent' }}>
            {chatMessages.length === 0 && (
              <p className="text-[12px] text-center py-8" style={{ color: '#94A3B8' }}>
                Ask anything — objection handling, pricing, product comparisons…
              </p>
            )}
            {chatMessages.map(m => (
              <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className="max-w-[85%] px-3 py-2 rounded-lg text-[12px] leading-relaxed"
                  style={m.role === 'user'
                    ? { background: '#2563eb', color: '#fff', borderRadius: '12px 12px 3px 12px' }
                    : { background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.07)', color: '#0F172A', borderRadius: '12px 12px 12px 3px' }}>
                  {m.role === 'ai'
                    ? <div dangerouslySetInnerHTML={{ __html: renderSuggestion(m.text || '…') }} />
                    : m.text}
                  {m.streaming && (
                    <span className="inline-block w-1.5 h-3 ml-1 rounded-sm"
                      style={{ background: '#2563eb', verticalAlign: 'middle', animation: 'pulse-subtle 0.8s ease-in-out infinite alternate' }} />
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-2" style={{ borderTop: '1px solid rgba(0,0,0,0.06)', paddingTop: '12px' }}>
            <input
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage(chatInput);
                  setChatInput('');
                }
              }}
              placeholder="Ask a question…"
              className="flex-1 text-[13px] px-3 py-2 rounded-lg outline-none"
              style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.08)', color: '#0F172A' }}
              disabled={isChatStreaming}
            />
            <button
              onClick={() => { sendMessage(chatInput); setChatInput(''); }}
              disabled={!chatInput.trim() || isChatStreaming}
              className="flex items-center justify-center rounded-lg transition-all"
              style={{
                width: '38px', height: '38px',
                background: '#2563eb', color: '#fff',
                opacity: (!chatInput.trim() || isChatStreaming) ? 0.45 : 1,
                cursor: (!chatInput.trim() || isChatStreaming) ? 'default' : 'pointer',
                border: 'none',
                flexShrink: 0,
              }}>
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default LiveCoach;
