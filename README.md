# OCVtuberAssistant

オリキャラをVtuberにして話し相手にできるもの

オリキャラをAI会話アシスタントとして活用できるやつです。  
お手持ちのVRMファイルとopenrouterのAPIキー、voicevoxのAPIを活用してオリキャラが表情を変えたり、動いたり、話します。  

## できること

- トリガーワードに応じて声で応答する指定した時間おきに独り言を話す  
- デバイスのインカメラを使用して自分の姿や見せたいものを見せてそれに応じた会話ができる  
- 待て、ができる（有効だと話さない）  
- スリープタイマーができる（指定した時間になると話さなくなる）  
- 会話部屋の背景を変更できる  
- キャラの表情や位置調整ができる  

## 導入方法

### 必要なもの

python nodejs voicevox openrouterのAPIキー（有料プランが望ましい、独り言オフなら無料プランでも可能）、オリキャラのVRMモデル

### 方法

1. リポジトリをクローン  
2. pythonの仮想環境を作成＆以下のライブラリをインストール  
   fastapi uvicorn requests python-dotenv opencontext openai python-multipart  
3. frontendフォルダに移動し、npm installを実行  
4. backend/.envにOPENAI_API_KEY=xxxxxxxxxの形でAPIキーを記述  
5. frontend/publicにmodel.vrmという名前でモデルを保存  
6. バックエンドをbackendフォルダーで　uvicorn main:app --host 0.0.0.0 --port 8888 で起動  
7. フロントエンドをfrontendフォルダーで npm run dev で実行  

## 動作環境

バックエンドはdebian13での動作を確認済みです  
フロントエンドにアクセスする際はパソコン版chrome出ないと正常動作しません  

## その他

ご意見質問ご要望等は開発者のツイッターのdmまで
