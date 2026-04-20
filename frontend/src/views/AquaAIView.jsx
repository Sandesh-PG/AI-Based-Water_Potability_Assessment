import { useEffect, useMemo, useRef, useState } from 'react';
import { sendChatMessage } from '../services/api.js';
import { usePinnedStations } from '../contexts/PinnedStationsContext.jsx';
import './AquaAIView.css';

const SUGGESTED_QUESTIONS = [
  'What is the safe limit for BOD in drinking water?',
  'How does high fecal coliform impact water safety?',
  'Explain this station risk using WHO and BIS standards.',
  'What actions can reduce nitrate pollution at this station?',
];

function createMessageId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function AquaAIView() {
  const { pinnedStations } = usePinnedStations();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedStationId, setSelectedStationId] = useState('');
  const messagesEndRef = useRef(null);

  const stationOptions = useMemo(
    () => pinnedStations.map(station => ({
      id: station.id,
      label: station.location || station.monitoring_location || `Station ${station.id}`,
    })),
    [pinnedStations],
  );

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollTop = messagesEndRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const getPayloadStationId = () => {
    if (!selectedStationId) return null;
    const numericValue = Number(selectedStationId);
    return Number.isNaN(numericValue) ? selectedStationId : numericValue;
  };

  const submitMessage = async (questionText) => {
    const messageText = questionText.trim();
    if (!messageText || loading) return;

    const userMessage = {
      id: createMessageId(),
      role: 'user',
      content: messageText,
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const response = await sendChatMessage(messageText, getPayloadStationId());

      setMessages(prev => [
        ...prev,
        {
          id: createMessageId(),
          role: 'assistant',
          content: response.answer,
          sources_used: response.sources_used || 0,
          station_name: response.station_name,
          violated_params: response.violated_params || [],
          has_station_context: response.has_station_context || false,
        },
      ]);
    } catch {
      setMessages(prev => [
        ...prev,
        {
          id: createMessageId(),
          role: 'assistant',
          content: 'Sorry, I could not reach the chat backend right now. Please try again.',
          sources_used: 0,
          station_name: null,
          violated_params: [],
          has_station_context: false,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    await submitMessage(input);
  };

  return (
    <div className="ai-layout">
      <div className="ai-header">
        <div className="ai-header-left">
          <span className="ai-icon" aria-hidden="true">💬</span>
          <div>
            <h2 className="ai-title">AquaAI</h2>
            <p className="ai-subtitle">Ask questions about water quality data</p>
          </div>
        </div>

        <div className="ai-station-selector">
          <label htmlFor="ai-station-context">Station Context</label>
          <select
            id="ai-station-context"
            value={selectedStationId}
            onChange={(event) => setSelectedStationId(event.target.value)}
          >
            <option value="">No station selected</option>
            {stationOptions.map((station) => (
              <option key={station.id} value={station.id}>{station.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="ai-messages" ref={messagesEndRef}>
        {messages.map((msg) => (
          <div key={msg.id} className={`ai-message ai-message-${msg.role}`}>
            {msg.role === 'assistant' && (
              <div className="ai-message-meta">
                {msg.sources_used > 0 && (
                  <span className="ai-sources-badge">{msg.sources_used} sources</span>
                )}
                {msg.station_name && (
                  <span className="ai-station-badge">{msg.station_name}</span>
                )}
                {msg.violated_params?.length > 0 && (
                  <span className="ai-violations-badge">
                    ⚠ {msg.violated_params.join(', ')}
                  </span>
                )}
              </div>
            )}
            <div className="ai-message-content">{msg.content}</div>
          </div>
        ))}

        {loading && (
          <div className="ai-message ai-message-assistant">
            <div className="ai-typing" aria-label="AquaAI is typing">
              <span />
              <span />
              <span />
            </div>
          </div>
        )}
      </div>

      {messages.length === 0 && (
        <div className="ai-suggestions">
          <p className="ai-suggestions-title">Suggested questions</p>
          <div className="ai-suggestions-list">
            {SUGGESTED_QUESTIONS.map((question) => (
              <button
                key={question}
                type="button"
                className="ai-suggestion-chip"
                onClick={() => submitMessage(question)}
                disabled={loading}
              >
                {question}
              </button>
            ))}
          </div>
        </div>
      )}

      <form className="ai-input-bar" onSubmit={handleSubmit}>
        <input
          type="text"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask AquaAI about standards, station risks, or mitigation steps..."
          disabled={loading}
        />
        <button type="submit" disabled={loading || !input.trim()}>
          {loading ? 'Sending...' : 'Send'}
        </button>
      </form>
    </div>
  );
}

export default AquaAIView;
