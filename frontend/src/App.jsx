/* src/App.jsx */
import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import VrmViewer from './VrmViewer';

function App() {
  // --- A. State定義 ---
  const [messages, setMessages] = useState([{ role: 'system', content: '初期化完了' }]);
  const [status, setStatus] = useState('Idle'); 
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [inputText, setInputText] = useState('');
  
  // 認識中の文字表示
  const [interimText, setInterimText] = useState('');
  
  // モード設定
  const [waitingMode, setWaitingMode] = useState(false);
  
  // ★設定項目
  const [triggerWord, setTriggerWord] = useState('みどりちゃん,緑ちゃん'); 
  const [systemPrompt, setSystemPrompt] = useState('あなたは『秋ノ原緑』というキャラクターになりきって話します。13歳の少女で落ち着いた性格をしています。"殺伐とした終末世界に生きており、大人びた口調で話すダウナー系の少女です。しかし、自らの感情を表すときは素直に子供っぽく表現します。身長は141cmの小柄な少女です。一人称は「私」、二人称は基本的に「あなた」または「君」を使います。落ち着いた文体で、語尾は「〜だね」「〜なのかもしれない」などをよく使います。強い感情が出るときは「うわーん」「やだやだ！」など、年相応に崩れることがあります。"できるだけAIらしくない文体で話してキャラクターに人間臭さを持たせてください。生成する一文が長くなりすぎないようにすること。長くても100文字以内');

  // ★自動独り言設定
  const [autoSpeakEnabled, setAutoSpeakEnabled] = useState(true); // ON/OFF
  const [autoSpeakInterval, setAutoSpeakInterval] = useState(5);  // 分

  // キャラ設定
  const [showSettings, setShowSettings] = useState(false);
  const [charPosition, setCharPosition] = useState({ x: 0.0, y: -0.6 }); 
  const [expression, setExpression] = useState('neutral');
  const [autoExpression, setAutoExpression] = useState(true);

  // 背景・時間
  const [bgImage, setBgImage] = useState(null);
  const [quietStart, setQuietStart] = useState(23);
  const [quietEnd, setQuietEnd] = useState(7);

  // --- B. Refs ---
  const recognitionRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const audioContextRef = useRef(null);
  
  // ★最終アクション時間を記録するRef（再レンダリングを防ぐためRefを使用）
  const lastActionTimeRef = useRef(Date.now());

  const EMOTIONS = ['neutral', 'happy', 'angry', 'sad', 'relaxed', 'surprised'];

  const isQuietTime = () => {
    const now = new Date().getHours();
    if (quietStart === quietEnd) return false; 
    if (quietStart > quietEnd) {
      return (now >= quietStart || now < quietEnd);
    } else {
      return (now >= quietStart && now < quietEnd);
    }
  };

  // --- C. 音声認識 ---
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'ja-JP';

    recognition.onresult = (event) => {
      if (isSpeaking) return;

      let finalTranscript = '';
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      if (interimTranscript) setInterimText(interimTranscript);

      if (finalTranscript) {
        setInterimText('');
        const rawText = finalTranscript.trim();
        console.log(`[音声認識] 生データ: "${rawText}"`);

        // 何か音が聞こえたらアクション時間を更新（独り言タイマーリセット）
        lastActionTimeRef.current = Date.now();

        if (waitingMode || isQuietTime()) return;

        // トリガー判定
        const normalizedText = rawText.replace(/\s+/g, '');
        const triggers = triggerWord.split(',').map(t => t.trim().replace(/\s+/g, ''));
        
        const isTriggered = triggers.some(trigger => normalizedText.includes(trigger));

        if (isTriggered) {
          console.log(`[判定OK] 送信: "${rawText}"`);
          handleChatSend(rawText); 
        } else {
           console.log(`[判定NG] トリガー待ち...`);
        }
      }
    };

    recognition.onend = () => { 
      // 停止ボタンが押されていなければ再開
      if (!waitingMode) {
        try { recognition.start(); } catch(e){} 
      }
    };
    
    recognitionRef.current = recognition;
  }, [isSpeaking, waitingMode, quietStart, quietEnd, triggerWord]);


  // --- D. 自動処理（表情変化 ＆ 独り言チェック） ---
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();

      // 1. おやすみモード判定
      if (isQuietTime()) {
        if (status !== 'Sleeping (Zzz...)') {
            setStatus('Sleeping (Zzz...)');
            // 寝てる顔に固定
            if (expression !== 'relaxed') setExpression('relaxed'); 
        }
        return; // おやすみ中は以降の処理をしない
      } else {
        if (status === 'Sleeping (Zzz...)') setStatus('Idle');
      }

      // 2. 表情のランダム変更 (Speaking等のときは邪魔しない)
      if (autoExpression && status === 'Idle') {
         if (Math.random() > 0.7) { 
            const candidates = EMOTIONS.filter(e => e !== 'neutral');
            setExpression(candidates[Math.floor(Math.random() * candidates.length)]);
         } else {
            setExpression('neutral');
         }
      }

      // 3. ★★ 自動独り言ロジック (ここを追加) ★★
      if (autoSpeakEnabled && status === 'Idle' && !waitingMode) {
        // 設定分数 * 60 * 1000 (ミリ秒)
        const threshold = autoSpeakInterval * 60 * 1000; 
        
        if (now - lastActionTimeRef.current > threshold) {
           console.log("⌚ 放置時間経過: 独り言を開始します");
           
           // 時間をリセットして連続発火を防ぐ
           lastActionTimeRef.current = Date.now(); 
           
           // AIに「独り言を言って」という隠し指示を送る
           // ユーザーのログには出さないようにする工夫も可能だが、
           // 通信関数を共通化しているためそのまま投げます
           handleChatSend("（長いこと会話が途切れています。退屈そうに独り言、またはユーザーへの問いかけを短く言ってください）");
        }
      }

    }, 5000); // 5秒ごとにチェック
    
    return () => clearInterval(interval);
  }, [autoExpression, quietStart, quietEnd, status, expression, autoSpeakEnabled, autoSpeakInterval, waitingMode]);


  // --- E. アクション ---
  const handleChatSend = async (text) => {
    if (!text) return;
    setInputText(''); 
    setStatus('Thinking...');
    
    // 自分が喋ったので最終アクション時間を更新
    lastActionTimeRef.current = Date.now();

    // ログへの追加（独り言指示はちょっと隠すか、そのまま出すか。今回は出す）
    addLog('User', text.startsWith('（') ? '(自動トリガー)' : text);

    try {
      if(autoExpression) setExpression('happy');
      
      const res = await axios.post('/api/chat', { 
        message: text,
        system_prompt: systemPrompt 
      });
      const aiText = res.data.text;
      
      addLog('AI', aiText);
      await playVoice(aiText);

    } catch (error) {
      console.error(error);
      setStatus('Error');
    } finally {
      if (!isSpeaking) setStatus('Idle');
      if(autoExpression) setExpression('neutral');
      // 喋り終わった時間もリセット
      lastActionTimeRef.current = Date.now();
    }
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setBgImage(URL.createObjectURL(file));
      lastActionTimeRef.current = Date.now(); // 背景変えたらアクションとみなす
    }
  };

  const handleCameraCapture = async () => {
    setStatus('Recognizing...');
    lastActionTimeRef.current = Date.now();
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(async (blob) => {
      if(!blob) return;
      const formData = new FormData();
      formData.append('file', blob, 'capture.jpg');
      try {
        const res = await axios.post('/api/vision', formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
        const aiText = res.data.text;
        addLog('AI(Vision)', aiText);
        await playVoice(aiText);
      } catch (e) { console.error(e); } 
      finally { setStatus('Idle'); }
    }, 'image/jpeg');
  };

  const playVoice = async (text) => {
    setStatus('Speaking');
    setIsSpeaking(true);
    try {
      const res = await axios.get('/api/tts', { params: { text }, responseType: 'arraybuffer' });
      
      if(!audioContextRef.current) {
          audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') await ctx.resume();

      const audioData = await ctx.decodeAudioData(res.data);
      const source = ctx.createBufferSource();
      source.buffer = audioData;
      source.connect(ctx.destination);
      
      return new Promise((resolve) => {
        source.onended = () => {
          setIsSpeaking(false);
          setStatus('Idle');
          lastActionTimeRef.current = Date.now(); // 喋り終わりリセット
          resolve();
        };
        source.start(0);
      });
    } catch (e) { 
        console.error(e);
        setIsSpeaking(false); 
        setStatus('Idle');
    }
  };

  const addLog = (role, text) => setMessages(prev => [...prev, { role, content: text }].slice(-5));
  
  const startApp = async () => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (audioContextRef.current.state === 'suspended') await audioContextRef.current.resume();

      recognitionRef.current.start();
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      videoRef.current.srcObject = stream;
      videoRef.current.play();
      addLog('System', '起動しました。');
      
      // 起動時に現在時刻セット
      lastActionTimeRef.current = Date.now();
    } catch (e) { 
        console.error(e);
        alert("マイク/カメラ許可を確認してください"); 
    }
  };

  // --- F. UI 描画 ---
  return (
    <div style={{ 
       width: '100vw', height: '100vh', overflow: 'hidden',
       backgroundImage: bgImage ? `url(${bgImage})` : 'none',
       backgroundSize: 'cover', backgroundPosition: 'center',
       backgroundColor: '#242424' 
    }}>
      
      <VrmViewer 
        isSpeaking={isSpeaking} 
        positionX={charPosition.x}
        positionY={charPosition.y}
        currentExpression={expression}
      />

      <div className="ui-layer">
        
        {interimText && (
            <div style={{
                position: 'absolute', top: '100px', left: '50%', transform: 'translateX(-50%)',
                backgroundColor: 'rgba(0,0,0,0.6)', color: '#fff', padding: '10px 20px',
                borderRadius: '20px', pointerEvents: 'none', zIndex: 50
            }}>
                👂 {interimText}
            </div>
        )}

        <div style={{ position: 'absolute', top: 10, right: 10, pointerEvents: 'auto', zIndex: 100 }}>
           <button onClick={() => setShowSettings(!showSettings)}>⚙️ 設定</button>
        </div>

        {showSettings && (
          <div className="ui-panel" style={{ position: 'absolute', top: 50, right: 10, width: '300px', maxHeight: '80vh', overflowY:'auto' }}>
            <h4 style={{marginTop:0}}>AI設定</h4>
            <label style={{display:'block', marginBottom:'5px', fontSize:'0.85rem'}}>
               トリガー:<br/><input type="text" value={triggerWord} onChange={(e)=>setTriggerWord(e.target.value)} style={{width:'90%'}} />
            </label>
            <label style={{display:'block', marginBottom:'10px', fontSize:'0.85rem'}}>
               プロンプト:<br/><textarea value={systemPrompt} onChange={(e)=>setSystemPrompt(e.target.value)} style={{width:'90%', height:'50px'}} />
            </label>

            <hr />
            {/* ★独り言設定 */}
            <h4 style={{marginBottom:'5px'}}>自動発話</h4>
             <label><input type="checkbox" checked={autoSpeakEnabled} onChange={(e) => setAutoSpeakEnabled(e.target.checked)} /> 独り言を言う</label>
             <div style={{marginTop:'5px', display: autoSpeakEnabled ? 'block' : 'none'}}>
               間隔: <input type="number" min="1" max="60" value={autoSpeakInterval} onChange={(e)=>setAutoSpeakInterval(Number(e.target.value))} style={{width:'40px'}}/> 分
             </div>

            <hr />
            <h4>背景変更</h4>
            <input type="file" accept="image/*" onChange={handleImageUpload} style={{fontSize:'0.8rem'}} />
            
            <hr />
            <h4>おやすみ時間 (現在:{new Date().getHours()}時)</h4>
            <div style={{display:'flex', alignItems:'center', gap:'5px', marginBottom:'10px'}}>
              <input type="number" min="0" max="23" value={quietStart} onChange={(e)=>setQuietStart(Number(e.target.value))} style={{width:'40px'}}/>時
              〜
              <input type="number" min="0" max="23" value={quietEnd} onChange={(e)=>setQuietEnd(Number(e.target.value))} style={{width:'40px'}}/>時
            </div>
            
            <hr />
            <h4>位置・表情</h4>
            <label>左右: <input type="range" min="-2.0" max="2.0" step="0.1" value={charPosition.x} onChange={(e) => setCharPosition(p => ({...p, x: parseFloat(e.target.value)}))} /></label><br/>
            <label>上下: <input type="range" min="-2.0" max="0.5" step="0.1" value={charPosition.y} onChange={(e) => setCharPosition(p => ({...p, y: parseFloat(e.target.value)}))} /></label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginTop: '5px' }}>
              <label><input type="checkbox" checked={autoExpression} onChange={(e) => setAutoExpression(e.target.checked)} /> Auto</label>
              {EMOTIONS.map(emo => (
                <button key={emo} disabled={autoExpression} onClick={() => setExpression(emo)} style={{ fontSize: '0.8rem' }}>{emo}</button>
              ))}
            </div>
          </div>
        )}

        <div className="ui-panel chat-history" style={{ maxHeight: '200px', width: '300px' }}>
          {messages.map((m, i) => (
            <div key={i} className="message"><strong>{m.role}: </strong>{m.content}</div>
          ))}
        </div>

        <div className="ui-panel controls">
          <button onClick={startApp} style={{fontWeight:'bold'}}>START</button>
          
          <div className="status-indicator" style={{width:'80px', fontSize:'0.7rem', lineHeight:'1.1', textAlign:'center'}}>
             {status}
          </div>
          
          <button 
             onClick={() => setWaitingMode(!waitingMode)}
             style={{ backgroundColor: waitingMode ? '#ff4444' : '#646cff', minWidth:'50px' }}
          >
            {waitingMode ? "再開" : "待て"}
          </button>

          <button onClick={handleCameraCapture}>📷</button>

          <input 
            type="text" value={inputText} onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleChatSend(inputText)}
            style={{ flexGrow: 1, minWidth: '50px' }} placeholder="会話..." 
          />
          <button onClick={() => handleChatSend(inputText)}>送信</button>
        </div>
      </div>

      <video ref={videoRef} className="hidden" muted playsInline style={{display:'none'}} />
      <canvas ref={canvasRef} className="hidden" style={{display:'none'}} />
    </div>
  );
}

export default App;