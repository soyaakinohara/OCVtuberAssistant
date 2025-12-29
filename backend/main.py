from fastapi import FastAPI, UploadFile, File, Form
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI  # クラスを直接インポート
import os
from dotenv import load_dotenv

# .env からAPIキー読み込み
load_dotenv()

# ★★★ OpenRouter設定 (新しい書き方) ★★★
# 環境変数からキーを取得。なければエラーになるので注意
api_key = os.getenv("OPENAI_API_KEY")
if not api_key:
    raise ValueError("OPENAI_API_KEY not found in .env file")

# クライアントインスタンスを作成
client = OpenAI(
    api_key=api_key,
    base_url="https://openrouter.ai/api/v1"
)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# AIの記憶（簡易版）
MEMORY = []

# リクエスト定義
class ChatRequest(BaseModel):
    message: str
    system_prompt: str = "あなたは親切なAIアシスタントです。" 

@app.post("/api/chat")
async def chat(req: ChatRequest):
    global MEMORY
    
    # メモリ管理
    system_msg = {"role": "system", "content": req.system_prompt}
    
    if len(MEMORY) > 0 and MEMORY[0]["role"] == "system":
        MEMORY[0] = system_msg
    else:
        MEMORY.insert(0, system_msg)

    MEMORY.append({"role": "user", "content": req.message})

    # ★★★ クライアント経由で呼び出し ★★★
    try:
        response = client.chat.completions.create(
            model="moonshotai/kimi-k2-0905", 
            messages=MEMORY,
            extra_headers={
                "HTTP-Referer": "http://localhost:5173", 
                "X-Title": "VRM Chat App" 
            },
            max_tokens=200
        )
        ai_text = response.choices[0].message.content
        MEMORY.append({"role": "assistant", "content": ai_text})
        
        if len(MEMORY) > 11:
            MEMORY = [MEMORY[0]] + MEMORY[-10:]

        return {"text": ai_text}
    
    except Exception as e:
        print(f"OpenAI Error: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})


# --- 音声合成 (VOICEVOX) ---
import requests
VOICEVOX_URL = "http://127.0.0.1:50021"

@app.get("/api/tts")
async def tts(text: str):
    speaker_id = 14
    try:
        query_res = requests.post(
            f"{VOICEVOX_URL}/audio_query",
            params={"text": text, "speaker": speaker_id}
        )
        audio_query = query_res.json()
        
        synth_res = requests.post(
            f"{VOICEVOX_URL}/synthesis",
            params={"speaker": speaker_id},
            json=audio_query
        )
        return Response(content=synth_res.content, media_type="audio/wav")
    except Exception as e:
        print(f"Voicevox Error: {e}")
        return Response(status_code=500)


# --- 画像認識 (Vision) ---
import base64

@app.post("/api/vision")
async def vision_analysis(file: UploadFile = File(...)):
    contents = await file.read()
    base64_image = base64.b64encode(contents).decode("utf-8")

    try:
        res = client.chat.completions.create(
            model="google/gemma-3-27b-it",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "この画像には何が映っていますか？詳細に答えて。"},
                        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{base64_image}"}}
                    ]
                }
            ],
            extra_headers={
                "HTTP-Referer": "http://localhost:5173", 
                "X-Title": "VRM Chat App" 
            },
            max_tokens=100
        )
        return {"text": res.choices[0].message.content}
    except Exception as e:
        print(f"Vision Error: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})