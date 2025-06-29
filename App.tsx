
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Chat } from '@google/genai';
import { ChatMessage, ChatSession, Attachment } from './types';
import { startChatSession } from './services/geminiService';
import { useSpeech } from './hooks/useSpeech';
import MainView from './components/MainView';
import ChatView from './components/ChatView';
import HistoryView from './components/HistoryView';
import CallView from './components/CallView';
import { fileToBase64 } from './utils/fileUtils';

type View = 'main' | 'chat' | 'history' | 'call';

const App: React.FC = () => {
  const [view, setView] = useState<View>('main');
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  
  const chatRef = useRef<Chat | null>(null);
  const speech = useSpeech();

  // Load sessions from localStorage on initial render
  useEffect(() => {
    try {
      const savedSessions = localStorage.getItem('chatSessions');
      if (savedSessions) {
        setSessions(JSON.parse(savedSessions));
      }
    } catch (e) {
      console.error("Failed to load sessions from localStorage", e);
      setSessions([]);
    }
  }, []);

  // Save sessions to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem('chatSessions', JSON.stringify(sessions));
    } catch (e) {
      console.error("Failed to save sessions to localStorage", e);
    }
  }, [sessions]);


  const initializeChat = useCallback(async (sessionId?: string) => {
    try {
      setIsLoading(true);
      chatRef.current = await startChatSession();
      setError(null);

      if (sessionId) {
        const existingSession = sessions.find(s => s.id === sessionId);
        if (existingSession && chatRef.current) {
           // In a more complex app, you would re-hydrate the chat history here
           // For now, we load messages into view, but the API context is fresh.
        }
      }

    } catch (e) {
      setError('Failed to initialize chat session. Check API key.');
      console.error(e);
    } finally {
        setIsLoading(false);
    }
  }, [sessions]);
    
  // Initialize chat on first load
  useEffect(() => {
    if (!chatRef.current) {
        initializeChat();
    }
  }, [initializeChat]);


  const handleSendMessage = useCallback(async (text: string, files: File[] = []) => {
    if ((!text.trim() && files.length === 0) || !chatRef.current) return;
    
    speech.stopListening();
    speech.resetTranscript();
    setIsLoading(true);
    setError(null);

    // Create a new session if one doesn't exist
    let sessionId = currentSessionId;
    if (!sessionId) {
      sessionId = `session-${Date.now()}`;
      setCurrentSessionId(sessionId);
      const newSession: ChatSession = {
        id: sessionId,
        title: text.substring(0, 40) || "New Chat",
        messages: [],
        createdAt: new Date().toISOString(),
      };
      setSessions(prev => [newSession, ...prev]);
    }

    const attachments: Attachment[] = await Promise.all(
      files.map(async (file) => {
        const data = await fileToBase64(file);
        return {
          name: file.name,
          type: file.type,
          url: URL.createObjectURL(file),
          data: data,
        };
      })
    );

    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      text,
      attachments,
    };

    setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, messages: [...s.messages, userMessage] } : s));
    if (view === 'main') setView('chat');

    try {
      const geminiParts: any[] = [{ text }];
      for (const att of attachments) {
        geminiParts.push({
          inlineData: { mimeType: att.type, data: att.data },
        });
      }
      
      const stream = await chatRef.current.sendMessageStream({ message: geminiParts });
      
      let modelResponse = '';
      const modelMessageId = `msg-${Date.now()}-model`;
      const modelMessage: ChatMessage = { id: modelMessageId, role: 'model', text: '' };
      
      // Add a placeholder for the model's response
      setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, messages: [...s.messages, modelMessage] } : s));

      for await (const chunk of stream) {
        modelResponse += chunk.text;
        setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, messages: s.messages.map(m => m.id === modelMessageId ? {...m, text: modelResponse} : m) } : s));
      }
    } catch (e) {
      console.error(e);
      const errorMessage = 'An error occurred. Please try again.';
      setError(errorMessage);
      const errorMsg: ChatMessage = { id: `err-${Date.now()}`, role: 'model', text: errorMessage };
       setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, messages: [...s.messages, errorMsg] } : s));
    } finally {
      setIsLoading(false);
    }
  }, [currentSessionId, speech, view, sessions, initializeChat]);

  const startNewChat = () => {
    setCurrentSessionId(null);
    chatRef.current = null; // Reset chat instance
    initializeChat();
    setView('main');
  };

  const loadChat = (sessionId: string) => {
    setCurrentSessionId(sessionId);
    chatRef.current = null; // Reset chat instance
    initializeChat(sessionId);
    setView('chat');
  };
  
  const currentMessages = sessions.find(s => s.id === currentSessionId)?.messages || [];

  if (view === 'history') {
    return <HistoryView sessions={sessions} onLoadSession={loadChat} onBack={() => setView(currentSessionId ? 'chat' : 'main')} />;
  }

  if (view === 'call') {
      return <CallView onSendMessage={handleSendMessage} speech={speech} onEndCall={() => setView('chat')} latestResponse={currentMessages.filter(m => m.role === 'model').pop()?.text}/>
  }

  if (view === 'chat') {
    return (
      <ChatView 
          messages={currentMessages} 
          isLoading={isLoading}
          error={error}
          onSendMessage={handleSendMessage}
          onNewChat={startNewChat}
          onShowHistory={() => setView('history')}
          onStartCall={() => {
            initializeChat(currentSessionId || undefined);
            setView('call');
          }}
          speechProps={{
              isListening: speech.isListening,
              transcript: speech.transcript,
              startListening: speech.startListening,
              stopListening: speech.stopListening,
              resetTranscript: speech.resetTranscript
          }}
      />
    );
  }

  return (
    <MainView
      onSendMessage={handleSendMessage}
      isLoading={isLoading}
      speechProps={{
        isListening: speech.isListening,
        transcript: speech.transcript,
        startListening: speech.startListening,
        stopListening: speech.stopListening,
        resetTranscript: speech.resetTranscript,
      }}
      onShowHistory={() => setView('history')}
      onStartCall={() => {
        initializeChat(currentSessionId || undefined);
        setView('call');
      }}
      onNewChat={startNewChat}
    />
  );
};

export default App;
