import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl' // 追加

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    basicSsl() // 追加：これで自動的にhttpsになります
  ],
  server: {
    host: '0.0.0.0',  // 追加：外部アクセスを許可(0.0.0.0相当)
    proxy: {
      '/api': {
        target: 'http://localhost:8000', // バックエンドへ転送
        changeOrigin: true,
        secure: false, // バックエンドはhttpなのでsecureチェックしない
      }
    }
  }
})