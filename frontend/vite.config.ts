import path from "path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  
  // If you need to allow specific hosts during development, you can configure the server options here.
  // server: {
  //   // 🌐 Define allowed hosts here
  //   // allowedHosts: [
  //   //   'my-local-site.test',
  //   //   'legiscounsel.loca.lt', 
  //   //   'project-name.local',
  //   //   '.ngrok-free.app' // Prefix with dot to allow all subdomains
  //   // ],
  //   // 💡 Often used with 'host' to expose the server to your local network
  //   host: true, 
  // },

  
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
