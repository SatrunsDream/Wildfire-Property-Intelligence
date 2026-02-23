import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// https://vite.dev/config/
export default defineConfig({
    plugins: [react(), tailwindcss()],
    server: {
        proxy: {
            "/conditional-pooling": "http://localhost:8000",
            "/map": "http://localhost:8000",
            "/conditioning-options": "http://localhost:8000",
            "/compare": "http://localhost:8000",
            "/c2st": "http://localhost:8000",
            "/bayesian": "http://localhost:8000",
            "/morans-i": "http://localhost:8000",
            "/group-divergence": "http://localhost:8000",
            "/healthz": "http://localhost:8000",
        },
    },
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
        },
    },
})
